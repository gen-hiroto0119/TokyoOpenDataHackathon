// いまの Path 区間に地図を寄せ、進行方向を上にする。駅全体は見せない。

import type { RouteMap, RouteMapPoint } from "worker/src/contract.js";

export type LngLat = [number, number];

const MIN_SPAN_M = 48;
const MIN_ZOOM = 17.2;
const MAX_ZOOM = 18.4;
const M_PER_PX_Z0 = 156543.03392;

function pointsOf(map: RouteMap): RouteMapPoint[] {
  return map.points ?? [];
}

export function bearingDeg(from: LngLat, to: LngLat): number {
  const φ1 = (from[1] * Math.PI) / 180;
  const φ2 = (to[1] * Math.PI) / 180;
  const Δλ = ((to[0] - from[0]) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function haversineM(from: LngLat, to: LngLat): number {
  const R = 6371000;
  const φ1 = (from[1] * Math.PI) / 180;
  const φ2 = (to[1] * Math.PI) / 180;
  const Δφ = φ2 - φ1;
  const Δλ = ((to[0] - from[0]) * Math.PI) / 180;
  const s = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function destination(from: LngLat, bearing: number, meters: number): LngLat {
  const R = 6371000;
  const δ = meters / R;
  const θ = (bearing * Math.PI) / 180;
  const φ1 = (from[1] * Math.PI) / 180;
  const λ1 = (from[0] * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI];
}

function sameLngLat(a: LngLat, b: LngLat): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function resolvePoint(map: RouteMap, nodeId: string | null): RouteMapPoint | null {
  if (!nodeId) return null;
  const point = pointsOf(map).find((row) => row.nodeId === nodeId);
  if (point) return point;
  const mark = map.marks.find((row) => row.nodeId === nodeId);
  if (!mark) return null;
  return { nodeId: mark.nodeId, floor: mark.floor, lng: mark.lng, lat: mark.lat };
}

function nextDistinct(points: readonly RouteMapPoint[], start: number, step: 1 | -1): RouteMapPoint | null {
  const origin = points[start];
  if (!origin) return null;
  for (let i = start + step; i >= 0 && i < points.length; i += step) {
    const row = points[i]!;
    if (row.lng !== origin.lng || row.lat !== origin.lat) return row;
  }
  return null;
}

/** 進行方向の始点・終点。同じ座標（EV など）は前後の別点で向きを出す。 */
export function travelEnds(
  map: RouteMap,
  fromNodeId: string | null,
  toNodeId: string | null,
): { from: LngLat; to: LngLat } | null {
  const from = resolvePoint(map, fromNodeId);
  const to = resolvePoint(map, toNodeId);
  if (from && to && (from.lng !== to.lng || from.lat !== to.lat)) {
    return { from: [from.lng, from.lat], to: [to.lng, to.lat] };
  }
  const points = pointsOf(map);
  const hereId = toNodeId ?? fromNodeId;
  const hereI = hereId ? points.findIndex((row) => row.nodeId === hereId) : -1;
  if (hereI >= 0) {
    const ahead = nextDistinct(points, hereI, 1);
    if (ahead) return { from: [points[hereI]!.lng, points[hereI]!.lat], to: [ahead.lng, ahead.lat] };
    const behind = nextDistinct(points, hereI, -1);
    if (behind) return { from: [behind.lng, behind.lat], to: [points[hereI]!.lng, points[hereI]!.lat] };
  }
  if (from) return { from: [from.lng, from.lat], to: [from.lng, from.lat] };
  if (to) return { from: [to.lng, to.lat], to: [to.lng, to.lat] };
  return null;
}

/** いまの区間の折れ線。階を跨ぐときは、表示中の階に残っている分だけ。 */
export function focusCoords(
  map: RouteMap,
  floor: string,
  fromNodeId: string | null,
  toNodeId: string | null,
): LngLat[] {
  const points = pointsOf(map);
  const fromI = fromNodeId ? points.findIndex((row) => row.nodeId === fromNodeId) : -1;
  const toI = toNodeId ? points.findIndex((row) => row.nodeId === toNodeId) : -1;
  if (fromI >= 0 && toI >= 0) {
    const start = Math.min(fromI, toI);
    const end = Math.max(fromI, toI);
    const slice: LngLat[] = [];
    for (let i = start; i <= end; i++) {
      const row = points[i]!;
      if ((row.floor ?? "") === floor || i === start) slice.push([row.lng, row.lat]);
      else if (slice.length > 0) break;
    }
    if (fromI > toI) slice.reverse();
    const onFloor = (points[fromI]?.floor ?? "") === floor || (points[toI]?.floor ?? "") === floor;
    if (onFloor && slice.length > 0) return slice;
  }
  if (fromI >= 0 && (points[fromI]!.floor ?? "") === floor) {
    return [[points[fromI]!.lng, points[fromI]!.lat]];
  }
  const onFloor = points.filter((row) => (row.floor ?? "") === floor).map((row) => [row.lng, row.lat] as LngLat);
  if (onFloor.length > 0) return onFloor;
  const line = map.lines.find((row) => row.floor === floor);
  return line ? [...line.coordinates] : [];
}

function polylineLengthM(coords: readonly LngLat[]): number {
  let sum = 0;
  for (let i = 1; i < coords.length; i++) sum += haversineM(coords[i - 1]!, coords[i]!);
  return sum;
}

function polylineMidpoint(coords: readonly LngLat[]): LngLat | null {
  const usable: LngLat[] = [];
  for (const row of coords) {
    if (Number.isFinite(row[0]) && Number.isFinite(row[1])) usable.push(row);
  }
  if (usable.length === 0) return null;
  if (usable.length === 1) return usable[0]!;
  const total = polylineLengthM(usable);
  if (!(total > 0)) return usable[0]!;
  const target = total / 2;
  let acc = 0;
  for (let i = 1; i < usable.length; i++) {
    const a = usable[i - 1]!;
    const b = usable[i]!;
    const d = haversineM(a, b);
    if (acc + d >= target) {
      const t = d === 0 ? 0 : (target - acc) / d;
      const lng = a[0] + (b[0] - a[0]) * t;
      const lat = a[1] + (b[1] - a[1]) * t;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return a;
      return [lng, lat];
    }
    acc += d;
  }
  return usable[usable.length - 1]!;
}

/** 直進中は区間の中央、節の上にいるときはその節。 */
export function hereLngLat(
  map: RouteMap,
  floor: string,
  fromNodeId: string | null,
  toNodeId: string | null,
  currentNodeId: string | null,
  between: boolean,
): LngLat | null {
  if (between) {
    const mid = polylineMidpoint(focusCoords(map, floor, fromNodeId, toNodeId));
    if (mid) return mid;
    const ends = travelEnds(map, fromNodeId, toNodeId);
    if (ends) return polylineMidpoint([ends.from, ends.to]);
  }
  const node = resolvePoint(map, currentNodeId) ?? resolvePoint(map, toNodeId) ?? resolvePoint(map, fromNodeId);
  if (node) return [node.lng, node.lat];
  return polylineMidpoint(focusCoords(map, floor, fromNodeId, toNodeId));
}

export function zoomForMeters(meters: number, sizePx: number, lat: number): number {
  const span = Math.max(meters, MIN_SPAN_M);
  const px = Math.max(sizePx, 1);
  const mpp = span / px;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  if (!Number.isFinite(mpp) || mpp <= 0 || !Number.isFinite(cosLat) || cosLat <= 0) {
    return MIN_ZOOM;
  }
  const zoom = Math.log2((M_PER_PX_Z0 * cosLat) / mpp);
  if (!Number.isFinite(zoom)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export type SegmentCamera = {
  center: LngLat;
  zoom: number;
  bearing: number;
  pitch: number;
  focus: LngLat[];
};

/** heading-up。区間が画面の大半を占めるズーム。pitch は map-probe と同じ 58。 */
export function segmentCamera(
  map: RouteMap,
  floor: string,
  fromNodeId: string | null,
  toNodeId: string | null,
  size: { width: number; height: number },
): SegmentCamera | null {
  const focus = focusCoords(map, floor, fromNodeId, toNodeId);
  const ends = travelEnds(map, fromNodeId, toNodeId);
  if (focus.length === 0 && !ends) return null;
  const from = focus[0] ?? ends?.from;
  const to = focus[focus.length - 1] ?? ends?.to;
  if (!from || !to) return null;
  if (![from[0], from[1], to[0], to[1]].every(Number.isFinite)) return null;
  const heading = sameLngLat(from, to)
    ? ends && !sameLngLat(ends.from, ends.to) && [ends.from[0], ends.from[1], ends.to[0], ends.to[1]].every(Number.isFinite)
      ? bearingDeg(ends.from, ends.to)
      : 0
    : bearingDeg(from, to);
  const coords = focus.length >= 2 ? focus.filter((row) => Number.isFinite(row[0]) && Number.isFinite(row[1])) : sameLngLat(from, to) ? [from] : [from, to];
  if (coords.length === 0) return null;
  const along = Math.max(polylineLengthM(coords), haversineM(from, to));
  const mid: LngLat =
    coords.length === 1
      ? coords[0]!
      : [
          (coords[0]![0] + coords[coords.length - 1]![0]) / 2,
          (coords[0]![1] + coords[coords.length - 1]![1]) / 2,
        ];
  if (!Number.isFinite(mid[0]) || !Number.isFinite(mid[1])) return null;
  const zoom = zoomForMeters(Math.max(along, MIN_SPAN_M), Math.max(size.height, 1) * 0.42, mid[1]);
  const bearing = Number.isFinite(heading) ? heading : 0;
  return {
    center: mid,
    zoom,
    bearing,
    pitch: 50,
    focus: coords,
  };
}
