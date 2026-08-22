// tools/ingest/main.go の変換規則(R1-R33)を IO なしの純関数として移植したもの。
//
// 入力は raw.ts の型で表した「パース済みの生データ」。出力は Go の
// graphOut/catalogOut と同じ形の JSON 構造体(オブジェクトのキー挿入順を
// Go の struct フィールド順に一致させてある。JSON.stringify はキーの挿入順を
// そのまま出すので、ここで順序を作ればそれがそのまま出力順になる)。
//
// R# のコメントは scratchpad/research-ingest.md §1 の表の番号に対応する。
// 移植しないもの(R1 の zlevel、slug/isNumeric、nav.Drawings)は最初から書いていない。
//
// 契約の正本は docs/RECOMMENDER.md。移植元は tools/ingest/main.go(変更禁止)。

import { polygonCenter, haversineM, project, type Geometry } from "./geo.ts";
import {
  codeName,
  exitNameOf,
  exitOnly,
  explainOf,
  genericName,
  linesOf,
  privateName,
} from "./rules.ts";
import type { ComEntity, ComMap, FeatureCollection, ManualLabels, NavFile, RawFeature } from "./raw.ts";

/**
 * mergeGeoms が返す、properties の文字列フィールドを Go のゼロ値("")に正規化した
 * feature。Go の struct フィールドは素の string(ポインタでない)なので、JSON に
 * キーが無ければ "" になる。これを一箇所でやってしまえば、以降の build.ts は
 * すべての properties.* アクセスを安全に string として扱える。
 */
export type NormalizedFeature = Omit<RawFeature, "properties"> & {
  properties: Required<RawFeature["properties"]>;
};

/**
 * R2: geojson-level-geom-*.geojson を辞書順ソートしたファイル名の順にマージしてジオメトリを
 * id で索引する。ID 重複時は後勝ち。main.ts が V16(手書きラベルの整合)用に marker=="entrance"
 * の gid 集合を作るのにも使うので、build() 内部からもここからも呼べるように外に出してある。
 */
export function mergeGeoms(featureCollections: FeatureCollection[]): Map<number, NormalizedFeature> {
  const geoms = new Map<number, NormalizedFeature>();
  for (const fc of featureCollections) {
    for (const f of fc.features) {
      geoms.set(f.id, {
        ...f,
        properties: {
          display_name: f.properties.display_name ?? "",
          facility: f.properties.facility ?? "",
          barrier: f.properties.barrier ?? "",
          traffic: f.properties.traffic ?? "",
          marker: f.properties.marker ?? "",
        },
      });
    }
  }
  return geoms;
}

// ---------------------------------------------------------------- 出力の型
//
// src/graph.ts の Graph/Catalog と概ね同じ形だが、ここでは実データの挙動に
// 忠実な2点だけ意図的にずらしてある(src/graph.ts を直すのはこのタスクの
// スコープ外。等価移植が先):
//
//   1. GraphNode.levelIds / geomIds は string[] | null。Go の `var levels []string`
//      は一度も append されないと nil のままで、json.Marshal(nil slice) は
//      `null` になる(空配列 `[]` ではない)。実データで geomIds が null になる
//      ノードが 43 件ある(R7 の gid 欠損 43 件が全リンクに及んだケース)。
//   2. ExitEntry に labelSource を持つ。src/graph.ts の ExitCatalogEntry には
//      無いが、実際にコミット済みの apps/worker/data/catalog.json には入っている
//      (main.go の exitEntry.LabelSource、json:"labelSource")。

export type VerticalKind = "none" | "stairs" | "escalator" | "elevator" | "unknown";

export type GraphNode = {
  id: string;
  levelIds: string[] | null;
  geomIds: string[] | null;
  nameJa: string | null;
  floorLabel: string | null;
  x: number;
  y: number;
};

export type GraphLink = {
  id: string;
  from: string;
  to: string;
  distanceM: number;
  deltaZ: number;
  vertical: VerticalKind;
  hours: { start: string; end: string } | null;
};

export type Graph = {
  datasetId: "tokyo.shinjuku-terminal";
  datasetVersion: string;
  graphHash: string;
  attributionJa: string;
  nodes: GraphNode[];
  links: GraphLink[];
};

export type EntryEntry = {
  catalogId: string;
  lineIds: string[];
  nodeId: string;
  nameJa: string;
};

