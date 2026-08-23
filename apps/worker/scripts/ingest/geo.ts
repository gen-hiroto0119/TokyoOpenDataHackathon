// 座標の純関数。

/** 地球を球とみなした地表距離。単位は m。出口の持ち出しコストと同じ式。 */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6371000.0;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 緯度経度を、原点 (lat0, lng0) を基準にしたメートルの平面へ落とす。x+ は東、y+ は北。
 * 手順の方向と地図、近さの判定に使う。経路の重みは国交省の `distance` をそのまま使う。
 */
export function project(lat: number, lng: number, lat0: number, lng0: number): { x: number; y: number } {
  const mPerDegLat = 111320.0;
  const x = (lng - lng0) * mPerDegLat * Math.cos((lat0 * Math.PI) / 180);
  const y = (lat - lat0) * mPerDegLat;
  return { x, y };
}

export type XY = { x: number; y: number };

export function distXY(a: XY, b: XY): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 点と線分の距離（平面）。 */
export function distPointSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return distXY(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return distXY(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** 点と折れ線の距離（平面）。 */
export function distPointPolyline(p: XY, line: XY[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < line.length; i++) best = Math.min(best, distPointSegment(p, line[i - 1]!, line[i]!));
  if (line.length === 1) best = distXY(p, line[0]!);
  return best;
}

/** 点がリング群の内側か（偶奇則。穴は内側から除かれる）。 */
export function pointInRings(p: XY, rings: XY[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % n]!;
      if (a.y > p.y !== b.y > p.y) {
        const xi = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
        if (xi > p.x) inside = !inside;
      }
    }
  }
  return inside;
}
