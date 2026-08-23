// 国交省の統合版から graph.json / catalog.json を作る純関数。
// IO はしない（読むのは main.ts、書くのも main.ts）。
//
// しきい値は下の定数。変えるときは呼び出し側と検査も揃える。
//
// 決定性: すべての反復を id の昇順に固定し、同点は id の辞書順で決める。
// 同じ入力なら同じバイト列が出る（verify の V9 が二回実行で確かめる）。

import { createHash } from "node:crypto";
import type {
  Catalog,
  CatalogLine,
  DestinationCatalogEntry,
  EntryCatalogEntry,
  ExitCatalogEntry,
  Graph,
  GraphLink,
  GraphNode,
  MeetingCatalogEntry,
  VerticalKind,
} from "../../src/graph.ts";
import { distPointPolyline, distXY, project, type XY } from "./geo.ts";
import type { LatLng, MlitData, MlitLink, MlitOpening } from "./mlit.ts";
import {
  codeName,
  exitNameOf,
  exitOnly,
  explainOf,
  genericName,
  normalizeName,
  platformName,
  privateName,
} from "./rules.ts";

// ---------------------------------------------------------------- 定数

export const DATASET_ID = "tokyo.shinjuku-terminal" as const;

/** 平面座標の原点。データが変わっても座標が動かないように固定する。 */
export const ORIGIN = { lat: 35.69, lng: 139.7 } as const;

/** 国交省の利用規約の加工表記。 */
export const ATTRIBUTION_JA =
  "「新宿駅周辺屋内地図データ」（国土交通省）（https://www.geospatial.jp/ckan/dataset/mlit-indoor-shinjuku-r2）を加工して作成。";

/** ordinal → floorLabel の固定表（docs/DATA.md「階」）。中間階は上の階の名前に M を付ける。 */
export const FLOOR_LABELS: Readonly<Record<string, string>> = {
  "-3": "B3F",
  "-2.5": "MB2F",
  "-2": "B2F",
  "-1.5": "MB1F",
  "-1": "B1F",
  "-0.5": "M1F",
  "0": "1F",
  "1": "1F",
  "1.5": "M2F",
  "2": "2F",
  "2.5": "M3F",
  "3": "3F",
  "4": "4F",
  "4.5": "M5F",
};

export function floorLabelOf(ordinal: number): string {
  const label = FLOOR_LABELS[String(ordinal)];
  if (label === undefined) throw new Error(`固定表に無い ordinal: ${ordinal}`);
  return label;
}

/** 階の高さ。屋外の地表(0)と屋内の 1 階(1)は同じ高さ。 */
function zOf(ordinal: number): number {
  return ordinal <= 0 ? ordinal : ordinal - 1;
}

/** 階の差。0.5 は 1 にし、それ以外は整数に丸める。 */
export function deltaZOf(fromOrdinal: number, toOrdinal: number): number {
  const d = zOf(toOrdinal) - zOf(fromOrdinal);
  if (Math.abs(d) < 1e-9) return 0;
  return Math.sign(d) * Math.max(1, Math.round(Math.abs(d)));
}

// しきい値（m）。docs/DATA.md「取り込みでどう結ぶか」。
const GATE_ON_LINE_M = 1.0;
const GATE_SNAP_M = 10;
const MEETING_SNAP_M = 40;
const BUSTA_ON_LINE_M = 1.0;
const EXIT_SIGN_SNAP_M = 15;
const EXIT_OUTDOOR_PATH_M = 120;
const EXIT_OUTDOOR_XY_M = 25;
const EXIT_TWIN_M = 40;
const BOUNDARY_EXIT_CLEAR_M = 15;
const FACILITY_SNAP_M = 15;

/** トイレの POI（F001〜F008）と面（B007〜B014）。 */
const RESTROOM_POI = /^F00[1-8]$/;
const RESTROOM_SPACE = /^B0(0[7-9]|1[0-4])$/;

// ---------------------------------------------------------------- 入出力の型

export type GatesFile = Record<string, { nameJa: string; lineIds: string[]; source?: string }>;

export type LinesFile = CatalogLine[];

export type LandmarkKind = "mouth" | "police" | "info";

export type LandmarksFile = Record<string, { nameJa: string; kind: LandmarkKind }>;