export type MeetingEntry = {
  catalogId: string;
  nodeId: string;
  nameJa: string;
  explainability: number;
  evidence: "hypothesis";
  lat: number;
  lng: number;
};

export type ExitEntry = {
  catalogId: string;
  nodeId: string;
  label: string;
  nameJa: string;
  labelSource: string;
  evidence: "hypothesis" | "checked";
  lat: number;
  lng: number;
};

export type DestinationEntry = {
  catalogId: string;
  nameJa: string;
  lat: number;
  lng: number;
};

export type Catalog = {
  entries: EntryEntry[];
  meetings: MeetingEntry[];
  exits: ExitEntry[];
  destinations: DestinationEntry[];
};

/** R35 の stdout 報告 + verify V17 が使う付随情報。 */
export type BuildReport = {
  nodes: number;
  links: number;
  entries: number;
  meetings: number;
  exits: number;
  destinations: number;
  /** 出口: 近さで既存ノードに結べた数。 */
  snapped: number;
  /** 出口: 15m 以内にノードが無く捨てた数。 */
  tooFar: number;
  /** 出口: 手書きラベルで上書きした数。 */
  manual: number;
  /** 出口: 手書きで除外した数。 */
  excluded: number;
  /** 出口: 人が見て確かめた数(手書きラベル由来)。 */
  checked: number;
  /** 集合候補: 同名重複で外した数。 */
  droppedDuplicate: number;
  /** 改札: 路線別の件数(複数路線の改札は両方に加算)。 */
  byLine: Record<string, number>;
  /** 改札: 出場専用として入口から外した名前(重複あり得る)。 */
  skippedExitOnly: string[];
  /** 改札: 路線を判定できなかった名前。 */
  gatesWithoutLine: string[];
};

export type BuildInput = {
  nav: NavFile;
  comMap: ComMap;
  /**
   * geojson-level-geom-*.geojson を辞書順ソートしたファイル名の順で読み込んだもの。
   * 同じ id のジオメトリが複数ファイルに出た場合は後勝ち(R2)。順序はここでは
   * 検証しない(呼び出し側の main.ts が glob 結果をソートしてから渡す)。
   */
  featureCollections: FeatureCollection[];
  comEntity: ComEntity;
  manualLabels: ManualLabels;
  version: string;
  hash: string;
};

export type BuildResult = {
  graph: Graph;
  catalog: Catalog;
  report: BuildReport;
};

const VERTICAL_FACILITIES = new Set(["stairs", "escalator", "elevator"]);

