// R1-R33 の出力(graph + catalog)を検査する。
//
// 検査項目 V1〜V17 は scratchpad/research-ingest.md §4 の表そのもの。期待値は
// すべて既存(コミット済み)の Go 出力に対して実測した値で、Go 出力・TS 出力の
// 両方に同じ検査をかける前提で作ってある。
//
// V15(決定性)と V16(手書きラベルの整合)は graph/catalog だけでは検査できない
// (V15 は「もう一度実行した結果」、V16 は raw の marker=="entrance" ジオメトリの
// gid 集合が要る)。呼び出し側が該当情報を渡さなければその2項目は skipped 扱いに
// なり、全体の pass/fail には影響しない(false 扱いにしない)。
// V17 は研究メモが明記するとおり「報告のみ、ゲートにはしない」ので常に pass=true。

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeGeoms, type Catalog, type Graph } from "./build.ts";
import { readJSON, type FeatureCollection, type ManualLabels } from "./raw.ts";

export type VerifyCheck = {
  id: string;
  title: string;
  pass: boolean;
  skipped?: boolean;
  detail: string;
};

export type VerifyContext = {
  graph: Graph;
  catalog: Catalog;
  /**
   * data/labels/exits.json の内容(gid 文字列 -> {labelJa?, exclude?, confirmed?})。
   * V16 用。省略時は V16 を skip する。
   */
  manualLabelKeys?: string[] | undefined;
  /** raw の marker=="entrance" ジオメトリの gid 集合。V16 用。省略時は V16 を skip する。 */
  entranceGids?: Set<number> | undefined;
  /** もう一度 build() した結果。V15(決定性)用。省略時は V15 を skip する。 */
  secondRun?: { graph: Graph; catalog: Catalog } | undefined;
};

export type VerifyResult = {
  checks: VerifyCheck[];
  allPass: boolean;
};

function eqSet<T>(a: Map<T, number> | Record<string, number>, expected: Record<string, number>): boolean {
  const rec = a instanceof Map ? Object.fromEntries(a) : a;
  const keys = new Set([...Object.keys(rec), ...Object.keys(expected)]);
  for (const k of keys) {
    if ((rec[k] ?? 0) !== (expected[k] ?? 0)) return false;
  }
  return true;
}

