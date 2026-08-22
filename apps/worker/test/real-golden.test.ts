import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecommendationRequest } from "../src/contract.js";
import type { Catalog, Dataset, Graph } from "../src/graph.js";
import { recommend } from "../src/recommend.js";

/**
 * 実データのゴールデンテスト。docs/RECOMMENDER.md のテスト節（463行）が求める
 * 「ZIP 取り込み後に、同じ契約で実データテストを足す」を満たす。
 * ノード ID は原則カタログ ID 経由で参照する。例外は G9 の片方向辺のノード ID
 * 2 個だけで、コメントで理由を明記してある。
 *
 * 期待値は取り込みのたびに変わりうる。冒頭で datasetVersion と graphHash を
 * 固定しているので、再取り込みで値が変わったらこのファイルごと見直すサイン。
 */
const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../data");
const dataset: Dataset = {
  graph: JSON.parse(readFileSync(join(dataDir, "graph.json"), "utf8")) as Graph,
  catalog: JSON.parse(readFileSync(join(dataDir, "catalog.json"), "utf8")) as Catalog,
};

describe("データセットの版", () => {
  it("datasetVersion と graphHash を固定する", () => {
    expect(dataset.graph.datasetVersion).toBe("2023-02-20");
    expect(dataset.graph.graphHash).toBe(
      "fc3466270c08593a300e652c7997021f85151bf0f435e17ee9fcb7935ed4ba31",
    );
  });
});

const representative: RecommendationRequest = {
  datasetId: "tokyo.shinjuku-terminal",
  destination: { kind: "catalog", id: "dest.tokyo-metropolitan-government" },
  participants: [
    { id: "jr", entry: { kind: "line", id: "line.jr" } },
    { id: "keio", entry: { kind: "line", id: "line.keio" } },
    { id: "marunouchi", entry: { kind: "line", id: "line.marunouchi" } },
  ],
};

describe("G1: 代表ケース（都庁、JR/京王/丸ノ内）", () => {
  const res = recommend(dataset, representative);
  const top = res.ranked[0]!;

  it("ranked / infeasible の件数", () => {
    expect(res.ranked.length).toBe(242);
    expect(res.infeasible.length).toBe(0);
  });

  it("上位3件の集合場所", () => {
    expect(res.ranked.slice(0, 3).map((r) => r.meeting.catalogId)).toEqual([
      "meet.28993812",
      "meet.28993811",
      "meet.28993854",
    ]);
  });

  it("1位のスコアと理由", () => {
    expect(top.scores).toEqual({
      maxDistanceM: 179.8,
      sumDistanceM: 424,
      onwardDistanceM: 221,
      explainability: 1,
    });
    expect(top.reasons).toEqual([{ code: "minimax", textJa: "一番長い人の移動が最も短い" }]);
  });

  it("1位の出口", () => {
    expect(top.onward.exit.catalogId).toBe("exit.28994922");
    expect(top.onward.exit.label).toBe("8");
  });

  it("3人の entry catalogId", () => {
    const entries = Object.fromEntries(top.legs.map((l) => [l.participantId, l.entry.catalogId]));
    expect(entries).toEqual({
      jr: "entry.28993975.11114545",
      keio: "entry.28993981.11126963",
      marunouchi: "entry.28993451.11126978",
    });
  });
});

describe("G2: 改札を直接渡し直しても entry と distanceM は不変", () => {
  it("路線から選ばれた改札を catalog で渡し直す", () => {
    const res1 = recommend(dataset, representative);
    const top1 = res1.ranked[0]!;
    const keioEntryId = top1.legs.find((l) => l.participantId === "keio")!.entry.catalogId!;

    const res2 = recommend(dataset, {
      ...representative,
      participants: [
        { id: "jr", entry: { kind: "line", id: "line.jr" } },
        { id: "keio", entry: { kind: "catalog", id: keioEntryId } },
        { id: "marunouchi", entry: { kind: "line", id: "line.marunouchi" } },
      ],
    });
    const top2 = res2.ranked.find((r) => r.meeting.catalogId === top1.meeting.catalogId)!;
    const keio1 = top1.legs.find((l) => l.participantId === "keio")!;
    const keio2 = top2.legs.find((l) => l.participantId === "keio")!;
    expect(keio2.entry.catalogId).toBe(keio1.entry.catalogId);
    expect(keio2.distanceM).toBe(keio1.distanceM);
  });
});

describe("G3: 複数路線に対応する改札が実在する", () => {
  it("lineIds.length > 1 の改札が少なくとも1件ある", () => {
    // 選ばれ方（近い方が勝つ）の制御は fixture 側
    // （recommend.test.ts「1 つの改札が複数の路線に対応してよい」）を正とする。
    // 実データでは経路長を手で作れないため、ここでは実在することだけ確認する。
    const multi = dataset.catalog.entries.filter((e) => e.lineIds.length > 1);
    expect(multi.length).toBeGreaterThan(0);
    expect(multi.every((e) => e.lineIds.length >= 2)).toBe(true);
  });
});

