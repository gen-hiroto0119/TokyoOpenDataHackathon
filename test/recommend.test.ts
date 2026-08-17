import { describe, expect, it } from "vitest";
import type { RecommendationRequest } from "../src/contract.js";
import { RecommendError, recommend } from "../src/recommend.js";
import { fixture } from "./fixture.js";

const representative: RecommendationRequest = {
  datasetId: "tokyo.shinjuku-terminal",
  destination: { kind: "catalog", id: "dest.tokyo-metropolitan-government" },
  participants: [
    { id: "jr", entry: { kind: "line", id: "line.jr" } },
    { id: "keio", entry: { kind: "line", id: "line.keio" } },
    { id: "marunouchi", entry: { kind: "line", id: "line.marunouchi" } },
  ],
};

describe("代表ケース", () => {
  const res = recommend(fixture, representative);

  it("順位は 最大負担 → 合計 → 出口までの近さ → 説明しやすさ の順で決まる", () => {
    expect(res.ranked.map((r) => r.meeting.nodeId)).toEqual(["m.board", "m.south", "m.koban"]);
    expect(res.ranked.map((r) => r.scores.maxDistanceM)).toEqual([290, 300, 310]);
    expect(res.ranked.map((r) => r.scores.sumDistanceM)).toEqual([840, 870, 900]);
  });

  it("理由は実際に効いた段だけを入れる", () => {
    expect(res.ranked[0]!.reasons).toEqual([{ code: "minimax", textJa: "一番長い人の移動が最も短い" }]);
  });

  it("costSeconds は表示用で、順位には使わない", () => {
    expect(res.walkingSpeedMps).toBe(1.2);
    const leg = res.ranked[0]!.legs.find((l) => l.participantId === "jr")!;
    expect(leg.distanceM).toBe(270);
    expect(leg.costSeconds).toBe(Math.round(270 / 1.2));
  });

  it("確認点は改札から集合地点まで機械的に取る", () => {
    const leg = res.ranked[0]!.legs.find((l) => l.participantId === "jr")!;
    expect(leg.confirmations[0]).toMatchObject({ kind: "gate", nodeId: "g.jr.south", status: "pending" });
    expect(leg.confirmations.at(-1)).toMatchObject({ kind: "landmark", nodeId: "m.board" });
    expect(leg.confirmations.every((c) => c.status === "pending")).toBe(true);
  });

  it("出典と版を返す", () => {
    expect(res.dataset.id).toBe("tokyo.shinjuku-terminal");
    expect(res.dataset.attributionJa).toContain("東京都");
  });
});

describe("改札は路線から選ぶ", () => {
  it("路線を渡すと、その路線の改札のうち一番近いものが legs[].entry に入る", () => {
    const res = recommend(fixture, representative);
    const entries = Object.fromEntries(
      res.ranked[0]!.legs.map((l) => [l.participantId, l.entry.catalogId]),
    );
    expect(entries).toEqual({
      jr: "entry.jr.south",
      keio: "entry.transfer",
      marunouchi: "entry.marunouchi.west",
    });
  });

  it("1 つの改札が複数の路線に対応してよい", () => {
    const shared = fixture.catalog.entries.find((e) => e.catalogId === "entry.transfer")!;
    expect(shared.lineIds).toEqual(["line.keio", "line.marunouchi"]);

    const res = recommend(fixture, representative);
    // 京王は連絡改札（130）が西口改札（150）より近いので選ばれる。
    const keio = res.ranked[0]!.legs.find((l) => l.participantId === "keio")!;
    expect(keio.entry.nodeId).toBe("g.transfer");
    // 丸ノ内は西口方面改札（120）の方が近いので、同じ連絡改札は選ばれない。
    const maru = res.ranked[0]!.legs.find((l) => l.participantId === "marunouchi")!;
    expect(maru.entry.nodeId).toBe("g.maru.west");
  });

  it("改札を直接渡したときは、そのまま使う", () => {
    const res = recommend(fixture, {
      ...representative,
      participants: [
        { id: "jr", entry: { kind: "catalog", id: "entry.jr.west" } },
        { id: "keio", entry: { kind: "line", id: "line.keio" } },
        { id: "marunouchi", entry: { kind: "line", id: "line.marunouchi" } },
      ],
    });
    const jr = res.ranked[0]!.legs.find((l) => l.participantId === "jr")!;
    expect(jr.entry.catalogId).toBe("entry.jr.west");
    expect(jr.distanceM).toBe(340);
  });

  it("路線に改札が無ければ弾く", () => {
    expect(() =>
      recommend(fixture, {
        ...representative,
        participants: [
          { id: "a", entry: { kind: "line", id: "line.oedo" } },
          { id: "b", entry: { kind: "line", id: "line.keio" } },
        ],
      }),
    ).toThrow(RecommendError);
  });
});

