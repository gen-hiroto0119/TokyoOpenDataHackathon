// docs/RECOMMENDER.md / docs/SCREENS.md「行き先」節: Places はクライアントが呼ぶ。
// この Worker(推薦 API)は名前と緯度経度しか知らない。
//
// Places API (New) を fetch で薄く叩くだけの層。依存追加はしない。
// キー未設定なら一切呼ばない(例外もコンソール警告も出さない)。プリセットは
// フォールバックとして残る前提なので、失敗はここで握りつぶして呼び出し側に
// 空配列 / null を返すだけにする。

// 新宿駅を中心にした検索バイアス。かけないと渋谷や品川が候補に出る。
const BIAS_CENTER = { lat: 35.690921, lng: 139.700258 };
const BIAS_RADIUS_M = 1500;

const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const DETAILS_URL = "https://places.googleapis.com/v1/places";

export type PlaceSuggestion = {
  placeId: string;
  primaryText: string;
  secondaryText: string;
};

export type PlaceDetails = {
  nameJa: string;
  lat: number;
  lng: number;
};

function apiKey(): string | undefined {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
}

/** キーが設定されているか。設定が無ければ呼び出し側はプリセットだけで動く。 */
export function hasPlacesKey(): boolean {
  return Boolean(apiKey());
}

type AutocompleteResponse = {
  suggestions?: {
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }[];
};

type DetailsResponse = {
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
};

/**
 * POST /v1/places:autocomplete。キー未設定・通信失敗・不正な応答は
 * すべて空配列にする(呼び出し側がプリセット検索へ静かにフォールバックする)。
 */
export async function autocomplete(
  input: string,
  sessionToken: string,
): Promise<PlaceSuggestion[]> {
  const key = apiKey();
  if (!key) return [];
  try {
    const res = await fetch(AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
      },
      body: JSON.stringify({
        input,
        sessionToken,
        languageCode: "ja",
        regionCode: "JP",
        locationBias: {
          circle: {
            center: { latitude: BIAS_CENTER.lat, longitude: BIAS_CENTER.lng },
            radius: BIAS_RADIUS_M,
          },
        },
      }),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as AutocompleteResponse;
    const results: PlaceSuggestion[] = [];
    for (const s of body.suggestions ?? []) {
      const p = s.placePrediction;
      const placeId = p?.placeId;
      const primaryText = p?.structuredFormat?.mainText?.text ?? p?.text?.text;
      if (!placeId || !primaryText) continue;
      results.push({
        placeId,
        primaryText,
        secondaryText: p?.structuredFormat?.secondaryText?.text ?? "",
      });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * GET /v1/places/{placeId}。sessionToken は autocomplete と同じものを渡す
 * (セッション単位課金にするため)。キー未設定・失敗は null。
 */
export async function placeDetails(
  placeId: string,
  sessionToken: string,
): Promise<PlaceDetails | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const url = `${DETAILS_URL}/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`;
    const res = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "id,displayName,location",
      },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as DetailsResponse;
    const nameJa = body.displayName?.text;
    const lat = body.location?.latitude;
    const lng = body.location?.longitude;
    if (!nameJa || typeof lat !== "number" || typeof lng !== "number") return null;
    return { nameJa, lat, lng };
  } catch {
    return null;
  }
}

export type PlaceSearcherOptions = {
  /** ミリ秒。既定 250。 */
  debounceMs?: number;
  /** これより短い入力では呼ばない。既定 2(1文字以下では呼ばない)。 */
  minLength?: number;
};

export type PlaceSearcher = {
  /** 入力文字列を渡す。デバウンス後に results コールバックへ結果が届く。 */
  search(input: string): void;
  /** 候補を確定して Details を取る。呼んだ時点でセッションを使い切って捨てる。 */
  select(placeId: string): Promise<PlaceDetails | null>;
  /** 画面が閉じるときに呼ぶ。以後の遅延コールバックを無視する。 */
  dispose(): void;
};

/**
 * 打鍵のデバウンスとセッショントークンの寿命をまとめて持つ。
 * トークンは最初の検索で発行し(入力開始で発行)、select() で使い切って
 * 破棄する。打鍵ごとに新規発行はしない。
 */
export function createPlaceSearcher(
  onResults: (results: PlaceSuggestion[]) => void,
  options: PlaceSearcherOptions = {},
): PlaceSearcher {
  const debounceMs = options.debounceMs ?? 250;
  const minLength = options.minLength ?? 2;

  let sessionToken: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let requestId = 0;
  let disposed = false;

  function ensureSessionToken(): string {
    if (!sessionToken) sessionToken = crypto.randomUUID();
    return sessionToken;
  }

  function search(input: string): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const trimmed = input.trim();
    if (!hasPlacesKey() || trimmed.length < minLength) {
      // 呼ばない: 直前の(古くなる)結果を掃除するだけ。
      requestId += 1;
      onResults([]);
      return;
    }
    const token = ensureSessionToken();
    const id = ++requestId;
    timer = setTimeout(() => {
      timer = null;
      void autocomplete(trimmed, token).then((results) => {
        // 打鍵が続いた後の古い応答は捨てる(デバウンスの取りこぼし対策)。
        if (!disposed && id === requestId) onResults(results);
      });
    }, debounceMs);
  }

  async function select(placeId: string): Promise<PlaceDetails | null> {
    const token = ensureSessionToken();
    sessionToken = null;
    return placeDetails(placeId, token);
  }

  function dispose(): void {
    disposed = true;
    if (timer !== null) clearTimeout(timer);
  }

  return { search, select, dispose };
}
