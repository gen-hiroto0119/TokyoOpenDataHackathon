import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM_RECOMMENDATIONS_LIMIT,
  buildRoomRecommendations,
  limitRanked,
  parseRoomRecommendationsLimit,
} from "../src/room-recommendations.js";
import type { Room } from "../src/room.js";
import { fixture } from "./fixture.js";

/**
 * ルームの状態から推薦を作る部分（`buildRoomRecommendations` / `limitRanked` /
 * `parseRoomRecommendationsLimit`）のテスト。index.ts の Hono の口は Durable
 * Object を介するため、HTTP を経由せずここで純関数として直接叩く
 * （research-verify.md「F4/F5 のテスト」の指示どおり）。
 */
const NOW = new Date().toISOString();

function participant(id: string, entryId: string): Room["participants"][number] {
  return {
    id,
    nameJa: id,
    role: "guest",
    entry: { kind: "line", id: entryId },
    confirmed: null,
    report: null,
    joinedAt: NOW,
    updatedAt: NOW,
  };
}

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    datasetId: "tokyo.shinjuku-terminal",
    destination: {
      catalogId: "dest.tokyo-metropolitan-government",
      nameJa: "東京都庁",
      lat: 35.6896,
      lng: 139.6917,
    },
    meetingNodeId: null,
    expiresAt: NOW,
    participants: [participant("jr", "line.jr"), participant("keio", "line.keio")],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("parseRoomRecommendationsLimit", () => {
  it("省略時は既定値(10)", () => {
    expect(parseRoomRecommendationsLimit(undefined)).toBe(DEFAULT_ROOM_RECOMMENDATIONS_LIMIT);
    expect(DEFAULT_ROOM_RECOMMENDATIONS_LIMIT).toBe(10);
  });

  it("正の整数はそのまま使う", () => {
    expect(parseRoomRecommendationsLimit("1")).toBe(1);
    expect(parseRoomRecommendationsLimit("3")).toBe(3);
  });

  it("0以下・数でない・整数でないものは既定値にする", () => {
    expect(parseRoomRecommendationsLimit("0")).toBe(DEFAULT_ROOM_RECOMMENDATIONS_LIMIT);
    expect(parseRoomRecommendationsLimit("-1")).toBe(DEFAULT_ROOM_RECOMMENDATIONS_LIMIT);
    expect(parseRoomRecommendationsLimit("abc")).toBe(DEFAULT_ROOM_RECOMMENDATIONS_LIMIT);
    expect(parseRoomRecommendationsLimit("1.5")).toBe(DEFAULT_ROOM_RECOMMENDATIONS_LIMIT);
  });
});

describe("limitRanked", () => {
  const response = {
    dataset: { id: "tokyo.shinjuku-terminal" as const, version: "v", graphHash: "h", attributionJa: "a" },
    walkingSpeedMps: 1.2,
    ranked: [
      { rank: 1, meeting: { nodeId: "m1" } },
      { rank: 2, meeting: { nodeId: "m2" } },
      { rank: 3, meeting: { nodeId: "m3" } },
    ],
    infeasible: [{ nodeId: "x1", nameJa: "x", reason: "unreachable" as const, textJa: "t" }],
    // biome-ignore lint: テスト用の簡略な形。limitRanked は meeting.nodeId と rank しか見ない。
  } as any;

  it("上位 limit 件に絞り、rank 値はそのまま", () => {
    const out = limitRanked(response, null, 2);
    expect(out.ranked.map((r: any) => r.rank)).toEqual([1, 2]);
  });

  it("meetingNodeId が圏外なら末尾に足す（rank は元のまま）", () => {
    const out = limitRanked(response, "m3", 1);
    expect(out.ranked.map((r: any) => r.rank)).toEqual([1, 3]);
  });

  it("meetingNodeId が圏内ならそのまま（重複しない）", () => {
    const out = limitRanked(response, "m2", 2);
    expect(out.ranked.map((r: any) => r.rank)).toEqual([1, 2]);
  });

  it("infeasible は絞らない", () => {
    const out = limitRanked(response, null, 1);
    expect(out.infeasible).toEqual(response.infeasible);
  });
});

describe("buildRoomRecommendations", () => {
  it("目的地が Places 由来（catalogId が null）でも 200 で返る（旧 preset_destination_required の回帰）", () => {
    const room = makeRoom({
      destination: { catalogId: null, nameJa: "適当な場所", lat: 35.6896, lng: 139.6985 },
    });
    const res = buildRoomRecommendations(fixture, room, 10);
    expect(res.ranked.length).toBeGreaterThan(0);
    expect(res.ranked[0]!.onward.exit.mapsDirUrl).toContain(encodeURIComponent("適当な場所"));
  });

  it("到着情報が2人未満だと not_enough_participants", () => {
    const room = makeRoom({ participants: [participant("jr", "line.jr")] });
    expect(() => buildRoomRecommendations(fixture, room, 10)).toThrowError(
      expect.objectContaining({ code: "not_enough_participants" }),
    );
  });

  it("POST /v1/recommendations と同じ形で返る", () => {
    const room = makeRoom({
      participants: [
        participant("jr", "line.jr"),
        participant("keio", "line.keio"),
        participant("marunouchi", "line.marunouchi"),
      ],
    });
    const res = buildRoomRecommendations(fixture, room, 10);
    expect(res.ranked.map((r) => r.meeting.nodeId)).toEqual(["m.board", "m.south", "m.koban"]);
    expect(res.infeasible).toEqual([]);
  });

  it("?limit で上位に絞る", () => {
    const room = makeRoom({
      participants: [
        participant("jr", "line.jr"),
        participant("keio", "line.keio"),
        participant("marunouchi", "line.marunouchi"),
      ],
    });
    const res = buildRoomRecommendations(fixture, room, 1);
    expect(res.ranked.map((r) => r.meeting.nodeId)).toEqual(["m.board"]);
    expect(res.ranked[0]!.rank).toBe(1);
  });

  it("meetingNodeId が絞った先に無ければ末尾に足す", () => {
    const room = makeRoom({
      meetingNodeId: "m.koban",
      participants: [
        participant("jr", "line.jr"),
        participant("keio", "line.keio"),
        participant("marunouchi", "line.marunouchi"),
      ],
    });
    const res = buildRoomRecommendations(fixture, room, 1);
    expect(res.ranked.map((r) => r.meeting.nodeId)).toEqual(["m.board", "m.koban"]);
    expect(res.ranked[0]!.rank).toBe(1);
    expect(res.ranked[1]!.rank).toBe(3);
  });
});
