// 経路 API が返す地図。map-probe と同じ線・点を、グラフ座標から作る。

import type { RouteMap, RouteMapConnector, RouteMapMark, RouteMapPoint, RouteResponse, Step } from "./contract.js";
import type { Dataset, Graph, GraphLink, GraphNode, VerticalKind } from "./graph.js";

const ORIGIN = { lat: 35.69, lng: 139.7 } as const;
const M_PER_DEG_LAT = 111320;

const FLOOR_ALIAS: Record<string, string> = {
  B3: "B3F",
  B2: "B2F",
  B1: "B1F",
  "0": "1F",
  "1": "1F",
  "2": "2F",
  "3": "3F",
  "4": "4F",
};

const FLOOR_ORDER = ["B3F", "B2F", "B1F", "1F", "2F", "3F", "4F"] as const;

export function normalizeFloorLabel(label: string | null | undefined): string {
  if (!label) return "";
  if (FLOOR_ALIAS[label]) return FLOOR_ALIAS[label];
  if (label.endsWith("F")) return label;
  return `${label}F`;
}

function unproject(x: number, y: number): [number, number] {
  const lat = ORIGIN.lat + y / M_PER_DEG_LAT;
  const lng = ORIGIN.lng + x / (M_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180));
  return [lng, lat];
}

function pieceOf(link: GraphLink, nodes: Map<string, GraphNode>): [number, number][] {
  if (link.shape && link.shape.length >= 2) {
    return link.shape.map(([x, y]) => unproject(x, y));
  }
  const from = nodes.get(link.from);
  const to = nodes.get(link.to);
  if (!from || !to) return [];
  return [unproject(from.x, from.y), unproject(to.x, to.y)];
}

function connectorKind(vertical: VerticalKind): RouteMapConnector["kind"] {
  switch (vertical) {
    case "stairs":
    case "escalator":
    case "elevator":
      return vertical;
    case "none":
    case "unknown":
      return "ramp";
    default: {
      const _never: never = vertical;
      return _never;
    }
  }
}

function markKindOf(
  step: Step,
  nodeId: string,
  entryNodeId: string | null,
  meetingNodeId: string,
  exitNodeId: string | null,
): RouteMapMark["kind"] {
  if (entryNodeId !== null && nodeId === entryNodeId) return "gate";
  if (nodeId === meetingNodeId) return "meeting";
  if (exitNodeId !== null && nodeId === exitNodeId) return "exit";
  if (step.vertical !== "none") return step.vertical;
  if (step.turn !== "straight") return "turn";
  return "node";
}

