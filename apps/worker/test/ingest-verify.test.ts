import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mergeGeoms, type Catalog, type Graph } from "../scripts/ingest/build.js";
import { readJSON, type FeatureCollection, type ManualLabels } from "../scripts/ingest/raw.js";
import { verify } from "../scripts/ingest/verify.js";

/**
 * apps/worker/data（コミット済みの Go 出力）に scripts/ingest/verify.ts の V1〜V17 を
 * かける。等価移植の受け入れ条件の一つ: 「Go 出力・TS 出力の両方で V1〜V17 全 pass」
 * のうち、Go 出力側を CI で常時確認する回帰テスト。
 *
 * apps/worker/data/*.json はリポジトリにコミットされているので通常は存在するが、
 * 万一削除された環境でテストスイート全体を壊さないようデータ存在ガードを付ける
 * （real.test.ts と同種の実データ依存テストの流儀）。V16 が要る data/raw/extracted は
 * .gitignore 対象（/data/raw/）なので、無ければ V16 だけ skip され、他の検査には影響しない。
 */
const workerDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(workerDir, "data");
const GRAPH = join(dataDir, "graph.json");
const CATALOG = join(dataDir, "catalog.json");
const repoRoot = join(workerDir, "../..");
const rawDir = join(repoRoot, "data/raw/extracted");
const labelsFile = join(repoRoot, "data/labels/exits.json");

const hasData = existsSync(GRAPH) && existsSync(CATALOG);

describe.skipIf(!hasData)("verify(apps/worker/data)", () => {
  const graph = JSON.parse(readFileSync(GRAPH, "utf8")) as Graph;
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as Catalog;

  let entranceGids: Set<number> | undefined;
  if (existsSync(rawDir)) {
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
  const manualLabelKeys = existsSync(labelsFile)
    ? Object.keys(JSON.parse(readFileSync(labelsFile, "utf8")) as ManualLabels)
    : undefined;

  const result = verify({ graph, catalog, entranceGids, manualLabelKeys });

  it("V1〜V17 全 pass（V15 は単一ディレクトリのため skip、V16 は data/raw/extracted があれば実施）", () => {
    const failed = result.checks.filter((c) => !c.skipped && !c.pass);
    if (failed.length > 0) {
      console.error(failed.map((c) => `[FAIL] ${c.id} ${c.title} — ${c.detail}`).join("\n"));
    }
    expect(failed).toEqual([]);
    expect(result.allPass).toBe(true);
  });

  it.each(result.checks.filter((c) => !c.skipped).map((c) => [c.id, c] as const))(
    "%s は pass する",
    (_id, check) => {
      expect(check.pass, check.detail).toBe(true);
    },
  );
});
