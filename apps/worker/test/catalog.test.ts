import { describe, expect, it, vi } from "vitest";
import catalogJson from "../data/catalog.json" with { type: "json" };
import type { Catalog } from "../src/graph.js";
import app from "../src/index.js";

describe("GET /health", () => {
  it("datasetVersion を返す", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; datasetVersion: string };
    expect(body.ok).toBe(true);
    expect(body.datasetVersion.length).toBeGreaterThan(0);
  });
});

describe("GET /v1/catalog", () => {
  it("路線と目的地プリセットだけ返す", async () => {
    const res = await app.request("/v1/catalog");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      lines: { id: string; nameJa: string }[];
      destinations: { catalogId: string; nameJa: string; lat: number; lng: number }[];
    };
    // 改札を持つ路線をすべて出す。実データでは JR・京王・丸ノ内・小田急・
    // 大江戸・都営新宿・西武新宿。
    expect(body.lines.map((l) => l.id)).toEqual([
      "line.jr",
      "line.keio",
      "line.marunouchi",
      "line.odakyu",
      "line.oedo",
      "line.shinjuku",
      "line.seibu",
    ]);
    expect(body.destinations.some((d) => d.catalogId === "dest.tokyo-metropolitan-government")).toBe(
      true,
    );
    expect(body).not.toHaveProperty("entries");
    expect(body).not.toHaveProperty("meetings");
    expect(body).not.toHaveProperty("exits");
    expect(body).not.toHaveProperty("nodes");
    expect(body).not.toHaveProperty("links");
  });

  it("ドリフト検知: 改札を持つ路線は実データの entries[].lineIds を全部拾えている(取り込み直しで路線が増えても静かに消えない)", async () => {
    const catalog = catalogJson as Catalog;
    const lineIdsWithGates = new Set<string>();
    for (const entry of catalog.entries) {
      for (const lineId of entry.lineIds) lineIdsWithGates.add(lineId);
    }
    expect(lineIdsWithGates.size).toBeGreaterThan(0);

    const res = await app.request("/v1/catalog");
    const body = (await res.json()) as { lines: { id: string; nameJa: string }[] };
    const knownIds = new Set(body.lines.map((l) => l.id));

    for (const lineId of lineIdsWithGates) {
      expect(knownIds.has(lineId)).toBe(true);
    }
  });

  describe("ドリフト検知(逆方向): 一覧の各路線に改札が1つ以上ある", () => {
    const catalog = catalogJson as Catalog;
    const lineIdsWithGates = new Set<string>();
    for (const entry of catalog.entries) {
      for (const lineId of entry.lineIds) lineIdsWithGates.add(lineId);
    }

    it.each([
      ["line.jr", "JR"],
      ["line.keio", "京王"],
      ["line.marunouchi", "丸ノ内"],
      ["line.odakyu", "小田急"],
      ["line.oedo", "大江戸"],
      ["line.shinjuku", "都営新宿"],
      ["line.seibu", "西武新宿"],
    ])("%s (%s) に改札がある", (lineId) => {
      expect(lineIdsWithGates.has(lineId)).toBe(true);
    });
  });
});

describe("POST /v1/recommendations（F2: valibot による検証）", () => {
  const validBody = {
    datasetId: "tokyo.shinjuku-terminal",
    destination: { kind: "catalog", id: "dest.tokyo-metropolitan-government" },
    participants: [
      { id: "jr", entry: { kind: "line", id: "line.jr" } },
      { id: "keio", entry: { kind: "line", id: "line.keio" } },
    ],
  };

  const post = (body: unknown) =>
    app.request("/v1/recommendations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("妥当な入力は 200 で ranked を返す", async () => {
    const res = await post(validBody);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ranked: unknown[] };
    expect(body.ranked.length).toBeGreaterThan(0);
  });

  it("手順と経路 ID は返さない", async () => {
    const res = await post(validBody);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ranked: { legs: object[]; onward: object }[];
    };
    const first = body.ranked[0]!;
    expect(first.legs[0]).not.toHaveProperty("steps");
    expect(first.legs[0]).not.toHaveProperty("pathNodeIds");
    expect(first.legs[0]).not.toHaveProperty("pathLinkIds");
    expect(first.legs[0]).not.toHaveProperty("confirmations");
    expect(first.onward).not.toHaveProperty("steps");
    expect(first.onward).not.toHaveProperty("pathNodeIds");
    expect(first.onward).not.toHaveProperty("pathLinkIds");
    expect(first.onward).toHaveProperty("exit");
    expect(first.onward).toHaveProperty("distanceM");
  });

  it("壊れた JSON は 400 invalid_request", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; messageJa: string };
    expect(body.code).toBe("invalid_request");
    expect(body.messageJa.length).toBeGreaterThan(0);
  });

  it("欄が欠けていると 400 invalid_request（スキーマ検証）", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; messageJa: string };
    expect(body.code).toBe("invalid_request");
    expect(body.messageJa.length).toBeGreaterThan(0);
  });

  it("参加者が1人だけだと 400 invalid_request（スキーマの minLength）", async () => {
    const res = await post({ ...validBody, participants: [validBody.participants[0]] });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("invalid_request");
  });

  it("entry の kind が知らない値だと 400 invalid_request", async () => {
    const res = await post({
      ...validBody,
      participants: [
        { id: "a", entry: { kind: "station", id: "x" } },
        { id: "b", entry: { kind: "line", id: "line.keio" } },
      ],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("invalid_request");
  });

  it("参加者の ID 重複はスキーマでは見ない。recommend() の invalid_participants のまま", async () => {
    const res = await post({
      ...validBody,
      participants: [
        { id: "same", entry: { kind: "line", id: "line.jr" } },
        { id: "same", entry: { kind: "line", id: "line.keio" } },
      ],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("invalid_participants");
  });

  it("知らないデータセット ID はスキーマでは通し、recommend() が 409 dataset_mismatch にする", async () => {
    const res = await post({ ...validBody, datasetId: "other" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("dataset_mismatch");
  });
});

describe("POST /v1/exit-reports", () => {
  const post = (body: unknown) =>
    app.request("/v1/exit-reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("正しい入力は 202 を返し、ログに 1 行出すだけで保存しない", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const res = await post({ catalogId: "exit.242583a94cd94ff7b213f5c4608e93f1", labelJa: "地下1出口" });
      expect(res.status).toBe(202);
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);

      expect(spy).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(spy.mock.calls[0]?.[0] as string) as Record<string, unknown>;
      expect(logged).toEqual({
        type: "exit_report",
        catalogId: "exit.242583a94cd94ff7b213f5c4608e93f1",
        labelJa: "地下1出口",
        was: "7",
      });
    } finally {
      spy.mockRestore();
    }
  });

  it("知らない catalogId は 400 unknown_catalog", async () => {
    const res = await post({ catalogId: "exit.no-such-exit", labelJa: "17番出口" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("unknown_catalog");
  });

  it("空の labelJa は 400 invalid_request", async () => {
    const res = await post({ catalogId: "exit.242583a94cd94ff7b213f5c4608e93f1", labelJa: "" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("invalid_request");
  });

  it("catalogId が欠けていると 400 invalid_request", async () => {
    const res = await post({ labelJa: "17番出口" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("invalid_request");
  });
});
