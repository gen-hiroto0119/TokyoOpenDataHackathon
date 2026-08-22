import type { Catalog, Dataset, Graph, GraphLink, GraphNode } from "../src/graph.js";

/**
 * hours（時間帯制約）だけを試すための独立した小さなグラフ。
 * 実データには `hours` 付きリンクが 0 件なので、既存の fixture.ts / directed-fixture.ts
 * には無い辺が要る。既存の共有 fixture に辺を足すと 48 件の既存テストの経路が
 * 変わってしまうため、ここだけの専用グラフとして新設する。
 *
 * - 改札 g.a / g.b → hall → 集合候補 3 つ
 *   - m.day: 昼だけの帯（09:00-20:00、日をまたがない）
 *   - m.night: 夜だけの帯（22:00-05:00、日をまたぐ）
 *   - m.free: 常に通れる（対照群。hours が無くても候補が残ることを保証する）
 * - 集合候補 3 つはそれぞれ出口 e.exit へつながる
 */
function node(id: string, x: number, y: number, nameJa: string | null, floorLabel: string): GraphNode {
  return { id, levelIds: [floorLabel], geomIds: [], nameJa, floorLabel, x, y };
}

function link(
  id: string,
  from: string,
  to: string,
  distanceM: number,
  hours: { start: string; end: string } | null = null,
): GraphLink {
  return { id, from, to, distanceM, deltaZ: 0, vertical: "none", hours };
}

const graph: Graph = {
  datasetId: "tokyo.shinjuku-terminal",
  datasetVersion: "hours-1",
  graphHash: "hours",
  attributionJa: "テスト用の hours グラフ",
  nodes: [
    // x を 0 でなく 1 にする。(0,0) は worker 側で「座標未取得」センチネル扱い
    // になるため、実在する改札をそこに置かない。
    node("g.a", 1, 0, "改札A", "B1"),
    node("g.b", 0, 100, "改札B", "B1"),
    node("hall", 100, 50, null, "B1"),
    node("m.day", 200, 0, "昼だけ広場", "B1"),
    node("m.night", 200, 50, "夜だけ広場", "B1"),
    node("m.free", 200, 100, "いつでも広場", "B1"),
    node("e.exit", 300, 50, "地上出口", "1F"),
  ],
  links: [
    link("l.a.hall", "g.a", "hall", 10),
    link("l.b.hall", "g.b", "hall", 10),
    link("l.hall.day", "hall", "m.day", 20, { start: "09:00", end: "20:00" }),
    link("l.hall.night", "hall", "m.night", 25, { start: "22:00", end: "05:00" }),
    link("l.hall.free", "hall", "m.free", 30),
    link("l.day.exit", "m.day", "e.exit", 5),
    link("l.night.exit", "m.night", "e.exit", 5),
    link("l.free.exit", "m.free", "e.exit", 5),
  ],
};

const catalog: Catalog = {
  entries: [
    { catalogId: "entry.a", lineIds: ["line.a"], nodeId: "g.a", nameJa: "改札A" },
    { catalogId: "entry.b", lineIds: ["line.b"], nodeId: "g.b", nameJa: "改札B" },
  ],
  meetings: [
    {
      catalogId: "meet.day",
      nodeId: "m.day",
      nameJa: "昼だけ広場",
      explainability: 1,
      evidence: "hypothesis",
    },
    {
      catalogId: "meet.night",
      nodeId: "m.night",
      nameJa: "夜だけ広場",
      explainability: 1,
      evidence: "hypothesis",
    },
    {
      catalogId: "meet.free",
      nodeId: "m.free",
      nameJa: "いつでも広場",
      explainability: 1,
      evidence: "hypothesis",
    },
  ],
  exits: [
    {
      catalogId: "exit.main",
      nodeId: "e.exit",
      label: "1",
      nameJa: "出口 1",
      evidence: "checked",
      lat: 35.6896,
      lng: 139.6985,
    },
  ],
  destinations: [{ catalogId: "dest.somewhere", nameJa: "どこか", lat: 35.6896, lng: 139.6917 }],
};

export const hoursFixture: Dataset = { graph, catalog };
