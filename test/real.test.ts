import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RecommendationRequest } from "../src/contract.js";
import type { Catalog, Dataset, Graph } from "../src/graph.js";
import { recommend } from "../src/recommend.js";

/**
 * 実データのテスト。`data/graph/*.json` があるときだけ走る。
 * 作り方は `tools/ingest`。ZIP はリポジトリに入れない。
 */
const GRAPH = "data/graph/graph.json";
const CATALOG = "data/graph/catalog.json";
const ready = existsSync(GRAPH) && existsSync(CATALOG);

describe.skipIf(!ready)("実データ", () => {
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
      `出口まで ${Math.round(top.scores.onwardDistanceM)}m（${top.onward.outdoorAnchor.nameJa}）`,
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

  it("出口は目的地に一番近いものが選ばれる", () => {
    const west = recommend(dataset, request).ranked[0]!.onward.outdoorAnchor;
    const east = recommend(dataset, {
      ...request,
      destination: { kind: "catalog", id: "dest.kabukicho" },
    }).ranked[0]!.onward.outdoorAnchor;
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
