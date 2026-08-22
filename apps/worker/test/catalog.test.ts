import { describe, expect, it } from "vitest";
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
    expect(body.lines.map((l) => l.id)).toEqual(["line.jr", "line.keio", "line.marunouchi"]);
    expect(body.destinations.some((d) => d.catalogId === "dest.tokyo-metropolitan-government")).toBe(
      true,
    );
    expect(body).not.toHaveProperty("entries");
    expect(body).not.toHaveProperty("meetings");
    expect(body).not.toHaveProperty("exits");
    expect(body).not.toHaveProperty("nodes");
    expect(body).not.toHaveProperty("links");
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
