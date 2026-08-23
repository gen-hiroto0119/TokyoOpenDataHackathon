// 国交省「新宿駅周辺屋内地図オープンデータ（令和2年度更新版）」統合版の読み込み。
//
// 読むのは docs/DATA.md「何が入っているか」の層のうち、取り込みが使うものだけ:
//   Floor（階の面）・Space（部屋の面）・Facility（設備の点）・Opening（出入口の線）と、
//   nw/ の node・link。Fixture・Drawing・TWSI は読まない（地図を描くときに足す）。
// 施設別版（分割版）からは Floor.id → 施設名の対応だけを引く。統合版の Floor は
// 建物名を持たないため（docs/DATA.md「版」）。
//
// 座標は JGD2011 の緯度経度。Shapefile の x が経度、y が緯度。

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readDbf, readShapefile, type ShpRecord } from "./shapefile.ts";

/** 統合版のファイル名に出てくる階。`out` は屋外（地表は 0、甲州街道などは 2）。 */
export const MLIT_FLOOR_DIRS = ["B3", "B2", "B1", "0", "1", "2", "2out", "3", "3out", "4", "4out"] as const;
export type MlitFloorDir = (typeof MLIT_FLOOR_DIRS)[number];

/** 階のファイル名 → ordinal。Floor の属性と一致する（docs/DATA.md）。 */
export const FLOOR_DIR_ORDINAL: Record<MlitFloorDir, number> = {
  B3: -3,
  B2: -2,
  B1: -1,
  "0": 0,
  "1": 1,
  "2": 2,
  "2out": 2,
  "3": 3,
  "3out": 3,
  "4": 4,
  "4out": 4,
};

export type LatLng = { lat: number; lng: number };

/** [minLng, minLat, maxLng, maxLat] */
export type BBox = [number, number, number, number];

export type MlitFloor = {
  id: string;
  ordinal: number;
  /** 「地下1階」「グランドレベル」など。 */
  name: string;
  /** 「B1F」「1F屋外」など。 */
  shortName: string;
  rings: LatLng[][];
  bbox: BBox;
  floorDir: MlitFloorDir;
};

export type MlitSpace = {
  id: string;
  /** 別表 8.1.4（B001 商業施設、B021 階段、B022 エレベーター、B007/B008/B010/B011 トイレ…）。 */
  category: string;
  floorId: string;
  name: string;
  ordinal: number;
  rings: LatLng[][];
  bbox: BBox;
  floorDir: MlitFloorDir;
};

export type MlitFacility = {
  id: string;
  /** 別表 8.3.1（F108 出口、F025 店舗、F012 エレベーター、F001/F002/F005 トイレ…）。 */
  category: string;
  floorId: string;
  name: string;
  ordinal: number;
  point: LatLng;
  floorDir: MlitFloorDir;
};

export type MlitOpening = {
  id: string;
  floorId: string;
  name: string;
  ordinal: number;
  lines: LatLng[][];
  floorDir: MlitFloorDir;
};

export type MlitNode = {
  id: string;
  lat: number;
  lng: number;
  ordinal: number;
  /** 1=施設外 2=施設内外の境界 3=施設内 */
  inOut: string;
};

export type MlitLink = {
  id: string;
  startId: string;
  endId: string;
  /** m。小数第 1 位。 */
  distance: number;
  /** 1=なし 4=エレベーター 5=エスカレーター 6=階段 */
  routeType: string;
  /** 1=両方向 2=起点→終点 3=終点→起点 */
  direction: string;
  /** 1=2cm 以下 2=2cm 超 */
  levDiff: string;
  /** 1=5% 以下 2/3=5% 超 */
  vtclSlope: string;
  /** 1=なし 2=非対応 3=車いす対応 … */
  elevator: string;
  /** 起点→終点の順の折れ線。両端を含む。 */
  shape: LatLng[];
};

export type MlitData = {
  floors: MlitFloor[];
  spaces: MlitSpace[];
  facilities: MlitFacility[];
  openings: MlitOpening[];
  nodes: MlitNode[];
  links: MlitLink[];
  /** Floor.id → 施設フォルダ名（「1.JR新宿駅改札」など）。分割版が無ければ空。 */
  buildingByFloorId: Map<string, string>;
  /** 読んだフォルダ名。報告用。 */
  mergedDir: string;
  splitDir: string | null;
};

function ringsOf(shape: ShpRecord): LatLng[][] {
  if (shape.kind === "polygon" || shape.kind === "polyline") {
    return shape.parts.map((part) => part.map(([x, y]) => ({ lat: y, lng: x })));
  }
  return [];
}

function bboxOf(shape: ShpRecord): BBox {
  if (shape.kind === "polygon" || shape.kind === "polyline") return shape.bbox;
  if (shape.kind === "point") return [shape.x, shape.y, shape.x, shape.y];
  return [0, 0, 0, 0];
}

function attr(attrs: Record<string, string>, key: string): string {
  return attrs[key] ?? "";
}

