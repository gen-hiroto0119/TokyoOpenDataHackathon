import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecommendationRequest } from "../src/contract.js";
import type { Catalog, Dataset, Graph, GraphLink } from "../src/graph.js";
import { recommend } from "../src/recommend.js";
import { directedFixture } from "./directed-fixture.js";
import { hoursFixture } from "./hours-fixture.js";

/**
 * 実データ応答全体に対する不変条件検査（性質テスト）。
 * ランダム生成（fast-check 等）は使わず、ranked 全件 × legs+onward を舐めて
 * docs/CORE.md・docs/RECOMMENDER.md の規範をコードが満たしているか検査する。
 * P9 だけは実データに hours 付きリンクが無いため、専用の小さな fixture を使う。
 */
const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../data");
const dataset: Dataset = {
  graph: JSON.parse(readFileSync(join(dataDir, "graph.json"), "utf8")) as Graph,
  catalog: JSON.parse(readFileSync(join(dataDir, "catalog.json"), "utf8")) as Catalog,
};

const representative: RecommendationRequest = {
  datasetId: "tokyo.shinjuku-terminal",
  destination: { kind: "catalog", id: "dest.tokyo-metropolitan-government" },
  participants: [
    { id: "jr", entry: { kind: "line", id: "line.jr" } },
    { id: "keio", entry: { kind: "line", id: "line.keio" } },
    { id: "marunouchi", entry: { kind: "line", id: "line.marunouchi" } },
  ],
};

const linkById = new Map(dataset.graph.links.map((l) => [l.id, l]));

/** from|to → 最短距離のリンク。並行辺は Dijkstra が最短を選ぶので、これで復元できる。 */
function buildMinDistancePairIndex(links: GraphLink[]): Map<string, GraphLink> {
  const byPair = new Map<string, GraphLink>();
  for (const link of links) {
    const key = `${link.from}|${link.to}`;
    const cur = byPair.get(key);
    if (!cur || link.distanceM < cur.distanceM) byPair.set(key, link);
  }
  return byPair;
}
const byPair = buildMinDistancePairIndex(dataset.graph.links);

/**
 * onward.pathNodeIds から実際に使ったリンクを復元する。
 * 契約に onward.pathLinkIds が無いための暫定策（research-verify.md §3 P2 の指示どおり）。
 */
function onwardLinks(nodeIds: string[]): GraphLink[] {
  const links: GraphLink[] = [];
  for (let i = 0; i < nodeIds.length - 1; i++) {
    const link = byPair.get(`${nodeIds[i]}|${nodeIds[i + 1]}`);
    if (!link) throw new Error(`no link between ${nodeIds[i]} and ${nodeIds[i + 1]}`);
    links.push(link);
  }
  return links;
}

describe("P1: 経路の連続性と向き", () => {
  it("全 legs で pathLinkIds が pathNodeIds を向きまで正しくつなぐ", () => {
    const res = recommend(dataset, representative);
    let legCount = 0;
    for (const cand of res.ranked) {
      for (const leg of cand.legs) {
        legCount++;
        expect(leg.pathLinkIds.length).toBe(leg.pathNodeIds.length - 1);
        for (let i = 0; i < leg.pathLinkIds.length; i++) {
          const link = linkById.get(leg.pathLinkIds[i]!);
          expect(link).toBeDefined();
          expect(link!.from).toBe(leg.pathNodeIds[i]);
          expect(link!.to).toBe(leg.pathNodeIds[i + 1]);
        }
      }
    }
    expect(legCount).toBe(216); // 72 候補 × 参加者3人
  });
});

