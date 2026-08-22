import { vValidator } from "@hono/valibot-validator";
import { Hono } from "hono";
import catalogJson from "../data/catalog.json" with { type: "json" };
import graphJson from "../data/graph.json" with { type: "json" };
import type {
  CatalogResponse,
  ExitReportResponse,
  RecommendationRequest,
  RecommendationResponse,
} from "./contract.js";
import { ExitReportRequestSchema, RecommendationRequestSchema } from "./contract.js";
import type { Catalog, Dataset, Graph } from "./graph.js";
import { RecommendError, recommend } from "./recommend.js";
import { buildRoomRecommendations, parseRoomRecommendationsLimit } from "./room-recommendations.js";
import {
  CreateRoomSchema,
  JoinSchema,
  RoomError,
  UpdateParticipantSchema,
  UpdateRoomSchema,
  statusOf,
  type CreateRoomResult,
  type JoinResult,
  type Room,
  type RoomErrorResponse,
} from "./room.js";

export { RoomObject } from "./room-do.js";

type Env = { ROOM: DurableObjectNamespace };

/**
 * 推薦 Worker。ステートレス。
 * グラフは起動時に読み、リクエストごとにパースし直さない。
 * ルームの状態は持たない（Durable Object は別）。
 */

let dataset: Dataset = {
  graph: graphJson as Graph,
  catalog: catalogJson as Catalog,
};

export function setDataset(next: Dataset): void {
  dataset = next;
}

/**
 * 改札を持つ路線をすべて出す(docs/RECOMMENDER.md「載っていない路線があると、
 * その人は参加できない」)。実データでは JR・京王・大江戸・小田急・丸ノ内の
 * 5 つ(改札の多い順)。取り込み直しで 6 つ目が現れたら
 * catalog.test.ts のドリフト検知テストで落ちる。
 */
const CATALOG_LINES: CatalogResponse["lines"] = [
  { id: "line.jr", nameJa: "JR" },
  { id: "line.keio", nameJa: "京王" },
  { id: "line.oedo", nameJa: "大江戸" },
  { id: "line.odakyu", nameJa: "小田急" },
  { id: "line.marunouchi", nameJa: "丸ノ内" },
];

function publicCatalog(ds: Dataset): CatalogResponse {
  return {
    lines: CATALOG_LINES,
    destinations: ds.catalog.destinations,
  };
}

const app = new Hono<{ Bindings: Env }>();

/** ルーム 1 件につき Durable Object 1 つ。ID から引く。 */
function roomStub(env: Env, roomId: string): DurableObjectStub {
  return env.ROOM.get(env.ROOM.idFromName(roomId));
}

/**
 * DO へ渡して、返ってきた JSON を型付きで受け取る。
 * Worker は経路を決めるだけで、状態を持たない。
 * 入力の検証はここ（vValidator）で済んでいるので、DO は形を疑わない。
 */
async function callRoom<T>(
  env: Env,
  roomId: string,
  path: string,
  init: RequestInit,
): Promise<{ ok: true; value: T } | { ok: false; error: RoomErrorResponse; status: number }> {
  const res = await roomStub(env, roomId).fetch(new Request(`https://room${path}`, init));
  if (res.status === 204) return { ok: true, value: undefined as T };
  const body = await res.json();
  if (!res.ok) return { ok: false, error: body as RoomErrorResponse, status: res.status };
  return { ok: true, value: body as T };
}

function jsonBody(value: unknown, auth?: string | undefined): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify(value),
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
  };
}

app.get("/health", (c) => c.json({ ok: true, datasetVersion: dataset.graph.datasetVersion }));

/** RecommendError の HTTP ステータス。POST とルーム側の両方が使う。 */
function recommendErrorStatus(code: RecommendError["code"]): 400 | 409 | 422 {
  if (code === "dataset_mismatch") return 409;
  if (code === "disconnected" || code === "no_feasible_meeting") return 422;
  return 400;
}

