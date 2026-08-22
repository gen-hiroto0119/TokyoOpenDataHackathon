// 等価性ゲート(scratchpad/research-ingest.md §3)。
//
// 手順:
//   1. 参照ディレクトリと出力ディレクトリの graph.json / catalog.json をそれぞれ
//      パースし、JSON.stringify してバイト一致すれば PASS(パース後の正規化バイト一致)。
//   2. 不一致なら構造 diff にフォールバックする。graph.json の nodes[].x / nodes[].y
//      だけ |Δ| <= 1e-4 を許容し、それ以外(lat/lng・distanceM・全文字列・配列順・
//      キーの有無)は完全一致を要求する。許容で救った件数を必ず報告する。
//   3. 不一致は JSON パスを先頭20件まで列挙して FAIL。
//
// 実行: `node scripts/ingest/compare.ts --ref <dir> --out <dir>`
// --ref 省略時はリポジトリルートの apps/worker/data(コミット済みの Go 出力)。

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    // `pnpm run ingest:compare -- --out X` は "--" をそのまま argv に残す。
    // 値を持たない裸の "--" は読み飛ばす。
    if (a === "--") continue;
    if (!a?.startsWith("--")) continue;
    const key = a.slice(2);
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`--${key} には値が必要`);
    out[key] = value;
    i++;
  }
  return out;
}

type Mismatch = { path: string; a: unknown; b: unknown };

const XY_PATH = /^nodes\[\d+\]\.(x|y)$/;

function diff(a: unknown, b: unknown, path: string, mismatches: Mismatch[], rescued: { count: number }): void {
  if (a === b) return;

  if (typeof a === "number" && typeof b === "number") {
    if (XY_PATH.test(path) && Math.abs(a - b) <= 1e-4) {
      rescued.count++;
      return;
    }
    mismatches.push({ path, a, b });
    return;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      mismatches.push({ path: `${path}.length`, a: a.length, b: b.length });
      return;
    }
    for (let i = 0; i < a.length; i++) diff(a[i], b[i], `${path}[${i}]`, mismatches, rescued);
    return;
  }

  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of keys) {
      diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k, mismatches, rescued);
    }
    return;
  }

  mismatches.push({ path, a, b });
}

function compareFile(name: string, refDir: string, outDir: string): { pass: boolean; rescued: number; mismatches: Mismatch[] } {
  const refRaw = readFileSync(join(refDir, name), "utf8");
  const outRaw = readFileSync(join(outDir, name), "utf8");
  const refParsed = JSON.parse(refRaw);
  const outParsed = JSON.parse(outRaw);

  // 手順1: パース後の正規化バイト一致。
  if (JSON.stringify(refParsed) === JSON.stringify(outParsed)) {
    return { pass: true, rescued: 0, mismatches: [] };
  }

  // 手順2: 構造 diff にフォールバック。
  const mismatches: Mismatch[] = [];
  const rescued = { count: 0 };
  diff(refParsed, outParsed, "", mismatches, rescued);
  return { pass: mismatches.length === 0, rescued: rescued.count, mismatches };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const refDir = args.ref ? resolve(process.cwd(), args.ref) : resolve(repoRoot, "apps/worker/data");
  if (!args.out) {
    console.error("使い方: node scripts/ingest/compare.ts --out <出力ディレクトリ> [--ref <参照ディレクトリ>]");
    process.exit(2);
  }
  const outDir = resolve(process.cwd(), args.out);

  console.log(`参照: ${refDir}`);
  console.log(`出力: ${outDir}`);

  let allPass = true;
  let totalRescued = 0;
  for (const name of ["graph.json", "catalog.json"]) {
    const result = compareFile(name, refDir, outDir);
    totalRescued += result.rescued;
    if (result.pass) {
      const note = result.rescued > 0 ? `(x/y許容で救った件数: ${result.rescued})` : "(バイト一致)";
      console.log(`[compare PASS] ${name} ${note}`);
    } else {
      allPass = false;
      console.log(`[compare FAIL] ${name} 不一致 ${result.mismatches.length} 件(先頭20件):`);
      for (const m of result.mismatches.slice(0, 20)) {
        console.log(`  ${m.path}: ref=${JSON.stringify(m.a)} out=${JSON.stringify(m.b)}`);
      }
    }
  }

  console.log(`\nx/y 許容で救った件数(合計): ${totalRescued}`);
  if (!allPass) {
    console.error("\n等価性ゲート: FAIL");
    process.exit(1);
  }
  console.log("\n等価性ゲート: PASS");
}

main();