export type ExitLabel = {
  labelJa?: string;
  exclude?: boolean;
  confirmed?: boolean;
  note?: string;
};
export type ExitLabelsFile = Record<string, ExitLabel | string>;

export type BuildInput = {
  mlit: MlitData;
  gates: GatesFile;
  lines: LinesFile;
  landmarks: LandmarksFile;
  exitLabels: ExitLabelsFile;
  version: string;
};

/** カタログの出口。src/graph.ts の型に labelSource を足したもの（人が見るための出どころ）。 */
export type ExitEntry = ExitCatalogEntry & { labelSource: string };

export type BuildCatalog = Omit<Catalog, "exits"> & { exits: ExitEntry[] };

export type BuildReport = {
  nodes: number;
  /** 向きを開いたあとの本数。 */
  links: number;
  entries: number;
  meetings: number;
  exits: number;
  destinations: number;
  /** 端点がノードに無いリンク（落とした）。 */
  droppedDanglingLinks: string[];
  /** 1m 以内に乗らず、10m まで寄せた改札。 */
  gatesSnapped: string[];
  /** 結べなかった改札。verify で落ちる。 */
  gatesUnresolved: string[];
  byLine: Record<string, number>;
  meetingSources: { gate: number; taxi: number; shop: number; opening: number; landmark: number };
  /** 国交省の中で同じ名前が複数あって外した名前。 */
  mlitDuplicateNames: string[];
  /** バスタ新宿の Opening を 1 候補へまとめた記録。 */
  bustaMerged: string[];
  /** 出場専用で改札にも集合にもしなかった Opening。 */
  gatesExitOnly: string[];
  /** 手書き地点の nodeId がグラフに無かったもの。 */
  landmarksUnresolved: string[];
  /** 40m 以内にノードが無かった名前。 */
  unsnapped: string[];
  /** 同じノードに寄った別名（両方残す。順位では推薦側が一つにまとめる）。 */
  sameNodeAliases: string[];
  snapDistancesM: number[];
  exitsClosed: string[];
  exitsNoNode: string[];
  exitsTwinDropped: number;
  /** 屋外ノードへ解けず看板の座標のままにした出口。 */
  exitsNoOutdoor: string[];
  exitsExcluded: string[];
  exitsManual: number;
  exitsChecked: number;
  exitsSameNodeDropped: string[];
  boundaryExits: number;
  verticalCounts: Record<string, number>;
  floorLabels: Record<string, number>;
};

export type BuildResult = {
  graph: Graph;
  catalog: BuildCatalog;
  report: BuildReport;
};

// ---------------------------------------------------------------- 内部の型と道具

type NodeRec = {
  node: GraphNode;
  ordinal: number;
  inOut: string;
  xy: XY;
  ll: LatLng;
};

type Edge = { to: string; distanceM: number };

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** (距離, nodeId) の順に取り出す最小ヒープ。src/recommend.ts の Heap と同じ形。 */
class DistHeap {
  private readonly items: { id: string; d: number }[] = [];

  private less(a: { id: string; d: number }, b: { id: string; d: number }): boolean {
    if (a.d !== b.d) return a.d < b.d;
    return a.id < b.id;
  }

  push(item: { id: string; d: number }): void {
    this.items.push(item);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(this.items[i]!, this.items[parent]!)) break;
      [this.items[i], this.items[parent]] = [this.items[parent]!, this.items[i]!];
      i = parent;
    }
  }

  pop(): { id: string; d: number } | undefined {
    const top = this.items[0];
    if (top === undefined) return undefined;
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let small = i;
        if (l < this.items.length && this.less(this.items[l]!, this.items[small]!)) small = l;
        if (r < this.items.length && this.less(this.items[r]!, this.items[small]!)) small = r;
        if (small === i) break;
        [this.items[i], this.items[small]] = [this.items[small]!, this.items[i]!];
        i = small;
      }
    }
    return top;
  }

  get size(): number {
    return this.items.length;
  }
}

const DIST_EPS = 1e-9;

/**
 * 多点始点の最短距離（値だけ）。同点の取り出し順は (距離, nodeId)、始点集合も
 * 辞書順に固定するので、二回実行しても同じ処理順になる。届かないノードは Map に無い。
 */