app.post(
  "/v1/recommendations",
  // JSON 自体が壊れているときは、スキーマ検証の前に弾く。
  async (c, next) => {
    try {
      await c.req.json();
    } catch {
      return c.json({ code: "invalid_request" as const, messageJa: "JSON を読めません" }, 400);
    }
    await next();
  },
  vValidator("json", RecommendationRequestSchema, (result, c) => {
    if (!result.success) {
      const first = result.issues[0];
      return c.json(
        { code: "invalid_request" as const, messageJa: first?.message ?? "リクエストが読めません" },
        400,
      );
    }
  }),
  async (c) => {
    const parsed = c.req.valid("json");
    // スキーマは datasetId を文字列としてしか見ない（値違いは recommend() の
    // dataset_mismatch=409 に任せるため）。ここで型を合わせるだけで、値は検証しない。
    // `confirmed?`/`constraints?` は欄ごと省く形で詰め直す。valibot の optional() は
    // 「値が undefined でもキーはある」形を返すが、こちらの型は「キー自体が無い」の
    // で、exactOptionalPropertyTypes がそのままの代入を許さない。
    const body: RecommendationRequest = {
      datasetId: parsed.datasetId as RecommendationRequest["datasetId"],
      destination: parsed.destination,
      participants: parsed.participants.map((p) => ({
        id: p.id,
        entry: p.entry,
        ...(p.confirmed ? { confirmed: p.confirmed } : {}),
      })),
      ...(parsed.constraints
        ? {
            constraints: {
              ...(parsed.constraints.accessibility
                ? { accessibility: parsed.constraints.accessibility }
                : {}),
              ...(parsed.constraints.asOf ? { asOf: parsed.constraints.asOf } : {}),
            },
          }
        : {}),
    };
    try {
      return c.json(recommend(dataset, body));
    } catch (error) {
      if (error instanceof RecommendError) {
        return c.json(
          error.details
            ? { code: error.code, messageJa: error.messageJa, details: error.details }
            : { code: error.code, messageJa: error.messageJa },
          recommendErrorStatus(error.code),
        );
      }
      throw error;
    }
  },
);

/**
 * 出口の看板が応答と違ったときに、現地の表示を送る口(docs/RECOMMENDER.md)。
 * 認証は要らない。受け取ったらログに出すだけで、保存しない — 取り込みの
 * ラベルは人が確かめて data/labels/exits.json に戻すもので、送信をそのまま
 * 正にしない(SCREENS.md「間違っていることを前提にする」)。
 */
app.post(
  "/v1/exit-reports",
  vValidator("json", ExitReportRequestSchema, (result, c) => {
    if (!result.success) {
      const first = result.issues[0];
      return c.json(
        { code: "invalid_request" as const, messageJa: first?.message ?? "リクエストが読めません" },
        400,
      );
    }
  }),
  async (c) => {
    const { catalogId, labelJa } = c.req.valid("json");
    const exit = dataset.catalog.exits.find((e) => e.catalogId === catalogId);
    if (!exit) {
      return c.json({ code: "unknown_catalog" as const, messageJa: "出口が登録されていません" }, 400);
    }
    console.log(JSON.stringify({ type: "exit_report", catalogId, labelJa, was: exit.label }));
    return c.json({ ok: true } satisfies ExitReportResponse, 202);
  },
);

// ---------------------------------------------------------------- ルーム

