import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecommendationRequest } from "../src/contract.js";
import type { Catalog, Dataset, Graph } from "../src/graph.js";
import { recommend } from "../src/recommend.js";
import { attachRouteMap } from "../src/route-map.js";
import { pickRoute } from "../src/room-route.js";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../data");
const dataset: Dataset = {
  graph: JSON.parse(readFileSync(join(dataDir, "graph.json"), "utf8")) as Graph,
  catalog: JSON.parse(readFileSync(join(dataDir, "catalog.json"), "utf8")) as Catalog,
};

const request: RecommendationRequest = {
  datasetId: "tokyo.shinjuku-terminal",
  destination: { kind: "catalog", id: "dest.tokyo-metropolitan-government" },
  participants: [
    { id: "jr", entry: { kind: "line", id: "line.jr" } },
    { id: "keio", entry: { kind: "line", id: "line.keio" } },
    { id: "marunouchi", entry: { kind: "line", id: "line.marunouchi" } },
  ],
};

describe("attachRouteMap", () => {
  it("JR の Path を階ごとの線にする", () => {
    const rec = recommend(dataset, request);
    const top = rec.ranked[0];
    expect(top).toBeDefined();
    const route = attachRouteMap(dataset, pickRoute(rec, { kind: "node", id: top!.meeting.nodeId }));
    const jr = route.map.participants.find((row) => row.participantId === "jr");
    expect(jr).toBeDefined();
    expect(jr!.floors.length).toBeGreaterThan(0);
    expect(jr!.lines.length).toBeGreaterThan(0);
    for (const line of jr!.lines) {
      expect(line.coordinates.length).toBeGreaterThanOrEqual(2);
      expect(line.coordinates[0]).toHaveLength(2);
    }
    expect(jr!.points.length).toBeGreaterThan(1);
    expect(jr!.points[0]!.nodeId).toBeDefined();
    expect(jr!.marks.some((mark) => mark.kind === "gate")).toBe(true);
    expect(jr!.marks.some((mark) => mark.kind === "meeting")).toBe(true);
    expect(route.map.onward.marks.some((mark) => mark.kind === "exit")).toBe(true);
    const [lng, lat] = jr!.lines[0]!.coordinates[0]!;
    expect(lng).toBeGreaterThan(139.69);
    expect(lng).toBeLessThan(139.71);
    expect(lat).toBeGreaterThan(35.68);
    expect(lat).toBeLessThan(35.70);
  });
});
