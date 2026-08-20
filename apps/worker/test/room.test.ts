import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
  CreateRoomSchema,
  DEFAULT_TTL_MS,
  DestinationSchema,
  EntryRefSchema,
  MAX_NAME_LENGTH,
  MAX_TTL_MS,
  NameSchema,
  NodeRefSchema,
  ReportSchema,
  RoomError,
  UpdateParticipantSchema,
  bearerOf,
  hashToken,
  resolveExpiry,
  statusOf,
} from "../src/room.js";

const NOW = Date.parse("2026-08-17T10:00:00.000Z");
const ok = <S extends v.GenericSchema>(s: S, x: unknown) => v.parse(s, x);
const ng = <S extends v.GenericSchema>(s: S, x: unknown) => () => v.parse(s, x);

describe("名前", () => {
  it("前後の空白と連続空白をならす", () => {
    expect(ok(NameSchema, "  ひろと　 ")).toBe("ひろと");
    expect(ok(NameSchema, "か  いる")).toBe("か いる");
  });

  it("空は受け取らない", () => {
    expect(ng(NameSchema, "   ")).toThrow();
    expect(ng(NameSchema, undefined)).toThrow();
  });

  it("長すぎるものは受け取らない", () => {
    expect(ng(NameSchema, "あ".repeat(MAX_NAME_LENGTH + 1))).toThrow();
    expect(ok(NameSchema, "あ".repeat(MAX_NAME_LENGTH))).toHaveLength(MAX_NAME_LENGTH);
  });
});

describe("行き先", () => {
  it("名前と緯度経度が要る。catalogId は省略できる", () => {
    expect(ok(DestinationSchema, { nameJa: "東京都庁", lat: 35.6895, lng: 139.6917 })).toEqual({
      catalogId: null,
      nameJa: "東京都庁",
      lat: 35.6895,
      lng: 139.6917,
    });
  });

  it("位置が無いものは受け取らない", () => {
    expect(ng(DestinationSchema, { nameJa: "東京都庁" })).toThrow();
    expect(ng(DestinationSchema, undefined)).toThrow();
  });
});

describe("期限", () => {
  it("省略すると既定の長さになる", () => {
    expect(resolveExpiry(undefined, NOW)).toBe(new Date(NOW + DEFAULT_TTL_MS).toISOString());
  });

  it("過ぎた時刻は受け取らない", () => {
    expect(() => resolveExpiry(new Date(NOW - 1000).toISOString(), NOW)).toThrow(RoomError);
  });

  it("上限を超えるものは受け取らない", () => {
    expect(() => resolveExpiry(new Date(NOW + MAX_TTL_MS + 1000).toISOString(), NOW)).toThrow(
      RoomError,
    );
    const edge = new Date(NOW + MAX_TTL_MS).toISOString();
    expect(resolveExpiry(edge, NOW)).toBe(edge);
  });
});

describe("到着情報", () => {
  it("路線・改札・ノードを受け取る", () => {
    expect(ok(EntryRefSchema, { kind: "line", id: "line.jr" })).toEqual({
      kind: "line",
      id: "line.jr",
    });
  });

  it("知らない種別は受け取らない", () => {
    expect(ng(EntryRefSchema, { kind: "station", id: "x" })).toThrow();
    expect(ng(EntryRefSchema, { kind: "line", id: "" })).toThrow();
  });

  it("確認した場所はノードだけ", () => {
    expect(ok(NodeRefSchema, { kind: "node", id: "n1" })).toEqual({ kind: "node", id: "n1" });
    expect(ng(NodeRefSchema, { kind: "line", id: "line.jr" })).toThrow();
  });

  it("申告は3つだけ", () => {
    expect(ok(ReportSchema, "late")).toBe("late");
    expect(ng(ReportSchema, "maybe")).toThrow();
  });

  it("更新は部分的でよく、null で消せる", () => {
    expect(ok(UpdateParticipantSchema, {})).toEqual({});
    expect(ok(UpdateParticipantSchema, { report: null })).toEqual({ report: null });
    expect(ok(UpdateParticipantSchema, { entry: { kind: "line", id: "line.keio" } })).toEqual({
      entry: { kind: "line", id: "line.keio" },
    });
  });
});

describe("ルーム作成", () => {
  it("主催者の名前と行き先が要る", () => {
    const parsed = ok(CreateRoomSchema, {
      hostNameJa: " ひろと ",
      destination: { nameJa: "東京都庁", lat: 35.6895, lng: 139.6917 },
    });
    expect(parsed.hostNameJa).toBe("ひろと");
    expect(parsed.expiresAt).toBeUndefined();
  });

  it("名前が無いと通らない", () => {
    expect(
      ng(CreateRoomSchema, { destination: { nameJa: "東京都庁", lat: 35.6, lng: 139.6 } }),
    ).toThrow();
  });
});

describe("トークン", () => {
  it("同じ値からは同じハッシュ、違う値からは違うハッシュ", async () => {
    const a = await hashToken("abc");
    expect(a).toBe(await hashToken("abc"));
    expect(a).not.toBe(await hashToken("abd"));
    expect(a).toHaveLength(64);
  });

  it("Bearer を読む", () => {
    expect(bearerOf("Bearer  tok-1 ")).toBe("tok-1");
    expect(bearerOf("bearer tok-2")).toBe("tok-2");
    expect(bearerOf("Basic tok")).toBeNull();
    expect(bearerOf(null)).toBeNull();
  });
});

describe("エラーの対応", () => {
  it("docs/ROOM.md の表と一致する", () => {
    expect(statusOf("invalid_request")).toBe(400);
    expect(statusOf("unauthorized")).toBe(401);
    expect(statusOf("forbidden")).toBe(403);
    expect(statusOf("room_not_found")).toBe(404);
    expect(statusOf("not_enough_participants")).toBe(409);
    expect(statusOf("room_expired")).toBe(410);
  });
});
