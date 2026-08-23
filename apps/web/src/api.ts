// HTTP だけを知る。localStorage は session.ts の仕事。
// パスはすべて相対(同一 origin 前提)。base URL は要らない —
// dev は Vite のプロキシが、本番は 1 origin が吸収する。
//
// 型は worker からの type-only import。hono/client は使わない
// (AppType が DurableObjectNamespace を参照し、web の tsc が解決できないため)。
import type {
  CatalogResponse,
  ExitReportResponse,
  LandmarksResponse,
  RecommendationResponse,
} from "worker/src/contract.js";
import type {
  CreateRoomInput,
  CreateRoomResult,
  JoinResult,
  Room,
  RoomErrorResponse,
  UpdateParticipantInput,
  UpdateRoomInput,
} from "worker/src/room.js";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: RoomErrorResponse,
  ) {
    super(body.messageJa);
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body as RoomErrorResponse);
  return body as T;
}

export const api = {
  catalog: () => request<CatalogResponse>("/v1/catalog"),
  createRoom: (input: CreateRoomInput) =>
    request<CreateRoomResult>("/v1/rooms", { method: "POST", body: JSON.stringify(input) }),
  getRoom: (id: string) => request<Room>(`/v1/rooms/${id}`),
  join: (id: string, nameJa: string) =>
    request<JoinResult>(`/v1/rooms/${id}/participants`, {
      method: "POST",
      body: JSON.stringify({ nameJa }),
    }),
  updateParticipant: (id: string, pid: string, patch: UpdateParticipantInput, token: string) =>
    request<Room>(
      `/v1/rooms/${id}/participants/${pid}`,
      { method: "PATCH", body: JSON.stringify(patch) },
      token,
    ),
  updateRoom: (id: string, patch: UpdateRoomInput, token: string) =>
    request<Room>(`/v1/rooms/${id}`, { method: "PATCH", body: JSON.stringify(patch) }, token),
  leave: (id: string, pid: string, token: string) =>
    request<void>(`/v1/rooms/${id}/participants/${pid}`, { method: "DELETE" }, token),
  // 解散。主催者だけ。docs/ROOM.md「DELETE /v1/rooms/:id」。
  dissolve: (id: string, token: string) => request<void>(`/v1/rooms/${id}`, { method: "DELETE" }, token),
  recommendations: (id: string) =>
    request<RecommendationResponse>(`/v1/rooms/${id}/recommendations?limit=10`),
  // 画面7「いまいる場所」。近くの名前のある地点(改札・集合候補・出口)。
  landmarks: (nearNodeId: string) =>
    request<LandmarksResponse>(`/v1/landmarks?near=${encodeURIComponent(nearNodeId)}`),
  // 認証不要。RECOMMENDER.md「表示が違う」: 保存しない、ログに出すだけ。
  reportExit: (catalogId: string, labelJa: string) =>
    request<ExitReportResponse>("/v1/exit-reports", {
      method: "POST",
      body: JSON.stringify({ catalogId, labelJa }),
    }),
};