function num(attrs: Record<string, string>, key: string): number {
  const v = Number(attr(attrs, key));
  if (!Number.isFinite(v)) throw new Error(`${key} が数値でない: ${JSON.stringify(attrs[key])}`);
  return v;
}

/**
 * `rawDir` に展開した統合版（と、あれば分割版）を読む。フォルダ名は配布の
 * 「新宿駅周辺屋内地図オープンデータ_統合版（Shapefile）」のままでよい。
 */
export function loadMlit(rawDir: string): MlitData {
  const entries = readdirSync(rawDir).filter((e) => statSync(join(rawDir, e)).isDirectory());
  const mergedDir = entries.find((e) => e.includes("統合版"));
  if (!mergedDir) throw new Error(`統合版のフォルダが ${rawDir} に無い`);
  const splitDir = entries.find((e) => e.includes("Shapefile") && !e.includes("統合版")) ?? null;

  const base = join(rawDir, mergedDir, "ShinjukuTerminal");
  const floors: MlitFloor[] = [];
  const spaces: MlitSpace[] = [];
  const facilities: MlitFacility[] = [];
  const openings: MlitOpening[] = [];

  for (const floorDir of MLIT_FLOOR_DIRS) {
    const ordinal = FLOOR_DIR_ORDINAL[floorDir];
    const layer = (name: string) => {
      const basename = join(base, `ShinjukuTerminal_${floorDir}_${name}`);
      return existsSync(`${basename}.dbf`) ? readShapefile(basename).records : [];
    };
    for (const r of layer("Floor")) {
      floors.push({
        id: attr(r.attrs, "id"),
        ordinal: num(r.attrs, "ordinal"),
        name: attr(r.attrs, "name"),
        shortName: attr(r.attrs, "short_name"),
        rings: ringsOf(r.shape),
        bbox: bboxOf(r.shape),
        floorDir,
      });
    }
    for (const r of layer("Space")) {
      spaces.push({
        id: attr(r.attrs, "id"),
        category: attr(r.attrs, "category"),
        floorId: attr(r.attrs, "floor_id"),
        name: attr(r.attrs, "name"),
        ordinal,
        rings: ringsOf(r.shape),
        bbox: bboxOf(r.shape),
        floorDir,
      });
    }
    for (const r of layer("Facility")) {
      if (r.shape.kind !== "point") continue;
      facilities.push({
        id: attr(r.attrs, "id"),
        category: attr(r.attrs, "category"),
        floorId: attr(r.attrs, "floor_id"),
        name: attr(r.attrs, "name"),
        ordinal,
        point: { lat: r.shape.y, lng: r.shape.x },
        floorDir,
      });
    }
    for (const r of layer("Opening")) {
      openings.push({
        id: attr(r.attrs, "id"),
        floorId: attr(r.attrs, "floor_id"),
        name: attr(r.attrs, "name"),
        ordinal,
        lines: ringsOf(r.shape),
        floorDir,
      });
    }
  }

  const nodes: MlitNode[] = readShapefile(join(rawDir, mergedDir, "nw", "Shinjuku_node")).records.map((r) => ({
    id: attr(r.attrs, "node_id"),
    lat: num(r.attrs, "lat"),
    lng: num(r.attrs, "lon"),
    ordinal: num(r.attrs, "ordinal"),
    inOut: attr(r.attrs, "in_out"),
  }));

  const links: MlitLink[] = readShapefile(join(rawDir, mergedDir, "nw", "Shinjuku_link")).records.map((r) => ({
    id: attr(r.attrs, "link_id"),
    startId: attr(r.attrs, "start_id"),
    endId: attr(r.attrs, "end_id"),
    distance: num(r.attrs, "distance"),
    routeType: attr(r.attrs, "route_type"),
    direction: attr(r.attrs, "direction"),
    levDiff: attr(r.attrs, "lev_diff"),
    vtclSlope: attr(r.attrs, "vtcl_slope"),
    elevator: attr(r.attrs, "elevator"),
    shape: ringsOf(r.shape).flat(),
  }));

  const buildingByFloorId = new Map<string, string>();
  if (splitDir) {
    const splitBase = join(rawDir, splitDir);
    for (const building of readdirSync(splitBase).sort()) {
      const bdir = join(splitBase, building);
      if (building === "nw" || !statSync(bdir).isDirectory()) continue;
      for (const floorDir of readdirSync(bdir).sort()) {
        const fdir = join(bdir, floorDir);
        if (!statSync(fdir).isDirectory()) continue;
        for (const file of readdirSync(fdir).sort()) {
          if (!file.endsWith("_Floor.dbf")) continue;
          for (const row of readDbf(join(fdir, file)).rows) {
            const id = row.id ?? "";
            if (id !== "" && !buildingByFloorId.has(id)) buildingByFloorId.set(id, building);
          }
        }
      }
    }
  }

  return { floors, spaces, facilities, openings, nodes, links, buildingByFloorId, mergedDir, splitDir };
}
