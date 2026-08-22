import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecommendationRequest } from "../src/contract.js";
import type { Catalog, Dataset, Graph } from "../src/graph.js";
import { recommend } from "../src/recommend.js";

/**
 * 実データのテスト。`apps/worker/data/*.json` を読む。
 * 作り方は `tools/ingest`（出力先は `apps/worker/data`）。ZIP はリポジトリに入れない。
 */
const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../data");
const GRAPH = join(dataDir, "graph.json");
const CATALOG = join(dataDir, "catalog.json");

describe("実データ", () => {
  const dataset: Dataset = {
    graph: JSON.parse(readFileSync(GRAPH, "utf8")) as Graph,
    catalog: JSON.parse(readFileSync(CATALOG, "utf8")) as Catalog,
  };

  const request: RecommendationRequest = {
    datasetId: "tokyo.shinjuku-terminal",
    destination: { kind: "catalog", id: "dest.tokyo-metropolitan-government" },
    participants: [
      { id: "ひろと", entry: { kind: "line", id: "line.marunouchi" } },
      { id: "かいる", entry: { kind: "line", id: "line.keio" } },
      { id: "あきな", entry: { kind: "line", id: "line.jr" } },
    ],
  };

  it("都庁へ向かう3人の集合場所を決められる", () => {
    const res = recommend(dataset, request);
    expect(res.ranked.length).toBeGreaterThan(0);

    const top = res.ranked[0]!;
    const lines = [
      "",
      `集合場所: ${top.meeting.nameJa}（${top.meeting.floorLabel}）`,
      `理由: ${top.reasons.map((r) => r.textJa).join(" / ")}`,
      `一番長い人 ${Math.round(top.scores.maxDistanceM)}m ・ 合計 ${Math.round(top.scores.sumDistanceM)}m`,
      `地上まで ${Math.round(top.scores.onwardDistanceM)}m（${top.onward.exit.nameJa}）`,
      ...top.legs.map(
        (l) =>
          `  ${l.participantId}: ${l.entry.nameJa} から ${Math.round(l.distanceM)}m ` +
          `${Math.round(l.costSeconds / 60)}分 ・ 階${l.floorChanges} ・ 分岐${l.branchCount} ・ 手順${l.steps.length}`,
      ),
      "",
      "次点:",
      ...res.ranked.slice(1, 4).map((r) => `  ${r.rank}. ${r.meeting.nameJa} 最長 ${Math.round(r.scores.maxDistanceM)}m`),
    ];
    console.log(lines.join("\n"));

    expect(top.meeting.nameJa).not.toBe("");
    expect(top.legs).toHaveLength(3);
    for (const leg of top.legs) {
      expect(leg.entry.nodeId).not.toBe("");
      expect(leg.steps.length).toBeGreaterThan(1);
      expect(leg.steps[0]!.kind).toBe("landmark");
    }
  });

  it("集合場所から地上へ出るまでを返す", () => {
    const top = recommend(dataset, request).ranked[0]!;
    console.log(
      `\n地上へ: ${top.onward.exit.nameJa}（看板「${top.onward.exit.label || "表示なし"}」）` +
        ` まで ${Math.round(top.onward.distanceM)}m`,
    );
    console.log(`そこから: ${top.onward.exit.mapsDirUrl}`);
    expect(top.onward.distanceM).toBeGreaterThan(0);
    expect(top.onward.pathNodeIds.length).toBeGreaterThan(1);
    expect(top.onward.exit.mapsDirUrl).toContain("travelmode=walking");
  });

  it("目的地が変われば出口も変わる", () => {
    const west = recommend(dataset, request).ranked[0]!.onward.exit;
    const east = recommend(dataset, {
      ...request,
      destination: { kind: "catalog", id: "dest.kabukicho" },
    }).ranked[0]!.onward.exit;
    console.log(`\n都庁 → ${west.nameJa} (${west.lat}, ${west.lng})`);
    console.log(`歌舞伎町 → ${east.nameJa} (${east.lat}, ${east.lng})`);
    expect(west.nodeId).not.toBe(east.nodeId);
  });

  it("同じ入力なら同じ結果", () => {
    expect(JSON.stringify(recommend(dataset, request))).toBe(
      JSON.stringify(recommend(dataset, request)),
    );
  });
});
