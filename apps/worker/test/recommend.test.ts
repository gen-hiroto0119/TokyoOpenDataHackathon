import { describe, expect, it } from "vitest";
import type { RecommendationRequest } from "../src/contract.js";
import { RecommendError, recommend } from "../src/recommend.js";
import { directedFixture } from "./directed-fixture.js";
import { fixture } from "./fixture.js";
import { tieFixture } from "./tie-fixture.js";

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

describe("出口は目的地から絞り、歩く距離で決める", () => {
  it("都庁なら西口", () => {
    const res = recommend(fixture, representative);
    expect(res.ranked[0]!.onward.exit.catalogId).toBe("exit.west");
  });

  it("歌舞伎町なら東口", () => {
    const res = recommend(fixture, {
      ...representative,
      destination: { kind: "catalog", id: "dest.kabukicho" },
    });
    expect(res.ranked[0]!.onward.exit.catalogId).toBe("exit.east");
  });

  it("看板の文字をそのまま持つ", () => {
    const res = recommend(fixture, representative);
    expect(res.ranked[0]!.onward.exit.label).toBe("15");
    expect(res.ranked[0]!.onward.exit.nameJa).toBe("出口 15");
  });

  it("Maps の URL は出口の座標と目的地の表示名で組む", () => {
    const res = recommend(fixture, representative);
    expect(res.ranked[0]!.onward.exit.mapsDirUrl).toBe(
      "https://www.google.com/maps/dir/?api=1" +
        `&origin=${encodeURIComponent("35.6896,139.6985")}` +
        `&destination=${encodeURIComponent("東京都庁")}` +
        "&travelmode=walking",
    );
  });

  it("集合場所から出口までの経路を返す", () => {
    const top = recommend(fixture, representative).ranked[0]!;
    expect(top.onward.pathNodeIds[0]).toBe(top.meeting.nodeId);
    expect(top.onward.pathNodeIds.at(-1)).toBe(top.onward.exit.nodeId);
    expect(top.onward.distanceM).toBeGreaterThan(0);
  });
});