describe("P2: 距離の和", () => {
  it("leg.distanceM はリンク距離の和と一致する", () => {
    const res = recommend(dataset, representative);
    for (const cand of res.ranked) {
      for (const leg of cand.legs) {
        const sum = leg.pathLinkIds.reduce((a, id) => a + linkById.get(id)!.distanceM, 0);
        expect(Math.abs(sum - leg.distanceM)).toBeLessThan(0.1);
      }
    }
  });

  it("onward.pathLinkIds が onward.pathNodeIds を向きまで正しくつなぎ、距離の和が onward.distanceM に一致する", () => {
    // 契約に onward.pathLinkIds が加わったので、from|to 復元の暫定策
    // （onwardLinks。並行辺があると別のリンクを拾いうる）はもう要らない。
    const res = recommend(dataset, representative);
    for (const cand of res.ranked) {
      expect(cand.onward.pathLinkIds.length).toBe(cand.onward.pathNodeIds.length - 1);
      for (let i = 0; i < cand.onward.pathLinkIds.length; i++) {
        const link = linkById.get(cand.onward.pathLinkIds[i]!);
        expect(link).toBeDefined();
        expect(link!.from).toBe(cand.onward.pathNodeIds[i]);
        expect(link!.to).toBe(cand.onward.pathNodeIds[i + 1]);
      }
      const sum = cand.onward.pathLinkIds.reduce((a, id) => a + linkById.get(id)!.distanceM, 0);
      expect(Math.abs(sum - cand.onward.distanceM)).toBeLessThan(0.1);
    }
  });
});

describe("P3: 片方向辺の固定ケース", () => {
  it("directed-fixture: 集合場所→出口だけ通れる辺を使う", () => {
    // recommend.test.ts「有向辺の出口探索」と同じ不変条件を、性質テストとしても固定する。
    const res = recommend(directedFixture, {
      datasetId: "tokyo.shinjuku-terminal",
      destination: { kind: "catalog", id: "dest.west" },
      participants: [
        { id: "a", entry: { kind: "catalog", id: "entry.a" } },
        { id: "b", entry: { kind: "catalog", id: "entry.b" } },
      ],
    });
    const top = res.ranked[0]!;
    expect(top.onward.pathNodeIds).toEqual(["m.meet", "e.west"]);
  });

  it("実データ: いずれかの onward が片方向辺を使う", () => {
    const pairs = new Set(dataset.graph.links.map((l) => `${l.from}\t${l.to}`));
    const res = recommend(dataset, representative);
    const usedOneWay = res.ranked.some((cand) =>
      cand.onward.pathNodeIds.some((nodeId, i) => {
        const next = cand.onward.pathNodeIds[i + 1];
        return (
          next !== undefined &&
          pairs.has(`${nodeId}\t${next}`) &&
          !pairs.has(`${next}\t${nodeId}`)
        );
      }),
    );
    expect(usedOneWay).toBe(true);
  });
});

describe("P4: step_free の健全性", () => {
  const any = recommend(dataset, representative);
  const stepFree = recommend(dataset, { ...representative, constraints: { accessibility: "step_free" } });

  it("段差なし応答の全リンクは stairs / escalator / unknown を含まない", () => {
    for (const cand of stepFree.ranked) {
      for (const leg of cand.legs) {
        for (const linkId of leg.pathLinkIds) {
          const v = linkById.get(linkId)!.vertical;
          expect(["stairs", "escalator", "unknown"]).not.toContain(v);
        }
      }
      for (const link of onwardLinks(cand.onward.pathNodeIds)) {
        expect(["stairs", "escalator", "unknown"]).not.toContain(link.vertical);
      }
    }
  });

  it("段差なしの infeasible は any の ranked に含まれる（緩和すれば届く）", () => {
    const anyMeetingIds = new Set(any.ranked.map((r) => r.meeting.nodeId));
    for (const i of stepFree.infeasible) {
      expect(anyMeetingIds.has(i.nodeId)).toBe(true);
    }
  });
});

describe("P5: 順位の再計算", () => {
  it("scores から PRODUCT.md の順で並べ直しても rank の順番と一致する", () => {
    const res = recommend(dataset, representative);
    const EPS = 1e-9;
    const sorted = [...res.ranked].sort((a, b) => {
      const keys = ["maxDistanceM", "sumDistanceM", "onwardDistanceM"] as const;
      for (const k of keys) {
        if (Math.abs(a.scores[k] - b.scores[k]) > EPS) return a.scores[k] - b.scores[k];
      }
      if (a.scores.explainability !== b.scores.explainability) {
        return b.scores.explainability - a.scores.explainability;
      }
      return a.meeting.nodeId < b.meeting.nodeId ? -1 : 1;
    });
    expect(sorted.map((c) => c.meeting.nodeId)).toEqual(res.ranked.map((c) => c.meeting.nodeId));
  });

  it("maxDistanceM / sumDistanceM は legs から再計算した値と一致する", () => {
    const res = recommend(dataset, representative);
    for (const cand of res.ranked) {
      const maxD = Math.max(...cand.legs.map((l) => l.distanceM));
      const sumD = cand.legs.reduce((a, l) => a + l.distanceM, 0);
      expect(Math.abs(maxD - cand.scores.maxDistanceM)).toBeLessThan(0.05);
      expect(Math.abs(sumD - cand.scores.sumDistanceM)).toBeLessThan(0.05);
    }
  });
});