/** union-find。無向連結成分の判定に使う(V6/V12)。 */
class DSU {
  private parent = new Map<string, string>();
  add(id: string) {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }
  find(id: string): string {
    let root = id;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = id;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function buildComponents(graph: Graph): { root: (id: string) => string; sizes: Map<string, number> } {
  const dsu = new DSU();
  for (const n of graph.nodes) dsu.add(n.id);
  for (const l of graph.links) dsu.union(l.from, l.to);
  const sizes = new Map<string, number>();
  for (const n of graph.nodes) {
    const r = dsu.find(n.id);
    sizes.set(r, (sizes.get(r) ?? 0) + 1);
  }
  return { root: (id: string) => dsu.find(id), sizes };
}

export function verify(ctx: VerifyContext): VerifyResult {
  const { graph, catalog } = ctx;
  const checks: VerifyCheck[] = [];
  const push = (id: string, title: string, pass: boolean, detail: string, skipped = false) => {
    checks.push({ id, title, pass, detail, skipped });
  };

  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  // V1: entries 件数・路線別。
  {
    const byLine: Record<string, number> = {};
    for (const e of catalog.entries) for (const l of e.lineIds) byLine[l] = (byLine[l] ?? 0) + 1;
    const expectedByLine = { "line.jr": 16, "line.keio": 11, "line.odakyu": 4, "line.oedo": 4, "line.marunouchi": 2 };
    const countOk = catalog.entries.length === 34;
    const byLineOk = eqSet(byLine, expectedByLine);
    push(
      "V1",
      "entries 件数・路線別",
      countOk && byLineOk,
      `entries=${catalog.entries.length}(期待34) byLine=${JSON.stringify(byLine)}`,
    );
  }

  // V2: meetings 件数と evidence。
  {
    const allHypothesis = catalog.meetings.every((m) => m.evidence === "hypothesis");
    push(
      "V2",
      "meetings 件数と evidence",
      catalog.meetings.length === 242 && allHypothesis,
      `meetings=${catalog.meetings.length}(期待242) 全hypothesis=${allHypothesis}`,
    );
  }

  // V3: exits 件数・内訳。
  {
    const labelNonEmpty = catalog.exits.filter((e) => e.label !== "").length;
    const labelSourceDist: Record<string, number> = {};
    for (const e of catalog.exits) labelSourceDist[e.labelSource] = (labelSourceDist[e.labelSource] ?? 0) + 1;
    const evidenceDist: Record<string, number> = {};
    for (const e of catalog.exits) evidenceDist[e.evidence] = (evidenceDist[e.evidence] ?? 0) + 1;
    const expectedLabelSource = { tokyo: 47, manual: 18, "": 4 };
    const expectedEvidence = { checked: 66, hypothesis: 3 };
    const ok =
      catalog.exits.length === 69 &&
      labelNonEmpty === 65 &&
      eqSet(labelSourceDist, expectedLabelSource) &&
      eqSet(evidenceDist, expectedEvidence);
    push(
      "V3",
      "exits 件数・内訳",
      ok,
      `exits=${catalog.exits.length}(期待69) labelあり=${labelNonEmpty}(期待65) ` +
        `labelSource=${JSON.stringify(labelSourceDist)} evidence=${JSON.stringify(evidenceDist)}`,
    );
  }

  // V4: destinations。
  push("V4", "destinations", catalog.destinations.length === 4, `destinations=${catalog.destinations.length}(期待4)`);

  // V5: catalog の nodeId 全存在。catalogId 全体でユニーク。
  {
    const withNodeId = [...catalog.entries, ...catalog.meetings, ...catalog.exits];
    const missing = withNodeId.filter((e) => !nodeIds.has(e.nodeId));
    const allIds = [
      ...catalog.entries.map((e) => e.catalogId),
      ...catalog.meetings.map((e) => e.catalogId),
      ...catalog.exits.map((e) => e.catalogId),
      ...catalog.destinations.map((e) => e.catalogId),
    ];
    const uniqueCount = new Set(allIds).size;
    const ok = missing.length === 0 && allIds.length === 349 && uniqueCount === 349;
    push(
      "V5",
      "catalog の nodeId 全存在・catalogId ユニーク",
      ok,
      `nodeId欠損=${missing.length} catalogId合計=${allIds.length}(期待349) ユニーク=${uniqueCount}(期待349)`,
    );
  }

  // V6: 最大連結成分への搭載。出口は 68/69 が既知の例外(exit.28994946)。
  {
    const { root, sizes } = buildComponents(graph);
    const mainRoot = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const entriesIn = mainRoot ? catalog.entries.filter((e) => root(e.nodeId) === mainRoot).length : 0;
    const meetingsIn = mainRoot ? catalog.meetings.filter((m) => root(m.nodeId) === mainRoot).length : 0;
    const exitsIn = mainRoot ? catalog.exits.filter((e) => root(e.nodeId) === mainRoot).length : 0;
    const exitsOutIds = mainRoot
      ? catalog.exits.filter((e) => root(e.nodeId) !== mainRoot).map((e) => e.catalogId)
      : [];
    const ok =
      entriesIn === catalog.entries.length &&
      meetingsIn === catalog.meetings.length &&
      exitsIn === 68 &&
      exitsOutIds.length === 1 &&
      exitsOutIds[0] === "exit.28994946";
    push(
      "V6",
      "最大連結成分への搭載",
      ok,
      `entries ${entriesIn}/${catalog.entries.length} meetings ${meetingsIn}/${catalog.meetings.length} ` +
        `exits ${exitsIn}/${catalog.exits.length}(孤立=${JSON.stringify(exitsOutIds)})`,
    );
  }

  // V7: 出口の階。
  {
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    const not1F = catalog.exits.filter((e) => nodeById.get(e.nodeId)?.floorLabel !== "1F");
    push("V7", "出口の階(全て1F)", not1F.length === 0, `1F以外=${not1F.length}件`);
  }

  // V8: グラフ規模。base link id ごとに .f/.r の有無を見て、元の d の分布を復元する。
  {
    const uniqueNodeIds = new Set(graph.nodes.map((n) => n.id));
    const dCount = { 1: 0, 2: 0, 3: 0 };
    const groups = new Map<string, Set<string>>();
    for (const l of graph.links) {
      const dot = l.id.lastIndexOf(".");
      const base = l.id.slice(0, dot);
      const suf = l.id.slice(dot + 1);
      let set = groups.get(base);
      if (!set) {
        set = new Set();
        groups.set(base, set);
      }
      set.add(suf);
    }
    let malformed = 0;
    for (const set of groups.values()) {
      if (set.size === 2 && set.has("f") && set.has("r")) dCount[3]++;
      else if (set.size === 1 && set.has("f")) dCount[1]++;
      else if (set.size === 1 && set.has("r")) dCount[2]++;
      else malformed++;
    }
    const identity = 2 * dCount[3] + dCount[2] + dCount[1] === graph.links.length;
    const ok =
      uniqueNodeIds.size === graph.nodes.length &&
      graph.nodes.length === 2506 &&
      graph.links.length === 5288 &&
      malformed === 0 &&
      identity &&
      dCount[3] === 2635 &&
      dCount[2] === 12 &&
      dCount[1] === 6;
    push(
      "V8",
      "グラフ規模",
      ok,
      `nodes=${graph.nodes.length}(期待2506,unique=${uniqueNodeIds.size}) links=${graph.links.length}(期待5288) ` +
        `d分布(復元)=${JSON.stringify(dCount)}(期待{3:2635,2:12,1:6}) malformed=${malformed}`,
    );
  }

  // V9: リンク健全性。
  {
    const badEndpoint = graph.links.filter((l) => !nodeIds.has(l.from) || !nodeIds.has(l.to));
    const negative = graph.links.filter((l) => l.distanceM < 0);
    const zero = graph.links.filter((l) => l.distanceM === 0);
    const ok = badEndpoint.length === 0 && negative.length === 0 && zero.length === 16;
    push(
      "V9",
      "リンク健全性",
      ok,
      `端点欠損=${badEndpoint.length} distanceM<0=${negative.length} distanceM==0=${zero.length}(期待16)`,
    );
  }

  // V10: 縦移動の整合。
  {
    const inconsistent = graph.links.filter((l) => (l.deltaZ !== 0) !== (l.vertical !== "none"));
    const dist: Record<string, number> = {};
    for (const l of graph.links) dist[l.vertical] = (dist[l.vertical] ?? 0) + 1;
    const expected = { none: 4814, stairs: 252, escalator: 140, elevator: 80, unknown: 2 };
    const ok = inconsistent.length === 0 && eqSet(dist, expected);
    push(
      "V10",
      "縦移動の整合",
      ok,
      `不整合=${inconsistent.length}件 分布=${JSON.stringify(dist)}(期待${JSON.stringify(expected)})`,
    );
  }

  // V11: hours。
  {
    const nonNull = graph.links.filter((l) => l.hours !== null).length;
    push("V11", "hours は全リンク null", nonNull === 0, `非null=${nonNull}件`);
  }

  // V12: 孤立・連結成分。
  {
    const { sizes } = buildComponents(graph);
    const sizeList = [...sizes.values()];
    const isolated = sizeList.filter((s) => s === 1).length;
    const largest = Math.max(...sizeList);
    const ok = isolated === 1 && sizes.size === 7 && largest === 2346;
    push(
      "V12",
      "孤立・連結成分",
      ok,
      `孤立=${isolated}(期待1) 成分数=${sizes.size}(期待7) 最大=${largest}(期待2346,${((largest / graph.nodes.length) * 100).toFixed(1)}%)`,
    );
  }

  // V13: 位置なしノード。
  {
    const zeroXY = graph.nodes.filter((n) => n.x === 0 && n.y === 0).length;
    push("V13", "位置なしノード(x==0&&y==0)", zeroXY === 276, `x==0&&y==0=${zeroXY}件(期待276)`);
  }

  // V14: ソート順。
  {
    const entryIds = catalog.entries.map((e) => e.catalogId);
    const entrySorted = entryIds.every((id, i) => i === 0 || entryIds[i - 1]! <= id);
    const meetingIds = catalog.meetings.map((m) => m.nodeId);
    const meetingSorted = meetingIds.every((id, i) => i === 0 || meetingIds[i - 1]! <= id);
    const meetingUnique = new Set(meetingIds).size === meetingIds.length;
    const exitIds = catalog.exits.map((e) => e.nodeId);
    const exitSorted = exitIds.every((id, i) => i === 0 || exitIds[i - 1]! <= id);
    const exitUnique = new Set(exitIds).size === exitIds.length;
    const ok = entrySorted && meetingSorted && meetingUnique && exitSorted && exitUnique;
    push(
      "V14",
      "ソート順",
      ok,
      `entries昇順=${entrySorted} meetings昇順=${meetingSorted}(unique=${meetingUnique}) exits昇順=${exitSorted}(unique=${exitUnique})`,
    );
  }

  // V15: 決定性。secondRun が渡された場合のみ検査する。
  if (ctx.secondRun) {
    const a = JSON.stringify(graph) + " " + JSON.stringify(catalog);
    const b = JSON.stringify(ctx.secondRun.graph) + " " + JSON.stringify(ctx.secondRun.catalog);
    push("V15", "決定性(2回実行してバイト一致)", a === b, a === b ? "一致" : "不一致");
  } else {
    push("V15", "決定性(2回実行してバイト一致)", true, "secondRun 未指定のため skip", true);
  }

  // V16: 手書きラベルの整合。entranceGids/manualLabelKeys が渡された場合のみ検査する。
  if (ctx.entranceGids && ctx.manualLabelKeys) {
    const stray = ctx.manualLabelKeys.filter((k) => !ctx.entranceGids!.has(Number(k)));
    push(
      "V16",
      "手書きラベルの整合(exits.json の全キーが marker==entrance の gid)",
      stray.length === 0,
      stray.length === 0
        ? `manualLabels=${ctx.manualLabelKeys.length}件、全てentranceのgidに一致`
        : `entranceに存在しないキー: ${stray.slice(0, 20).join(", ")}`,
    );
  } else {
    push(
      "V16",
      "手書きラベルの整合(exits.json の全キーが marker==entrance の gid)",
      true,
      "entranceGids/manualLabelKeys 未指定のため skip",
      true,
    );
  }

  // V17: 報告のみ。ゲートにはしない(常に pass=true)。
  {
    const dist: Record<string, number> = {};
    for (const m of catalog.meetings) dist[String(m.explainability)] = (dist[String(m.explainability)] ?? 0) + 1;
    push(
      "V17",
      "(報告のみ) explainability 分布ほか",
      true,
      `explainability分布=${JSON.stringify(dist)}(期待{"1":232,"2":7,"4":2,"5":1})`,
    );
  }

  // V18: 集合候補ごとの近くの設備(elevatorM/restroomM)。Go 版には無い新規機能
  // (docs/RECOMMENDER.md「近くの設備は取り込みで測る」)。件数と値域を固定する。
  // 期待値は実行して得た実測値をそのまま固定したもの(このタスクの受け入れ条件)。
  {
    const elevatorValues = catalog.meetings.map((m) => m.elevatorM);
    const restroomValues = catalog.meetings.map((m) => m.restroomM);
    const elevatorNonNull = elevatorValues.filter((v) => v !== null).length;
    const restroomNonNull = restroomValues.filter((v) => v !== null).length;
    const elevatorNull = elevatorValues.length - elevatorNonNull;
    const restroomNull = restroomValues.length - restroomNonNull;
    const negative = [...elevatorValues, ...restroomValues].filter((v) => v !== null && v < 0).length;
    const ok =
      catalog.meetings.length === 242 &&
      elevatorNonNull === 242 &&
      elevatorNull === 0 &&
      restroomNonNull === 242 &&
      restroomNull === 0 &&
      negative === 0;
    push(
      "V18",
      "設備距離(elevatorM/restroomM)の件数と値域",
      ok,
      `elevator: 値あり=${elevatorNonNull}(期待242) null=${elevatorNull}(期待0) / ` +
        `restroom: 値あり=${restroomNonNull}(期待242) null=${restroomNull}(期待0) / ` +
        `負値=${negative}件(期待0)`,
    );
  }

  const allPass = checks.every((c) => c.skipped || c.pass);
  return { checks, allPass };
}

// ------------------------------------------------------------ CLI
//
// `node scripts/ingest/verify.ts --dir <graph.json/catalog.jsonのあるディレクトリ>
//   [--raw <geojson-level-geom-*.geojsonのあるディレクトリ>] [--labels <exits.json>]`
//
// build() を経由しない、コミット済み出力(や別実行の出力)に対する単独検査。
// --raw/--labels を渡すと V16 も検査する(marker=="entrance" の gid 集合が要るため)。
// V15(決定性)は単一ディレクトリの検査なので対象外(skip のまま)。

function parseCliArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a?.startsWith("--")) continue;
    const key = a.slice(2);
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`--${key} には値が必要`);
    out[key] = value;
    i++;
  }
  return out;
}

