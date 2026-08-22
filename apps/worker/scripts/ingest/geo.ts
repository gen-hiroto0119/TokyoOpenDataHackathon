// 座標変換とジオメトリの純関数。
//
// 移植元: tools/ingest/main.go の haversineM / project / polygonCenter。
// 数式・演算の順序を Go と揃えている。Math.cos/Math.sin と Go の math.Cos/math.Sin は
// 最終 ulp の一致が保証されないため、呼び出し側（等価性ゲート）では x/y にだけ
// 小さな許容誤差を持たせる設計になっている（scratchpad/research-ingest.md §3）。

/** 地球を球とみなした地表距離。単位は m。 */
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
 * 緯度経度を、原点 (lat0, lng0) を基準にしたメートルの平面へ落とす。
 * 手順の方向を出すためだけに使う。距離は都データの dm をそのまま使うので、
 * ここでの誤差は経路探索の重みには影響しない。
 */
export function project(lat: number, lng: number, lat0: number, lng0: number): { x: number; y: number } {
  const mPerDegLat = 111320.0;
  const x = (lng - lng0) * mPerDegLat * Math.cos((lat0 * Math.PI) / 180);
  const y = (lat - lat0) * mPerDegLat;
  return { x, y };
}

/** GeoJSON の座標。[lng, lat] の順（GeoJSON の仕様どおり）。 */
export type Point2 = [number, number];

export type Geometry = {
  type: string;
  coordinates: unknown;
};

/**
 * 出入口は面（Polygon）で入っている。その外周リング（coordinates[0]）の頂点を
 * 単純平均した点を代表点にする。GeoJSON の閉じ点（先頭=末尾の重複）も平均に
 * 含めたまま（Go の挙動をそのまま再現。重心の厳密な計算ではないが、直さない）。
 *
 * Polygon 以外、またはリングが読めない場合は null（Go の center{ok:false} に対応）。
 */
export function polygonCenter(geometry: Geometry): { lat: number; lng: number } | null {
  if (geometry.type !== "Polygon") return null;
  const rings = geometry.coordinates as Point2[][] | undefined;
  const ring = rings?.[0];
  if (!ring || ring.length === 0) return null;
  let lat = 0;
  let lng = 0;
  for (const point of ring) {
    lng += point[0];
    lat += point[1];
  }
  const n = ring.length;
  return { lat: lat / n, lng: lng / n };
}
