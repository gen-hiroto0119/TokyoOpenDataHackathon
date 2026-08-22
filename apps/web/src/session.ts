// localStorage だけを知る。HTTP は api.ts の仕事。
//
// ルームごとに 1 キー 1 JSON。読み書きが原子的で、410/404 のときは
// 1 キー消すだけで済む。
import type { RoomRole } from "worker/src/room.js";

const KEY_PREFIX = "ekiawase/room/";
const ONBOARDED_KEY = "ekiawase/onboarded";
const EXIT_REPORT_PREFIX = "ekiawase/exit-report/";

export type Session = {
  v: 1;
  participantId: string;
  /** hostToken か participantToken。区別は role で持つ。 */
  token: string;
  role: RoomRole;
  /** ルームの期限。掃除用。 */
  expiresAt: string;
};

function keyOf(roomId: string): string {
  return `${KEY_PREFIX}${roomId}`;
}

export function saveSession(roomId: string, session: Session): void {
  localStorage.setItem(keyOf(roomId), JSON.stringify(session));
}

export function loadSession(roomId: string): Session | null {
  const raw = localStorage.getItem(keyOf(roomId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession(roomId: string): void {
  localStorage.removeItem(keyOf(roomId));
}

/**
 * 起動時に呼ぶ。期限切れのルームキーを全キー走査で消す。
 * ROOM.md の「個人の申告が残り続けないようにする」を端末側でも守る。
 */
export function sweepExpired(now: Date = new Date()): void {
  const nowMs = now.getTime();
  const staleKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(KEY_PREFIX)) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const session = JSON.parse(raw) as Session;
      if (Date.parse(session.expiresAt) <= nowMs) staleKeys.push(key);
    } catch {
      staleKeys.push(key);
    }
  }
  for (const key of staleKeys) localStorage.removeItem(key);
}

export function isOnboarded(): boolean {
  return localStorage.getItem(ONBOARDED_KEY) === "1";
}

export function setOnboarded(): void {
  localStorage.setItem(ONBOARDED_KEY, "1");
}

// -------------------------------------------------------- 出口の表示が違う報告
//
// 送信は POST /v1/exit-reports(api.ts の reportExit)。ここは送信後の
// 「もう送った」という事実だけを端末に残す — 同じ出口で二度出さないため
// (docs/RECOMMENDER.md: 送信はログに出すだけで保存しないので、正はここではない)。

export type ExitReport = {
  exitCatalogId: string;
  labelJa: string;
  at: string;
};

function exitReportKeyOf(roomId: string): string {
  return `${EXIT_REPORT_PREFIX}${roomId}`;
}

export function saveExitReport(roomId: string, exitCatalogId: string, labelJa: string): ExitReport {
  const report: ExitReport = { exitCatalogId, labelJa, at: new Date().toISOString() };
  localStorage.setItem(exitReportKeyOf(roomId), JSON.stringify(report));
  return report;
}

export function loadExitReport(roomId: string): ExitReport | null {
  const raw = localStorage.getItem(exitReportKeyOf(roomId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ExitReport;
  } catch {
    return null;
  }
}
