import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readDbf, readShapefile, readShp } from "../scripts/ingest/shapefile.ts";

/**
 * scripts/ingest/shapefile.ts のテスト。
 * 1. 自分で組み立てた小さな dbf/shp の往復。
 * 2. 実データ（data/raw/mlit、git に入れない）の件数。Python で独立に数えた値を正とする。
 */

// ---------------------------------------------------------------- 合成データ

function dbfBytes(fields: { name: string; type: string; length: number }[], rows: (string[] | null)[]): Buffer {
  // rows の null は削除レコード。
  const recordLength = 1 + fields.reduce((s, f) => s + f.length, 0);
  const headerLength = 32 + 32 * fields.length + 1;
  const buf = Buffer.alloc(headerLength + recordLength * rows.length + 1);
  buf[0] = 0x03;
  buf.writeUInt32LE(rows.length, 4);
  buf.writeUInt16LE(headerLength, 8);
  buf.writeUInt16LE(recordLength, 10);
  fields.forEach((f, i) => {
    const p = 32 + 32 * i;
    buf.write(f.name, p, "ascii");
    buf[p + 11] = f.type.charCodeAt(0);
    buf[p + 16] = f.length;
  });
  buf[32 + 32 * fields.length] = 0x0d;
  rows.forEach((row, i) => {
    const start = headerLength + i * recordLength;
    buf[start] = row === null ? 0x2a : 0x20;
    let p = start + 1;
    fields.forEach((f, j) => {
      const v = Buffer.from(row === null ? "" : (row[j] ?? ""), "utf8");
      buf.fill(0x20, p, p + f.length);
      v.copy(buf, p, 0, Math.min(v.length, f.length));
      p += f.length;
    });
  });
  buf[buf.length - 1] = 0x1a;
  return buf;
}

function shpBytes(records: Buffer[]): Buffer {
  const body = Buffer.concat(
    records.map((content, i) => {
      const h = Buffer.alloc(8);
      h.writeInt32BE(i + 1, 0);
      h.writeInt32BE(content.length / 2, 4);
      return Buffer.concat([h, content]);
    }),
  );
  const header = Buffer.alloc(100);
  header.writeInt32BE(9994, 0);
  header.writeInt32BE((100 + body.length) / 2, 24);
  header.writeInt32LE(1000, 28);
  header.writeInt32LE(3, 32);
  return Buffer.concat([header, body]);
}

function pointContent(x: number, y: number): Buffer {
  const b = Buffer.alloc(20);
  b.writeInt32LE(1, 0);
  b.writeDoubleLE(x, 4);
  b.writeDoubleLE(y, 12);
  return b;
}

function polyContent(type: 3 | 5, parts: [number, number][][]): Buffer {
  const npts = parts.reduce((s, p) => s + p.length, 0);
  const b = Buffer.alloc(44 + 4 * parts.length + 16 * npts);
  b.writeInt32LE(type, 0);
  const xs = parts.flat().map((p) => p[0]);
  const ys = parts.flat().map((p) => p[1]);
  b.writeDoubleLE(Math.min(...xs), 4);
  b.writeDoubleLE(Math.min(...ys), 12);
  b.writeDoubleLE(Math.max(...xs), 20);
  b.writeDoubleLE(Math.max(...ys), 28);
  b.writeInt32LE(parts.length, 36);
  b.writeInt32LE(npts, 40);
  let start = 0;
  parts.forEach((p, i) => {
    b.writeInt32LE(start, 44 + 4 * i);
    start += p.length;
  });
  let q = 44 + 4 * parts.length;
  for (const [x, y] of parts.flat()) {
    b.writeDoubleLE(x, q);
    b.writeDoubleLE(y, q + 8);
    q += 16;
  }
  return b;
}

function nullContent(): Buffer {
  const b = Buffer.alloc(4);
  b.writeInt32LE(0, 0);
  return b;
}

