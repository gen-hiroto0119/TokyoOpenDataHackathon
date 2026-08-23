import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  build,
  type ExitLabelsFile,
  type GatesFile,
  type LandmarksFile,
  type LinesFile,
} from "../scripts/ingest/build.ts";
import { DEFAULT_VERSION } from "../scripts/ingest/main.ts";
import { loadMlit } from "../scripts/ingest/mlit.ts";
import { verify } from "../scripts/ingest/verify.ts";

/**
 * 生データ（git に入れない）があるときだけ動く。取り込みを最初から最後まで回し、
 * 検査が全部通ること、書き出してある apps/worker/data が今の取り込み結果と
 * バイト一致することを見る。
 */
const workerDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = resolve(workerDir, "../..");
const datasetDir = join(repoRoot, "Dataset");
const rawDir = join(repoRoot, "data/raw/mlit");
const mlitDir = existsSync(datasetDir) ? datasetDir : rawDir;
const labelsDir = join(repoRoot, "data/labels");
const hasData = existsSync(mlitDir) && existsSync(join(labelsDir, "gates.json"));

function readJSON<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe.skipIf(!hasData)("ingest: 生データから build して verify", () => {
  const input = {
    mlit: loadMlit(mlitDir),
    gates: readJSON<GatesFile>(join(labelsDir, "gates.json")),
    lines: readJSON<LinesFile>(join(labelsDir, "lines.json")),
    landmarks: readJSON<LandmarksFile>(join(labelsDir, "landmarks.json")),
    exitLabels: readJSON<ExitLabelsFile>(join(labelsDir, "exits.json")),
    version: DEFAULT_VERSION,
  };
  const first = build(input);
  const second = build(input);
  const result = verify({ ...first, secondRun: { graph: second.graph, catalog: second.catalog } });

  it("検査が全部通る", () => {
    const failed = result.checks.filter((c) => !c.pass).map((c) => `${c.id} ${c.title}: ${c.detail}`);
    expect(failed).toEqual([]);
  });

  it("書き出し済みの graph.json / catalog.json が今の取り込み結果と一致する", () => {
    const graphOnDisk = readFileSync(join(workerDir, "data/graph.json"), "utf8");
    const catalogOnDisk = readFileSync(join(workerDir, "data/catalog.json"), "utf8");
    expect(graphOnDisk).toBe(JSON.stringify(first.graph));
    expect(catalogOnDisk).toBe(JSON.stringify(first.catalog));
  });
});
