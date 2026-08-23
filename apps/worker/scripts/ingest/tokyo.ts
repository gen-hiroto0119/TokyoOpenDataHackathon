// 東京都「新宿駅周辺の施設情報及び移動ルート」から、名前のある地点だけを取り出す。
//
// docs/DATA.md「二つのデータの役割」のとおり、東京都から使うのは店舗などの名前だけ。
// 歩行網・改札・出口は国交省から取るので、ここでは v5_nav.json を読まない。
// 地点の位置はジオメトリの `location`（代表点）、階はファイル名の階（B1F など）。
// 階名は国交省の ordinal と一致しないので、build.ts が data/labels/tokyo-levels.json
// の固定表で国交省の階に落とす。

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { readJSON, type ComEntity, type FeatureCollection, type RawFeature } from "./raw.ts";
import { codeName, exitOnly, genericName, platformName, privateName } from "./rules.ts";

export type TokyoNamedPoint = {
  gid: number;
  nameJa: string;
  lat: number;
  lng: number;
  /** ファイル名の階（B5F〜4F、MB2F、M1F）。 */
  levelLabel: string;
};

const GEOM_PREFIX = "geojson-level-geom-";
const GEOM_SUFFIX = ".geojson";

/**
 * 名前のある地点。選び方は docs/RECOMMENDER.md「集合候補の選び方」と同じ規則:
 * 固有の名前（駅に 1 件）、番線や区画コードでない、設備の一般名でない、
 * 立って待てる、出場専用でない。改札（`barrier: gate`）と出口（`marker: entrance`）は
 * 国交省から取るので外す。gid の昇順で返す。
 */
export function loadTokyoNamedPoints(extractedDir: string): TokyoNamedPoint[] {
  const comEntity = readJSON<ComEntity>(join(extractedDir, "com-entity.geojson"));
  const files = readdirSync(extractedDir)
    .filter((f) => f.startsWith(GEOM_PREFIX) && f.endsWith(GEOM_SUFFIX))
    .sort();

  // ジオメトリを id で索引。複数ファイルに同じ id が出たら後勝ち（前の取り込みと同じ）。
  const geoms = new Map<number, { f: RawFeature; level: string }>();
  for (const file of files) {
    const level = file.slice(GEOM_PREFIX.length, -GEOM_SUFFIX.length);
    const fc = readJSON<FeatureCollection>(join(extractedDir, file));
    for (const f of fc.features) geoms.set(f.id, { f, level });
  }

  // 日本語名。全角空白→半角、前後の空白を落とす。先勝ち。
  const gidNameJa = new Map<number, string>();
  for (const ent of comEntity.entities) {
    const name = ent.properties.name.replaceAll("　", " ").trim();
    if (name === "") continue;
    for (const g of ent.properties.geometry ?? []) {
      if (!Array.isArray(g) || g.length === 0) continue;
      const idRaw = g[0];
      if (typeof idRaw !== "number") continue;
      const gid = Math.trunc(idRaw);
      if (!gidNameJa.has(gid)) gidNameJa.set(gid, name);
    }
  }
  const displayName = (gid: number): string =>
    gidNameJa.get(gid) ?? (geoms.get(gid)?.f.properties.display_name ?? "").trim();

  // 同じ名前が駅に複数ある地点は外す。数えるのは名前のある全ジオメトリ。
  const nameCount = new Map<string, number>();
  for (const gid of geoms.keys()) {
    const n = displayName(gid);
    if (n !== "") nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
  }

  const out: TokyoNamedPoint[] = [];
  for (const gid of [...geoms.keys()].sort((a, b) => a - b)) {
    const { f, level } = geoms.get(gid)!;
    const p = f.properties;
    const name = displayName(gid);
    if (name === "" || codeName.test(name) || privateName.test(name) || genericName.test(name)) continue;
    if (platformName.test(name)) continue;
    if ((nameCount.get(name) ?? 0) > 1) continue;
    if (exitOnly.test(name) || exitOnly.test(p.display_name ?? "")) continue;
    const fac = p.facility ?? "";
    if (fac !== "unit" && fac !== "hallway" && fac !== "") continue;
    if ((p.traffic ?? "") !== "") continue;
    if ((p.barrier ?? "") === "gate") continue;
    if ((p.marker ?? "") === "entrance") continue;
    const loc = f.location?.coordinates;
    if (!loc || loc.length !== 2) continue;
    out.push({ gid, nameJa: name, lat: loc[1]!, lng: loc[0]!, levelLabel: level });
  }
  return out;
}