function multiSourceDistances(starts: Iterable<string>, adjacency: Map<string, Edge[]>): Map<string, number> {
  const best = new Map<string, number>();
  const queue = new DistHeap();
  for (const s of [...new Set(starts)].sort()) {
    best.set(s, 0);
    queue.push({ id: s, d: 0 });
  }
  const done = new Set<string>();
  while (queue.size > 0) {
    const head = queue.pop();
    if (!head) break;
    if (done.has(head.id)) continue;
    done.add(head.id);
    const d = best.get(head.id);
    if (d === undefined) continue;
    for (const edge of adjacency.get(head.id) ?? []) {
      if (done.has(edge.to)) continue;
      const next = d + edge.distanceM;
      const known = best.get(edge.to);
      if (known !== undefined && next >= known - DIST_EPS) continue;
      best.set(edge.to, next);
      queue.push({ id: edge.to, d: next });
    }
  }
  return best;
}

/** 始点から経路距離 limit 以内で、accept を満たす一番近いノード。無ければ null。 */
function nearestByPath(
  start: string,
  adjacency: Map<string, Edge[]>,
  limitM: number,
  accept: (id: string) => boolean,
): { id: string; d: number } | null {
  const best = new Map<string, number>([[start, 0]]);
  const queue = new DistHeap();
  queue.push({ id: start, d: 0 });
  const done = new Set<string>();
  while (queue.size > 0) {
    const head = queue.pop();
    if (!head) break;
    if (done.has(head.id)) continue;
    done.add(head.id);
    if (head.id !== start && accept(head.id)) return { id: head.id, d: head.d };
    if (head.d > limitM) continue;
    for (const edge of adjacency.get(head.id) ?? []) {
      if (done.has(edge.to)) continue;
      const next = head.d + edge.distanceM;
      if (next > limitM) continue;
      const known = best.get(edge.to);
      if (known !== undefined && next >= known - DIST_EPS) continue;
      best.set(edge.to, next);
      queue.push({ id: edge.to, d: next });
    }
  }
  return null;
}

function verticalOf(link: MlitLink): VerticalKind {
  switch (link.routeType) {
    case "4":
      return "elevator";
    case "5":
      return "escalator";
    case "6":
      return "stairs";
    default:
      return link.levDiff === "2" ? "unknown" : "none";
  }
}

function exitLabelOf(file: ExitLabelsFile, id: string): ExitLabel | null {
  const v = file[id];
  return v !== undefined && typeof v !== "string" ? v : null;
}

/** 名前の規則を通るか。番線・区画コード・設備の一般名は外す。 */
function usableName(name: string): boolean {
  return (
    name !== "" && !codeName.test(name) && !privateName.test(name) && !genericName.test(name) && !platformName.test(name)
  );
}

type MeetingFacilityCategory = "F039" | "F025";

/** 集合候補にする施設。タクシー乗り場と、名前のある店。 */
export function isMeetingFacility(category: string, name: string): category is MeetingFacilityCategory {
  return (category === "F039" || category === "F025") && usableName(name);
}

function meetingSourceOfFacility(category: MeetingFacilityCategory): "taxi" | "shop" {
  switch (category) {
    case "F039":
      return "taxi";
    case "F025":
      return "shop";
    default: {
      const _never: never = category;
      return _never;
    }
  }
}