const roomRoutes = app
  .get("/v1/catalog", (c) => c.json(publicCatalog(dataset)))

  .post("/v1/rooms", vValidator("json", CreateRoomSchema), async (c) => {
    const roomId = crypto.randomUUID();
    const inviteUrl = new URL(`/r/${roomId}`, c.req.url).toString();
    const query = `roomId=${roomId}&inviteUrl=${encodeURIComponent(inviteUrl)}`;
    const r = await callRoom<CreateRoomResult>(c.env, roomId, `/create?${query}`, {
      ...jsonBody(c.req.valid("json")),
    });
    if (!r.ok) return c.json(r.error, statusOf(r.error.code));
    return c.json(r.value, 201);
  })

  .get("/v1/rooms/:id", async (c) => {
    const r = await callRoom<Room>(c.env, c.req.param("id"), "/", { method: "GET" });
    if (!r.ok) return c.json(r.error, statusOf(r.error.code));
    return c.json(r.value);
  })

  /**
   * 通知用の WebSocket。101 の応答は `callRoom`（JSON に読み直す）に乗らないので、
   * この口だけ DO の fetch をそのまま返す。ヘッダ（Upgrade 含む）だけを転送し、
   * DO 側の `/ws` がアップグレード前の 404/410 と Upgrade ヘッダの有無を見る。
   */
  .get("/v1/rooms/:id/ws", async (c) => {
    const forwarded = new Request("https://room/ws", { headers: c.req.raw.headers });
    return roomStub(c.env, c.req.param("id")).fetch(forwarded);
  })

  .post("/v1/rooms/:id/participants", vValidator("json", JoinSchema), async (c) => {
    const id = c.req.param("id");
    const r = await callRoom<JoinResult>(c.env, id, "/participants", {
      ...jsonBody(c.req.valid("json")),
    });
    if (!r.ok) return c.json(r.error, statusOf(r.error.code));
    return c.json(r.value, 201);
  })

  .patch(
    "/v1/rooms/:id/participants/:pid",
    vValidator("json", UpdateParticipantSchema),
    async (c) => {
      const id = c.req.param("id");
      const r = await callRoom<Room>(c.env, id, `/participants/${c.req.param("pid")}`, {
        ...jsonBody(c.req.valid("json"), c.req.header("authorization")),
        method: "PATCH",
      });
      if (!r.ok) return c.json(r.error, statusOf(r.error.code));
      return c.json(r.value);
    },
  )

  .delete("/v1/rooms/:id/participants/:pid", async (c) => {
    const id = c.req.param("id");
    const r = await callRoom<void>(c.env, id, `/participants/${c.req.param("pid")}`, {
      method: "DELETE",
      headers: { authorization: c.req.header("authorization") ?? "" },
    });
    if (!r.ok) return c.json(r.error, statusOf(r.error.code));
    return c.body(null, 204);
  })

  .patch("/v1/rooms/:id", vValidator("json", UpdateRoomSchema), async (c) => {
    const id = c.req.param("id");
    const r = await callRoom<Room>(c.env, id, "/", {
      ...jsonBody(c.req.valid("json"), c.req.header("authorization")),
      method: "PATCH",
    });
    if (!r.ok) return c.json(r.error, statusOf(r.error.code));
    return c.json(r.value);
  })

  .delete("/v1/rooms/:id", async (c) => {
    const r = await callRoom<void>(c.env, c.req.param("id"), "/", {
      method: "DELETE",
      headers: { authorization: c.req.header("authorization") ?? "" },
    });
    if (!r.ok) return c.json(r.error, statusOf(r.error.code));
    return c.body(null, 204);
  })

  /**
   * ルームの状態から推薦を作る。保存しない。
   * 人が増えたり到着情報が変わるたびに変わるので、都度計算する。
   * 中身は `buildRoomRecommendations`（純関数）。ここは HTTP の形に直すだけ。
   */
  .get("/v1/rooms/:id/recommendations", async (c) => {
    const r = await callRoom<Room>(c.env, c.req.param("id"), "/", { method: "GET" });
    if (!r.ok) return c.json(r.error, statusOf(r.error.code));
    const limit = parseRoomRecommendationsLimit(c.req.query("limit"));

    try {
      return c.json(buildRoomRecommendations(dataset, r.value, limit));
    } catch (error) {
      if (error instanceof RecommendError) {
        return c.json(
          error.details
            ? { code: error.code, messageJa: error.messageJa, details: error.details }
            : { code: error.code, messageJa: error.messageJa },
          recommendErrorStatus(error.code),
        );
      }
      if (error instanceof RoomError) {
        return c.json(
          error.details
            ? { code: error.code, messageJa: error.messageJa, details: error.details }
            : { code: error.code, messageJa: error.messageJa },
          statusOf(error.code),
        );
      }
      throw error;
    }
  });

/**
 * Hono RPC 用の型。ただし web はこれを import していない —
 * `AppType` は `DurableObjectNamespace` を参照していて、web 側の tsc からは解決できない。
 * web は `contract.ts` / `room.ts` の型だけを type-only import し、素の fetch で叩く
 * （`apps/web/src/api.ts`）。ここでは型を捨てないために export だけ残す。
 */
export type AppType = typeof roomRoutes;

export default app;