describe("出口は目的地から選ぶ", () => {
  it("都庁なら西口", () => {
    const res = recommend(fixture, representative);
    expect(res.ranked[0]!.onward.outdoorAnchor.catalogId).toBe("exit.west");
  });

  it("歌舞伎町なら東口", () => {
    const res = recommend(fixture, {
      ...representative,
      destination: { kind: "catalog", id: "dest.kabukicho" },
    });
    expect(res.ranked[0]!.onward.outdoorAnchor.catalogId).toBe("exit.east");
  });

  it("Maps の URL は出口の座標と目的地の表示名で組む", () => {
    const res = recommend(fixture, representative);
    const url = res.ranked[0]!.onward.outdoorAnchor.mapsDirUrl;
    expect(url).toBe(
      "https://www.google.com/maps/dir/?api=1" +
        `&origin=${encodeURIComponent("35.6896,139.6985")}` +
        `&destination=${encodeURIComponent("東京都庁")}` +
        "&travelmode=walking",
    );
  });
});

describe("確認済みノード", () => {
  it("その人の開始が変わり、他の人は改札のまま", () => {
    const res = recommend(fixture, {
      ...representative,
      participants: [
        { id: "jr", entry: { kind: "line", id: "line.jr" }, confirmed: { kind: "node", id: "branch" } },
        { id: "keio", entry: { kind: "line", id: "line.keio" } },
        { id: "marunouchi", entry: { kind: "line", id: "line.marunouchi" } },
      ],
    });
    const top = res.ranked[0]!;
    const jr = top.legs.find((l) => l.participantId === "jr")!;
    const keio = top.legs.find((l) => l.participantId === "keio")!;
    expect(jr.entry.nodeId).toBe("branch");
    expect(jr.distanceM).toBe(60);
    expect(keio.entry.catalogId).toBe("entry.transfer");
  });

  it("確認済みより手前の確認点は confirmed になる", () => {
    const res = recommend(fixture, {
      ...representative,
      participants: [
        { id: "jr", entry: { kind: "line", id: "line.jr" }, confirmed: { kind: "node", id: "branch" } },
        { id: "keio", entry: { kind: "line", id: "line.keio" } },
      ],
    });
    const jr = res.ranked[0]!.legs.find((l) => l.participantId === "jr")!;
    expect(jr.confirmations[0]).toMatchObject({ nodeId: "branch", status: "confirmed" });
  });
});

describe("段差なし", () => {
  const res = recommend(fixture, {
    ...representative,
    constraints: { accessibility: "step_free" },
  });

  it("階段しか無い候補は infeasible になり、理由が付く", () => {
    expect(res.ranked.map((r) => r.meeting.nodeId)).toEqual(["m.board", "m.koban"]);
    expect(res.infeasible).toEqual([
      { nodeId: "m.south", nameJa: "南通路広場", reason: "step_free", textJa: "段差なしでは行けません" },
    ]);
  });

  it("段差なしを指定したときだけ step_free を理由に入れる", () => {
    expect(res.ranked[0]!.reasons.map((r) => r.code)).toContain("step_free");
  });
});

describe("手順", () => {
  const res = recommend(fixture, representative);
  const leg = res.ranked.find((r) => r.meeting.nodeId === "m.koban")!.legs.find(
    (l) => l.participantId === "marunouchi",
  )!;

  it("最初の手順はその人の改札", () => {
    expect(leg.steps[0]).toMatchObject({ kind: "landmark", nodeId: "g.maru.west", distanceM: 0 });
  });

  it("名前のない通路は 1 つの move にまとまる", () => {
    expect(leg.pathNodeIds).toContain("u1");
    expect(leg.steps.map((s) => s.nodeId)).not.toContain("u1");
    const toBranch = leg.steps.find((s) => s.nodeId === "branch")!;
    expect(toBranch.distanceM).toBe(100);
  });

  it("最後の手順は集合地点", () => {
    expect(leg.steps.at(-1)).toMatchObject({ kind: "landmark", nodeId: "m.koban", nameJa: "西口交番前" });
  });
});

describe("負担のフィールド", () => {
  it("階移動と分岐はその人の改札から集合地点まで", () => {
    const res = recommend(fixture, representative);
    const south = res.ranked.find((r) => r.meeting.nodeId === "m.south")!;
    const leg = south.legs.find((l) => l.participantId === "jr")!;
    expect(leg.floorChanges).toBe(1);
    expect(leg.branchCount).toBeGreaterThan(0);
  });
});

describe("決定性", () => {
  it("同じ入力なら同じ JSON を返す", () => {
    const a = JSON.stringify(recommend(fixture, representative));
    const b = JSON.stringify(recommend(fixture, representative));
    expect(a).toBe(b);
  });
});

describe("エラー", () => {
  it("参加者が 2 人未満", () => {
    expect(() =>
      recommend(fixture, { ...representative, participants: [representative.participants[0]!] }),
    ).toThrowError(expect.objectContaining({ code: "invalid_participants" }));
  });

  it("参加者の ID が重複", () => {
    expect(() =>
      recommend(fixture, {
        ...representative,
        participants: [
          { id: "same", entry: { kind: "line", id: "line.jr" } },
          { id: "same", entry: { kind: "line", id: "line.keio" } },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_participants" }));
  });

  it("知らない目的地", () => {
    expect(() =>
      recommend(fixture, { ...representative, destination: { kind: "catalog", id: "dest.nope" } }),
    ).toThrowError(expect.objectContaining({ code: "unknown_catalog" }));
  });

  it("データセットが違う", () => {
    expect(() =>
      recommend(fixture, { ...representative, datasetId: "other" as never }),
    ).toThrowError(expect.objectContaining({ code: "dataset_mismatch" }));
  });
});