describe("shapefile: 合成データの往復", () => {
  const dir = mkdtempSync(join(tmpdir(), "shp-"));
  const fields = [
    { name: "id", type: "C", length: 8 },
    { name: "name", type: "C", length: 24 },
  ];
  writeFileSync(join(dir, "t.dbf"), dbfBytes(fields, [["a1", "西改札"], null, ["b2", "  右寄せ"], ["c3", ""]]));
  writeFileSync(
    join(dir, "t.shp"),
    shpBytes([
      pointContent(139.7, 35.69),
      nullContent(),
      polyContent(3, [
        [
          [0, 0],
          [1, 1],
        ],
        [
          [2, 2],
          [3, 3],
          [4, 4],
        ],
      ]),
      polyContent(5, [
        [
          [0, 0],
          [0, 1],
          [1, 1],
          [0, 0],
        ],
      ]),
    ]),
  );

  it("dbf: 欄・行・UTF-8・削除行・前後の空白", () => {
    const t = readDbf(join(dir, "t.dbf"));
    expect(t.fields).toEqual(fields);
    expect(t.rows).toEqual([
      { id: "a1", name: "西改札" },
      { id: "b2", name: "右寄せ" },
      { id: "c3", name: "" },
    ]);
  });

  it("shp: Point / Null / PolyLine(2 parts) / Polygon", () => {
    const s = readShp(join(dir, "t.shp"));
    expect(s).toHaveLength(4);
    expect(s[0]).toEqual({ kind: "point", x: 139.7, y: 35.69 });
    expect(s[1]).toEqual({ kind: "null" });
    expect(s[2]!.kind).toBe("polyline");
    if (s[2]!.kind === "polyline") {
      expect(s[2]!.parts).toEqual([
        [
          [0, 0],
          [1, 1],
        ],
        [
          [2, 2],
          [3, 3],
          [4, 4],
        ],
      ]);
      expect(s[2]!.bbox).toEqual([0, 0, 4, 4]);
    }
    expect(s[3]!.kind).toBe("polygon");
  });

  it("readShapefile: 行と図形を突き合わせ、削除行は図形ごと落とす", () => {
    const r = readShapefile(join(dir, "t"));
    expect(r.records.map((x) => x.attrs.id)).toEqual(["a1", "b2", "c3"]);
    expect(r.records.map((x) => x.shape.kind)).toEqual(["point", "polyline", "polygon"]);
  });
});

// ---------------------------------------------------------------- 実データ

const here = dirname(fileURLToPath(import.meta.url));
const mlitDir = resolve(here, "../../../data/raw/mlit/新宿駅周辺屋内地図オープンデータ_統合版（Shapefile）");
const hasMlit = existsSync(mlitDir);
const FLOORS = ["B3", "B2", "B1", "0", "1", "2", "2out", "3", "3out", "4", "4out"];

describe.skipIf(!hasMlit)("shapefile: 国交省 統合版の実データ", () => {
  const st = (name: string) => join(mlitDir, "ShinjukuTerminal", `ShinjukuTerminal_${name}`);

  it("B1 Space: 326 行、欄は仕様どおり", () => {
    const t = readDbf(`${st("B1_Space")}.dbf`);
    expect(t.rows).toHaveLength(326);
    expect(t.fields.map((f) => f.name)).toEqual([
      "id",
      "category",
      "floor_id",
      "name",
      "restricted",
      "suite",
      "nonpublic",
      "toll",
      "source",
    ]);
    expect(t.fields.every((f) => f.type === "C")).toBe(true);
  });

  it("node: 1985 点、ordinal は書式が混在していても数値になる", () => {
    const r = readShapefile(join(mlitDir, "nw", "Shinjuku_node"));
    expect(r.records).toHaveLength(1985);
    expect(r.records.every((x) => x.shape.kind === "point")).toBe(true);
    const names = r.fields.map((f) => f.name);
    expect(names.slice(0, 5)).toEqual(["node_id", "lat", "lon", "ordinal", "in_out"]);
    expect(r.records.every((x) => Number.isFinite(Number(x.attrs.ordinal)))).toBe(true);
  });

  it("link: 2549 本、折れ点の分布", () => {
    const r = readShapefile(join(mlitDir, "nw", "Shinjuku_link"));
    expect(r.records).toHaveLength(2549);
    const counts = new Map<number, number>();
    let max = 0;
    for (const x of r.records) {
      expect(x.shape.kind).toBe("polyline");
      if (x.shape.kind !== "polyline") continue;
      const n = x.shape.parts.reduce((s, p) => s + p.length, 0);
      counts.set(n, (counts.get(n) ?? 0) + 1);
      max = Math.max(max, n);
    }
    expect(counts.get(2)).toBe(2159);
    expect(counts.get(3)).toBe(262);
    expect(max).toBe(13);
  });

  it("B1 Opening 26 線、B1 Facility 356（出口 44）、0 Floor 86 面", () => {
    expect(readShp(`${st("B1_Opening")}.shp`).filter((s) => s.kind === "polyline")).toHaveLength(26);
    const fac = readDbf(`${st("B1_Facility")}.dbf`);
    expect(fac.rows).toHaveLength(356);
    expect(fac.rows.filter((r) => r.category === "F108")).toHaveLength(44);
    expect(readShp(`${st("0_Floor")}.shp`).filter((s) => s.kind === "polygon")).toHaveLength(86);
  });

  it("Facility 全階: 829 件、出口 150、店舗 76", () => {
    let total = 0;
    let f108 = 0;
    let f025 = 0;
    for (const fl of FLOORS) {
      const t = readDbf(`${st(`${fl}_Facility`)}.dbf`);
      total += t.rows.length;
      f108 += t.rows.filter((r) => r.category === "F108").length;
      f025 += t.rows.filter((r) => r.category === "F025").length;
    }
    expect(total).toBe(829);
    expect(f108).toBe(150);
    expect(f025).toBe(76);
  });
});
