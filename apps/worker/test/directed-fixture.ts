import type { Catalog, Dataset, Graph, GraphLink, GraphNode } from "../src/graph.js";

/**
 * 往復を置かない有向グラフ。双方向 fixture とは別物。
 *
 * - 集合場所 → 西口 / 東口 だけ通れる
 * - 出口 e.trap → 集合場所 だけ通れる（順方向で出口から探すとこれが使われる）
 */
function node(id: string, x: number, y: number, nameJa: string | null, floorLabel: string): GraphNode {
  return { id, levelIds: [floorLabel], geomIds: [], nameJa, floorLabel, x, y };
}

function link(id: string, from: string, to: string, distanceM: number): GraphLink {
  return { id, from, to, distanceM, deltaZ: 0, vertical: "none", hours: null };
}

const graph: Graph = {
  datasetId: "tokyo.shinjuku-terminal",
  datasetVersion: "directed-1",
  graphHash: "directed",
  attributionJa: "テスト用の有向グラフ",
  nodes: [
    // x を 0 でなく 1 にする。(0,0) は worker 側で「座標未取得」センチネル扱い
    // になるため、実在する改札をそこに置かない。
    node("g.a", 1, 0, "改札A", "B1"),
    node("g.b", 0, 100, "改札B", "B1"),
    node("m.meet", 100, 50, "集合場所", "B1"),
    node("e.west", 200, 0, "西口", "1F"),
    node("e.east", 200, 100, "東口", "1F"),
    node("e.trap", 100, 200, "逆向きだけの出口", "1F"),
  ],
  links: [
    link("l.a.meet", "g.a", "m.meet", 80),
    link("l.b.meet", "g.b", "m.meet", 90),
    link("l.meet.west", "m.meet", "e.west", 50),
    link("l.meet.east", "m.meet", "e.east", 40),
    link("l.trap.meet", "e.trap", "m.meet", 10),
  ],
};

const catalog: Catalog = {
  entries: [
    { catalogId: "entry.a", lineIds: ["line.a"], nodeId: "g.a", nameJa: "改札A" },
    { catalogId: "entry.b", lineIds: ["line.b"], nodeId: "g.b", nameJa: "改札B" },
  ],
  meetings: [
    {
      catalogId: "meet.one",
      nodeId: "m.meet",
      nameJa: "集合場所",
      explainability: 1,
      evidence: "hypothesis",
    },
  ],
  exits: [
    {
      catalogId: "exit.west",
      nodeId: "e.west",
      label: "W",
      nameJa: "西口",
      evidence: "checked",
      lat: 35.6896,
      lng: 139.6985,
    },
    {
      catalogId: "exit.east",
      nodeId: "e.east",
      label: "E",
      nameJa: "東口",
      evidence: "checked",
      lat: 35.6938,
      lng: 139.7025,
    },
    {
      catalogId: "exit.trap",
      nodeId: "e.trap",
      label: "",
      nameJa: "逆向きだけの出口",
      evidence: "hypothesis",
      lat: 35.692,
      lng: 139.7,
    },
  ],
  destinations: [
    { catalogId: "dest.west", nameJa: "西側", lat: 35.6896, lng: 139.6917 },
    { catalogId: "dest.east", nameJa: "東側", lat: 35.695, lng: 139.703 },
    { catalogId: "dest.trap", nameJa: "逆向き出口のそば", lat: 35.692, lng: 139.7 },
  ],
};

export const directedFixture: Dataset = { graph, catalog };
