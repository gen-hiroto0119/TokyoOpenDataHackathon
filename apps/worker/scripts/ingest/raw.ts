// 東京都「新宿駅周辺の施設情報及び移動ルート」の JSON の型。tokyo.ts が読む分だけ。
//
// 使うのは com-entity.geojson（日本語名）と geojson-level-geom-*.geojson（地物と代表点）。
// v5_nav.json と com-map.geojson は読まない（歩行網は国交省から取る。docs/DATA.md）。
// properties の各欄は実データで非常によく欠ける（15,556 件中 display_name 13,966 件が欠損）ので
// すべて optional。

import { readFileSync } from "node:fs";

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

export type RawFeature = {
  id: number;
  properties: RawFeatureProperties;
  location?: RawLocation | null;
};

export type FeatureCollection = {
  features: RawFeature[];
};

export type ComEntityProperties = {
  name: string;
  /** 各要素は [gid, ...] のペア。gid は先頭要素（数値）。欠損することがある（423 件中 9 件）。 */
  geometry?: unknown[];
};

export type ComEntity = {
  entities: { properties: ComEntityProperties }[];
};

export function readJSON<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
