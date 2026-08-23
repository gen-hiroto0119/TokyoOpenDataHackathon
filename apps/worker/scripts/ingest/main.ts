// 取り込みの CLI。国交省の統合版を読み、build.ts で結び、verify.ts に
// かけてから apps/worker/data に書く。一つでも検査に落ちたら書かない。
//
// 実行: `pnpm --filter worker ingest` か `node scripts/ingest/main.ts`
//   --mlit    国交省の展開先（既定 data/raw/mlit。統合版と施設別版のフォルダを置く）
//   --labels  手書きの表の置き場（既定 data/labels。gates.json / lines.json / landmarks.json / exits.json）
//   --out     書き出し先（既定 apps/worker/data）
//   --version datasetVersion（既定 mlit-2020-08）
// 明示しない引数はリポジトリルートを基準に解決する（pnpm --filter は cwd を apps/worker にするため）。

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  build,
  type ExitLabelsFile,
  type GatesFile,
  type LandmarksFile,
  type LinesFile,
} from "./build.ts";
import { loadMlit } from "./mlit.ts";
import { verify } from "./verify.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");

export const DEFAULT_VERSION = "mlit-2020-08";

type Args = { mlit: string; labels: string; out: string; version: string };

function parseArgs(argv: string[]): Partial<Args> {
  const out: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--" || !a?.startsWith("--")) continue;
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

function readJSON<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const args: Args = {
    mlit: resolveArg(parsed.mlit, "data/raw/mlit"),
    labels: resolveArg(parsed.labels, "data/labels"),
    out: resolveArg(parsed.out, "apps/worker/data"),
    version: parsed.version ?? DEFAULT_VERSION,
  };

  const mlit = loadMlit(args.mlit);
  const gates = readJSON<GatesFile>(join(args.labels, "gates.json"));
  const lines = readJSON<LinesFile>(join(args.labels, "lines.json"));
  const landmarks = readJSON<LandmarksFile>(join(args.labels, "landmarks.json"));
  const exitLabels = readJSON<ExitLabelsFile>(join(args.labels, "exits.json"));

  const input = { mlit, gates, lines, landmarks, exitLabels, version: args.version };
  const { graph, catalog, report } = build(input);
  const second = build(input);
  const result = verify({ graph, catalog, report, secondRun: { graph: second.graph, catalog: second.catalog } });

  for (const c of result.checks) {
    console.log(`[verify ${c.pass ? "PASS" : "FAIL"}] ${c.id} ${c.title} — ${c.detail}`);
  }

  console.log(`\n国交省 ${mlit.mergedDir}${mlit.splitDir ? ` + ${mlit.splitDir}` : ""}`);
  console.log(`nodes=${report.nodes} links=${report.links}(向きを開いた本数) 端点欠けで落としたリンク=${report.droppedDanglingLinks.length}`);
  console.log(`entries=${report.entries} meetings=${report.meetings} exits=${report.exits} destinations=${report.destinations}`);
  console.log(`縦移動 ${JSON.stringify(report.verticalCounts)}`);
  console.log(`集合候補の出どころ ${JSON.stringify(report.meetingSources)}`);
  console.log(`  国交省で同名が複数 ${report.mlitDuplicateNames.length}: ${report.mlitDuplicateNames.join(" / ") || "なし"}`);
  console.log(`  バスタを一つにした ${report.bustaMerged.length}: ${report.bustaMerged.join(" / ") || "なし"}`);
  console.log(`  手書き地点が解けない ${report.landmarksUnresolved.length}: ${report.landmarksUnresolved.join(" / ") || "なし"}`);
  console.log(`  同じノードまたは同名で外した ${report.sameNodeAliases.length}: ${report.sameNodeAliases.slice(0, 8).join(" / ")}${report.sameNodeAliases.length > 8 ? " …" : ""}`);
  console.log(`出口 除外 ${report.exitsExcluded.length} / 手書きラベル ${report.exitsManual} / 人が確かめた ${report.exitsChecked} / 同じノードで落とした ${report.exitsSameNodeDropped.length}`);
  for (const k of Object.keys(report.byLine).sort()) console.log(`  ${k.padEnd(18)} ${report.byLine[k]}`);

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
  console.log("");
  write("graph.json", graph);
  write("catalog.json", catalog);
}

main();
