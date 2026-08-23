// ルームの通知 WebSocket。
// 状態は流れてこない。「変わった」を受けたら SWR の room キーを取り直させるだけ。
// 切断中の正しさは useRoom の 5 秒ポーリングが担保する — ここは速さの上乗せ。
import { useEffect } from "react";
import { useSWRConfig } from "swr";

/** サーバーが明示的に閉じたときのコード。再接続しない(期限切れ/解散)。 */
const TERMINAL_CODES = new Set([4404, 4410]);

/** 再接続の間隔。1s → 5s → 15s で頭打ち。 */
const BACKOFF_MS = [1000, 5000, 15000];

function wsUrl(roomId: string): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/v1/rooms/${roomId}/ws`;
}

export function useRoomSocket(roomId: string | null): void {
  // グローバルの mutate は既定キャッシュにしか効かない。アプリは SWRConfig の
  // provider(localStorage 同期)で包んでいるので、そのスコープの mutate を使う。
  const { mutate } = useSWRConfig();
  useEffect(() => {
    if (!roomId) return;

    let socket: WebSocket | null = null;
    let attempt = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (stopped) return;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      const ws = new WebSocket(wsUrl(roomId!));
      socket = ws;

      ws.addEventListener("open", () => {
        attempt = 0;
      });

      ws.addEventListener("message", (event) => {
        let data: unknown;
        try {
          data = JSON.parse(String(event.data));
        } catch {
          return; // 読めないメッセージは無視する。
        }
        if ((data as { type?: string } | null)?.type === "room_updated") {
          void mutate(["room", roomId]);
        }
      });

      ws.addEventListener("close", (event) => {
        if (socket !== ws) return; // すでに次の接続へ切り替わっている
        socket = null;
        if (stopped || TERMINAL_CODES.has(event.code)) return;
        const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!;
        attempt += 1;
        timer = setTimeout(connect, delay);
      });

      ws.addEventListener("error", () => ws.close());
    }

    connect();

    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
        attempt = 0;
        connect();
      }
      void mutate(["room", roomId]);
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer !== null) clearTimeout(timer);
      socket?.close();
      socket = null;
    };
  }, [roomId, mutate]);
}
