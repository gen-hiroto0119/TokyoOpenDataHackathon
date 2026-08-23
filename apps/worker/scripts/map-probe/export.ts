// 地図に写るか見るための GeoJSON 書き出し。アプリには載せない。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMlit } from "../ingest/mlit.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const outDir = resolve(here, "out");

const SPACE_KIND: Record<string, string> = {
  B001: "shop",
  B021: "stairs",
  B022: "elevator",
  B023: "escalator",
  B025: "ramp",
  B007: "restroom",
  B008: "restroom",
  B010: "restroom",
  B011: "restroom",
  B029: "corridor",
  B019: "room",
  B005: "ticket",
  B004: "waiting",
};

function ringToLngLat(ring: { lat: number; lng: number }[]): number[][] {
  return ring.map((p) => [p.lng, p.lat]);
}

type Geom = { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] };

function polygon(rings: { lat: number; lng: number }[][]): Geom | null {
  const parts = rings.filter((r) => r.length >= 4).map(ringToLngLat);
  if (parts.length === 0) return null;
  if (parts.length === 1) return { type: "Polygon", coordinates: parts };
  return { type: "MultiPolygon", coordinates: parts.map((p) => [p]) };
}

function main() {
  const mlit = loadMlit(resolve(repo, "Dataset"));
  const floorsWanted = new Set(["B1", "0", "1", "2"]);

  type Feat = { type: "Feature"; properties: Record<string, string | number | null>; geometry: object };
  const floors: Feat[] = [];
  for (const floor of mlit.floors) {
    if (!floorsWanted.has(floor.floorDir)) continue;
    const geom = polygon(floor.rings);
    if (!geom) continue;
    floors.push({
      type: "Feature",
      properties: {
        id: floor.id,
        name: floor.name,
        shortName: floor.shortName,
        floor: floor.floorDir,
      },
      geometry: geom,
    });
  }

  const spaces: Feat[] = [];
  for (const s of mlit.spaces) {
    if (!floorsWanted.has(s.floorDir)) continue;
    const geom = polygon(s.rings);
    if (!geom) continue;
    spaces.push({
      type: "Feature",
      properties: {
        id: s.id,
        kind: SPACE_KIND[s.category] ?? "other",
        category: s.category,
        name: s.name,
        floor: s.floorDir,
      },
      geometry: geom,
    });
  }

  const links: Feat[] = [];
  for (const l of mlit.links) {
    const from = mlit.nodes.find((n) => n.id === l.startId);
    const to = mlit.nodes.find((n) => n.id === l.endId);
    const coords =
      l.shape.length >= 2
        ? l.shape.map((p) => [p.lng, p.lat])
        : from && to
          ? [
              [from.lng, from.lat],
              [to.lng, to.lat],
            ]
          : [];
    if (coords.length < 2) continue;
    const vertical = l.routeType === "4" ? "elevator" : l.routeType === "5" ? "escalator" : l.routeType === "6" ? "stairs" : "walk";
    links.push({
      type: "Feature",
      properties: { id: l.id, vertical, floorFrom: from?.ordinal ?? null, floorTo: to?.ordinal ?? null },
      geometry: { type: "LineString", coordinates: coords },
    });
  }

  const points: Feat[] = [];
  for (const f of mlit.facilities) {
    const keep = f.category === "F108" || f.category === "F106" || f.category === "F039" || f.category === "F016";
    if (!keep) continue;
    const kind =
      f.category === "F108" ? "exit" : f.category === "F106" ? "gate" : f.category === "F039" ? "taxi" : "building";
    points.push({
      type: "Feature",
      properties: { id: f.id, kind, name: f.name, floor: f.floorDir },
      geometry: { type: "Point", coordinates: [f.point.lng, f.point.lat] },
    });
  }
  for (const o of mlit.openings) {
    const mid = o.lines[0]?.[Math.floor((o.lines[0].length - 1) / 2)];
    if (!mid) continue;
    const kind = /改札|口/.test(o.name) ? "gate" : o.name.includes("バスタ") ? "busta" : "opening";
    points.push({
      type: "Feature",
      properties: { id: o.id, kind, name: o.name || "(空)", floor: o.floorDir },
      geometry: { type: "Point", coordinates: [mid.lng, mid.lat] },
    });
  }

  mkdirSync(outDir, { recursive: true });
  const write = (name: string, features: Feat[]) => {
    const body = JSON.stringify({ type: "FeatureCollection", features });
    writeFileSync(join(outDir, name), body);
    console.log(`${name} ${features.length} ${(body.length / 1024).toFixed(0)}KB`);
  };
  write("floors.geojson", floors);
  write("spaces.geojson", spaces);
  write("links.geojson", links);
  write("points.geojson", points);
}

main();
