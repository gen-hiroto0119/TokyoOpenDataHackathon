// tools/ingest/main.go が読む入力 JSON の型と、単一ファイルの読み込みヘルパ。
//
// R1-R33 の変換規則（build.ts、次タスク）はここで定義した型の上で動く。
// このファイルの役目は入力の「形」を決めることと、Go と JS のゼロ値の扱いの違いを
// 型の上で明示すること。Go は構造体のフィールドが JSON に無くてもゼロ値
// （数値なら 0）に落ちるが、JS の JSON.parse はキーが無ければ単に undefined になる。
// gid（実データで 43 件欠損）と dz（同 2,407 件欠損）はこの違いが結果に効くので
// optional にしてあり、読む側（build.ts）で `?? 0` を書くことを型で強制する
// （scratchpad/research-ingest.md の R7 / R11）。
//
// 死にコード（tools/ingest/main.go で読むが使わないフィールド）は移植しない:
//   - navFile.Drawings（json:"d"）… レベル表は com-map.geojson 側から作る
//   - ノードの mx / my … main.go のどこからも参照されていない
//   - com-map.geojson の levels[].properties.zlevel … 読むが未使用
//
// 契約の正本は docs/RECOMMENDER.md。移植元は tools/ingest/main.go。

import { readFileSync } from "node:fs";

// ---------------------------------------------------------------- v5_nav.json

/**
 * ノードに紐づく地物参照。gid は欠損することがある（実データで 43 件）。
 * Go は構造体のゼロ値で 0 に落ちる（R7）。
 */
export type RawNavNodeLink = {
  lid: number;
  gid?: number;
};

export type RawNavNode = {
  id: number;
  l: RawNavNodeLink[];
};

/**
 * d は方向種別（1=順方向 2=逆方向 3=双方向）。dz は縦移動量（下りは負）で、
 * どちらも欠損することがある（dz は実データで 2,407 件）。
 * Go はどちらもゼロ値 0 に落ちる（R11）。
 */
export type RawNavLink = {
  id: number;
  n1: number;
  n2: number;
  d?: number;
  dm: number;
  dz?: number;
};

export type NavFile = {
  n: RawNavNode[];
  l: RawNavLink[];
};

// ---------------------------------------------------------------- com-map.geojson

export type RawLevel = {
  id: number;
  properties: { name: string };
};

export type RawDrawing = {
  levels: RawLevel[];
};

export type ComMap = {
  drawings: RawDrawing[];
};

// ---------------------------------------------------------------- geojson-level-geom-*.geojson

/**
 * Go の feature.Properties は各フィールドが素の string(ポインタでない)なので、
 * JSON にキーが無ければゼロ値の "" に落ちる。実データでは非常によく欠ける
 * (15,556 件中 display_name 13,966 件・barrier 15,519 件・marker 15,460 件が
 * 欠損)。ここでは「欠ける」ことを型で表し、"" への正規化は build.ts の
 * mergeGeoms(すべてのジオメトリが通る唯一の場所)でまとめて行う。
 */
export type RawFeatureProperties = {
  display_name?: string;
  facility?: string;
  barrier?: string;
  traffic?: string;
  marker?: string;
};

export type RawLocation = {
  /** [lng, lat] の順（GeoJSON の仕様どおり）。 */
  coordinates: number[];
};

export type RawGeometry = {
  type: string;
  coordinates: unknown;
};

export type RawFeature = {
  id: number;
  properties: RawFeatureProperties;
  location?: RawLocation | null;
  geometry: RawGeometry;
};

export type FeatureCollection = {
  features: RawFeature[];
};

// ---------------------------------------------------------------- com-entity.geojson

export type ComEntityProperties = {
  name: string;
  /**
   * 各要素は [gid, ...] のペア。gid は先頭要素（数値）。欠損することがある
   * （実データで423件中9件）。Go は `[]any` のゼロ値（nil）で、range しても
   * 0回反復になるだけでエラーにはならない（build.ts 側で `?? []` として読む）。
   */
  geometry?: unknown[];
};

export type ComEntity = {
  entities: { properties: ComEntityProperties }[];
};

// ---------------------------------------------------------------- data/labels/exits.json

export type ManualLabel = {
  labelJa?: string;
  /** 出口ではないと人が判断したもの。地下広場への入口や設備の開口が混ざる。 */
  exclude?: boolean;
  /** 人が見て出口だと確かめたもの。ラベルを直していなくても記録に残す。 */
  confirmed?: boolean;
};

export type ManualLabels = Record<string, ManualLabel>;

// ---------------------------------------------------------------- 読み込み

/** JSON ファイルを読んで型を付ける。tools/ingest/main.go の readJSON に対応。 */
export function readJSON<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
