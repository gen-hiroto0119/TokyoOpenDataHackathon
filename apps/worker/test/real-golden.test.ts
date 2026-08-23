import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecommendationRequest } from "../src/contract.js";
import type { Catalog, Dataset, Graph } from "../src/graph.js";
import { recommend } from "../src/recommend.js";

/**
 * 実データのゴールデン。期待値は取り込みのたびに変わりうる。
 * 冒頭で datasetVersion と graphHash を固定しているので、再取り込みで
 * 値が変わったらこのファイルごと見直す。
 */
const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../data");
const dataset: Dataset = {
  graph: JSON.parse(readFileSync(join(dataDir, "graph.json"), "utf8")) as Graph,
  catalog: JSON.parse(readFileSync(join(dataDir, "catalog.json"), "utf8")) as Catalog,
};

describe("データセットの版", () => {
  it("datasetVersion と graphHash を固定する", () => {
    expect(dataset.graph.datasetVersion).toBe("mlit-2020-08");
    expect(dataset.graph.graphHash).toBe(
      "a5f8455bf8d2e696dd4f836575b9000843359fc0e75d9314269c1057b91802e1",
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
    expect(res.ranked.length).toBe(72);
    expect(res.infeasible.length).toBe(0);
  });

  it("上位3件の集合場所", () => {
    expect(res.ranked.slice(0, 3).map((r) => r.meeting.catalogId)).toEqual([
      "meet.mlit.ded26d8ca534472181a13cd5950df68a",
      "meet.mlit.e83a373de29c40df85975be167725aa5",
      "meet.mlit.bc30f06d24f74562aab411d142a8fe34",
    ]);
    expect(res.ranked.slice(0, 3).map((r) => r.meeting.nameJa)).toEqual([
      "スターバックス コーヒー 新宿西口店",
      "中・大型タクシーのりば",
      "MINIPLA (ミニプラ) 小田急新宿西口店",
    ]);
  });

  it("1位のスコアと理由", () => {
    expect(top.scores).toEqual({
      maxDistanceM: 105.5,
      sumDistanceM: 266.6,
      onwardDistanceM: 157.9,
      explainability: 1,
    });
    expect(top.reasons).toEqual([{ code: "minimax", textJa: "一番長い人の移動が最も短い" }]);
  });

  it("1位の出口", () => {
    expect(top.onward.exit.catalogId).toBe("exit.9b009263412c4446a9189d22c9e180a0");
    expect(top.onward.exit.label).toBe("9");
  });

  it("3人の entry catalogId", () => {
    const entries = Object.fromEntries(top.legs.map((l) => [l.participantId, l.entry.catalogId]));
    expect(entries).toEqual({
      jr: "entry.f7ec73273c3e45c3835bff65f7c5cbfd.dd4a36af20b64cb49ff0a9bc5650ebec",
      keio: "entry.8d3dc24aebe44c2396997dd6e3a54621.203eac45b6544615b776c0146865f999",
      marunouchi: "entry.987143aae7814d658f6e9bd87eac83cb.2e3864c2d80c432e8f6e953612f44432",
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
    expect(res.ranked.length).toBe(66);
    expect(res.infeasible.length).toBe(6);
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
    expect(counts).toEqual({
      jr: { pathNodeIds: 8, steps: 4 },
      keio: { pathNodeIds: 12, steps: 9 },
      marunouchi: { pathNodeIds: 12, steps: 7 },
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
    expect(west.ranked[0]!.onward.exit.catalogId).toBe("exit.9b009263412c4446a9189d22c9e180a0");
    expect(busta.ranked[0]!.onward.exit.catalogId).toBe("exit.ebb869c05be2473fb6c3b37e6750de58");
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

describe("G9: 片方向のリンクがグラフにあり、経路がそれを使える", () => {
  it("逆向きの無いリンクが少なくとも1本ある", () => {
    const pairs = new Set(dataset.graph.links.map((l) => `${l.from}\t${l.to}`));
    const oneWay = dataset.graph.links.filter((l) => !pairs.has(`${l.to}\t${l.from}`));
    expect(oneWay.length).toBeGreaterThan(0);
  });
});

describe("G10: 代表ケースの keio 手順に曲がりがある", () => {
  it("keio leg に straight 以外の turn がある", () => {
    const res = recommend(dataset, representative);
    const keio = res.ranked[0]!.legs.find((l) => l.participantId === "keio")!;
    expect(keio.steps.some((s) => s.turn !== "straight")).toBe(true);
  });
});

describe("G11: 手順は次数では区切らないので、連続する straight move が無い", () => {
  it("marunouchi leg は 15 行以下で、先頭は改札・末尾は集合地点", () => {
    const res = recommend(dataset, representative);
    const top = res.ranked[0]!;
    const maru = top.legs.find((l) => l.participantId === "marunouchi")!;
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

describe("G12: 代表ケースの branchCount を固定する", () => {
  it("1位の branchCount", () => {
    const res = recommend(dataset, representative);
    const byParticipant = Object.fromEntries(res.ranked[0]!.legs.map((l) => [l.participantId, l.branchCount]));
    expect(byParticipant).toEqual({ jr: 4, keio: 10, marunouchi: 8 });
  });
});

describe("G13: confirmations の branch 件数も実分岐で決める", () => {
  it("代表ケースの confirmations.branch 件数を固定する", () => {
    const res = recommend(dataset, representative);
    const branchCounts = Object.fromEntries(
      res.ranked[0]!.legs.map((l) => [l.participantId, l.confirmations.filter((c) => c.kind === "branch").length]),
    );
    expect(branchCounts).toEqual({ jr: 4, keio: 10, marunouchi: 8 });
  });
});

describe("G14: 1位の facilities をゴールデンに固定する", () => {
  it("代表ケースの1位（スターバックス コーヒー 新宿西口店）の facilities", () => {
    const res = recommend(dataset, representative);
    const top = res.ranked[0]!;
    expect(top.meeting.catalogId).toBe("meet.mlit.ded26d8ca534472181a13cd5950df68a");
    expect(top.meeting.facilities).toEqual({ elevator: true, restroom: false, stepFree: true });
  });

  it("設備は順位を変えない: 上位3件の並びは G1 のゴールデンと同じ", () => {
    const res = recommend(dataset, representative);
    expect(res.ranked.slice(0, 3).map((r) => r.meeting.catalogId)).toEqual([
      "meet.mlit.ded26d8ca534472181a13cd5950df68a",
      "meet.mlit.e83a373de29c40df85975be167725aa5",
      "meet.mlit.bc30f06d24f74562aab411d142a8fe34",
    ]);
  });
});

describe("G15: accessibility: step_free では ranked 全件の stepFree が true", () => {
  it("G5 の 66 件すべてで facilities.stepFree === true", () => {
    const res = recommend(dataset, { ...representative, constraints: { accessibility: "step_free" } });
    expect(res.ranked.length).toBe(66);
    expect(res.ranked.every((r) => r.meeting.facilities.stepFree)).toBe(true);
  });
});