function markNameOf(
  step: Step,
  kind: RouteMapMark["kind"],
  entryNameJa: string | null,
  meetingNameJa: string,
  exitNameJa: string | null,
  fallback: string,
): string {
  switch (kind) {
    case "gate":
      return entryNameJa ?? fallback;
    case "meeting":
      return meetingNameJa;
    case "exit":
      return exitNameJa ?? fallback;
    case "stairs":
      return "階段";
    case "escalator":
      return "エスカレーター";
    case "elevator":
      return "エレベーター";
    case "turn":
      switch (step.turn) {
        case "right":
          return "右";
        case "left":
          return "左";
        case "slight_right":
          return "やや右";
        case "slight_left":
          return "やや左";
        case "straight":
          return fallback;
        default: {
          const _never: never = step.turn;
          return _never;
        }
      }
    case "node":
      return step.nameJa ?? fallback;
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

/** 階段・ES の手前までを今の階、着地から次の階。同じ階が二度出たら別線。 */
function linesByFloor(
  linkIds: string[],
  nodes: Map<string, GraphNode>,
  links: Map<string, GraphLink>,
): { floor: string; coordinates: [number, number][] }[] {
  const out: { floor: string; coordinates: [number, number][] }[] = [];
  let floor = "";
  let coords: [number, number][] = [];
  const flush = () => {
    if (coords.length >= 2 && floor !== "") out.push({ floor, coordinates: coords });
    coords = [];
  };
  for (const id of linkIds) {
    const link = links.get(id);
    if (!link) continue;
    const from = nodes.get(link.from);
    const to = nodes.get(link.to);
    if (!from || !to) continue;
    const fromFloor = normalizeFloorLabel(from.floorLabel) || floor;
    const toFloor = normalizeFloorLabel(to.floorLabel) || fromFloor;
    const piece = pieceOf(link, nodes);
    if (piece.length < 2) continue;
    if (floor === "") floor = fromFloor;
    if (fromFloor !== floor) {
      flush();
      floor = fromFloor;
    }
    if (toFloor !== fromFloor) {
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

function uniqueFloors(floors: string[]): string[] {
  const seen = new Set<string>();
  const extra: string[] = [];
  for (const floor of floors) {
    if (!floor || seen.has(floor)) continue;
    seen.add(floor);
    extra.push(floor);
  }
  return [
    ...FLOOR_ORDER.filter((floor) => seen.has(floor)),
    ...extra.filter((floor) => !FLOOR_ORDER.includes(floor as (typeof FLOOR_ORDER)[number])),
  ];
}

export function buildPathMap(
  graph: Graph,
  input: {
    pathNodeIds: string[];
    pathLinkIds: string[];
    steps: Step[];
    entry: { nodeId: string; nameJa: string } | null;
    meeting: { nodeId: string; nameJa: string };
    exit: { nodeId: string; nameJa: string } | null;
  },
): RouteMap {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const links = new Map(graph.links.map((l) => [l.id, l]));
  const lines = linesByFloor(input.pathLinkIds, nodes, links);
  const connectors: RouteMapConnector[] = [];
  for (const id of input.pathLinkIds) {
    const link = links.get(id);
    if (!link) continue;
    const from = nodes.get(link.from);
    const to = nodes.get(link.to);
    if (!from || !to) continue;
    const fromFloor = normalizeFloorLabel(from.floorLabel);
    const toFloor = normalizeFloorLabel(to.floorLabel);
    if (fromFloor === toFloor) continue;
    connectors.push({
      kind: connectorKind(link.vertical),
      fromFloor: fromFloor || null,
      toFloor: toFloor || null,
      coordinates: [unproject(from.x, from.y), unproject(to.x, to.y)],
    });
  }

  const marks: RouteMapMark[] = [];
  const seen = new Set<string>();
  for (const step of input.steps) {
    const node = nodes.get(step.nodeId);
    if (!node || seen.has(step.nodeId)) continue;
    const kind = markKindOf(
      step,
      step.nodeId,
      input.entry?.nodeId ?? null,
      input.meeting.nodeId,
      input.exit?.nodeId ?? null,
    );
    // 改札・集合・出口と階の移動だけ。曲がり角を点で強調しない。
    if (kind === "turn" || kind === "node") continue;
    seen.add(step.nodeId);
    const [lng, lat] = unproject(node.x, node.y);
    marks.push({
      kind,
      nodeId: step.nodeId,
      nameJa: markNameOf(
        step,
        kind,
        input.entry?.nameJa ?? null,
        input.meeting.nameJa,
        input.exit?.nameJa ?? null,
        step.nameJa ?? node.nameJa ?? "",
      ),
      floor: normalizeFloorLabel(step.floorLabel ?? node.floorLabel) || null,
      lng,
      lat,
    });
  }

  const points: RouteMapPoint[] = [];
  for (const nodeId of input.pathNodeIds) {
    const node = nodes.get(nodeId);
    if (!node) continue;
    const [lng, lat] = unproject(node.x, node.y);
    points.push({
      nodeId,
      floor: normalizeFloorLabel(node.floorLabel) || null,
      lng,
      lat,
    });
  }

  return {
    floors: uniqueFloors(lines.map((line) => line.floor)),
    lines,
    connectors,
    marks,
    points,
  };
}

export function attachRouteMap(ds: Dataset, route: Omit<RouteResponse, "map">): RouteResponse {
  return {
    ...route,
    map: {
      participants: route.legs.map((leg) => ({
        participantId: leg.participantId,
        ...buildPathMap(ds.graph, {
          pathNodeIds: leg.pathNodeIds,
          pathLinkIds: leg.pathLinkIds,
          steps: leg.steps,
          entry: leg.entry,
          meeting: route.meeting,
          exit: null,
        }),
      })),
      onward: buildPathMap(ds.graph, {
        pathNodeIds: route.onward.pathNodeIds,
        pathLinkIds: route.onward.pathLinkIds,
        steps: route.onward.steps,
        entry: null,
        meeting: route.meeting,
        exit: route.onward.exit,
      }),
    },
  };
}
