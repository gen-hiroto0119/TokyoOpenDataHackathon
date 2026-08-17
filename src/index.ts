import { Hono } from "hono";
import type { RecommendationRequest } from "./contract.js";
import type { Dataset } from "./graph.js";
import { RecommendError, recommend } from "./recommend.js";

/**
 * 推薦 Worker。ステートレス。
 * グラフは起動時に読み、リクエストごとにパースし直さない。
 * ルームの状態は持たない（Durable Object は別）。
 */

let dataset: Dataset | null = null;

export function setDataset(next: Dataset): void {
  dataset = next;
}

const app = new Hono();

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

export default app;
