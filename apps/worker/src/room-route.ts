// 決まった集合場所の経路。POST /v1/routes と GET /v1/rooms/:id/route。
//
// index.ts に置かないのは wrangler の制約のため: Worker のメインモジュールは
// 関数・クラス以外の named export をエントリポイント候補として拒否し、
// 起動できなくなる。

import type { RecommendationResponse, RouteMeetingRef, RouteResponse } from "./contract.js";
import type { Dataset } from "./graph.js";
import { RecommendError } from "./recommend.js";
import { attachRouteMap } from "./route-map.js";
import { DEFAULT_ROOM_RECOMMENDATIONS_LIMIT, buildRoomRecommendations } from "./room-recommendations.js";
import { RoomError, type Room } from "./room.js";

function rankedOf(
  ranked: RecommendationResponse["ranked"],
  meeting: RouteMeetingRef,
): RecommendationResponse["ranked"][number] | undefined {
  switch (meeting.kind) {
    case "catalog":
      return ranked.find((row) => row.meeting.catalogId === meeting.id);
    case "node":
      return ranked.find((row) => row.meeting.nodeId === meeting.id);
    default: {
      const _exhaustive: never = meeting;
      return _exhaustive;
    }
  }
}

function infeasibleOf(
  infeasible: RecommendationResponse["infeasible"],
  meeting: RouteMeetingRef,
): RecommendationResponse["infeasible"][number] | undefined {
  switch (meeting.kind) {
    case "catalog":
      // infeasible は catalogId を持たない。カタログ参照は ranked だけで見る。
      return undefined;
    case "node":
      return infeasible.find((row) => row.nodeId === meeting.id);
    default: {
      const _exhaustive: never = meeting;
      return _exhaustive;
    }
  }
}

function unknownMeeting(meeting: RouteMeetingRef): never {
  switch (meeting.kind) {
    case "catalog":
      throw new RecommendError("unknown_catalog", "集合場所が見つかりません", {
        catalogId: meeting.id,
      });
    case "node":
      throw new RecommendError("unknown_node", "集合場所が見つかりません", { nodeId: meeting.id });
    default: {
      const _exhaustive: never = meeting;
      throw new Error(String(_exhaustive));
    }
  }
}

function meetingRefOf(room: Room): RouteMeetingRef {
  if (!room.meetingCatalogId) {
    throw new RoomError("invalid_request", "集合場所が決まっていません");
  }
  return { kind: "catalog", id: room.meetingCatalogId };
}

/**
 * 推薦結果から、指定した集合場所 1 件の経路を取り出す。
 */
export function pickRoute(
  response: RecommendationResponse,
  meeting: RouteMeetingRef,
): Omit<RouteResponse, "map"> {
  const chosen = rankedOf(response.ranked, meeting);
  if (chosen) {
    return {
      dataset: response.dataset,
      walkingSpeedMps: response.walkingSpeedMps,
      rank: chosen.rank,
      meeting: chosen.meeting,
      scores: chosen.scores,
      reasons: chosen.reasons,
      legs: chosen.legs,
      onward: chosen.onward,
    };
  }
  if (infeasibleOf(response.infeasible, meeting)) {
    throw new RecommendError("no_feasible_meeting", "条件を満たす集合場所がありません");
  }
  return unknownMeeting(meeting);
}

/**
 * ルームの状態から、決まっている集合場所の経路を作る。保存しない。
 * `meeting` が無ければ `room.meetingCatalogId` を使う。Hono のコンテキストに依らない
 * 純関数にして、HTTP を経由せずテストできるようにする。
 */
export function buildRoomRoute(ds: Dataset, room: Room, meeting?: RouteMeetingRef): RouteResponse {
  const ref = meeting ?? meetingRefOf(room);
  return attachRouteMap(ds, pickRoute(buildRoomRecommendations(ds, room, DEFAULT_ROOM_RECOMMENDATIONS_LIMIT), ref));
}