describe("有向辺の出口探索", () => {
  const twoPeople: RecommendationRequest = {
    datasetId: "tokyo.shinjuku-terminal",
    destination: { kind: "catalog", id: "dest.west" },
    participants: [
      { id: "a", entry: { kind: "catalog", id: "entry.a" } },
      { id: "b", entry: { kind: "catalog", id: "entry.b" } },
    ],
  };

  it("集合場所→出口だけ通れる辺を使い、経路は集合場所始まり・出口終わり", () => {
    const top = recommend(directedFixture, twoPeople).ranked[0]!;
    expect(top.onward.pathNodeIds[0]).toBe("m.meet");
    expect(top.onward.pathNodeIds.at(-1)).toBe("e.west");
    expect(top.onward.pathNodeIds).toEqual(["m.meet", "e.west"]);
    expect(top.onward.distanceM).toBe(50);
    expect(top.onward.exit.nodeId).toBe("e.west");
  });

  it("出口→集合場所だけ通れる辺は使わない", () => {
    const trapDest = recommend(directedFixture, {
      ...twoPeople,
      destination: { kind: "catalog", id: "dest.trap" },
    }).ranked[0]!;
    expect(trapDest.onward.exit.nodeId).not.toBe("e.trap");
    expect(trapDest.onward.pathNodeIds).not.toContain("e.trap");
    expect(trapDest.onward.pathNodeIds[0]).toBe("m.meet");
    expect(["e.west", "e.east"]).toContain(trapDest.onward.pathNodeIds.at(-1));
  });

  it("目的地を変えても legs[].distanceM は変わらない", () => {
    const west = recommend(directedFixture, twoPeople);
    const east = recommend(directedFixture, {
      ...twoPeople,
      destination: { kind: "catalog", id: "dest.east" },
    });
    expect(west.ranked[0]!.onward.exit.nodeId).toBe("e.west");
    expect(east.ranked[0]!.onward.exit.nodeId).toBe("e.east");
    expect(east.ranked[0]!.onward.distanceM).toBe(40);

    const distances = (res: ReturnType<typeof recommend>) =>
      Object.fromEntries(res.ranked[0]!.legs.map((l) => [l.participantId, l.distanceM]));
    expect(distances(east)).toEqual(distances(west));
    expect(distances(west)).toEqual({ a: 80, b: 90 });
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

  it("名前のない通路は 1 つの move にまとまる。次数では区切らないので、行き止まり枝を持つ分岐点(branch)も名前や曲がりが無ければ区切りにならない", () => {
    expect(leg.pathNodeIds).toEqual(["g.maru.west", "hall", "u1", "branch", "m.koban"]);
    expect(leg.steps.map((s) => s.nodeId)).not.toContain("u1");
    // "branch" は行き止まり枝(m.board)を持つので実分岐(次数3)だが、次数では
    // steps を区切らない。座標上は g.maru.west → hall で少し曲がる以外まっすぐ
    // なので、hall で 1 度だけ区切られ、u1・branch は素通りして move にまとまる。
    expect(leg.steps.map((s) => s.nodeId)).not.toContain("branch");
    const toHall = leg.steps.find((s) => s.nodeId === "hall")!;
    expect(toHall).toMatchObject({ kind: "move", turn: "slight_right", distanceM: 120 });
    // 最後の landmark(集合地点)までの距離には、素通りした u1→branch→m.koban ぶんが乗る。
    expect(leg.steps.at(-1)).toMatchObject({ nodeId: "m.koban", distanceM: 180 });
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

describe("reasons は 1 位だけ", () => {
  it("2 位以降の reasons は空", () => {
    const res = recommend(fixture, representative);
    expect(res.ranked.length).toBeGreaterThan(1);
    expect(res.ranked[0]!.reasons.length).toBeGreaterThan(0);
    for (const r of res.ranked.slice(1)) {
      expect(r.reasons).toEqual([]);
    }
  });
});

describe("改札の同点は決定的（F7）", () => {
  const tieRequest: RecommendationRequest = {
    datasetId: "tokyo.shinjuku-terminal",
    destination: { kind: "catalog", id: "dest.somewhere" },
    participants: [
      { id: "tie", entry: { kind: "line", id: "line.tie" } },
      { id: "other", entry: { kind: "line", id: "line.b" } },
    ],
  };

  it("同距離のとき z.gate が選ばれる（nodeId の辞書順ではない）", () => {
    const res = recommend(tieFixture, tieRequest);
    const top = res.ranked.find((r) => r.meeting.catalogId === "meet.m")!;
    const tie = top.legs.find((l) => l.participantId === "tie")!;
    expect(tie.entry.nodeId).toBe("z.gate");
    expect(tie.distanceM).toBe(100);
  });

  it("二回実行しても同じ改札が選ばれる", () => {
    const a = recommend(tieFixture, tieRequest);
    const b = recommend(tieFixture, tieRequest);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("infeasible の原因判定（F4）", () => {
  const tieRequest: RecommendationRequest = {
    datasetId: "tokyo.shinjuku-terminal",
    destination: { kind: "catalog", id: "dest.somewhere" },
    participants: [
      { id: "tie", entry: { kind: "line", id: "line.tie" } },
      { id: "other", entry: { kind: "line", id: "line.b" } },
    ],
  };

  it("孤立ノードは制約が無くても unreachable", () => {
    const res = recommend(tieFixture, tieRequest);
    expect(res.infeasible).toContainEqual({
      nodeId: "isolated",
      nameJa: "孤立広場",
      reason: "unreachable",
      textJa: "全員が行ける経路がありません",
    });
  });

  it("出口側の欠けは、制約を緩めても届かないので unreachable のまま（step_free のせいにしない）", () => {
    const res = recommend(tieFixture, {
      ...tieRequest,
      constraints: { accessibility: "step_free" },
    });
    // onlyexit は参加者からは m 経由で届くが、出口への辺が無い。
    // 参加者側だけを見る旧ロジックだと、ここが誤って reason:"step_free" になっていた。
    expect(res.infeasible).toContainEqual({
      nodeId: "onlyexit",
      nameJa: "出口への辺が無い広場",
      reason: "unreachable",
      textJa: "全員が行ける経路がありません",
    });
  });
});

describe("Places の目的地", () => {
  it("place destination で通り、mapsDirUrl の destination がその名前になる", () => {
    const res = recommend(fixture, {
      ...representative,
      destination: { kind: "place", nameJa: "適当な場所", lat: 35.6896, lng: 139.6985 },
    });
    expect(res.ranked.length).toBeGreaterThan(0);
    expect(res.ranked[0]!.onward.exit.mapsDirUrl).toContain(encodeURIComponent("適当な場所"));
  });

  it("同じ座標のプリセットと place で、出口と onward が一致する（座標だけが効いていることの証拠）", () => {
    // dest.tokyo-metropolitan-government: lat 35.6896, lng 139.6917（fixture.ts）
    const preset = recommend(fixture, representative);
    const place = recommend(fixture, {
      ...representative,
      destination: { kind: "place", nameJa: "別の名前で呼んでも", lat: 35.6896, lng: 139.6917 },
    });
    expect(place.ranked[0]!.meeting.nodeId).toBe(preset.ranked[0]!.meeting.nodeId);
    expect(place.ranked[0]!.onward.exit.catalogId).toBe(preset.ranked[0]!.onward.exit.catalogId);
    expect(place.ranked[0]!.onward.distanceM).toBe(preset.ranked[0]!.onward.distanceM);
    expect(place.ranked[0]!.onward.pathNodeIds).toEqual(preset.ranked[0]!.onward.pathNodeIds);
  });
});

describe("設備 facilities（順位には使わない）", () => {
  it("50m 以内かどうかの真偽と、届かない(null)場合の false", () => {
    const res = recommend(fixture, representative);
    const byId = Object.fromEntries(res.ranked.map((r) => [r.meeting.nodeId, r.meeting.facilities]));
    // m.koban: elevatorM=50(境界→true) restroomM=50.1(超える→false)
    expect(byId["m.koban"]).toMatchObject({ elevator: true, restroom: false });
    // m.board: elevatorM=null(届かない→false) restroomM=10(→true)
    expect(byId["m.board"]).toMatchObject({ elevator: false, restroom: true });
    // m.south: elevatorM=80(超える→false) restroomM=0(境界→true)
    expect(byId["m.south"]).toMatchObject({ elevator: false, restroom: true });
  });

  it("設備は順位を変えない: 代表ケースの ranked 順はゴールデンのまま", () => {
    const res = recommend(fixture, representative);
    expect(res.ranked.map((r) => r.meeting.nodeId)).toEqual(["m.board", "m.south", "m.koban"]);
  });

  it("accessibility: step_free では ranked 全件の stepFree が true", () => {
    const res = recommend(fixture, { ...representative, constraints: { accessibility: "step_free" } });
    expect(res.ranked.length).toBeGreaterThan(0);
    expect(res.ranked.every((r) => r.meeting.facilities.stepFree)).toBe(true);
  });

  it("accessibility: any では、階段しか経路が無い候補だけ stepFree が false", () => {
    // branch→m.south は階段(vertical:'stairs')の1本だけ。m.board/m.koban への
    // 経路には階段が無いので、any でも stepFree のまま true。
    const res = recommend(fixture, representative);
    const byId = Object.fromEntries(
      res.ranked.map((r) => [r.meeting.nodeId, r.meeting.facilities.stepFree]),
    );
    expect(byId["m.south"]).toBe(false);
    expect(byId["m.board"]).toBe(true);
    expect(byId["m.koban"]).toBe(true);
  });
});
