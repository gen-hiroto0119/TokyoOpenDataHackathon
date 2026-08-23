// 取り込みの検査。docs/DATA.md「検査（ingest:verify）」をそのまま機械検査にしたもの。
// main.ts は書き出す前にこれを通し、一つでも落ちたら書き出さない。

import type { Graph } from "../../src/graph.ts";
import { FLOOR_LABELS, type BuildCatalog, type BuildReport } from "./build.ts";

export type Check = {
  id: string;
  title: string;
  pass: boolean;
  detail: string;
};

export type VerifyInput = {
  graph: Graph;
  catalog: BuildCatalog;
  report: BuildReport;
  /** 同じ入力でもう一度 build() したもの。V9 の決定性に使う。 */
  secondRun: { graph: Graph; catalog: BuildCatalog };
};

/**
 * 改札を持つ路線。src/index.ts の CATALOG_LINES と同じ集合でなければならない
 * （V7）。index.ts は Worker の口なのでここから import せず、集合を写す。
 */
export const EXPECTED_LINE_IDS = [
  "line.jr",
  "line.keio",
  "line.marunouchi",
  "line.odakyu",
  "line.oedo",
  "line.shinjuku",
  "line.seibu",
] as const;

const FLOOR_LABEL_SET = new Set(Object.values(FLOOR_LABELS));

function inRange(v: number, lo: number, hi: number): boolean {
  return v >= lo && v <= hi;
}

/** 向きを無視した最大連結成分のノード集合。 */
function largestComponent(graph: Graph): Set<string> {
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const l of graph.links) {
    adj.get(l.from)!.push(l.to);
    adj.get(l.to)!.push(l.from);
  }
  const seen = new Set<string>();
  let best = new Set<string>();
  for (const n of graph.nodes) {
    if (seen.has(n.id)) continue;
    const comp = new Set<string>([n.id]);
    const stack = [n.id];
    seen.add(n.id);
    while (stack.length > 0) {
      const u = stack.pop()!;
      for (const v of adj.get(u) ?? []) {
        if (seen.has(v)) continue;
        seen.add(v);
        comp.add(v);
        stack.push(v);
      }
    }
    if (comp.size > best.size) best = comp;
  }
  return best;
}