function landmarkExplain(kind: LandmarkKind): number {
  switch (kind) {
    case "police":
      return 5;
    case "info":
      return 4;
    case "mouth":
      return 3;
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

function hitsOnOpening(
  opening: MlitOpening,
  byOrdinal: Map<number, NodeRec[]>,
  toXY: (p: LatLng) => XY,
  onLineM: number,
  snapM: number,
): { hits: { rec: NodeRec; d: number }[]; snapped: boolean } {
  const lineXY = opening.lines.map((line) => line.map(toXY));
  const cands = (byOrdinal.get(opening.ordinal) ?? []).map((rec) => ({
    rec,
    d: lineXY.reduce((m, line) => Math.min(m, distPointPolyline(rec.xy, line)), Number.POSITIVE_INFINITY),
  }));
  const onLine = cands.filter((c) => c.d <= onLineM);
  if (onLine.length > 0) return { hits: onLine, snapped: false };
  const near = cands.filter((c) => c.d <= snapM).sort((x, y) => x.d - y.d || cmp(x.rec.node.id, y.rec.node.id));
  return near[0] ? { hits: [near[0]], snapped: true } : { hits: [], snapped: false };
}

// ---------------------------------------------------------------- 本体

export function build(input: BuildInput): BuildResult {
  const { mlit, gates, lines: lineList, landmarks, exitLabels, version } = input;
  const report: BuildReport = {
    nodes: 0,
    links: 0,
    entries: 0,
    meetings: 0,
    exits: 0,
    destinations: 0,
    droppedDanglingLinks: [],
    gatesSnapped: [],
    gatesUnresolved: [],
    byLine: {},
    meetingSources: { gate: 0, taxi: 0, shop: 0, opening: 0, landmark: 0 },
    mlitDuplicateNames: [],
    bustaMerged: [],
    gatesExitOnly: [],
    landmarksUnresolved: [],
    unsnapped: [],
    sameNodeAliases: [],
    snapDistancesM: [],
    exitsClosed: [],
    exitsNoNode: [],
    exitsTwinDropped: 0,
    exitsNoOutdoor: [],
    exitsExcluded: [],
    exitsManual: 0,
    exitsChecked: 0,
    exitsSameNodeDropped: [],
    boundaryExits: 0,
    verticalCounts: {},
    floorLabels: {},
  };
  const toXY = (p: LatLng): XY => project(p.lat, p.lng, ORIGIN.lat, ORIGIN.lng);

  // ---- 1. ノード
  const recs = new Map<string, NodeRec>();
  const nodes: GraphNode[] = [];
  for (const n of [...mlit.nodes].sort((a, b) => cmp(a.id, b.id))) {
    if (n.id === "") throw new Error("node_id が空のノードがある");
    if (recs.has(n.id)) throw new Error(`node_id が重複: ${n.id}`);
    const xy = toXY(n);
    const floorLabel = floorLabelOf(n.ordinal);
    const node: GraphNode = { id: n.id, nameJa: null, floorLabel, x: xy.x, y: xy.y };
    nodes.push(node);
    recs.set(n.id, { node, ordinal: n.ordinal, inOut: n.inOut, xy, ll: { lat: n.lat, lng: n.lng } });
    report.floorLabels[floorLabel] = (report.floorLabels[floorLabel] ?? 0) + 1;
  }
  const byOrdinal = new Map<number, NodeRec[]>();
  for (const r of recs.values()) {
    const list = byOrdinal.get(r.ordinal);
    if (list) list.push(r);
    else byOrdinal.set(r.ordinal, [r]);
  }
  for (const list of byOrdinal.values()) list.sort((a, b) => cmp(a.node.id, b.node.id));

  /** 同じ階で一番近いノード。同じ距離なら id の若い方。 */
  function nearestNode(ordinal: number, xy: XY, limitM: number): { rec: NodeRec; d: number } | null {
    let best: { rec: NodeRec; d: number } | null = null;
    for (const rec of byOrdinal.get(ordinal) ?? []) {
      const d = distXY(rec.xy, xy);
      if (d <= limitM && (best === null || d < best.d)) best = { rec, d };
    }
    return best;
  }

  // ---- 2. リンク（向きを開く）
  const links: GraphLink[] = [];
  const forward = new Map<string, Edge[]>();
  const reverse = new Map<string, Edge[]>();
  const addEdge = (map: Map<string, Edge[]>, from: string, edge: Edge) => {
    const list = map.get(from);
    if (list) list.push(edge);
    else map.set(from, [edge]);
  };
  for (const l of [...mlit.links].sort((a, b) => cmp(a.id, b.id))) {
    const a = recs.get(l.startId);
    const b = recs.get(l.endId);
    if (!a || !b) {
      report.droppedDanglingLinks.push(l.id);
      continue;
    }
    if (!(l.distance > 0)) throw new Error(`リンク ${l.id} の distance が正でない: ${l.distance}`);
    const vertical = verticalOf(l);
    const dz = deltaZOf(a.ordinal, b.ordinal);
    const shape =
      l.shape.length > 2
        ? l.shape.map((p): [number, number] => {
            const q = toXY(p);
            return [q.x, q.y];
          })
        : null;
    const goesForward = l.direction === "1" || l.direction === "2";
    const goesBackward = l.direction === "1" || l.direction === "3";
    if (!goesForward && !goesBackward) throw new Error(`リンク ${l.id} の direction が読めない: ${l.direction}`);
    if (goesForward) {
      links.push({
        id: `${l.id}.f`,
        from: a.node.id,
        to: b.node.id,
        distanceM: l.distance,
        deltaZ: dz,
        vertical,
        hours: null,
        ...(shape ? { shape } : {}),
      });
      addEdge(forward, a.node.id, { to: b.node.id, distanceM: l.distance });
      addEdge(reverse, b.node.id, { to: a.node.id, distanceM: l.distance });
    }
    if (goesBackward) {
      links.push({
        id: `${l.id}.r`,
        from: b.node.id,
        to: a.node.id,
        distanceM: l.distance,
        deltaZ: -dz,
        vertical,
        hours: null,
        ...(shape ? { shape: [...shape].reverse() } : {}),
      });
      addEdge(forward, b.node.id, { to: a.node.id, distanceM: l.distance });
      addEdge(reverse, a.node.id, { to: b.node.id, distanceM: l.distance });
    }
    report.verticalCounts[vertical] = (report.verticalCounts[vertical] ?? 0) + 1;
  }

  // ---- 3. 改札（Opening の線 + gates.json）
  const openingsById = new Map(mlit.openings.map((o) => [o.id, o]));
  const entries: EntryCatalogEntry[] = [];
  for (const openingId of Object.keys(gates).sort()) {
    const gate = gates[openingId]!;
    const opening = openingsById.get(openingId);
    if (!opening) {
      report.gatesUnresolved.push(`${gate.nameJa}: Opening ${openingId} が無い`);
      continue;
    }
    if (exitOnly.test(gate.nameJa) || exitOnly.test(opening.name)) {
      report.gatesExitOnly.push(gate.nameJa);
      continue;
    }
    const resolved = hitsOnOpening(opening, byOrdinal, toXY, GATE_ON_LINE_M, GATE_SNAP_M);
    if (resolved.hits.length === 0) {
      report.gatesUnresolved.push(`${gate.nameJa}: ${GATE_SNAP_M}m 以内にノードが無い`);
      continue;
    }
    if (resolved.snapped) {
      const first = resolved.hits[0]!;
      report.gatesSnapped.push(`${gate.nameJa} ${first.d.toFixed(1)}m`);
    }
    const lineIds = [...new Set(gate.lineIds)].sort();
    for (const h of resolved.hits.sort((x, y) => cmp(x.rec.node.id, y.rec.node.id))) {
      entries.push({ catalogId: `entry.${openingId}.${h.rec.node.id}`, lineIds, nodeId: h.rec.node.id, nameJa: gate.nameJa });
      if (h.rec.node.nameJa === null) h.rec.node.nameJa = gate.nameJa;
    }
  }
  entries.sort((a, b) => cmp(a.catalogId, b.catalogId));
  for (const e of entries) for (const l of e.lineIds) report.byLine[l] = (report.byLine[l] ?? 0) + 1;

  // ---- 4. 集合候補（改札前・タクシー・店・バスタ前・手書きの大きな口）
  const meetingByNode = new Map<string, MeetingCatalogEntry>();
  const meetingByName = new Map<string, MeetingCatalogEntry>();
  const meetings: MeetingCatalogEntry[] = [];
  type MeetingSource = keyof BuildReport["meetingSources"];
  const pushMeeting = (m: MeetingCatalogEntry, source: MeetingSource): void => {
    const sameNode = meetingByNode.get(m.nodeId);
    if (sameNode) {
      report.sameNodeAliases.push(`${m.nameJa} = ${sameNode.nameJa}`);
      return;
    }
    const nameKey = normalizeName(m.nameJa);
    const sameName = meetingByName.get(nameKey);
    if (sameName) {
      report.sameNodeAliases.push(`${m.nameJa} = ${sameName.nameJa}`);
      return;
    }
    meetingByNode.set(m.nodeId, m);
    meetingByName.set(nameKey, m);
    meetings.push(m);
    report.meetingSources[source]++;
    const rec = recs.get(m.nodeId);
    if (rec && rec.node.nameJa === null) rec.node.nameJa = m.nameJa;
  };

  const gateNodeByName = new Map<string, string>();
  for (const e of entries) {
    const prev = gateNodeByName.get(e.nameJa);
    if (prev === undefined || cmp(e.nodeId, prev) < 0) gateNodeByName.set(e.nameJa, e.nodeId);
  }
  for (const [nameJa, nodeId] of [...gateNodeByName.entries()].sort((a, b) => cmp(a[1], b[1]))) {
    pushMeeting(
      {
        catalogId: `meet.gate.${nodeId}`,
        nodeId,
        nameJa,
        explainability: 2,
        evidence: "hypothesis",
        elevatorM: null,
        restroomM: null,
      },
      "gate",
    );
  }

  const facilityMeetings = mlit.facilities
    .filter((f) => isMeetingFacility(f.category, f.name))
    .sort((a, b) => cmp(a.id, b.id));
  const facilityNameCount = new Map<string, number>();
  for (const f of facilityMeetings) {
    const k = normalizeName(f.name.trim());
    facilityNameCount.set(k, (facilityNameCount.get(k) ?? 0) + 1);
  }
  for (const f of facilityMeetings) {
    const category = f.category;
    if (!isMeetingFacility(category, f.name)) continue;
    const name = f.name.trim();
    if ((facilityNameCount.get(normalizeName(name)) ?? 0) > 1) {
      if (!report.mlitDuplicateNames.includes(name)) report.mlitDuplicateNames.push(name);
      continue;
    }
    const near = nearestNode(f.ordinal, toXY(f.point), MEETING_SNAP_M);
    if (!near) {
      report.unsnapped.push(`${name} (${floorLabelOf(f.ordinal)})`);
      continue;
    }
    report.snapDistancesM.push(near.d);
    pushMeeting(
      {
        catalogId: `meet.mlit.${f.id}`,
        nodeId: near.rec.node.id,
        nameJa: name,
        explainability: explainOf(name),
        evidence: "hypothesis",
        elevatorM: null,
        restroomM: null,
      },
      meetingSourceOfFacility(category),
    );
  }

  const bustaOpenings = mlit.openings.filter((o) => o.name.trim() === "バスタ新宿").sort((a, b) => cmp(a.id, b.id));
  const bustaHits: { openingId: string; rec: NodeRec; d: number }[] = [];
  for (const opening of bustaOpenings) {
    const resolved = hitsOnOpening(opening, byOrdinal, toXY, BUSTA_ON_LINE_M, BUSTA_ON_LINE_M);
    for (const h of resolved.hits) bustaHits.push({ openingId: opening.id, rec: h.rec, d: h.d });
  }
  bustaHits.sort((a, b) => cmp(a.rec.node.id, b.rec.node.id) || cmp(a.openingId, b.openingId));
  const busta = bustaHits[0];
  if (busta) {
    for (const extra of bustaHits.slice(1)) {
      report.bustaMerged.push(`${extra.openingId} → ${busta.openingId} (${extra.rec.node.id})`);
    }
    pushMeeting(
      {
        catalogId: `meet.opening.${busta.openingId}`,
        nodeId: busta.rec.node.id,
        nameJa: "バスタ新宿",
        explainability: explainOf("バスタ新宿"),
        evidence: "hypothesis",
        elevatorM: null,
        restroomM: null,
      },
      "opening",
    );
    if (busta.rec.node.nameJa === null) busta.rec.node.nameJa = "バスタ新宿";
  } else if (bustaOpenings.length > 0) {
    report.unsnapped.push("バスタ新宿");
  }

  for (const nodeId of Object.keys(landmarks).sort()) {
    const mark = landmarks[nodeId]!;
    if (!recs.has(nodeId)) {
      report.landmarksUnresolved.push(`${mark.nameJa} (${nodeId})`);
      continue;
    }
    pushMeeting(
      {
        catalogId: `meet.node.${nodeId}`,
        nodeId,
        nameJa: mark.nameJa,
        explainability: landmarkExplain(mark.kind),
        evidence: "hypothesis",
        elevatorM: null,
        restroomM: null,
      },
      "landmark",
    );
  }

  // 4e. 近くの設備。エレベーターのリンクの端点と、トイレの POI・面に一番近いノードから、逆向きの多点始点最短。
  const elevatorNodeIds = new Set<string>();
  for (const l of links) if (l.vertical === "elevator") elevatorNodeIds.add(l.from).add(l.to);
  const restroomNodeIds = new Set<string>();
  for (const f of mlit.facilities) {
    if (!RESTROOM_POI.test(f.category)) continue;
    const near = nearestNode(f.ordinal, toXY(f.point), FACILITY_SNAP_M);
    if (near) restroomNodeIds.add(near.rec.node.id);
  }
  for (const s of mlit.spaces) {
    if (!RESTROOM_SPACE.test(s.category)) continue;
    const ring = s.rings[0];
    if (!ring || ring.length === 0) continue;
    const pts = ring.map(toXY);
    const centroid = { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
    const near = nearestNode(s.ordinal, centroid, FACILITY_SNAP_M);
    if (near) restroomNodeIds.add(near.rec.node.id);
  }
  const elevatorDist = multiSourceDistances(elevatorNodeIds, reverse);
  const restroomDist = multiSourceDistances(restroomNodeIds, reverse);
  for (const m of meetings) {
    m.elevatorM = elevatorDist.get(m.nodeId) ?? null;
    m.restroomM = restroomDist.get(m.nodeId) ?? null;
  }
  meetings.sort((a, b) => cmp(a.nodeId, b.nodeId) || cmp(a.catalogId ?? "", b.catalogId ?? ""));

  // ---- 5. 出口
  type ExitCand = { id: string; name: string; ordinal: number; xy: XY; sign: NodeRec; floorDir: string };
  const exitCands: ExitCand[] = [];
  for (const f of mlit.facilities.filter((x) => x.category === "F108").sort((a, b) => cmp(a.id, b.id))) {
    const name = f.name.trim();
    if (name.includes("閉鎖")) {
      report.exitsClosed.push(name);
      continue;
    }
    const xy = toXY(f.point);
    const near = nearestNode(f.ordinal, xy, EXIT_SIGN_SNAP_M);
    if (!near) {
      report.exitsNoNode.push(`${name} (${f.floorDir})`);
      continue;
    }
    exitCands.push({ id: f.id, name, ordinal: f.ordinal, xy, sign: near.rec, floorDir: f.floorDir });
  }
  // 地上と地下に同じ看板があれば地下の方だけ残す。人手補正は地下の id に引き継ぐ。
  const carried = new Map<string, ExitLabel>();
  const underground = exitCands.filter((e) => e.ordinal < 0);
  const kept = exitCands.filter((e) => {
    if (e.ordinal < 0) return true;
    const twin = underground.find((u) => u.name === e.name && distXY(u.xy, e.xy) <= EXIT_TWIN_M);
    if (!twin) return true;
    report.exitsTwinDropped++;
    const label = exitLabelOf(exitLabels, e.id);
    if (label && !exitLabelOf(exitLabels, twin.id) && !carried.has(twin.id)) carried.set(twin.id, label);
    return false;
  });
  const isOutdoor = (id: string): boolean => {
    const r = recs.get(id)!;
    return (r.inOut === "1" || r.inOut === "2") && r.ordinal >= 0 && Number.isInteger(r.ordinal);
  };
  const exitByNode = new Map<string, ExitEntry>();
  const exits: ExitEntry[] = [];
  const pushExit = (e: ExitEntry): void => {
    const prev = exitByNode.get(e.nodeId);
    if (prev) {
      // 同じノードに二つ。看板のある方、同じなら id の若い方を残す。
      const keepPrev = prev.label !== "" || e.label === "" ? true : false;
      if (keepPrev) {
        report.exitsSameNodeDropped.push(`${e.nameJa} (${prev.nameJa} と同じノード)`);
        return;
      }
      report.exitsSameNodeDropped.push(`${prev.nameJa} (${e.nameJa} と同じノード)`);
      exits.splice(exits.indexOf(prev), 1);
    }
    exitByNode.set(e.nodeId, e);
    exits.push(e);
  };
  for (const e of kept) {
    let ll = e.sign.ll;
    if (e.ordinal < 0) {
      const out = nearestByPath(e.sign.node.id, forward, EXIT_OUTDOOR_PATH_M, (id) => isOutdoor(id) && distXY(recs.get(id)!.xy, e.xy) <= EXIT_OUTDOOR_XY_M);
      if (out) ll = recs.get(out.id)!.ll;
      else report.exitsNoOutdoor.push(`${e.name} (${e.floorDir})`);
    }
    let label = e.name;
    let labelSource = "mlit";
    let evidence: ExitEntry["evidence"] = "hypothesis";
    const manual = exitLabelOf(exitLabels, e.id) ?? carried.get(e.id) ?? null;
    if (manual) {
      if (manual.exclude) {
        report.exitsExcluded.push(e.name);
        continue;
      }
      const v = (manual.labelJa ?? "").trim();
      if (v !== "" && v !== label) {
        label = v;
        labelSource = "manual";
        report.exitsManual++;
      }
      if (manual.confirmed || v !== "") {
        evidence = "checked";
        report.exitsChecked++;
      }
    }
    if (label === "") labelSource = "";
    pushExit({
      catalogId: `exit.${e.id}`,
      nodeId: e.sign.node.id,
      label,
      nameJa: exitNameOf(label),
      labelSource,
      evidence,
      lat: ll.lat,
      lng: ll.lng,
    });
  }
  // 地上の境界ノードで、近くに出口 POI が無いものは無名の出口。
  const f108XY = mlit.facilities.filter((f) => f.category === "F108").map((f) => toXY(f.point));
  for (const rec of [...recs.values()].sort((a, b) => cmp(a.node.id, b.node.id))) {
    if (rec.inOut !== "2" || rec.ordinal < 0 || !Number.isInteger(rec.ordinal)) continue;
    if (exitByNode.has(rec.node.id)) continue;
    if (f108XY.some((p) => distXY(p, rec.xy) <= BOUNDARY_EXIT_CLEAR_M)) continue;
    let label = "";
    let labelSource = "";
    let evidence: ExitEntry["evidence"] = "hypothesis";
    const manual = exitLabelOf(exitLabels, rec.node.id);
    if (manual) {
      if (manual.exclude) {
        report.exitsExcluded.push(`境界ノード ${rec.node.id}`);
        continue;
      }
      const v = (manual.labelJa ?? "").trim();
      if (v !== "") {
        label = v;
        labelSource = "manual";
        report.exitsManual++;
      }
      if (manual.confirmed || v !== "") {
        evidence = "checked";
        report.exitsChecked++;
      }
    }
    report.boundaryExits++;
    pushExit({
      catalogId: `exit.node.${rec.node.id}`,
      nodeId: rec.node.id,
      label,
      nameJa: exitNameOf(label),
      labelSource,
      evidence,
      lat: rec.ll.lat,
      lng: rec.ll.lng,
    });
  }
  exits.sort((a, b) => cmp(a.nodeId, b.nodeId) || cmp(a.catalogId, b.catalogId));

  // ---- 6. 目的地（プリセット）
  const destinations: DestinationCatalogEntry[] = [
    { catalogId: "dest.tokyo-metropolitan-government", nameJa: "東京都庁", lat: 35.689487, lng: 139.691711 },
    { catalogId: "dest.busta-shinjuku", nameJa: "バスタ新宿", lat: 35.686622, lng: 139.700258 },
    { catalogId: "dest.kabukicho", nameJa: "歌舞伎町", lat: 35.694945, lng: 139.702734 },
    { catalogId: "dest.shinjuku-central-park", nameJa: "新宿中央公園", lat: 35.690833, lng: 139.690278 },
  ];

  // ---- 7. まとめ
  const graphHash = createHash("sha256").update(JSON.stringify({ nodes, links })).digest("hex");
  const graph: Graph = {
    datasetId: DATASET_ID,
    datasetVersion: version,
    graphHash,
    attributionJa: ATTRIBUTION_JA,
    nodes,
    links,
  };
  const usedLineIds = new Set<string>();
  for (const e of entries) for (const id of e.lineIds) usedLineIds.add(id);
  const lines: CatalogLine[] = lineList.filter((l) => usedLineIds.has(l.id));
  const catalog: BuildCatalog = { lines, entries, meetings, exits, destinations };

  report.nodes = nodes.length;
  report.links = links.length;
  report.entries = entries.length;
  report.meetings = meetings.length;
  report.exits = exits.length;
  report.destinations = destinations.length;

  return { graph, catalog, report };
}