describe("P6: steps の不変条件", () => {
  it("Σ steps.distanceM は leg.distanceM に近く、先頭は entry、末尾は経路の終点", () => {
    const res = recommend(dataset, representative);
    for (const cand of res.ranked) {
      for (const leg of cand.legs) {
        const stepSum = leg.steps.reduce((a, s) => a + s.distanceM, 0);
        // 個々の step.distanceM は 0.1m 単位の丸め済み値なので、区切りの多い
        // 経路では丸め誤差が積み上がる。実測の最大値は約 0.5m だった。
        expect(Math.abs(stepSum - leg.distanceM)).toBeLessThan(0.6);
        expect(leg.steps[0]!.nodeId).toBe(leg.pathNodeIds[0]);
        expect(leg.steps.at(-1)!.nodeId).toBe(leg.pathNodeIds.at(-1));
      }
    }
  });

  it("名前のある経路上ノードは必ず steps に現れる", () => {
    const res = recommend(dataset, representative);
    const nodeById = new Map(dataset.graph.nodes.map((n) => [n.id, n]));
    for (const cand of res.ranked) {
      for (const leg of cand.legs) {
        const stepNodeIds = new Set(leg.steps.map((s) => s.nodeId));
        for (const nodeId of leg.pathNodeIds) {
          if (nodeById.get(nodeId)?.nameJa) {
            expect(stepNodeIds.has(nodeId)).toBe(true);
          }
        }
      }
    }
  });
});

describe("P7: confirmations", () => {
  it("先頭は gate、末尾は集合地点、全点が経路上、重複なし", () => {
    const res = recommend(dataset, representative);
    // 実測の内訳（216 legs）: 末尾の kind は landmark / gate / branch。
    // buildConfirmations は同じ nodeId を二重登録しないため、集合地点そのものが
    // 改札（経路長1、16件）や次数3以上の分岐点（2件）を兼ねると、末尾は
    // landmark に昇格されず先に付いた kind のまま残る。nodeId は常に一致する。
    const lastKindCounts: Record<string, number> = {};
    for (const cand of res.ranked) {
      for (const leg of cand.legs) {
        expect(leg.confirmations[0]!.kind).toBe("gate");
        expect(leg.confirmations.at(-1)!.nodeId).toBe(leg.pathNodeIds.at(-1));
        const lastKind = leg.confirmations.at(-1)!.kind;
        lastKindCounts[lastKind] = (lastKindCounts[lastKind] ?? 0) + 1;

        const pathSet = new Set(leg.pathNodeIds);
        for (const c of leg.confirmations) expect(pathSet.has(c.nodeId)).toBe(true);

        const seen = new Set<string>();
        for (const c of leg.confirmations) {
          expect(seen.has(c.nodeId)).toBe(false);
          seen.add(c.nodeId);
        }
      }
    }
    expect(lastKindCounts).toEqual({ landmark: 138, gate: 18, branch: 60 });
  });
});

