// 契約(contract.ts / room.ts)の応答を画面の文字列に変換するだけの純関数。
// HTTP も localStorage も知らない(api.ts / session.ts の仕事)。
import type { CatalogLine } from "worker/src/contract.js";
import type { ArrivalReport, EntryRef, Participant } from "worker/src/room.js";
import type { ArrivalProgress } from "./components/Arrival.js";
import type { ReportSelected } from "./components/Report.js";

export function initialOf(nameJa: string): string {
  return nameJa.trim().charAt(0) || "?";
}

export function nameOf(participants: readonly Participant[], id: string): string {
  return participants.find((p) => p.id === id)?.nameJa ?? "";
}

/** entry が路線のときだけ、カタログから路線名を引く。 */
export function lineNameOf(lines: readonly CatalogLine[], entry: EntryRef | null): string {
  if (!entry || entry.kind !== "line") return "";
  return lines.find((l) => l.id === entry.id)?.nameJa ?? "";
}

/** 推薦・経路の leg から、参加者が出る改札の表示名を引く。 */
export function assignedGateNameOf(
  legs: readonly { participantId: string; entry: { nameJa: string } }[] | undefined,
  participantId: string,
): string | null {
  const nameJa = legs?.find((leg) => leg.participantId === participantId)?.entry.nameJa;
  return nameJa && nameJa.length > 0 ? nameJa : null;
}

/**
 * 到着行の詳細。改札が決まっていればその名前、まだなら路線名。
 * 文言の例は Figma 25 Copy「到着行 / 丸ノ内線改札」。
 */
export function arrivalDetailOf(lineName: string, gateName: string | null): string {
  return gateName ?? lineName;
}

/**
 * 集合場所が決まっていれば経路の legs、未決定なら推薦 1 位の legs。
 * 2 人未満で路線が入っていないときはどちらも渡さず、改札は出さない。
 */
export function assignedGateLegsOf(
  meetingChosen: boolean,
  recommendationTopLegs: readonly { participantId: string; entry: { nameJa: string } }[] | undefined,
  routeLegs: readonly { participantId: string; entry: { nameJa: string } }[] | undefined,
): readonly { participantId: string; entry: { nameJa: string } }[] | undefined {
  return meetingChosen ? routeLegs : recommendationTopLegs;
}

/** 到着情報が無ければ未確認、あれば移動中、現地で確認済みなら到着。 */
export function progressOf(p: Participant): ArrivalProgress {
  if (p.confirmed) return "Arrived";
  if (p.entry) return "Moving";
  return "Pending";
}

export function reportLabelOf(report: ArrivalReport | null): string {
  switch (report) {
    case "early":
      return "早く着く";
    case "on_time":
      return "予定通り";
    case "late":
      return "遅れる";
    default:
      return "";
  }
}

export function reportSelectedOf(report: ArrivalReport | null): ReportSelected {
  switch (report) {
    case "early":
      return "Early";
    case "on_time":
      return "OnTime";
    case "late":
      return "Late";
    default:
      return "None";
  }
}

export function reportOf(selected: Exclude<ReportSelected, "None">): ArrivalReport {
  switch (selected) {
    case "Early":
      return "early";
    case "OnTime":
      return "on_time";
    case "Late":
      return "late";
  }
}

export function minutesLabel(seconds: number): string {
  return `${Math.round(seconds / 60)}分`;
}

export function effortLabel(floorChanges: number, branchCount: number): string {
  return `階${floorChanges} · 分岐${branchCount}`;
}

export function factsLabel(onwardDistanceM: number, walkingSpeedMps: number): string {
  const minutes = Math.round(onwardDistanceM / walkingSpeedMps / 60);
  return `出口まで ${minutes}分`;
}
