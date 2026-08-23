// データ取得は SWR に統一する。fetcher は HTTP 呼び出しだけを行い、
// キャッシュの永続化はここでだけ扱う。トークン(session.ts)はここに入れない
// — room / recommendations の応答にトークンは含まれないので、自然と入らない。
import type { ReactNode } from "react";
import useSWR, { mutate as globalMutate, SWRConfig, type Cache } from "swr";
import type { CatalogResponse, LandmarksResponse, RecommendationResponse } from "worker/src/contract.js";
import type { Room } from "worker/src/room.js";
import { ApiError, api } from "./api.js";

const CACHE_KEY = "ekiawase/cache";

/**
 * Map を localStorage に同期する SWR provider。リロード時に前回の
 * room / 推薦を初期表示できるようにする(地下でネットワークが無くても
 * 直前の状態が見える)。
 */
function localStorageProvider(): Cache {
  let entries: [string, unknown][] = [];
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    entries = raw ? (JSON.parse(raw) as [string, unknown][]) : [];
  } catch {
    entries = [];
  }
  const map = new Map<string, unknown>(entries);

  const persist = () => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(Array.from(map.entries())));
    } catch {
      // 容量超過などは諦める。次回起動時のキャッシュが無いだけ。
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", persist);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") persist();
    });
  }

  return map as unknown as Cache;
}

export function CacheProvider({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: localStorageProvider }}>{children}</SWRConfig>;
}

// ---------------------------------------------------------------- room

type RoomKey = readonly ["room", string];

function roomKey(roomId: string | null): RoomKey | null {
  return roomId ? (["room", roomId] as const) : null;
}

async function roomFetcher([, roomId]: RoomKey): Promise<Room> {
  return api.getRoom(roomId);
}

export function useRoom(roomId: string | null) {
  return useSWR(roomKey(roomId), roomFetcher, {
    refreshInterval: 5000,
    keepPreviousData: true,
  });
}

// ---------------------------------------------------------------- 推薦

export type RecsResult =
  | { kind: "waiting"; waitingFor: string[] }
  | { kind: "ready"; data: RecommendationResponse };

type RecsKey = readonly ["recs", string, string];

function recsKey(roomId: string | null, updatedAt: string | undefined): RecsKey | null {
  return roomId && updatedAt ? (["recs", roomId, updatedAt] as const) : null;
}

/**
 * 409 not_enough_participants は状態であってエラーではないので、ここで
 * catch して通常値に正規化する。throw すると SWR がリトライ連打する。
 */
async function recsFetcher([, roomId]: RecsKey): Promise<RecsResult> {
  try {
    const data = await api.recommendations(roomId);
    return { kind: "ready", data };
  } catch (error) {
    if (error instanceof ApiError && error.body.code === "not_enough_participants") {
      const waitingFor = error.body.details?.["waitingFor"];
      return {
        kind: "waiting",
        waitingFor: Array.isArray(waitingFor) ? (waitingFor as string[]) : [],
      };
    }
    throw error;
  }
}

/**
 * room の updatedAt が変わったときだけキーが変わり、それが再取得の引き金になる。
 * refreshInterval は付けない(room 側のポーリングに乗る)。
 */
export function useRoomRecommendations(roomId: string | null, updatedAt: string | undefined) {
  return useSWR(recsKey(roomId, updatedAt), recsFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
}

/**
 * confirmed の PATCH で room.updatedAt が変わった直後、次の updatedAt に
 * 対応する推薦キーへ先回りしてデータを入れておく。呼ばずに任せると
 * useRoomRecommendations がキー変化を検知してから取りに行くので、
 * 呼び出し側は「新しい経路が出るまで」を待てない。ここで待てるようにする。
 */
export async function primeRoomRecommendations(
  roomId: string,
  updatedAt: string,
): Promise<RecsResult> {
  const key = recsKey(roomId, updatedAt);
  if (!key) throw new Error("invalid room/updatedAt");
  const result = await recsFetcher(key);
  await globalMutate(key, result, { revalidate: false });
  return result;
}

// ---------------------------------------------------------------- 画面7: いまいる場所

type LandmarksKey = readonly ["landmarks", string];

function landmarksKey(nearNodeId: string | null): LandmarksKey | null {
  return nearNodeId ? (["landmarks", nearNodeId] as const) : null;
}

async function landmarksFetcher([, nearNodeId]: LandmarksKey): Promise<LandmarksResponse> {
  return api.landmarks(nearNodeId);
}

/** near ノードが変わるたびに取り直す(キーに含める)。 */
export function useLandmarks(nearNodeId: string | null) {
  return useSWR(landmarksKey(nearNodeId), landmarksFetcher, {
    revalidateOnFocus: false,
  });
}

// ---------------------------------------------------------------- catalog

export function useCatalog() {
  return useSWR<CatalogResponse>("catalog", () => api.catalog(), {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });
}
