// 前処理後の内部グラフと地点カタログ。
// 東京都データの取り込みは TOK-10。ここは取り込み後の形だけを定義する。

export type VerticalKind = "none" | "stairs" | "escalator" | "elevator" | "unknown";

export type GraphNode = {
  id: string;
  levelIds: string[];
  geomIds: string[];
  nameJa: string | null;
  floorLabel: string | null;
  /** 平面座標。手順の方向を出すために使う。単位はメートル。 */
  x: number;
  y: number;
};

export type GraphLink = {
  id: string;
  from: string;
  to: string;
  distanceM: number;
  deltaZ: number;
  vertical: VerticalKind;
  hours: { start: string; end: string } | null;
};

export type Graph = {
  datasetId: "tokyo.shinjuku-terminal";
  datasetVersion: string;
  graphHash: string;
  attributionJa: string;
  nodes: GraphNode[];
  links: GraphLink[];
};

export type EntryCatalogEntry = {
  catalogId: string;
  /** 1 つの改札が複数の路線に対応することがある（連絡改札）。 */
  lineIds: string[];
  nodeId: string;
  nameJa: string;
};

export type MeetingCatalogEntry = {
  catalogId: string | null;
  nodeId: string;
  nameJa: string;
  explainability: number;
  evidence: "hypothesis" | "field_confirmed";
};

export type ExitCatalogEntry = {
  catalogId: string;
  nodeId: string;
  /** 看板に書いてある文字。番号・記号・空のいずれか。現地がそうなっている。 */
  label: string;
  nameJa: string;
  /** 取り込んだだけか、人が見て確かめたか。 */
  evidence: "hypothesis" | "checked";
  lat: number;
  lng: number;
};

export type DestinationCatalogEntry = {
  catalogId: string;
  nameJa: string;
  lat: number;
  lng: number;
};

export type Catalog = {
  entries: EntryCatalogEntry[];
  meetings: MeetingCatalogEntry[];
  exits: ExitCatalogEntry[];
  destinations: DestinationCatalogEntry[];
};

export type Dataset = {
  graph: Graph;
  catalog: Catalog;
};

export type Adjacency = Map<string, { linkId: string; to: string }[]>;

/**
 * 隣接リスト。リンクは前処理の時点で from -> to の向きに開かれている前提。
 * 東京都データの `d`（1=順方向 2=逆方向 3=双方向）は取り込みで解く。
 */
export function buildAdjacency(graph: Graph): Adjacency {
  const adjacency: Adjacency = new Map();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  for (const link of graph.links) {
    const list = adjacency.get(link.from);
    if (!list) throw new Error(`link ${link.id} references unknown node ${link.from}`);
    if (!adjacency.has(link.to)) throw new Error(`link ${link.id} references unknown node ${link.to}`);
    list.push({ linkId: link.id, to: link.to });
  }
  return adjacency;
}

/**
 * 逆向きの隣接リスト。各リンクの to → from。リンク ID は元のまま。
 * 集合場所→出口の距離を、出口を始点にした多点最短で出すために使う。
 * 通行可能性は元のリンクを見る。
 */
export function buildReverseAdjacency(graph: Graph): Adjacency {
  const adjacency: Adjacency = new Map();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  for (const link of graph.links) {
    const list = adjacency.get(link.to);
    if (!list) throw new Error(`link ${link.id} references unknown node ${link.to}`);
    if (!adjacency.has(link.from)) throw new Error(`link ${link.id} references unknown node ${link.from}`);
    list.push({ linkId: link.id, to: link.from });
  }
  return adjacency;
}

export function indexNodes(graph: Graph): Map<string, GraphNode> {
  return new Map(graph.nodes.map((n) => [n.id, n]));
}

export function indexLinks(graph: Graph): Map<string, GraphLink> {
  return new Map(graph.links.map((l) => [l.id, l]));
}

/** 次数。両端を数える。生の次数で、行き止まり枝も数える。 */
export function degrees(graph: Graph): Map<string, number> {
  const degree = new Map<string, number>();
  for (const node of graph.nodes) degree.set(node.id, 0);
  const seen = new Set<string>();
  for (const link of graph.links) {
    const key = link.from < link.to ? `${link.from}|${link.to}` : `${link.to}|${link.from}`;
    if (seen.has(key)) continue;
    seen.add(key);
    degree.set(link.from, (degree.get(link.from) ?? 0) + 1);
    degree.set(link.to, (degree.get(link.to) ?? 0) + 1);
  }
  return degree;
}

/**
 * 実分岐の次数。行き止まりの枝（設備への袋小路。相手端点の生の次数が 1 の辺）を
 * 除いて数える。生の次数（{@link degrees}）で分岐点を決めると、ATM やトイレへの
 * 枝がすべて分岐扱いになり、`steps` の区切りや `confirmations` の確認点が溢れる
 * （網には行き止まり枝が 742 本ある。docs/RECOMMENDER.md「実分岐」）。
 * `branchCount` と `confirmations` の branch 判定はこちらを使う。
 */
export function branchDegrees(graph: Graph): Map<string, number> {
  const raw = degrees(graph);
  const branch = new Map<string, number>();
  for (const node of graph.nodes) branch.set(node.id, 0);
  const seen = new Set<string>();
  for (const link of graph.links) {
    const key = link.from < link.to ? `${link.from}|${link.to}` : `${link.to}|${link.from}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const fromIsLeaf = (raw.get(link.from) ?? 0) === 1;
    const toIsLeaf = (raw.get(link.to) ?? 0) === 1;
    if (!toIsLeaf) branch.set(link.from, (branch.get(link.from) ?? 0) + 1);
    if (!fromIsLeaf) branch.set(link.to, (branch.get(link.to) ?? 0) + 1);
  }
  return branch;
}