function runCli() {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.dir) {
    console.error("使い方: node scripts/ingest/verify.ts --dir <graph.json/catalog.jsonのあるディレクトリ> [--raw <dir>] [--labels <file>]");
    process.exit(2);
  }
  const dir = resolve(process.cwd(), args.dir);
  const graph = JSON.parse(readFileSync(join(dir, "graph.json"), "utf8")) as Graph;
  const catalog = JSON.parse(readFileSync(join(dir, "catalog.json"), "utf8")) as Catalog;

  let entranceGids: Set<number> | undefined;
  let manualLabelKeys: string[] | undefined;
  if (args.raw) {
    const rawDir = resolve(process.cwd(), args.raw);
    const files = readdirSync(rawDir)
      .filter((f) => f.startsWith("geojson-level-geom-") && f.endsWith(".geojson"))
      .sort();
    const featureCollections = files.map((f) => readJSON<FeatureCollection>(join(rawDir, f)));
    const geoms = mergeGeoms(featureCollections);
    entranceGids = new Set<number>();
    for (const [gid, f] of geoms) {
      if (f.properties.marker === "entrance") entranceGids.add(gid);
    }
  }
  if (args.labels) {
    const manualLabels = JSON.parse(readFileSync(resolve(process.cwd(), args.labels), "utf8")) as ManualLabels;
    manualLabelKeys = Object.keys(manualLabels);
  }

  const result = verify({ graph, catalog, entranceGids, manualLabelKeys });
  for (const c of result.checks) {
    const mark = c.skipped ? "SKIP" : c.pass ? "PASS" : "FAIL";
    console.log(`[verify ${mark}] ${c.id} ${c.title} — ${c.detail}`);
  }
  console.log(result.allPass ? "\nverify: PASS" : "\nverify: FAIL");
  if (!result.allPass) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
