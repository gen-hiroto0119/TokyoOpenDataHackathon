// tools/ingest/main.go の CLI 相当。R1-R33(build.ts)を実行し、書き出す前に
// verify.ts(V1〜V17)にかけ、失敗したら書き出さずに終了する。
//
// 実行: `node scripts/ingest/main.ts [--in ...] [--out ...] [--labels ...] [--version ...] [--hash ...]`
// (Node v24 の型ストリップでゼロ依存実行。apps/worker から `pnpm ingest` でも可)
//
// 既定値は main.go の flag と同じ意味(data/raw/extracted 等)。ただし main.go は
// リポジトリルートから実行される前提の相対パスなので、ここでは「明示指定が無い
// 引数だけ」リポジトリルートを基準に解決する(pnpm --filter worker はカレント
// ディレクトリを apps/worker にするため、素の相対パスのままだと解決先が変わってしまう)。
// 明示指定された引数はふつうの CLI と同じく実行時の cwd を基準にする。

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, mergeGeoms } from "./build.ts";
import { readJSON, type ComEntity, type ComMap, type FeatureCollection, type ManualLabels, type NavFile } from "./raw.ts";
import { verify } from "./verify.ts";

const here = dirname(fileURLToPath(import.meta.url));
// apps/worker/scripts/ingest -> apps/worker/scripts -> apps/worker -> apps -> リポジトリルート
const repoRoot = resolve(here, "../../../..");

type Args = {
  in: string;
  out: string;
  labels: string;
  version: string;
  hash: string;
};

function parseArgs(argv: string[]): Partial<Record<keyof Args, string>> {
  const out: Partial<Record<keyof Args, string>> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    // `pnpm run ingest -- --out X` は "--" をそのまま argv に残す(npm/pnpm の
    // 素通し引数の区切り)。値を持たない裸の "--" は読み飛ばす。
    if (a === "--") continue;
    if (!a?.startsWith("--")) continue;
    const key = a.slice(2) as keyof Args;
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`--${key} には値が必要`);
    out[key] = value;
    i++;
  }
  return out;
}

function resolveArg(explicit: string | undefined, defaultRelativeToRepoRoot: string): string {
  if (explicit !== undefined) return resolve(process.cwd(), explicit);
  return resolve(repoRoot, defaultRelativeToRepoRoot);
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const args: Args = {
    in: resolveArg(parsed.in, "data/raw/extracted"),
    out: resolveArg(parsed.out, "apps/worker/data"),
    labels: resolveArg(parsed.labels, "data/labels/exits.json"),
    version: parsed.version ?? "2023-02-20",
    hash: parsed.hash ?? "",
  };

  const nav = readJSON<NavFile>(join(args.in, "v5_nav.json"));
  const comMap = readJSON<ComMap>(join(args.in, "com-map.geojson"));

  // geojson-level-geom-*.geojson を辞書順(ファイル名の昇順)で glob する。
  // Go の filepath.Glob は結果を辞書順で返すので、ここでも明示的にソートする(R2)。
  const geomFiles = readdirSync(args.in)
    .filter((f) => f.startsWith("geojson-level-geom-") && f.endsWith(".geojson"))
    .sort();
  const featureCollections = geomFiles.map((f) => readJSON<FeatureCollection>(join(args.in, f)));

  const comEntity = readJSON<ComEntity>(join(args.in, "com-entity.geojson"));

  let manualLabels: ManualLabels = {};
  try {
    const raw = readFileSync(args.labels, "utf8");
    manualLabels = JSON.parse(raw) as ManualLabels;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    // ファイルが無ければ Go 同様、空のまま進む(main.go: os.ReadFile の err != nil は無視)。
  }

  const input = { nav, comMap, featureCollections, comEntity, manualLabels, version: args.version, hash: args.hash };
  const { graph, catalog, report } = build(input);

  // V16 用: marker=="entrance" の gid 集合。
  const geoms = mergeGeoms(featureCollections);
  const entranceGids = new Set<number>();
  for (const [gid, f] of geoms) {
    if (f.properties.marker === "entrance") entranceGids.add(gid);
  }

  // V15 用: プロセス内でもう一度 build() して決定性を確認する(2プロセスをまたぐ
  // 決定性の確認は受け入れ条件のとおり別途 CLI を2回実行して行う)。
  const second = build(input);

  const result = verify({
    graph,
    catalog,
    entranceGids,
    manualLabelKeys: Object.keys(manualLabels),
    secondRun: { graph: second.graph, catalog: second.catalog },
  });

  for (const c of result.checks) {
    const mark = c.skipped ? "SKIP" : c.pass ? "PASS" : "FAIL";
    console.log(`[verify ${mark}] ${c.id} ${c.title} — ${c.detail}`);
  }
  if (!result.allPass) {
    console.error("\nverify に失敗した項目があるため書き出しを中止した。");
    process.exit(1);
  }

  mkdirSync(args.out, { recursive: true });
  const write = (name: string, value: unknown) => {
    const body = JSON.stringify(value);
    writeFileSync(join(args.out, name), body);
    console.log(`${name.padEnd(14)} ${(body.length / 1024).toFixed(1).padStart(8)} KB`);
  };
  write("graph.json", graph);
  write("catalog.json", catalog);

  console.log(`\nnodes=${report.nodes} links=${report.links}(expanded)`);
  console.log(
    `entries=${report.entries} meetings=${report.meetings} exits=${report.exits}` +
      `(近さで結んだもの ${report.snapped}、遠すぎて外したもの ${report.tooFar}、` +
      `手書きラベル ${report.manual}、外したもの ${report.excluded}、人が確かめたもの ${report.checked})`,
  );
  console.log(`同じ名前が複数あって候補から外した地点: ${report.droppedDuplicate}`);
  for (const k of Object.keys(report.byLine).sort()) {
    console.log(`  ${k.padEnd(20)} ${report.byLine[k]}`);
  }
  if (report.skippedExitOnly.length > 0) {
    const sorted = [...report.skippedExitOnly].sort();
    console.log(`\n出場専用として入口から外した改札 ${sorted.length} 件`);
    for (const n of sorted) console.log(`  ${n}`);
  }
  if (report.gatesWithoutLine.length > 0) {
    const sorted = [...report.gatesWithoutLine].sort();
    console.log(`\n路線を判定できなかった改札 ${sorted.length} 件(対応表に足すか、外すかを決める)`);
    for (const n of sorted) console.log(`  ${n}`);
  }
}

main();
