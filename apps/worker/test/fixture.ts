import type { Catalog, Dataset, Graph, GraphLink, GraphNode, VerticalKind } from "../src/graph.js";

/**
 * 実データが無くても契約を固定するための小さなグラフ。
 * 改札 7（3 路線ぶん、うち 1 つは連絡改札）、集合候補 3、出口 2、階段 1 本。
 * 距離は読みやすい値を直接置く。座標は手順の方向を出すためだけに使う。
 */

type NodeSpec = [id: string, x: number, y: number, nameJa: string | null, floorLabel: string];

const NODE_SPECS: NodeSpec[] = [
  // x を 0 でなく 1 にする。(0,0) は worker 側で「座標未取得」センチネル扱い
  // になるため、実在する改札をそこに置かない。
  ["g.jr.west", 1, 0, "JR 西口改札", "B1"],
  ["g.keio.west", 0, 40, "京王線 西口改札", "B1"],
  ["g.maru.west", 0, 90, "丸ノ内線 西口方面改札", "B1"],
  ["g.jr.south", 0, 200, "JR 南口改札", "B1"],
  ["g.keio.main", 0, 260, "京王線 中央口改札", "B1"],
  ["g.maru.east", 0, 330, "丸ノ内線 東口方面改札", "B1"],
  ["g.transfer", 0, 160, "京王・丸ノ内線 連絡改札", "B1"],
  ["hall", 100, 150, null, "B1"],
  ["u1", 150, 150, null, "B1"],
  ["branch", 200, 150, null, "B1"],
  ["m.koban", 280, 150, "西口交番前", "B1"],
  ["m.board", 200, 80, "B1 案内板前", "B1"],
  ["m.south", 200, 230, "南通路広場", "1F"],
  ["e.west", 330, 150, "西口地上出口", "1F"],
  ["e.east", 200, 300, "東口地上出口", "1F"],
];

type LinkSpec = [
  id: string,
  a: string,
  b: string,
  distanceM: number,
  deltaZ?: number,
  vertical?: VerticalKind,
];

const LINK_SPECS: LinkSpec[] = [
  ["l.jr.west", "g.jr.west", "hall", 180],
  ["l.keio.west", "g.keio.west", "hall", 150],
  ["l.maru.west", "g.maru.west", "hall", 120],
  ["l.jr.south", "g.jr.south", "hall", 110],
  ["l.keio.main", "g.keio.main", "hall", 160],
  ["l.maru.east", "g.maru.east", "hall", 210],
  ["l.transfer", "g.transfer", "hall", 130],
  ["l.hall.u1", "hall", "u1", 50],
  ["l.u1.branch", "u1", "branch", 50],
  ["l.branch.koban", "branch", "m.koban", 80],
  ["l.branch.board", "branch", "m.board", 60],
  ["l.branch.south", "branch", "m.south", 70, 1, "stairs"],
  ["l.koban.ewest", "m.koban", "e.west", 40],
  ["l.south.eeast", "m.south", "e.east", 40],
];

function buildGraph(): Graph {
  const nodes: GraphNode[] = NODE_SPECS.map(([id, x, y, nameJa, floorLabel]) => ({
    id,
    nameJa,
    floorLabel,
    x,
    y,
  }));

  const links: GraphLink[] = [];
  for (const [id, a, b, distanceM, deltaZ = 0, vertical = "none"] of LINK_SPECS) {
    links.push({ id: `${id}.f`, from: a, to: b, distanceM, deltaZ, vertical, hours: null });
    links.push({ id: `${id}.r`, from: b, to: a, distanceM, deltaZ: -deltaZ, vertical, hours: null });
  }

  return {
    datasetId: "tokyo.shinjuku-terminal",
    datasetVersion: "fixture-1",
    graphHash: "fixture",
    attributionJa: "東京都「新宿駅周辺の施設情報及び移動ルート」（CC BY 4.0）",
    nodes,
    links,
  };
}

const catalog: Catalog = {
  lines: [
    { id: "line.jr", nameJa: "JR" },
    { id: "line.keio", nameJa: "京王" },
    { id: "line.marunouchi", nameJa: "丸ノ内" },
  ],
  entries: [
    { catalogId: "entry.jr.west", lineIds: ["line.jr"], nodeId: "g.jr.west", nameJa: "JR 西口改札" },
    { catalogId: "entry.jr.south", lineIds: ["line.jr"], nodeId: "g.jr.south", nameJa: "JR 南口改札" },
    {
      catalogId: "entry.keio.west",
      lineIds: ["line.keio"],
      nodeId: "g.keio.west",
      nameJa: "京王線 西口改札",
    },
    {
      catalogId: "entry.keio.main",
      lineIds: ["line.keio"],
      nodeId: "g.keio.main",
      nameJa: "京王線 中央口改札",
    },
    {
      catalogId: "entry.marunouchi.west",
      lineIds: ["line.marunouchi"],
      nodeId: "g.maru.west",
      nameJa: "丸ノ内線 西口方面改札",
    },
    {
      catalogId: "entry.marunouchi.east",
      lineIds: ["line.marunouchi"],
      nodeId: "g.maru.east",
      nameJa: "丸ノ内線 東口方面改札",
    },
    {
      catalogId: "entry.transfer",
      lineIds: ["line.keio", "line.marunouchi"],
      nodeId: "g.transfer",
      nameJa: "京王・丸ノ内線 連絡改札",
    },
  ],
  meetings: [
    {
      catalogId: "meet.koban",
      nodeId: "m.koban",
      nameJa: "西口交番前",
      explainability: 3,
      evidence: "hypothesis",
      // 50m ちょうど(しきい値の境界)。elevator: true。
      elevatorM: 50,
      // しきい値を超える。restroom: false。
      restroomM: 50.1,
    },
    {
      catalogId: "meet.board",
      nodeId: "m.board",
      nameJa: "B1 案内板前",
      explainability: 2,
      evidence: "hypothesis",
      // 届かない(null)。elevator: false。
      elevatorM: null,
      restroomM: 10,
    },
    {
      catalogId: "meet.south",
      nodeId: "m.south",
      nameJa: "南通路広場",
      explainability: 1,
      evidence: "hypothesis",
      elevatorM: 80,
      // 0m(境界)。restroom: true。
      restroomM: 0,
    },
  ],
  exits: [
    {
      catalogId: "exit.west",
      nodeId: "e.west",
      label: "15",
      nameJa: "出口 15",
      evidence: "checked",
      lat: 35.6896,
      lng: 139.6985,
    },
    {
      catalogId: "exit.east",
      nodeId: "e.east",
      label: "",
      nameJa: "地上出口",
      evidence: "hypothesis",
      lat: 35.6938,
      lng: 139.7025,
    },
  ],
  destinations: [
    { catalogId: "dest.tokyo-metropolitan-government", nameJa: "東京都庁", lat: 35.6896, lng: 139.6917 },
    { catalogId: "dest.kabukicho", nameJa: "歌舞伎町", lat: 35.6950, lng: 139.7030 },
  ],
};

export const fixture: Dataset = { graph: buildGraph(), catalog };