export function verify(input: VerifyInput): { checks: Check[]; allPass: boolean } {
  const { graph, catalog, report } = input;
  const checks: Check[] = [];
  const add = (id: string, title: string, pass: boolean, detail: string) => checks.push({ id, title, pass, detail });

  // V1 件数
  const counts = {
    nodes: graph.nodes.length,
    links: graph.links.length,
    entries: catalog.entries.length,
    meetings: catalog.meetings.length,
    exits: catalog.exits.length,
  };
  add(
    "V1",
    "件数が docs/DATA.md の範囲にある",
    inRange(counts.nodes, 1900, 2100) &&
      inRange(counts.links, 4700, 5200) &&
      inRange(counts.entries, 30, 60) &&
      inRange(counts.meetings, 200, 420) &&
      inRange(counts.exits, 90, 200),
    JSON.stringify(counts),
  );

  // V2 連結
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const big = largestComponent(graph);
  const entriesOut = catalog.entries.filter((e) => !big.has(e.nodeId)).map((e) => e.nameJa);
  const meetingsOut = catalog.meetings.filter((m) => !big.has(m.nodeId)).map((m) => m.nameJa);
  const exitsOut = catalog.exits.filter((e) => !big.has(e.nodeId)).map((e) => e.nameJa);
  add(
    "V2",
    "最大連結成分に改札・集合候補・出口の全件がある",
    entriesOut.length === 0 && meetingsOut.length === 0 && exitsOut.length === 0,
    `成分 ${big.size}/${graph.nodes.length}。外れた改札 ${entriesOut.length}、集合候補 ${meetingsOut.length}、出口 ${exitsOut.length}` +
      (entriesOut.length + meetingsOut.length + exitsOut.length > 0
        ? `: ${[...entriesOut, ...meetingsOut, ...exitsOut].slice(0, 10).join(" / ")}`
        : ""),
  );

  // V3 改札
  add(
    "V3",
    "gates.json の改札すべてにノードが結べた",
    report.gatesUnresolved.length === 0,
    report.gatesUnresolved.length === 0
      ? `${counts.entries} 件。10m まで寄せたもの ${report.gatesSnapped.length}: ${report.gatesSnapped.join(" / ") || "なし"}`
      : report.gatesUnresolved.join(" / "),
  );

  // V4 出口の解決（報告のみ）
  add(
    "V4",
    "出口 POI の解決（落とさない）",
    true,
    `看板にノードが無い ${report.exitsNoNode.length}${report.exitsNoNode.length > 0 ? ` (${report.exitsNoNode.join(" / ")})` : ""}、` +
      `屋外ノードへ解けず看板の座標 ${report.exitsNoOutdoor.length}${report.exitsNoOutdoor.length > 0 ? ` (${report.exitsNoOutdoor.join(" / ")})` : ""}、` +
      `地上と地下の重複 ${report.exitsTwinDropped}、閉鎖中 ${report.exitsClosed.length}、境界ノードの無名出口 ${report.boundaryExits}`,
  );

  // V5 東京都の名前の寄せ（報告のみ）
  const sorted = [...report.snapDistancesM].sort((a, b) => a - b);
  const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)]! : 0;
  add(
    "V5",
    "名前をノードへ寄せた距離（落とさない）",
    true,
    `中央値 ${median.toFixed(1)}m、最大 ${(sorted[sorted.length - 1] ?? 0).toFixed(1)}m、40m 以内に無くて外した ${report.unsnapped.length}` +
      (report.unsnapped.length > 0 ? ` (${report.unsnapped.slice(0, 10).join(" / ")})` : "") +
      `、階の表に無い ${report.tokyoNoLevel.length}、表の先頭に落とした ${report.tokyoLevelFallback}`,
  );

  // V6 重複と閉鎖
  const names = new Map<string, number>();
  for (const m of catalog.meetings) names.set(m.nameJa, (names.get(m.nameJa) ?? 0) + 1);
  const dupNames = [...names.entries()].filter(([, c]) => c > 1).map(([n]) => n);
  const closed = catalog.exits.filter((e) => e.label.includes("閉鎖")).map((e) => e.label);
  add(
    "V6",
    "同じ名前の集合候補が無く、閉鎖中の出口が無い",
    dupNames.length === 0 && closed.length === 0,
    `重複 ${dupNames.length}${dupNames.length > 0 ? ` (${dupNames.join(" / ")})` : ""}、閉鎖中 ${closed.length}`,
  );

  // V7 路線
  const lineSet = new Set<string>();
  for (const e of catalog.entries) for (const l of e.lineIds) lineSet.add(l);
  const expected = new Set<string>(EXPECTED_LINE_IDS);
  const missing = [...expected].filter((l) => !lineSet.has(l));
  const extra = [...lineSet].filter((l) => !expected.has(l));
  add(
    "V7",
    "改札の路線と CATALOG_LINES が一致する",
    missing.length === 0 && extra.length === 0,
    `改札の無い路線 ${missing.join(",") || "なし"}、一覧に無い路線 ${extra.join(",") || "なし"}`,
  );

  // V8 階名
  const badFloors = graph.nodes.filter((n) => n.floorLabel === null || !FLOOR_LABEL_SET.has(n.floorLabel)).length;
  add("V8", "floorLabel が固定表の値だけ", badFloors === 0, `表に無いもの ${badFloors}。内訳 ${JSON.stringify(report.floorLabels)}`);

  // V9 決定性
  const same =
    JSON.stringify(graph) === JSON.stringify(input.secondRun.graph) &&
    JSON.stringify(catalog) === JSON.stringify(input.secondRun.catalog);
  add("V9", "二回 build してバイト一致", same, same ? "一致" : "不一致");

  // V10 リンクの整合
  const badLinks = graph.links.filter((l) => !nodeIds.has(l.from) || !nodeIds.has(l.to) || l.from === l.to || !(l.distanceM > 0)).length;
  add(
    "V10",
    "全リンクの端点がノードにあり、自己ループと非正の距離が無い",
    badLinks === 0,
    `不正 ${badLinks}。落とした端点欠けリンク ${report.droppedDanglingLinks.length}`,
  );

  // V11 出口の座標
  const bbox = { minLat: 35.68, maxLat: 35.70, minLng: 139.69, maxLng: 139.71 };
  const badExit = catalog.exits.filter(
    (e) => !(e.lat >= bbox.minLat && e.lat <= bbox.maxLat && e.lng >= bbox.minLng && e.lng <= bbox.maxLng),
  ).length;
  add("V11", "出口の緯度経度が新宿駅の範囲にある", badExit === 0, `範囲外 ${badExit}`);

  // V12 縦移動
  const v = report.verticalCounts;
  add(
    "V12",
    "縦移動の種別がリンク属性から取れている",
    (v.stairs ?? 0) >= 150 && (v.escalator ?? 0) >= 50 && (v.elevator ?? 0) >= 50,
    JSON.stringify(v),
  );

  // V13 カタログの参照
  const badRefs = [
    ...catalog.entries.filter((e) => !nodeIds.has(e.nodeId)).map((e) => e.catalogId),
    ...catalog.meetings.filter((m) => !nodeIds.has(m.nodeId)).map((m) => m.catalogId ?? ""),
    ...catalog.exits.filter((e) => !nodeIds.has(e.nodeId)).map((e) => e.catalogId),
  ];
  const ids = [
    ...catalog.entries.map((e) => e.catalogId),
    ...catalog.meetings.map((m) => m.catalogId ?? ""),
    ...catalog.exits.map((e) => e.catalogId),
    ...catalog.destinations.map((d) => d.catalogId),
  ];
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  add(
    "V13",
    "カタログのノード参照が全部グラフにあり、catalogId が一意",
    badRefs.length === 0 && dupIds.length === 0,
    `欠け ${badRefs.length}、重複 ${dupIds.length}${dupIds.length > 0 ? ` (${dupIds.slice(0, 5).join(",")})` : ""}`,
  );

  return { checks, allPass: checks.every((c) => c.pass) };
}
