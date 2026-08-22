import type { Catalog, Dataset, Graph, GraphLink, GraphNode } from "../src/graph.js";

/**
 * 改札の同点タイ専用の小さなグラフ（F7）。
 *
 * `line.tie` に 2 つの改札 `a.gate` / `z.gate` を割り当て、
 * どちらを使っても集合場所 `m` までちょうど 100 になるようにする。
 *
 *   a.gate --50--> x --50--> m   （経由あり、合計100）
 *   z.gate --100-----------> m   （直結、合計100）
 *
 * shortestFrom はヒープを (距離, nodeId) の順で取り出す。両改札とも初期距離 0 で
 * 並ぶと `a.gate` が先に確定するが、そこから伸ばした `x` 経由の 100 は、
 * 先に届いていた `z.gate` の 100 を「厳密に縮めない」ので上書きしない
 * （同点は先着優先）。結果として選ばれる改札は `z.gate` になる。
 * `nodeId` の辞書順（a < z なら a が勝つ）とは一致しない具体例として固定する。
 * docs/CORE.md 48 行はこの決定規則（探索の取り出し順）に合わせて改訂済みで、
 * 「辞書順は保証しない」と明記している。
 */
function node(id: string, x: number, y: number, nameJa: string | null, floorLabel: string): GraphNode {
  return { id, levelIds: [floorLabel], geomIds: [], nameJa, floorLabel, x, y };
}

function link(id: string, from: string, to: string, distanceM: number): GraphLink {
  return { id, from, to, distanceM, deltaZ: 0, vertical: "none", hours: null };
}

const graph: Graph = {
  datasetId: "tokyo.shinjuku-terminal",
  datasetVersion: "tie-1",
  graphHash: "tie",
  attributionJa: "テスト用の同点タイグラフ",
  nodes: [
    // x を 0 でなく 1 にする。(0,0) は worker 側で「座標未取得」センチネル扱い
    // になるため、実在する改札をそこに置かない。
    node("a.gate", 1, 0, "改札A", "B1"),
    node("z.gate", 0, 100, "改札Z", "B1"),
    node("b.gate", 0, 200, "改札B", "B1"),
    node("x", 50, 0, null, "B1"),
    node("m", 100, 50, "集合場所", "B1"),
    node("e", 150, 50, "出口", "1F"),
    // 参加者からも出口からも辺の無い孤立ノード。infeasible reason "unreachable" の検証専用。
    node("isolated", 300, 300, "孤立広場", "B1"),
    // 参加者からは m 経由で届くが、出口へは一本も辺が無いノード。
    // 「制約を緩めても出口側が届かない＝グラフの欠け」を区別する検証専用
    // （参加者側だけを見る旧ロジックだと、ここが誤って `step_free`/`hours` になる）。
    node("onlyexit", 100, 150, "出口への辺が無い広場", "B1"),
  ],
  links: [
    link("l.a.x", "a.gate", "x", 50),
    link("l.x.m", "x", "m", 50),
    link("l.z.m", "z.gate", "m", 100),
    link("l.b.m", "b.gate", "m", 30),
    link("l.m.e", "m", "e", 20),
    link("l.m.onlyexit", "m", "onlyexit", 15),
  ],
};

const catalog: Catalog = {
  entries: [
    { catalogId: "entry.a", lineIds: ["line.tie"], nodeId: "a.gate", nameJa: "改札A" },
    { catalogId: "entry.z", lineIds: ["line.tie"], nodeId: "z.gate", nameJa: "改札Z" },
    { catalogId: "entry.b", lineIds: ["line.b"], nodeId: "b.gate", nameJa: "改札B" },
  ],
  meetings: [
    {
      catalogId: "meet.m",
      nodeId: "m",
      nameJa: "集合場所",
      explainability: 1,
      evidence: "hypothesis",
    },
    {
      catalogId: "meet.isolated",
      nodeId: "isolated",
      nameJa: "孤立広場",
      explainability: 1,
      evidence: "hypothesis",
    },
    {
      catalogId: "meet.onlyexit",
      nodeId: "onlyexit",
      nameJa: "出口への辺が無い広場",
      explainability: 1,
      evidence: "hypothesis",
    },
  ],
  exits: [
    {
      catalogId: "exit.e",
      nodeId: "e",
      label: "1",
      nameJa: "出口 1",
      evidence: "checked",
      lat: 35.6896,
      lng: 139.6985,
    },
  ],
  destinations: [{ catalogId: "dest.somewhere", nameJa: "どこか", lat: 35.6896, lng: 139.6917 }],
};

export const tieFixture: Dataset = { graph, catalog };
