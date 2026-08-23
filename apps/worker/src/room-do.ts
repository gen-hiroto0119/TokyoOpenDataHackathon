// ルーム 1 件ぶんの状態。Durable Object。
// 計算は持たない。

import {
  RoomError,
  bearerOf,
  hashToken,
  resolveExpiry,
  statusOf,
  type CreateRoomInput,
  type CreateRoomResult,
  type JoinInput,
  type JoinResult,
  type Participant,
  type Room,
  type UpdateParticipantInput,
  type UpdateRoomInput,
} from "./room.js";

/** 保存する形。トークンはハッシュだけを持つ。 */
type Stored = {
  room: Room;
  /** participantId -> トークンのハッシュ。 */
  tokens: Record<string, string>;
};

const KEY = "room";

export class RoomObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: unknown,
  ) {
    // ping には pong を自動応答する。休止中でも起こさずに済む。
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  private async load(): Promise<Stored | null> {
    return (await this.state.storage.get<Stored>(KEY)) ?? null;
  }

  private async save(stored: Stored): Promise<void> {
    await this.state.storage.put(KEY, stored);
    // 期限に消す。更新のたびに張り直す。
    await this.state.storage.setAlarm(Date.parse(stored.room.expiresAt));
    this.broadcast({ type: "room_updated", updatedAt: stored.room.updatedAt });
  }

  /** 状態が変わったことだけを押す。中身は取り直させる。 */
  private broadcast(payload: { type: "room_updated"; updatedAt: string }): void {
    const message = JSON.stringify(payload);
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(message);
      } catch {
        // 送れない接続は無視する。片付けは webSocketClose/Error に任せる。
      }
    }
  }

  /**
   * 期限切れ(4410)・解散(4404)で全接続を閉じる。
   * close の送信はすぐには完了しない。呼び出し側はこの直後に
   * `storage.deleteAll()` で DO 自体を消すため、先に消してしまうと
   * 閉じたフレームが送り出される前に破棄されうる。一呼吸だけ待つ。
   */
  private async closeAll(code: number, reason: string): Promise<void> {
    const sockets = this.state.getWebSockets();
    if (sockets.length === 0) return;
    for (const ws of sockets) {
      try {
        ws.close(code, reason);
      } catch {
        // すでに閉じている接続は無視する。
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  /** 期限を過ぎたルームは消える。alarm が遅れても読ませない。 */
  private alive(stored: Stored | null, nowMs: number): Stored {
    if (!stored) throw new RoomError("room_not_found", "ルームが見つかりません");
    if (Date.parse(stored.room.expiresAt) <= nowMs) {
      throw new RoomError("room_expired", "このルームは期限が過ぎています");
    }
    return stored;
  }

  private async authorize(stored: Stored, header: string | null): Promise<Participant> {
    const token = bearerOf(header);
    if (!token) throw new RoomError("unauthorized", "権限がありません");
    const digest = await hashToken(token);
    const id = Object.keys(stored.tokens).find((pid) => stored.tokens[pid] === digest);
    if (!id) throw new RoomError("unauthorized", "権限がありません");
    const participant = stored.room.participants.find((p) => p.id === id);
    if (!participant) throw new RoomError("unauthorized", "権限がありません");
    return participant;
  }

  async alarm(): Promise<void> {
    await this.closeAll(4410, "room_expired");
    await this.state.storage.deleteAll();
  }

  // ------------------------------------------------------- WebSocket Hibernation

  /** クライアントからのメッセージは読まない。 */
  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {}

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // すでに閉じている。
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    try {
      ws.close();
    } catch {
      // すでに閉じている。
    }
  }

  async fetch(request: Request): Promise<Response> {
    try {
      return await this.route(request);
    } catch (error) {
      if (error instanceof RoomError) {
        return Response.json(
          error.details
            ? { code: error.code, messageJa: error.messageJa, details: error.details }
            : { code: error.code, messageJa: error.messageJa },
          { status: statusOf(error.code) },
        );
      }
      throw error;
    }
  }

  private async route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const auth = request.headers.get("Authorization");
    const now = new Date();
    const nowMs = now.getTime();
    const iso = now.toISOString();

    // 作成。ここだけ状態が無い状態で呼ばれる。
    if (request.method === "POST" && path === "/create") {
      if (await this.load()) {
        throw new RoomError("invalid_request", "このルームはすでにあります");
      }
      // 形は Worker のスキーマが見ている。ここが見るのは時刻の妥当性だけ。
      const body = (await request.json()) as CreateRoomInput;
      const expiresAt = resolveExpiry(body.expiresAt, nowMs);
      const roomId = url.searchParams.get("roomId");
      const inviteUrl = url.searchParams.get("inviteUrl");
      if (!roomId || !inviteUrl) throw new RoomError("invalid_request", "ルーム ID がありません");

      const participantId = crypto.randomUUID();
      const hostToken = crypto.randomUUID();
      const host: Participant = {
        id: participantId,
        nameJa: body.hostNameJa,
        role: "host",
        entry: null,
        confirmed: null,
        report: null,
        joinedAt: iso,
        updatedAt: iso,
      };
      const room: Room = {
        id: roomId,
        datasetId: "tokyo.shinjuku-terminal",
        destination: body.destination,
        meetingNodeId: null,
        expiresAt,
        participants: [host],
        createdAt: iso,
        updatedAt: iso,
      };
      await this.save({ room, tokens: { [participantId]: await hashToken(hostToken) } });
      const res: CreateRoomResult = { room, hostToken, participantId, inviteUrl };
      return Response.json(res, { status: 201 });
    }

    const stored = this.alive(await this.load(), nowMs);

    // 読み取り。トークンは要らない。
    if (request.method === "GET" && path === "/") {
      return Response.json(stored.room);
    }

    // 通知。状態は流さず「変わった」だけを押す。読み取りと同じくトークンは要らない。
    if (request.method === "GET" && path === "/ws") {
      const upgrade = request.headers.get("Upgrade");
      if (!upgrade || upgrade.toLowerCase() !== "websocket") {
        throw new RoomError("invalid_request", "WebSocket 接続だけを受け付けます");
      }
      const { 0: client, 1: server } = new WebSocketPair();
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "POST" && path === "/participants") {
      const body = (await request.json()) as JoinInput;
      const participantId = crypto.randomUUID();
      const participantToken = crypto.randomUUID();
      stored.room.participants.push({
        id: participantId,
        nameJa: body.nameJa,
        role: "guest",
        entry: null,
        confirmed: null,
        report: null,
        joinedAt: iso,
        updatedAt: iso,
      });
      stored.room.updatedAt = iso;
      stored.tokens[participantId] = await hashToken(participantToken);
      await this.save(stored);
      const res: JoinResult = { room: stored.room, participantId, participantToken };
      return Response.json(res, { status: 201 });
    }

    const participantMatch = /^\/participants\/([^/]+)$/.exec(path);
    if (participantMatch) {
      const targetId = participantMatch[1]!;
      const me = await this.authorize(stored, auth);
      const target = stored.room.participants.find((p) => p.id === targetId);
      if (!target) throw new RoomError("room_not_found", "その参加者はいません");

      if (request.method === "PATCH") {
        // 主催者でも他人の到着情報は書けない。申告は本人のもの。
        if (me.id !== target.id) {
          throw new RoomError("forbidden", "他の人の到着情報は変えられません");
        }
        const body = (await request.json()) as UpdateParticipantInput;
        if (body.nameJa !== undefined) target.nameJa = body.nameJa;
        if ("entry" in body) target.entry = body.entry ?? null;
        if ("confirmed" in body) target.confirmed = body.confirmed ?? null;
        if ("report" in body) target.report = body.report ?? null;
        target.updatedAt = iso;
        stored.room.updatedAt = iso;
        await this.save(stored);
        return Response.json(stored.room);
      }

      if (request.method === "DELETE") {
        if (me.id !== target.id && me.role !== "host") {
          throw new RoomError("forbidden", "他の人は外せません");
        }
        // 主催者が抜けるとルームごと終わる。残った人だけでは決められない。
        if (target.role === "host") {
          await this.closeAll(4404, "room_dissolved");
          await this.state.storage.deleteAll();
          return new Response(null, { status: 204 });
        }
        stored.room.participants = stored.room.participants.filter((p) => p.id !== target.id);
        delete stored.tokens[target.id];
        stored.room.updatedAt = iso;
        await this.save(stored);
        return Response.json(stored.room);
      }
    }

    if (path === "/") {
      const me = await this.authorize(stored, auth);
      if (me.role !== "host") throw new RoomError("forbidden", "主催者だけができます");

      if (request.method === "PATCH") {
        const body = (await request.json()) as UpdateRoomInput;
        if (body.destination !== undefined) stored.room.destination = body.destination;
        if (body.expiresAt !== undefined) {
          stored.room.expiresAt = resolveExpiry(body.expiresAt, nowMs);
        }
        if ("meetingNodeId" in body) stored.room.meetingNodeId = body.meetingNodeId ?? null;
        stored.room.updatedAt = iso;
        await this.save(stored);
        return Response.json(stored.room);
      }

      if (request.method === "DELETE") {
        await this.closeAll(4404, "room_dissolved");
        await this.state.storage.deleteAll();
        return new Response(null, { status: 204 });
      }
    }

    throw new RoomError("room_not_found", "その口はありません");
  }
}
