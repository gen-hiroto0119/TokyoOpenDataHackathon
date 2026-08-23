// Path と同じ recommend() の経路を GeoJSON にする。アプリには載せない。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecommendationRequest, Step, StepTurn, StepVertical } from "../../src/contract.js";
import type { Catalog, Dataset, Graph, GraphLink, GraphNode } from "../../src/graph.js";
import { recommend } from "../../src/recommend.js";

const ORIGIN = { lat: 35.69, lng: 139.7 } as const;

const here = dirname(fileURLToPath(import.meta.url));
const workerDir = resolveWorker(here);
const outDir = join(here, "out");

function resolveWorker(from: string): string {
  return join(from, "../..");
}

const WHO: Record<string, string> = {
  あきな: "JR",
  かいる: "京王",
  ひろと: "丸ノ内",
};

const M_PER_DEG_LAT = 111320;

function unproject(x: number, y: number): [number, number] {
  const lat = ORIGIN.lat + y / M_PER_DEG_LAT;
  const lng = ORIGIN.lng + x / (M_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180));
  return [lng, lat];
}

type Feat = { type: "Feature"; properties: Record<string, string | number | null>; geometry: object };

function pieceOf(link: GraphLink, nodes: Map<string, GraphNode>): number[][] {
  if (link.shape && link.shape.length >= 2) return link.shape.map(([x, y]) => unproject(x, y));
  const from = nodes.get(link.from);
  const to = nodes.get(link.to);
  if (!from || !to) return [];
  return [unproject(from.x, from.y), unproject(to.x, to.y)];
}

/** 階段・ES の手前までを今の階、着地から次の階。同じ階が二度出たら別線。 */
function linesByFloor(
  linkIds: string[],
  nodes: Map<string, GraphNode>,
  links: Map<string, GraphLink>,
): { floor: string; coords: number[][] }[] {
  const out: { floor: string; coords: number[][] }[] = [];
  let floor = "";
  let coords: number[][] = [];
  const flush = () => {
    if (coords.length >= 2 && floor !== "") out.push({ floor, coords });
    coords = [];
  };
  for (const id of linkIds) {
    const link = links.get(id);
    if (!link) continue;
    const from = nodes.get(link.from);
    const to = nodes.get(link.to);
    if (!from || !to) continue;
    const fromFloor = from.floorLabel ?? floor;
    const toFloor = to.floorLabel ?? fromFloor;
    const piece = pieceOf(link, nodes);
    if (piece.length < 2) continue;
    if (floor === "") floor = fromFloor;
    if (fromFloor !== floor) {
      flush();
      floor = fromFloor;
    }
    if (toFloor !== fromFloor) {
      // 階移動は connectors.geojson が紫（EV は黒）で描く。
      // 水平 Path にも含めると同じ区間が青と紫で二重になる。
      flush();
      floor = toFloor;
      coords = [piece[piece.length - 1]!];
      continue;
    }
    if (coords.length === 0) coords.push(...piece);
    else coords.push(...piece.slice(1));
  }
  flush();
  return out;
}

function turnLabel(turn: StepTurn): string {
  switch (turn) {
    case "right":
      return "右";
    case "left":
      return "左";
    case "slight_right":
      return "やや右";
    case "slight_left":
      return "やや左";
    case "straight":
      return "直進";
    default: {
      const _never: never = turn;
      return _never;
    }
  }
}

function verticalLabel(vertical: StepVertical): string {
  switch (vertical) {
    case "stairs":
      return "階段";
    case "escalator":
      return "エスカレーター";
    case "elevator":
      return "エレベーター";
    case "none":
      return "";
    default: {
      const _never: never = vertical;
      return _never;
    }
  }
}

