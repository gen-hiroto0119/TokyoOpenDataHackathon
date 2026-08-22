// ルームの状態から推薦を作る部分。docs/ROOM.md の GET /v1/rooms/:id/recommendations。
//
// index.ts に置かないのは wrangler の制約のため: Worker のメインモジュールは
// 関数・クラス以外の named export（DEFAULT_ROOM_RECOMMENDATIONS_LIMIT のような値）を
// エントリポイント候補として拒否し、起動できなくなる。

import type { RecommendationResponse } from "./contract.js";
import type { Dataset } from "./graph.js";
import { recommend } from "./recommend.js";
import { RoomError, type Room } from "./room.js";

/** `GET /v1/rooms/:id/recommendations` の既定件数。docs/ROOM.md のとおり。 */
export const DEFAULT_ROOM_RECOMMENDATIONS_LIMIT = 10;

/** `?limit` を読む。無い・数でない・0 以下のときは既定値にする。 */
export function parseRoomRecommendationsLimit(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_ROOM_RECOMMENDATIONS_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return DEFAULT_ROOM_RECOMMENDATIONS_LIMIT;
  return n;
}

/**
 * `ranked` を上位 `limit` 件に絞る。`rank` の値は詰め直さず元のまま残す
 * （画面が知りたいのは全候補中の順位であって、切り詰め後の並び順ではない）。
 * 決まっている集合場所が絞った先に無ければ、末尾に足す。`infeasible` は絞らない。
 */
export function limitRanked(
  response: RecommendationResponse,
  meetingNodeId: string | null,
  limit: number,
): RecommendationResponse {
  const ranked = response.ranked.slice(0, limit);
  if (meetingNodeId !== null && !ranked.some((r) => r.meeting.nodeId === meetingNodeId)) {
    const chosen = response.ranked.find((r) => r.meeting.nodeId === meetingNodeId);
    if (chosen) ranked.push(chosen);
  }
  return { ...response, ranked };
}

/**
 * ルームの状態から推薦を作る。保存しない。人が増えたり到着情報が変わるたびに
 * 変わるので、都度計算する。Hono のコンテキストに依らない純関数にして、
 * HTTP を経由せずテストできるようにする。
 */
export function buildRoomRecommendations(ds: Dataset, room: Room, limit: number): RecommendationResponse {
  if (room.destination.catalogId === null) {
    throw new RoomError("preset_destination_required", "目的地がプリセットではありません");
  }

  const ready = room.participants.filter((p) => p.entry !== null);
  if (ready.length < 2) {
    throw new RoomError("not_enough_participants", "到着情報がそろっていません", {
      waitingFor: room.participants.filter((p) => p.entry === null).map((p) => p.id),
    });
  }

  const res = recommend(ds, {
    datasetId: room.datasetId,
    destination: { kind: "catalog", id: room.destination.catalogId },
    participants: ready.map((p) => ({
      id: p.id,
      entry: p.entry!,
      ...(p.confirmed ? { confirmed: p.confirmed } : {}),
    })),
  });
  return limitRanked(res, room.meetingNodeId, limit);
}
