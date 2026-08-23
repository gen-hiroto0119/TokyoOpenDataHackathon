import { describe, expect, it } from "vitest";
import { deltaZOf, floorLabelOf } from "../scripts/ingest/build.ts";
import { distPointPolyline, haversineM, pointInRings, project } from "../scripts/ingest/geo.ts";
import { codeName, exitNameOf, exitOnly, explainOf, genericName, normalizeName, privateName } from "../scripts/ingest/rules.ts";

/** scripts/ingest の純関数のテスト。 */

describe("exitOnly", () => {
  it("日本語の出口専用表記にマッチする", () => {
    expect(exitOnly.test("JR中央西口(出口専用)")).toBe(true);
  });

  it("大文字小文字を区別する", () => {
    expect(exitOnly.test("Exitonly")).toBe(true);
    expect(exitOnly.test("exitonly")).toBe(false);
  });
});

describe("exitNameOf", () => {
  it("空ラベルは地上出口", () => {
    expect(exitNameOf("")).toBe("地上出口");
  });

  it("3 文字までの看板の文字には「出口 」を前に付ける", () => {
    expect(exitNameOf("7")).toBe("出口 7");
    expect(exitNameOf("15B")).toBe("出口 15B");
    expect(exitNameOf("A10")).toBe("出口 A10");
  });

  it("4 文字以上はそのまま出す", () => {
    expect(exitNameOf("安田口")).toBe("出口 安田口");
    expect(exitNameOf("ルミネエスト 地下入口")).toBe("ルミネエスト 地下入口");
  });
});

describe("名前の規則", () => {
  it("番線・区画コード・内部 ID は名前にしない", () => {
    expect(codeName.test("11")).toBe(true);
    expect(codeName.test("D10")).toBe(true);
    expect(codeName.test("Unit B3F-115")).toBe(true);
    expect(codeName.test("HOKUO新宿エース南店")).toBe(false);
  });

  it("設備の一般名は外す。ATM は先頭だけ", () => {
    expect(genericName.test("コインロッカー")).toBe(true);
    expect(genericName.test("ATM")).toBe(true);
    expect(genericName.test("みずほATM")).toBe(false);
    expect(genericName.test("西口交番")).toBe(false);
  });

  it("立って待てない場所は外す", () => {
    expect(privateName.test("おむつ交換室")).toBe(true);
    expect(privateName.test("カフェ珈人")).toBe(false);
  });

  it("説明しやすさ", () => {
    expect(explainOf("西口交番")).toBe(5);
    expect(explainOf("観光案内所")).toBe(4);
    expect(explainOf("西口地下広場")).toBe(3);
    expect(explainOf("JR 西改札")).toBe(2);
    expect(explainOf("HOKUO新宿エース南店")).toBe(1);
  });
});

describe("normalizeName", () => {
  it("空白・記号・全角半角・大文字小文字を揃える", () => {
    expect(normalizeName("スターバックス コーヒー 新宿西口店")).toBe("スターバックスコーヒー新宿西口店");
    expect(normalizeName("ＪＩＮＳ")).toBe("jins");
    expect(normalizeName("粥餐庁 （かゆさんちん）")).toBe("粥餐庁かゆさんちん");
  });
});

describe("階", () => {
  it("ordinal → floorLabel は固定表。中間階は上の階に M", () => {
    expect(floorLabelOf(-3)).toBe("B3F");
    expect(floorLabelOf(-2.5)).toBe("MB2F");
    expect(floorLabelOf(-0.5)).toBe("M1F");
    expect(floorLabelOf(0)).toBe("1F");
    expect(floorLabelOf(1)).toBe("1F");
    expect(floorLabelOf(1.5)).toBe("M2F");
    expect(floorLabelOf(4.5)).toBe("M5F");
    expect(() => floorLabelOf(7)).toThrow();
  });

  it("deltaZ: 屋外の地表と屋内 1 階は同じ高さ。0.5 は 1。2 階分は 2", () => {
    expect(deltaZOf(0, 1)).toBe(0);
    expect(deltaZOf(1, 0)).toBe(0);
    expect(deltaZOf(-1, 0)).toBe(1);
    expect(deltaZOf(0, -2)).toBe(-2);
    expect(deltaZOf(-1, -1.5)).toBe(-1);
    expect(deltaZOf(-2.5, -2)).toBe(1);
    expect(deltaZOf(0, 2)).toBe(1);
    expect(deltaZOf(2, 4)).toBe(2);
    expect(deltaZOf(2, 2)).toBe(0);
  });
});

describe("geo", () => {
  it("haversineM: 経度 0.001° は新宿でおよそ 90m", () => {
    expect(haversineM(35.69, 139.7, 35.69, 139.701)).toBeCloseTo(90.3, 0);
  });

  it("project: 原点からのメートル。x+ は東、y+ は北", () => {
    const p = project(35.691, 139.701, 35.69, 139.7);
    expect(p.x).toBeCloseTo(90.4, 0);
    expect(p.y).toBeCloseTo(111.3, 0);
  });

  it("distPointPolyline: 線分の外側は端点までの距離", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(distPointPolyline({ x: 5, y: 3 }, line)).toBe(3);
    expect(distPointPolyline({ x: 14, y: 3 }, line)).toBe(5);
  });

  it("pointInRings: 穴は外側", () => {
    const outer = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const hole = [
      { x: 4, y: 4 },
      { x: 6, y: 4 },
      { x: 6, y: 6 },
      { x: 4, y: 6 },
    ];
    expect(pointInRings({ x: 1, y: 1 }, [outer, hole])).toBe(true);
    expect(pointInRings({ x: 5, y: 5 }, [outer, hole])).toBe(false);
    expect(pointInRings({ x: 11, y: 5 }, [outer, hole])).toBe(false);
  });
});
