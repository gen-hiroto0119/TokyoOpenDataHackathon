import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const workerDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  root: workerDir,
  test: {
    include: ["scripts/map-probe/from-recommend.test.ts"],
    environment: "node",
  },
});