export function build(input: BuildInput): BuildResult {
  const { nav, comMap, featureCollections, comEntity, manualLabels, version, hash } = input;

  // R1: 階テーブル。zlevel は読むが未使用(移植しない)。
  const levelName = new Map<number, string>();
  for (const d of comMap.drawings) {
    for (const l of d.levels) {
      levelName.set(l.id, l.properties.name);
    }
  }

  // R2: ジオメトリ索引。ID 重複は後勝ち。
  const geoms = mergeGeoms(featureCollections);

  // R3: 日本語名。全角空白→半角、TrimSpace。先勝ち(既存 gid は上書きしない)。
  const gidNameJa = new Map<number, string>();
  for (const ent of comEntity.entities) {
    const name = ent.properties.name.replaceAll("　", " ").trim();
    if (name === "") continue;
    // geometry は欠損することがある(実データで9件)。Go の `[]any` ゼロ値(nil)は
    // range で0回反復になるだけで、エラーにはならない。
    for (const g of ent.properties.geometry ?? []) {
      if (!Array.isArray(g) || g.length === 0) continue;
      const idRaw = g[0];
      if (typeof idRaw !== "number") continue;
      const gid = Math.trunc(idRaw);
      if (!gidNameJa.has(gid)) gidNameJa.set(gid, name);
    }
  }
  // R4: displayName。
  function displayName(gid: number): string {
    const n = gidNameJa.get(gid);
    if (n !== undefined) return n;
    return geoms.get(gid)?.properties.display_name ?? "";
  }

  // R12: ジオメトリ ID を昇順ソートした固定順。R5 の原点平均、以降の全カタログ
  // 生成をこの順で反復する(map 反復順依存の出力揺れ対策。DATA.md:212)。
  const gidsSorted = [...geoms.keys()].sort((a, b) => a - b);

  // R5: 平面原点。全ジオメトリの location.coordinates の単純平均。
  // gid 昇順の固定順で加算する(Go は map 反復順で加算するため実行順依存だった。
  // ここで直る。x/y が sub-mm 動くのは想定内で、等価ゲートの許容誤差が吸収する)。
  let sumLat = 0;
  let sumLng = 0;
  let n = 0;
  for (const gid of gidsSorted) {
    const f = geoms.get(gid)!;
    if (f.location && f.location.coordinates.length === 2) {
      sumLng += f.location.coordinates[0]!;
      sumLat += f.location.coordinates[1]!;
      n++;
    }
  }
  const lat0 = sumLat / n;
  const lng0 = sumLng / n;

  // R6-R9: ノード。
  const nodeLatLng = new Map<number, [number, number]>();
  const nodes: GraphNode[] = [];
  for (const nd of nav.n) {
    const levels: string[] = [];
    const gids: string[] = [];
    let nameJa: string | null = null;
    let floor: string | null = null;
    let lat = 0;
    let lng = 0;
    let hasLoc = false;
    for (const l of nd.l) {
      const levelNm = levelName.get(l.lid);
      if (levelNm !== undefined) {
        levels.push(levelNm);
        if (floor === null) floor = levelNm;
      }
      const gid = l.gid ?? 0;
      if (gid !== 0) {
        gids.push(String(gid));
        const g = geoms.get(gid);
        if (g) {
          if (!hasLoc && g.location && g.location.coordinates.length === 2) {
            lng = g.location.coordinates[0]!;
            lat = g.location.coordinates[1]!;
            hasLoc = true;
          }
          if (nameJa === null) {
            const name = displayName(gid);
            if (name !== "" && (g.properties.facility === "unit" || g.properties.barrier === "gate")) {
              nameJa = name;
            }
          }
        }
      }
    }
    const id = String(nd.id);
    let x = 0;
    let y = 0;
    if (hasLoc) {
      const p = project(lat, lng, lat0, lng0);
      x = p.x;
      y = p.y;
      nodeLatLng.set(nd.id, [lat, lng]);
    }
    nodes.push({
      id,
      levelIds: levels.length > 0 ? levels : null,
      geomIds: gids.length > 0 ? gids : null,
      nameJa,
      floorLabel: floor,
      x,
      y,
    });
  }

  // R10: 縦移動種別。リンクに種別が無いので両端のジオメトリから引く。ノード単位でキャッシュ。
  const nodeById = new Map<number, NavFile["n"][number]>();
  for (const nd of nav.n) nodeById.set(nd.id, nd);

  function facilityOf(nodeID: number): string {
    const nd = nodeById.get(nodeID);
    if (!nd) return "";
    for (const l of nd.l) {
      const gid = l.gid ?? 0;
      const g = geoms.get(gid);
      if (g && VERTICAL_FACILITIES.has(g.properties.facility)) return g.properties.facility;
    }
    return "";
  }
  const facCache = new Map<number, string>();
  function facility(id: number): string {
    let v = facCache.get(id);
    if (v === undefined) {
      v = facilityOf(id);
      facCache.set(id, v);
    }
    return v;
  }

  // R11: 方向展開。hours は常に null。dz/d は欠損を ?? 0 で Go のゼロ値に合わせる。
  const links: GraphLink[] = [];
  for (const l of nav.l) {
    const dz = l.dz ?? 0;
    let vertical: VerticalKind = "none";
    if (dz !== 0) {
      vertical = "unknown";
      const v1 = facility(l.n1);
      if (v1 !== "") {
        vertical = v1 as VerticalKind;
      } else {
        const v2 = facility(l.n2);
        if (v2 !== "") vertical = v2 as VerticalKind;
      }
    }
    const a = String(l.n1);
    const b = String(l.n2);
    const id = String(l.id);
    const d = l.d ?? 0;
    if (d === 1 || d === 3) {
      links.push({ id: id + ".f", from: a, to: b, distanceM: l.dm, deltaZ: dz, vertical, hours: null });
    }
    if (d === 2 || d === 3) {
      links.push({ id: id + ".r", from: b, to: a, distanceM: l.dm, deltaZ: -dz, vertical, hours: null });
    }
  }

  // gidNodes: gid -> ノード ID 列(nav ファイル順)。
  const gidNodes = new Map<number, number[]>();
  for (const nd of nav.n) {
    for (const l of nd.l) {
      const gid = l.gid ?? 0;
      if (gid !== 0) {
        const arr = gidNodes.get(gid);
        if (arr) arr.push(nd.id);
        else gidNodes.set(gid, [nd.id]);
      }
    }
  }

  // R13-R17: 改札 entries。
  const entries: EntryEntry[] = [];
  const seenEntry = new Set<string>();
  const gatesWithoutLine: string[] = [];
  const skippedExitOnly: string[] = [];
  for (const gid of gidsSorted) {
    const f = geoms.get(gid)!;
    const name = displayName(gid);
    if (f.properties.barrier !== "gate" || name === "") continue;
    if (exitOnly.test(name) || exitOnly.test(f.properties.display_name)) {
      skippedExitOnly.push(name);
      continue;
    }
    let lines = linesOf(name);
    if (lines.length === 0) lines = linesOf(f.properties.display_name);
    if (lines.length === 0) {
      gatesWithoutLine.push(name);
      continue;
    }
    const ids = [...(gidNodes.get(gid) ?? [])].sort((a, b) => a - b);
    for (const nodeID of ids) {
      const catalogId = `entry.${gid}.${nodeID}`;
      if (seenEntry.has(catalogId)) continue;
      seenEntry.add(catalogId);
      entries.push({ catalogId, lineIds: lines, nodeId: String(nodeID), nameJa: name });
    }
  }
  entries.sort((a, b) => (a.catalogId < b.catalogId ? -1 : a.catalogId > b.catalogId ? 1 : 0));

  // R18-R24: 集合候補 meetings。
  const nameCount = new Map<string, number>();
  for (const gid of geoms.keys()) {
    const nm = displayName(gid);
    if (nm !== "") nameCount.set(nm, (nameCount.get(nm) ?? 0) + 1);
  }

  const meetings: MeetingEntry[] = [];
  const seenMeeting = new Set<string>();
  let droppedDuplicate = 0;
  for (const gid of gidsSorted) {
    const f = geoms.get(gid)!;
    const name = displayName(gid);
    if (name === "" || codeName.test(name) || privateName.test(name)) continue;
    if (genericName.test(name)) continue;
    if ((nameCount.get(name) ?? 0) > 1) {
      droppedDuplicate++;
      continue;
    }
    if (exitOnly.test(name) || exitOnly.test(f.properties.display_name)) continue;
    const fac = f.properties.facility;
    if (fac !== "unit" && fac !== "hallway" && fac !== "") continue;
    if (f.properties.traffic !== "") continue;
    const ids = [...(gidNodes.get(gid) ?? [])].sort((a, b) => a - b);
    if (ids.length === 0) continue;
    const first = ids[0]!;
    const nodeId = String(first);
    if (seenMeeting.has(nodeId)) continue;
    const ll = nodeLatLng.get(first);
    if (!ll) continue;
    seenMeeting.add(nodeId);
    meetings.push({
      catalogId: `meet.${gid}`,
      nodeId,
      nameJa: name,
      explainability: explainOf(name),
      evidence: "hypothesis",
      lat: ll[0],
      lng: ll[1],
    });
  }
  meetings.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));

  // R25-R33: 出口 exits。
  const groundNodes: { id: number; lat: number; lng: number }[] = [];
  for (const nd of nodes) {
    if (nd.floorLabel !== "1F") continue;
    const id = Number(nd.id);
    const ll = nodeLatLng.get(id);
    if (ll) groundNodes.push({ id, lat: ll[0], lng: ll[1] });
  }
  const snapM = 15.0;
  function snapTo(lat: number, lng: number): { id: number; d: number } | null {
    let bestID = 0;
    let bestD = Number.MAX_VALUE;
    for (const gn of groundNodes) {
      const d = haversineM(lat, lng, gn.lat, gn.lng);
      if (d < bestD || (d === bestD && gn.id < bestID)) {
        bestID = gn.id;
        bestD = d;
      }
    }
    if (bestID === 0 || bestD > snapM) return null;
    return { id: bestID, d: bestD };
  }

  const exits: ExitEntry[] = [];
  let snapped = 0;
  let tooFar = 0;
  let manual = 0;
  let excluded = 0;
  let checked = 0;
  // ノード ID -> そのノードに載っている出口にラベルがあるか。R28 の重複排除に使う。
  const seenExit = new Map<string, boolean>();
  for (const gid of gidsSorted) {
    const f = geoms.get(gid)!;
    if (f.properties.marker !== "entrance") continue;
    const ring = polygonCenter(f.geometry as Geometry);
    if (!ring) continue;

    const ids = gidNodes.get(gid) ?? [];
    let nodeInt = 0;
    let bestD = Number.MAX_VALUE;
    for (const id of ids) {
      const ll = nodeLatLng.get(id);
      if (!ll) continue;
      const d = haversineM(ring.lat, ring.lng, ll[0], ll[1]);
      if (d < bestD || (d === bestD && id < nodeInt)) {
        nodeInt = id;
        bestD = d;
      }
    }
    if (nodeInt === 0) {
      const snap = snapTo(ring.lat, ring.lng);
      if (!snap) {
        tooFar++;
        continue;
      }
      nodeInt = snap.id;
      snapped++;
    }
    const nodeId = String(nodeInt);
    if (seenExit.has(nodeId)) {
      const prevHasLabel = seenExit.get(nodeId)!;
      if (prevHasLabel || f.properties.display_name.trim() === "") continue;
      const idx = exits.findIndex((e) => e.nodeId === nodeId);
      if (idx !== -1) exits.splice(idx, 1);
    }
    const guard = nodeLatLng.get(nodeInt);
    if (!guard) continue;
    // 出口の座標は地物そのものの代表点を使う。ノードは経路上の点でしかない。
    const finalLat = ring.lat;
    const finalLng = ring.lng;

    let label = f.properties.display_name.trim();
    let source = "tokyo";
    let evidence: "hypothesis" | "checked" = "hypothesis";
    const m = manualLabels[String(gid)];
    if (m) {
      if (m.exclude) {
        excluded++;
        continue;
      }
      const v = (m.labelJa ?? "").trim();
      if (v !== "" && v !== label) {
        label = v;
        source = "manual";
        manual++;
      }
      if (m.confirmed || (m.labelJa ?? "") !== "") {
        evidence = "checked";
        checked++;
      }
    }
    if (label === "") source = "";
    // Go は置き換えた件数を replaced 変数で数えているが、その値は main.go の
    // 最終 fmt.Printf のフォーマット文字列に含まれておらず未使用(移植しない)。
    seenExit.set(nodeId, label !== "");
    exits.push({
      catalogId: `exit.${gid}`,
      nodeId,
      label,
      nameJa: exitNameOf(label),
      labelSource: source,
      evidence,
      lat: finalLat,
      lng: finalLng,
    });
  }
  exits.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));

  const destinations: DestinationEntry[] = [
    { catalogId: "dest.tokyo-metropolitan-government", nameJa: "東京都庁", lat: 35.689487, lng: 139.691711 },
    { catalogId: "dest.busta-shinjuku", nameJa: "バスタ新宿", lat: 35.686622, lng: 139.700258 },
    { catalogId: "dest.kabukicho", nameJa: "歌舞伎町", lat: 35.694945, lng: 139.702734 },
    { catalogId: "dest.shinjuku-central-park", nameJa: "新宿中央公園", lat: 35.690833, lng: 139.690278 },
  ];

  const graph: Graph = {
    datasetId: "tokyo.shinjuku-terminal",
    datasetVersion: version,
    graphHash: hash,
    attributionJa: "東京都都市整備局「新宿駅周辺の施設情報及び移動ルート」（CC BY 4.0）",
    nodes,
    links,
  };
  const catalog: Catalog = { entries, meetings, exits, destinations };

  const byLine: Record<string, number> = {};
  for (const e of entries) {
    for (const l of e.lineIds) byLine[l] = (byLine[l] ?? 0) + 1;
  }

  const report: BuildReport = {
    nodes: nodes.length,
    links: links.length,
    entries: entries.length,
    meetings: meetings.length,
    exits: exits.length,
    destinations: destinations.length,
    snapped,
    tooFar,
    manual,
    excluded,
    checked,
    droppedDuplicate,
    byLine,
    skippedExitOnly,
    gatesWithoutLine,
  };

  return { graph, catalog, report };
}