describe("P8: costSeconds", () => {
  it("costSeconds は distanceM / 1.2 の丸めに近い", () => {
    const res = recommend(dataset, representative);
    for (const cand of res.ranked) {
      for (const leg of cand.legs) {
        // costSeconds は丸め前の距離から、leg.distanceM は丸め後の値なので
        // ±1 秒の誤差を許容する（docs/DATA.md 実測どおり）。
        expect(Math.abs(leg.costSeconds - Math.round(leg.distanceM / 1.2))).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("P9: hours（時間帯制約、専用 fixture）", () => {
  const base: RecommendationRequest = {
    datasetId: "tokyo.shinjuku-terminal",
    destination: { kind: "catalog", id: "dest.somewhere" },
    participants: [
      { id: "a", entry: { kind: "line", id: "line.a" } },
      { id: "b", entry: { kind: "line", id: "line.b" } },
    ],
  };

  it("帯内（09:00-20:00、12:00 は帯内）: m.day を使える", () => {
    const res = recommend(hoursFixture, { ...base, constraints: { asOf: "2024-06-01T12:00:00" } });
    expect(res.ranked.map((r) => r.meeting.nodeId)).toContain("m.day");
    expect(res.infeasible.some((i) => i.nodeId === "m.day")).toBe(false);
  });

  it("帯外（09:00-20:00、23:00 は帯外）: m.day が infeasible(hours) になる", () => {
    const res = recommend(hoursFixture, { ...base, constraints: { asOf: "2024-06-01T23:00:00" } });
    expect(res.ranked.some((r) => r.meeting.nodeId === "m.day")).toBe(false);
    expect(res.infeasible).toContainEqual({
      nodeId: "m.day",
      nameJa: "昼だけ広場",
      reason: "hours",
      textJa: "いまの時間帯は通れません",
    });
  });

  it("日跨ぎ（22:00-05:00、02:00 は帯内）: m.night を使える", () => {
    const res = recommend(hoursFixture, { ...base, constraints: { asOf: "2024-06-01T02:00:00" } });
    expect(res.ranked.map((r) => r.meeting.nodeId)).toContain("m.night");
    expect(res.infeasible.some((i) => i.nodeId === "m.night")).toBe(false);
  });

  it("日跨ぎ（22:00-05:00、13:00 は帯外）: m.night が infeasible(hours) になる", () => {
    const res = recommend(hoursFixture, { ...base, constraints: { asOf: "2024-06-01T13:00:00" } });
    expect(res.ranked.some((r) => r.meeting.nodeId === "m.night")).toBe(false);
    expect(res.infeasible).toContainEqual({
      nodeId: "m.night",
      nameJa: "夜だけ広場",
      reason: "hours",
      textJa: "いまの時間帯は通れません",
    });
  });

  it("asOf 省略: hours 制約を掛けず、全候補が使える", () => {
    const res = recommend(hoursFixture, base);
    expect(res.ranked.map((r) => r.meeting.nodeId).sort()).toEqual(["m.day", "m.free", "m.night"]);
    expect(res.infeasible).toEqual([]);
  });
});

describe("P10: 手順の区切り（座標は内部処理のみ。応答に x,y は出ない）", () => {
  it("同じ向きの move が連続しない（隣り合う無名 move が両方とも straight にならない）", () => {
    // 座標クリーニング（cleanRouteCoordinates）は turn 判定の内部処理としてのみ残り、
    // 応答の Step から x,y は削った（docs/RECOMMENDER.md steps 節）。区切りは
    // 名前・実際に曲がる・階が変わるノードだけで決め、次数では区切らないため、
    // 曲がらずに階変化だけが続くと、隣り合う無名 move が両方 straight になり
    // うる（＝実際には曲がっていない「直進する」move の連続）。それを 1 つに
    // 畳む mergeSameDirectionMoves の不変条件をここで固定する。実際に曲がる
    // move（turn が straight でない）が同じ向きで連続するのは正当な経路の形
    // なので対象にしない。
    const res = recommend(dataset, representative);
    let checked = 0;
    const assertNoRepeat = (steps: { kind: string; turn: string }[]) => {
      for (let i = 1; i < steps.length; i++) {
        const prev = steps[i - 1]!;
        const cur = steps[i]!;
        if (prev.kind === "move" && cur.kind === "move") {
          expect(prev.turn === "straight" && cur.turn === "straight").toBe(false);
        }
        checked++;
      }
    };
    for (const cand of res.ranked) {
      for (const leg of cand.legs) assertNoRepeat(leg.steps);
      assertNoRepeat(cand.onward.steps);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("検収 d: onward.steps は集合場所始まり・出口終わりで、距離の和が onward.distanceM に一致する", () => {
    const res = recommend(dataset, representative);
    for (const cand of res.ranked) {
      expect(cand.onward.steps[0]!.nodeId).toBe(cand.meeting.nodeId);
      expect(cand.onward.steps.at(-1)!.nodeId).toBe(cand.onward.exit.nodeId);
      const sum = cand.onward.steps.reduce((a, s) => a + s.distanceM, 0);
      // REC テスト節 10 は ±0.5。浮動小数の丸め誤差ぶんだけ余裕を持たせる。
      expect(Math.abs(sum - cand.onward.distanceM)).toBeLessThanOrEqual(0.5 + 1e-6);
    }
  });
});
