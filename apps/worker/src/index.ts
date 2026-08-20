import { Hono } from "hono";
import type { RecommendationRequest } from "./contract.js";
import type { Dataset } from "./graph.js";
import { RecommendError, recommend } from "./recommend.js";
import { vValidator } from "@hono/valibot-validator";
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

let dataset: Dataset | null = null;

export function setDataset(next: Dataset): void {
  dataset = next;
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

app.get("/health", (c) => c.json({ ok: true, dataset: dataset?.graph.datasetVersion ?? null }));

app.post("/v1/recommendations", async (c) => {
  if (!dataset) {
    return c.json({ code: "dataset_mismatch", messageJa: "データセットが読み込まれていません" }, 503);
  }
  let body: RecommendationRequest;
  try {
    body = (await c.req.json()) as RecommendationRequest;
  } catch {
    return c.json({ code: "invalid_participants", messageJa: "JSON を読めません" }, 400);
  }

  try {
    return c.json(recommend(dataset, body));
  } catch (error) {
    if (error instanceof RecommendError) {
      const status =
        error.code === "dataset_mismatch"
          ? 409
          : error.code === "disconnected" || error.code === "no_feasible_meeting"
            ? 422
            : 400;
      return c.json(
        error.details
          ? { code: error.code, messageJa: error.messageJa, details: error.details }
          : { code: error.code, messageJa: error.messageJa },
        status,
      );
    }
    throw error;
  }
});

// ---------------------------------------------------------------- ルーム

const roomRoutes = app
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
   */
  .get("/v1/rooms/:id/recommendations", async (c) => {
    if (!dataset) {
      return c.json(
        { code: "dataset_mismatch" as const, messageJa: "データセットが読み込まれていません" },
        503,
      );
    }
    const r = await callRoom<Room>(c.env, c.req.param("id"), "/", { method: "GET" });
    if (!r.ok) return c.json(r.error, statusOf(r.error.code));
    const room = r.value;

    const ready = room.participants.filter((p) => p.entry !== null);
    if (ready.length < 2) {
      return c.json(
        {
          code: "not_enough_participants" as const,
          messageJa: "到着情報がそろっていません",
          details: { waitingFor: room.participants.filter((p) => p.entry === null).map((p) => p.id) },
        },
        409,
      );
    }

    try {
      return c.json(
        recommend(dataset, {
          datasetId: room.datasetId,
          destination: { kind: "catalog", id: room.destination.catalogId ?? "" },
          participants: ready.map((p) => ({
            id: p.id,
            entry: p.entry!,
            ...(p.confirmed ? { confirmed: p.confirmed } : {}),
          })),
        }),
      );
    } catch (error) {
      if (error instanceof RecommendError) {
        const status =
          error.code === "dataset_mismatch"
            ? 409
            : error.code === "disconnected" || error.code === "no_feasible_meeting"
              ? 422
              : 400;
        return c.json({ code: error.code, messageJa: error.messageJa }, status);
      }
      if (error instanceof RoomError) {
        return c.json({ code: error.code, messageJa: error.messageJa }, statusOf(error.code));
      }
      throw error;
    }
  });

/** Hono RPC が使う型。フロントはこれを import して口を叩く。 */
export type AppType = typeof roomRoutes;

export default app;
