import { describe, expect, it } from "vitest";
import { haversineM, polygonCenter, project } from "../scripts/ingest/geo.js";
import { codeName, exitNameOf, exitOnly, explainOf, genericName, linesOf } from "../scripts/ingest/rules.js";

/**
 * scripts/ingest/{rules,geo}.ts の純関数のテスト。
 *
 * 期待値は tools/ingest/main.go を Go のまま実行した結果（scratchpad/regex_check.go,
 * scratchpad/geo_check.go）と突き合わせて確認済み。ここに書く値は「TS で書いたら
 * こうなりそう」ではなく、Go の実測値そのもの。
 */

describe("linesOf", () => {
  it("JR の改札名から line.jr を拾う", () => {
    expect(linesOf("JR 中央西口")).toEqual(["line.jr"]);
  });

  it("連絡改札は複数路線を拾い、lineID の辞書順で返す", () => {
    expect(linesOf("京王・丸ノ内線 連絡改札")).toEqual(["line.keio", "line.marunouchi"]);
  });

  it("英字表記のみでも判定できる", () => {
    expect(linesOf("KeioLine")).toEqual(["line.keio"]);
  });

  it("判定できない名前は空配列", () => {
    expect(linesOf("総合案内所")).toEqual([]);
  });
});

describe("exitOnly", () => {
  it("日本語の出口専用表記にマッチする", () => {
    expect(exitOnly.test("JR中央西口(出口専用)")).toBe(true);
  });

  it("先頭大文字の Exitonly にマッチする", () => {
    expect(exitOnly.test("Exitonly")).toBe(true);
  });

  it("小文字の exitonly にはマッチしない（Go に (?i) が無いのと同じ）", () => {
    expect(exitOnly.test("exitonly")).toBe(false);
  });
});

describe("exitNameOf", () => {
  it("空ラベルは地上出口", () => {
    expect(exitNameOf("")).toBe("地上出口");
  });

  it("1文字の番号には「出口 」を前に付ける", () => {
    expect(exitNameOf("7")).toBe("出口 7");
  });

  it("3rune の英数字ラベルにも「出口 」を前に付ける", () => {
    expect(exitNameOf("15B")).toBe("出口 15B");
    expect(exitNameOf("B14")).toBe("出口 B14");
  });

  it("4rune 以上の手書き文はそのまま出す", () => {
    expect(exitNameOf("ルミネエスト 地下入口")).toBe("ルミネエスト 地下入口");
  });
});

describe("codeName", () => {
  it.each(["11", "A", "D10", "Unit B3F-115"])("%s は名前として使えないコード扱い", (s) => {
    expect(codeName.test(s)).toBe(true);
  });

  it("駅の案内表示に出てくる名前はコード扱いしない", () => {
    expect(codeName.test("西口交番前")).toBe(false);
  });
});

describe("genericName", () => {
  it("先頭の ATM は大文字小文字を無視してマッチする", () => {
    expect(genericName.test("ATMコーナー")).toBe(true);
  });

  it("設備名は部分一致でマッチする", () => {
    expect(genericName.test("コインロッカー")).toBe(true);
  });

  it("ATM が先頭に無いと ATM 由来ではマッチしない（^ が効くのは先頭の ATM だけ）", () => {
    // 「みずほATM」は他のどの選択肢とも部分一致しないので、genericName 全体としても
    // 非マッチになる。Go の挙動をそのまま再現した結果で、直す対象ではない。
    expect(genericName.test("みずほATM")).toBe(false);
  });
});

describe("explainOf", () => {
  it("交番は5", () => {
    expect(explainOf("新宿駅前交番")).toBe(5);
  });

  it("案内所・インフォメーションは4", () => {
    expect(explainOf("総合案内所")).toBe(4);
    expect(explainOf("インフォメーションセンター")).toBe(4);
  });

  it("広場・コンコースは3", () => {
    expect(explainOf("東西自由広場")).toBe(3);
    expect(explainOf("中央コンコース")).toBe(3);
  });

  it("改札は2", () => {
    expect(explainOf("中央東改札")).toBe(2);
  });

  it("それ以外（店舗など）は1", () => {
    expect(explainOf("スターバックスコーヒー")).toBe(1);
  });
});

describe("haversineM", () => {
  it("同一点は0", () => {
    expect(haversineM(0, 0, 0, 0)).toBe(0);
  });

  it("新宿駅構内程度の距離（Go の実測値 143.24896726206762m と一致）", () => {
    expect(haversineM(35.69, 139.7, 35.691, 139.701)).toBeCloseTo(143.24896726206762, 6);
  });

  it("東京-大阪程度の距離（Go の実測値 402784.183027452m と一致）", () => {
    expect(haversineM(35.6812, 139.7671, 34.6937, 135.5023)).toBeCloseTo(402784.183027452, 4);
  });
});

describe("project", () => {
  it("原点と同じ座標は (0, 0)", () => {
    expect(project(35.69, 139.7, 35.69, 139.7)).toEqual({ x: 0, y: 0 });
  });

  it("Go の実測値と一致する（x=90.41247446233118 y=111.32000000053154）", () => {
    const { x, y } = project(35.691, 139.701, 35.69, 139.7);
    expect(x).toBeCloseTo(90.41247446233118, 9);
    expect(y).toBeCloseTo(111.32000000053154, 9);
  });
});

describe("polygonCenter", () => {
  it("閉じ点を含めたまま外周リングを単純平均する（正方形、Go の実測値と一致）", () => {
    const center = polygonCenter({
      type: "Polygon",
      coordinates: [
        [
          [139.7, 35.69],
          [139.701, 35.69],
          [139.701, 35.691],
          [139.7, 35.691],
          [139.7, 35.69],
        ],
      ],
    });
    expect(center).not.toBeNull();
    expect(center!.lat).toBeCloseTo(35.6904, 9);
    expect(center!.lng).toBeCloseTo(139.7004, 9);
  });

  it("三角形でも同じ式で平均する（Go の実測値と一致）", () => {
    const center = polygonCenter({
      type: "Polygon",
      coordinates: [
        [
          [139.7, 35.68],
          [139.71, 35.685],
          [139.705, 35.69],
          [139.7, 35.68],
        ],
      ],
    });
    expect(center).not.toBeNull();
    expect(center!.lat).toBeCloseTo(35.68375, 9);
    expect(center!.lng).toBeCloseTo(139.70375, 9);
  });

  it("Polygon 以外は null", () => {
    expect(polygonCenter({ type: "Point", coordinates: [139.7, 35.69] })).toBeNull();
  });
});
