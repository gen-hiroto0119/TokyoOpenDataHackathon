// docs/ROOM.md の状態と HTTP 契約。
// ここが正本ではない。docs を直してからここを直す。
//
// 入力の検証は Valibot のスキーマで行い、型はそこから導く。
// 手で書いた型とスキーマが二重にならないようにする。

import * as v from "valibot";

// ---------------------------------------------------------------- 制約

/** 期限を省略したときの長さ。待ち合わせ一件ぶん。 */
export const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

/** 期限の上限。これより先は受け取らない。個人の申告を残し続けない。 */
export const MAX_TTL_MS = 24 * 60 * 60 * 1000;

/** 名前の長さ。画面に収まる範囲。 */
export const MAX_NAME_LENGTH = 24;

// ---------------------------------------------------------------- スキーマ

/** 前後の空白を落とし、連続する空白を 1 つにする。全角空白も空白として扱う。 */
export const NameSchema = v.pipe(
  v.string("名前を入れてください"),
  v.transform((s) => s.replace(/\s+/gu, " ").trim()),
  v.minLength(1, "名前を入れてください"),
  v.maxLength(MAX_NAME_LENGTH, `名前は${MAX_NAME_LENGTH}文字までです`),
);

export const EntryRefSchema = v.object({
  kind: v.picklist(["line", "catalog", "node"], "到着情報が読めません"),
  id: v.pipe(v.string("到着情報が読めません"), v.minLength(1, "到着情報が読めません")),
});

export const NodeRefSchema = v.object({
  kind: v.literal("node", "確認した場所が読めません"),
  id: v.pipe(v.string("確認した場所が読めません"), v.minLength(1, "確認した場所が読めません")),
});

export const ReportSchema = v.picklist(["early", "on_time", "late"], "到着申告が読めません");

export const DestinationSchema = v.object({
  catalogId: v.nullish(v.string(), null),
  nameJa: v.pipe(v.string("行き先を入れてください"), v.trim(), v.minLength(1, "行き先を入れてください")),
  lat: v.pipe(v.number("行き先の位置が読めません"), v.finite("行き先の位置が読めません")),
  lng: v.pipe(v.number("行き先の位置が読めません"), v.finite("行き先の位置が読めません")),
});

const IsoDateSchema = v.pipe(v.string("期限が読めません"), v.isoTimestamp("期限が読めません"));

export const CreateRoomSchema = v.object({
  hostNameJa: NameSchema,
  destination: DestinationSchema,
  expiresAt: v.optional(IsoDateSchema),
});

export const JoinSchema = v.object({ nameJa: NameSchema });

export const UpdateParticipantSchema = v.partial(
  v.object({
    nameJa: NameSchema,
    entry: v.nullable(EntryRefSchema),
    confirmed: v.nullable(NodeRefSchema),
    report: v.nullable(ReportSchema),
  }),
);

export const UpdateRoomSchema = v.partial(
  v.object({
    destination: DestinationSchema,
    expiresAt: IsoDateSchema,
    meetingNodeId: v.nullable(v.string()),
  }),
);

// ---------------------------------------------------------------- 型

export type RoomRole = "host" | "guest";
export type ArrivalReport = v.InferOutput<typeof ReportSchema>;
export type Destination = v.InferOutput<typeof DestinationSchema>;
export type EntryRef = v.InferOutput<typeof EntryRefSchema>;
export type NodeRef = v.InferOutput<typeof NodeRefSchema>;

export type CreateRoomInput = v.InferOutput<typeof CreateRoomSchema>;
export type JoinInput = v.InferOutput<typeof JoinSchema>;
export type UpdateParticipantInput = v.InferOutput<typeof UpdateParticipantSchema>;
export type UpdateRoomInput = v.InferOutput<typeof UpdateRoomSchema>;

export type Participant = {
  id: string;
  nameJa: string;
  role: RoomRole;
  /** 到着する路線か改札。未入力のうちは null。 */
  entry: EntryRef | null;
  /** 現地で確認したノード。経路の再計算に使う。 */
  confirmed: NodeRef | null;
  /** 本人の申告。位置情報からは判断しない。 */
  report: ArrivalReport | null;
  joinedAt: string;
  updatedAt: string;
};

export type Room = {
  id: string;
  datasetId: "tokyo.shinjuku-terminal";
  destination: Destination;
  /** 主催者が決めた集合場所。決まるまで null。 */
  meetingNodeId: string | null;
  expiresAt: string;
  participants: Participant[];
  createdAt: string;
  updatedAt: string;
};

export type CreateRoomResult = {
  room: Room;
  /** 一度だけ返す。以後は再発行しない。 */
  hostToken: string;
  participantId: string;
  inviteUrl: string;
};

export type JoinResult = {
  room: Room;
  participantId: string;
  participantToken: string;
};

// ---------------------------------------------------------------- エラー

export type RoomErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "room_not_found"
  | "not_enough_participants"
  | "preset_destination_required"
  | "room_expired";

export type RoomErrorResponse = {
  code: RoomErrorCode;
  messageJa: string;
  details?: Record<string, unknown>;
};

export class RoomError extends Error {
  constructor(
    readonly code: RoomErrorCode,
    readonly messageJa: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export function statusOf(code: RoomErrorCode): 400 | 401 | 403 | 404 | 409 | 410 {
  switch (code) {
    case "invalid_request":
      return 400;
    case "unauthorized":
      return 401;
    case "forbidden":
      return 403;
    case "room_not_found":
      return 404;
    case "not_enough_participants":
    case "preset_destination_required":
      return 409;
    case "room_expired":
      return 410;
  }
}

// ---------------------------------------------------------------- 規則

/**
 * 期限を決める。省略なら既定、上限を超えるものは受け取らない。
 * 形はスキーマが見る。ここが見るのは「いまから見て妥当か」だけ。
 */
export function resolveExpiry(raw: string | undefined, nowMs: number): string {
  if (raw === undefined) {
    return new Date(nowMs + DEFAULT_TTL_MS).toISOString();
  }
  const at = Date.parse(raw);
  if (Number.isNaN(at)) {
    throw new RoomError("invalid_request", "期限が読めません");
  }
  if (at <= nowMs) {
    throw new RoomError("invalid_request", "期限が過ぎています");
  }
  if (at - nowMs > MAX_TTL_MS) {
    throw new RoomError("invalid_request", "期限は24時間先までです");
  }
  return new Date(at).toISOString();
}

// ---------------------------------------------------------------- トークン

/**
 * 保存するのはハッシュだけ。平文は発行したときに一度返すだけで持たない。
 * ストレージが漏れてもトークンとして使えないようにする。
 */
export async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function bearerOf(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1]!.trim() : null;
}