describe("G4: confirmed で経路上のノードを渡すと、その人だけ距離が縮む", () => {
  it("中間ノードを confirmed にすると entry が変わり、他の2人は不変", () => {
    const res1 = recommend(dataset, representative);
    const top1 = res1.ranked[0]!;
    const maruLeg1 = top1.legs.find((l) => l.participantId === "marunouchi")!;
    const midNode = maruLeg1.pathNodeIds[Math.floor(maruLeg1.pathNodeIds.length / 2)]!;

    const res2 = recommend(dataset, {
      ...representative,
      participants: [
        { id: "jr", entry: { kind: "line", id: "line.jr" } },
        { id: "keio", entry: { kind: "line", id: "line.keio" } },
        {
          id: "marunouchi",
          entry: { kind: "line", id: "line.marunouchi" },
          confirmed: { kind: "node", id: midNode },
        },
      ],
    });
    const top2 = res2.ranked.find((r) => r.meeting.catalogId === top1.meeting.catalogId)!;
    const maruLeg2 = top2.legs.find((l) => l.participantId === "marunouchi")!;
    expect(maruLeg2.entry.nodeId).toBe(midNode);
    expect(maruLeg2.distanceM).toBeLessThan(maruLeg1.distanceM);

    expect(JSON.stringify(top2.legs.find((l) => l.participantId === "jr"))).toBe(
      JSON.stringify(top1.legs.find((l) => l.participantId === "jr")),
    );
    expect(JSON.stringify(top2.legs.find((l) => l.participantId === "keio"))).toBe(
      JSON.stringify(top1.legs.find((l) => l.participantId === "keio")),
    );
  });
});

describe("G5: step_free", () => {
  const res = recommend(dataset, { ...representative, constraints: { accessibility: "step_free" } });

  it("ranked / infeasible の件数と理由", () => {
    expect(res.ranked.length).toBe(136);
    expect(res.infeasible.length).toBe(106);
    expect(res.infeasible.every((i) => i.reason === "step_free")).toBe(true);
  });

  it("1位の reasons に step_free を含む", () => {
    expect(res.ranked[0]!.reasons.map((r) => r.code)).toContain("step_free");
  });
});

describe("G6: 1位の steps は経路の部分集合で、entry に始まり meeting に終わる", () => {
  it("実測の pathNodeIds / steps 件数を固定する", () => {
    const res = recommend(dataset, representative);
    const top = res.ranked[0]!;
    const counts: Record<string, { pathNodeIds: number; steps: number }> = {};
    for (const leg of top.legs) {
      expect(leg.steps.length).toBeLessThanOrEqual(leg.pathNodeIds.length);
      expect(leg.steps[0]).toMatchObject({ kind: "landmark", nodeId: leg.entry.nodeId, distanceM: 0 });
      expect(leg.steps.at(-1)!.nodeId).toBe(top.meeting.nodeId);
      counts[leg.participantId] = { pathNodeIds: leg.pathNodeIds.length, steps: leg.steps.length };
    }
    // steps の区切りは名前・実際に曲がる・階が変わるノードだけで決め、次数
    // (行き止まり枝込みの生の次数)では区切らない(docs/RECOMMENDER.md steps
    // 節)。以前は次数3以上で区切っていたため、網にある行き止まり枝(設備への
    // 袋小路)ぶん steps が水増しされていた(marunouchi は 31 行、pathNodeIds
    // と同数)。区切り規則の変更後は次のとおり縮む。
    //   jr:         steps 10 → 3
    //   keio:       steps 18 → 6
    //   marunouchi: steps 31 → 6
    // ここでは実測値を凍結する。
    expect(counts).toEqual({
      jr: { pathNodeIds: 10, steps: 3 },
      keio: { pathNodeIds: 24, steps: 6 },
      marunouchi: { pathNodeIds: 31, steps: 6 },
    });
  });
});

describe("G7: 目的地を変えると出口が変わる", () => {
  it("都庁→バスタ新宿で出口が変わり、1位の集合場所と legs は不変", () => {
    const west = recommend(dataset, representative);
    const busta = recommend(dataset, {
      ...representative,
      destination: { kind: "catalog", id: "dest.busta-shinjuku" },
    });
    expect(west.ranked[0]!.onward.exit.catalogId).toBe("exit.28994922");
    expect(busta.ranked[0]!.onward.exit.catalogId).toBe("exit.28994916");
    expect(busta.ranked[0]!.meeting.catalogId).toBe(west.ranked[0]!.meeting.catalogId);
    expect(JSON.stringify(busta.ranked[0]!.legs)).toBe(JSON.stringify(west.ranked[0]!.legs));
  });
});