describe("map-probe Path 経路", () => {
  it("JR の Path node に点を置く", () => {
    const dataset: Dataset = {
      graph: JSON.parse(readFileSync(join(workerDir, "data/graph.json"), "utf8")) as Graph,
      catalog: JSON.parse(readFileSync(join(workerDir, "data/catalog.json"), "utf8")) as Catalog,
    };
    const request: RecommendationRequest = {
      datasetId: "tokyo.shinjuku-terminal",
      destination: { kind: "catalog", id: "dest.tokyo-metropolitan-government" },
      participants: [
        { id: "ひろと", entry: { kind: "line", id: "line.marunouchi" } },
        { id: "かいる", entry: { kind: "line", id: "line.keio" } },
        { id: "あきな", entry: { kind: "line", id: "line.jr" } },
      ],
    };
    const top = recommend(dataset, request).ranked[0];
    expect(top).toBeDefined();

    const nodes = new Map(dataset.graph.nodes.map((n) => [n.id, n]));
    const links = new Map(dataset.graph.links.map((l) => [l.id, l]));
    const routes: Feat[] = [];
    const marks: Feat[] = [];
    const connectors: Feat[] = [];

    const jr = top!.legs.find((l) => l.participantId === "あきな");
    expect(jr).toBeDefined();
    const who = WHO[jr!.participantId] ?? jr!.participantId;
    const linkIds = [...jr!.pathLinkIds, ...top!.onward.pathLinkIds];
    const segments = linesByFloor(linkIds, nodes, links);
    expect(segments.length).toBeGreaterThan(0);
    const floors: string[] = [];
    for (const seg of segments) {
      if (!floors.includes(seg.floor)) floors.push(seg.floor);
      routes.push({
        type: "Feature",
        properties: {
          who,
          floor: seg.floor,
          from: jr!.entry.nameJa,
          meeting: top!.meeting.nameJa,
          exit: top!.onward.exit.nameJa,
        },
        geometry: { type: "LineString", coordinates: seg.coords },
      });
    }
    for (const id of linkIds) {
      const link = links.get(id);
      if (!link) continue;
      const from = nodes.get(link.from);
      const to = nodes.get(link.to);
      if (!from || !to || from.floorLabel === to.floorLabel) continue;
      const kind = link.vertical === "none" ? "ramp" : link.vertical;
      connectors.push({
        type: "Feature",
        properties: {
          who,
          kind,
          fromFloor: from.floorLabel,
          toFloor: to.floorLabel,
          floor: from.floorLabel,
          distanceM: link.distanceM,
        },
        geometry: {
          type: "LineString",
          coordinates: [unproject(from.x, from.y), unproject(to.x, to.y)],
        },
      });
    }

    const onwardSteps =
      top!.onward.steps[0]?.nodeId === top!.meeting.nodeId ? top!.onward.steps.slice(1) : top!.onward.steps;
    const seen = new Set<string>();
    for (const step of [...jr!.steps, ...onwardSteps]) {
      const keep =
        step.kind === "landmark" || step.turn !== "straight" || step.vertical !== "none";
      if (!keep || seen.has(step.nodeId)) continue;
      seen.add(step.nodeId);
      const node = nodes.get(step.nodeId);
      if (!node) continue;
      const kind =
        step.nodeId === jr!.entry.nodeId
          ? "gate"
          : step.nodeId === top!.meeting.nodeId
            ? "meeting"
            : step.nodeId === top!.onward.exit.nodeId
              ? "exit"
              : step.vertical !== "none"
                ? step.vertical
                : step.turn !== "straight"
                  ? "turn"
                  : "node";
      const name =
        kind === "gate"
          ? jr!.entry.nameJa
          : kind === "meeting"
            ? top!.meeting.nameJa
            : kind === "exit"
              ? top!.onward.exit.nameJa
              : step.vertical !== "none"
                ? verticalLabel(step.vertical)
                : step.turn !== "straight"
                  ? turnLabel(step.turn)
                  : (step.nameJa ?? node.nameJa ?? "");
      marks.push({
        type: "Feature",
        properties: { who, kind, name, floor: step.floorLabel },
        geometry: { type: "Point", coordinates: unproject(node.x, node.y) },
      });
    }

    const pathNodeIds = [...jr!.pathNodeIds, ...top!.onward.pathNodeIds.slice(1)];
    expect(linkIds).toHaveLength(pathNodeIds.length - 1);
    const stepsByNode = new Map([...jr!.steps, ...onwardSteps].map((step) => [step.nodeId, step]));
    const selectedIndexes = new Set<number>([0, pathNodeIds.length - 1]);
    for (let index = 0; index < pathNodeIds.length; index++) {
      if (stepsByNode.has(pathNodeIds[index]!)) selectedIndexes.add(index);
    }
    for (let index = 0; index < linkIds.length; index++) {
      const link = links.get(linkIds[index]!);
      if (link && (link.deltaZ !== 0 || link.vertical !== "none")) {
        selectedIndexes.add(index);
        selectedIndexes.add(index + 1);
      }
    }

    const orderedIndexes = [...selectedIndexes].sort((a, b) => a - b);
    const labelAt = (index: number): string => {
      const nodeId = pathNodeIds[index]!;
      const node = nodes.get(nodeId);
      if (nodeId === jr!.entry.nodeId) return jr!.entry.nameJa;
      if (nodeId === top!.meeting.nodeId) return top!.meeting.nameJa;
      if (nodeId === top!.onward.exit.nodeId) return top!.onward.exit.nameJa;

      const incoming = index > 0 ? links.get(linkIds[index - 1]!) : undefined;
      const outgoing = index < linkIds.length ? links.get(linkIds[index]!) : undefined;
      const linkVerticalLabel = (link: GraphLink): string =>
        link.vertical === "stairs"
          ? "階段"
          : link.vertical === "escalator"
            ? "エスカレーター"
            : link.vertical === "elevator"
              ? "エレベーター"
              : "階移動";
      if (outgoing && (outgoing.deltaZ !== 0 || outgoing.vertical !== "none")) {
        return `${node?.floorLabel ?? ""} ${linkVerticalLabel(outgoing)}手前`.trim();
      }
      if (incoming && (incoming.deltaZ !== 0 || incoming.vertical !== "none")) {
        return `${node?.floorLabel ?? ""} ${linkVerticalLabel(incoming)}着地`.trim();
      }

      const step = stepsByNode.get(nodeId);
      if (step?.nameJa) return step.nameJa;
      if (step && step.turn !== "straight") return `${turnLabel(step.turn)}へ曲がる`;
      return node?.nameJa ?? "経路Node";
    };

    const nodeDistances = orderedIndexes.slice(1).map((toIndex, itemIndex) => {
      const fromIndex = orderedIndexes[itemIndex]!;
      let distanceM = 0;
      for (let index = fromIndex; index < toIndex; index++) {
        distanceM += links.get(linkIds[index]!)?.distanceM ?? 0;
      }
      return {
        from: labelAt(fromIndex),
        to: labelAt(toIndex),
        fromFloor: nodes.get(pathNodeIds[fromIndex]!)?.floorLabel ?? "",
        toFloor: nodes.get(pathNodeIds[toIndex]!)?.floorLabel ?? "",
        distanceM: Math.round(distanceM * 10) / 10,
      };
    });

    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "routes.geojson"), JSON.stringify({ type: "FeatureCollection", features: routes }));
    writeFileSync(join(outDir, "route-ends.geojson"), JSON.stringify({ type: "FeatureCollection", features: marks }));
    writeFileSync(
      join(outDir, "connectors.geojson"),
      JSON.stringify({ type: "FeatureCollection", features: connectors }),
    );
    writeFileSync(join(outDir, "node-distances.json"), JSON.stringify(nodeDistances));
    writeFileSync(
      join(outDir, "path-meta.json"),
      JSON.stringify({
        meeting: top!.meeting.nameJa,
        floor: top!.meeting.floorLabel,
        floors,
        exit: top!.onward.exit.nameJa,
        destination: "東京都庁",
      }),
    );
    console.log(`JR Path ${floors.join(" → ")} / ${jr!.entry.nameJa} → ${top!.meeting.nameJa} → ${top!.onward.exit.nameJa}`);
  });
});