describe("G8: 決定性", () => {
  it("同じ入力なら同じ JSON を二回とも返す", () => {
    const a = JSON.stringify(recommend(dataset, representative));
    const b = JSON.stringify(recommend(dataset, representative));
    expect(a).toBe(b);
  });
});

describe("G10: turn 判定の縮退座標修正（research-mapDesign.md §2.6 検収 a）", () => {
  it("keio leg の steps に京王西口近くの角ノード 11120481 が含まれる", () => {
    // 縮退座標バグ（直後のノードが同一座標で角度が 0 に潰れる）が直る前は、
    // この角が steps から漏れて約 20m のショートカットになっていた
    // （research-shape.md 実測）。修正後は turn が straight でない形で現れる。
    const res = recommend(dataset, representative);
    const top = res.ranked[0]!;
    const keio = top.legs.find((l) => l.participantId === "keio")!;
    expect(keio.pathNodeIds).toContain("11120481");
    const step = keio.steps.find((s) => s.nodeId === "11120481");
    expect(step).toBeDefined();
    expect(step!.turn).not.toBe("straight");
  });
});

describe("G9: 向きの実データ回帰", () => {
  it("meet.29008226 の onward は片方向辺 11114909→11110818 を使う", () => {
    const res = recommend(dataset, representative);
    const cand = res.ranked.find((r) => r.meeting.catalogId === "meet.29008226");
    expect(cand).toBeDefined();
    expect(cand!.rank).toBe(113);
    expect(cand!.onward.exit.catalogId).toBe("exit.28994920");
    expect(cand!.onward.distanceM).toBeCloseTo(224.6, 1);

    // raw ノード ID を直書きする唯一の例外。片方向リンク 18771133.f
    // （11114909 → 11110818。逆向きの辺はグラフに無い）を実際に使っていることを
    // 確認するのが目的で、カタログ ID を経由できない。
    // 順方向の隣接で出口から探索する誤実装だと、この片方向辺を逆走できず
    // 選ばれる出口や距離がずれる（research-verify.md 実測で 242 候補中 49 件に差）。
    const i = cand!.onward.pathNodeIds.indexOf("11114909");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(cand!.onward.pathNodeIds[i + 1]).toBe("11110818");
  });
});

describe("G11: 手順は次数では区切らないので、行き止まり枝の多い経路ほど大きく減る", () => {
  it("marunouchi leg は 15 行以下で、先頭は改札・末尾は集合地点、連続する straight move が無い", () => {
    const res = recommend(dataset, representative);
    const top = res.ranked[0]!;
    const maru = top.legs.find((l) => l.participantId === "marunouchi")!;
    // 区切り規則の変更前は pathNodeIds と同数の 31 行だった（G6 のコメント参照）。
    // 変更後は 6 行に縮む。ここでは緩めに 15 行以下だけを固定する。
    expect(maru.steps.length).toBeLessThanOrEqual(15);
    expect(maru.steps[0]).toMatchObject({ kind: "landmark", nodeId: maru.entry.nodeId, distanceM: 0 });
    expect(maru.steps.at(-1)).toMatchObject({ kind: "landmark", nodeId: top.meeting.nodeId });
    for (let i = 1; i < maru.steps.length; i++) {
      const prev = maru.steps[i - 1]!;
      const cur = maru.steps[i]!;
      const bothStraightMoves =
        prev.kind === "move" && prev.turn === "straight" && cur.kind === "move" && cur.turn === "straight";
      expect(bothStraightMoves).toBe(false);
    }
  });
});

describe("G12: branchCount は実分岐（行き止まり枝を除いた次数）で決める", () => {
  it("代表ケースの branchCount を固定する", () => {
    const res = recommend(dataset, representative);
    const top = res.ranked[0]!;
    const byParticipant = Object.fromEntries(top.legs.map((l) => [l.participantId, l.branchCount]));
    // 生の次数（行き止まり枝込み）で数えていたときの実測は
    // jr: 9 / keio: 15 / marunouchi: 27。行き止まり枝を除いた実分岐に切り替えた
    // 後は次のとおり縮む（マージンとして最終報告にも同じ値を載せる）。
    expect(byParticipant).toEqual({ jr: 4, keio: 12, marunouchi: 21 });
  });
});

describe("G13: confirmations の branch 件数も実分岐で決める", () => {
  it("代表ケースの confirmations.branch 件数を固定する", () => {
    const res = recommend(dataset, representative);
    const top = res.ranked[0]!;
    const branchCounts = Object.fromEntries(
      top.legs.map((l) => [l.participantId, l.confirmations.filter((c) => c.kind === "branch").length]),
    );
    // 生の次数だったときの実測: jr 8 / keio 15 / marunouchi 27。
    // 実分岐に切り替えた後: jr 3 / keio 12 / marunouchi 21。
    expect(branchCounts).toEqual({ jr: 3, keio: 12, marunouchi: 21 });
  });
});
