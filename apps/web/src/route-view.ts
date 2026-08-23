// 契約(worker/src/contract.ts)の Leg / Step / ConfirmationPoint を画面6・7の行に
// 変換する純関数。HTTP も localStorage も知らない(api.ts / session.ts の仕事)。
import type {
  ConfirmationPoint,
  Landmark,
  Leg,
  MeetingCandidate,
  RecommendationResponse,
  RouteMap,
  RouteResponse,
  Step,
  StepTurn,
  StepVertical,
} from "worker/src/contract.js";
import type { IconName } from "./components/Icon.js";
import type { PathKind } from "./components/Path.js";

// ---------------------------------------------------------------- 画面6: 行

export type PathRow = {
  kind: "path";
  nodeId: string;
  Kind: PathKind;
  Landmark?: string;
  Detail: string;
  Goal?: string;
  ShowGoal?: boolean;
  Icon: IconName;
  floorLabel: string | null;
};

/**
 * 階の並び(下→上)。docs/DATA.md「階」の固定表(国交省の ordinal と対応する
 * floorLabel)に合わせた順。中間階は上の階の名前に M を付ける。学習しない。
 */
const FLOOR_ORDER = [
  "B5F",
  "B4F",
  "B3F",
  "MB2F",
  "B2F",
  "MB1F",
  "B1F",
  "M1F",
  "1F",
  "M2F",
  "2F",
  "M3F",
  "3F",
  "4F",
  "M5F",
] as const;

function floorIndex(label: string | null): number | null {
  if (label === null) return null;
  const i = FLOOR_ORDER.indexOf(label as (typeof FLOOR_ORDER)[number]);
  return i === -1 ? null : i;
}

/** 前の行の floorLabel と比べて上がる/下りるを決める。表に無い・同じ階のときは null。 */
function floorDirection(prevFloorLabel: string | null, floorLabel: string): "上がる" | "下りる" | null {
  const prev = floorIndex(prevFloorLabel);
  const curr = floorIndex(floorLabel);
  if (prev === null || curr === null || prev === curr) return null;
  return curr > prev ? "上がる" : "下りる";
}

export function turnLabel(turn: StepTurn): string {
  switch (turn) {
    case "straight":
      return "直進する";
    case "right":
      return "右へ曲がる";
    case "left":
      return "左へ曲がる";
    case "slight_right":
      return "やや右へ";
    case "slight_left":
      return "やや左へ";
    default: {
      const _never: never = turn;
      return _never;
    }
  }
}

export function turnIcon(turn: StepTurn): IconName {
  switch (turn) {
    case "straight":
      return "Straight";
    case "right":
      return "Right";
    case "left":
      return "Left";
    case "slight_right":
      return "SlightRight";
    case "slight_left":
      return "SlightLeft";
    default: {
      const _never: never = turn;
      return _never;
    }
  }
}

function verticalLabel(vertical: Exclude<StepVertical, "none">): string {
  switch (vertical) {
    case "stairs":
      return "階段";
    case "escalator":
      return "エスカレーター";
    case "elevator":
      return "エレベーター";
    default: {
      const _never: never = vertical;
      return _never;
    }
  }
}

/**
 * 階の文言。floorLabel が無い・表に無い・前後が同じ階で方向が決まらないときは
 * 方向を付けずに種別だけ返す(距離は含めない。分離型では距離は直進行が持つ)。
 */
function verticalDetail(step: Step, prevFloorLabel: string | null): string {
  if (step.floorLabel !== null) {
    const dir = floorDirection(prevFloorLabel, step.floorLabel);
    if (dir !== null) return `${step.floorLabel}へ${dir} · ${verticalLabel(step.vertical as Exclude<StepVertical, "none">)}`;
  }
  return verticalLabel(step.vertical as Exclude<StepVertical, "none">);
}

function moveDetail(distanceM: number): string {
  return `直進する · ${Math.round(distanceM)}m`;
}

/**
 * 分離型(1 行 = 1 動作)。Step の distanceM は「前の区切りからこのノードまで
 * の距離」を表す。turn ≠ straight / vertical ≠ none / landmark のいずれかで、
 * かつ distanceM > 0 のときは、直前に「直進する · Nm」の move 行を差し込み、
 * 本体の行からは距離を落とす。turn = straight な move 行(無名の直進)だけは
 * 従来どおり距離込みの 1 行のまま。
 * 挿入した直進行と本体行は同じ nodeId を持つ(復元は先に一致した方でよい)。
 */
export function rowsOfStep(step: Step, prevFloorLabel: string | null): PathRow[] {
  const hasAction = step.turn !== "straight" || step.vertical !== "none" || step.kind === "landmark";
  const split = hasAction && step.distanceM > 0;

  const rows: PathRow[] = [];
  if (split) {
    rows.push({
      kind: "path",
      nodeId: step.nodeId,
      Kind: "Move",
      Detail: moveDetail(step.distanceM),
      Icon: "Straight",
      floorLabel: step.floorLabel,
    });
  }

  let detail: string;
  if (step.vertical !== "none") {
    detail = verticalDetail(step, prevFloorLabel);
  } else if (step.turn !== "straight") {
    detail = turnLabel(step.turn);
  } else if (split) {
    // landmark 単体が split の理由。曲がりも階変化も無いので、本体行に添える
    // 文言が無い(直進した旨はすでに直前の move 行が持っている)。
    detail = "";
  } else {
    // 距離 0 の行に「直進する · 0m」を出さない(先頭の改札など、動きの無い行)。
    detail = step.distanceM > 0 ? moveDetail(step.distanceM) : "";
  }

  rows.push({
    kind: "path",
    nodeId: step.nodeId,
    Kind: step.kind === "landmark" ? "Landmark" : "Move",
    Landmark: step.kind === "landmark" ? (step.nameJa ?? "") : undefined,
    Detail: detail,
    Icon: turnIcon(step.turn),
    floorLabel: step.floorLabel,
  });

  return rows;
}

/**
 * Landmark 行で、名前も動き(曲がる・階変化)も持たない = 画面に出せる文字が
 * 無い行。無名の中間ノードがちょうど leg の起点(現地確認からの再計算)に
 * なったときに起きる: distanceM が 0 で split されず、turn=straight・
 * vertical=none・nameJa=null が重なると Landmark も Detail も空になる。
 */
function isEmptyLandmarkRow(row: PathRow): boolean {
  return row.Kind === "Landmark" && (row.Landmark ?? "") === "" && row.Detail === "";
}

/**
 * 空の landmark 行を取り除く。配列の最後の行だけは残す — rowsOfLeg が
 * そこへ集合場所・出口の名前を上書きする(呼び出し側の責務)ので、空のまま
 * 来ても後で埋まる。距離を持つ split 行(直前の「直進する · Nm」)は
 * Kind="Move" で別要素なので、この関数では触らない = 消えない。
 */
function dropEmptyLandmarkRows(rows: readonly PathRow[]): PathRow[] {
  return rows.filter((row, i) => i === rows.length - 1 || !isEmptyLandmarkRow(row));
}

/**
 * 自分の leg(改札→集合場所)と onward(集合場所→出口)を 1 本の手順列にする。
 * onward の先頭は集合場所そのものなので、leg の最終行と重複するときは飛ばす。
 *
 * 集合場所・出口の行の Landmark は source.meeting.nameJa / onward.exit.nameJa
 * で上書きする。実データでは、経路の終端ノードは isLast だから kind:"landmark"
 * になるが、グラフ上のノード自体は無名(nameJa: null)なことがある
 * (名前はカタログ側にだけ付く)。Step.nameJa だけを見ると空欄になってしまう。
 * MeetingCandidate も RouteResponse も meeting / onward を持つので、どちらも渡せる。
 */
export function rowsOfLeg(
  candidate: Pick<MeetingCandidate, "meeting" | "onward">,
  leg: Leg,
): PathRow[] {
  const onward = candidate.onward;
  let rows: PathRow[] = [];
  let prevFloor: string | null = null;

  for (const step of leg.steps) {
    rows.push(...rowsOfStep(step, prevFloor));
    prevFloor = step.floorLabel ?? prevFloor;
  }
  rows = dropEmptyLandmarkRows(rows);
  const meetingRow = rows[rows.length - 1];
  if (meetingRow) {
    meetingRow.Landmark = candidate.meeting.nameJa;
    meetingRow.ShowGoal = true;
    meetingRow.Goal = "集合場所";
  }

  const meetingNodeId = leg.steps[leg.steps.length - 1]?.nodeId;
  const onwardSteps =
    onward.steps.length > 0 && onward.steps[0]!.nodeId === meetingNodeId
      ? onward.steps.slice(1)
      : onward.steps;

  let onwardRows: PathRow[] = [];
  for (const step of onwardSteps) {
    onwardRows.push(...rowsOfStep(step, prevFloor));
    prevFloor = step.floorLabel ?? prevFloor;
  }
  onwardRows = dropEmptyLandmarkRows(onwardRows);
  rows.push(...onwardRows);
  if (onwardRows.length > 0) {
    const exitRow = rows[rows.length - 1]!;
    exitRow.Landmark = onward.exit.nameJa;
    exitRow.ShowGoal = true;
    exitRow.Goal = "出口";
  }

  return rows;
}

/** rows 中で nodeId が一致する行の index。無ければ -1。 */
export function rowIndexOfNode(rows: readonly PathRow[], nodeId: string | null): number {
  if (nodeId === null) return -1;
  return rows.findIndex((r) => r.nodeId === nodeId);
}

// ---------------------------------------------------------------- 自分の leg の選択

/**
 * ranked から自分の leg を選ぶ。確定済みの集合場所(room.meetingCatalogId)と
 * meeting.catalogId が一致する候補を使う。未確定なら rank 1。
 */
export function myLegOf(
  recs: RecommendationResponse,
  meetingCatalogId: string | null,
  participantId: string,
): { candidate: MeetingCandidate; leg: Leg } | null {
  const candidate =
    (meetingCatalogId !== null
      ? recs.ranked.find((c) => c.meeting.catalogId === meetingCatalogId)
      : undefined) ?? recs.ranked.find((c) => c.rank === 1);
  if (!candidate) return null;
  const leg = candidate.legs.find((l) => l.participantId === participantId);
  if (!leg) return null;
  return { candidate, leg };
}

/**
 * GET /v1/rooms/:id/route の応答から自分の leg を選ぶ。1 地点分しか無いので
 * 候補の選択は不要。legs に自分が無ければ null。
 */
export function myLegFromRoute(
  route: RouteResponse,
  participantId: string,
): { route: RouteResponse; leg: Leg } | null {
  const leg = route.legs.find((l) => l.participantId === participantId);
  if (!leg) return null;
  return { route, leg };
}

/** RouteResponse から手順行を作る。規則は rowsOfLeg と同じ。 */
export function rowsOfRoute(route: RouteResponse, leg: Leg): PathRow[] {
  return rowsOfLeg(route, leg);
}

const MAP_FLOOR_ORDER = ["B3F", "B2F", "B1F", "1F", "2F", "3F", "4F"] as const;

function mergeRouteMaps(a: RouteMap, b: RouteMap): RouteMap {
  const aMarks = a.marks ?? [];
  const bMarks = b.marks ?? [];
  const marks = [...aMarks];
  const seen = new Set(aMarks.map((mark) => mark.nodeId));
  for (const mark of bMarks) {
    if (seen.has(mark.nodeId)) continue;
    seen.add(mark.nodeId);
    marks.push(mark);
  }
  const floors = [...(a.floors ?? []), ...(b.floors ?? [])];
  const unique = [...new Set(floors.filter((floor) => floor.length > 0))];
  const aPoints = a.points ?? [];
  const bPoints = b.points ?? [];
  const lastA = aPoints.at(-1)?.nodeId;
  return {
    floors: [
      ...MAP_FLOOR_ORDER.filter((floor) => unique.includes(floor)),
      ...unique.filter((floor) => !MAP_FLOOR_ORDER.includes(floor as (typeof MAP_FLOOR_ORDER)[number])),
    ],
    lines: [...(a.lines ?? []), ...(b.lines ?? [])],
    connectors: [...(a.connectors ?? []), ...(b.connectors ?? [])],
    marks,
    points: [...aPoints, ...bPoints.filter((point) => point.nodeId !== lastA)],
  };
}

export function displayFloorLabel(label: string | null | undefined): string {
  if (!label) return "";
  if (label === "B3" || label === "B2" || label === "B1") return `${label}F`;
  if (label === "0" || label === "1") return "1F";
  if (label.endsWith("F")) return label;
  return `${label}F`;
}

/** いまの手順の次に来る曲がり・名前のある地点・出口。同じ node の直進行は飛ばす。 */
export function nextFocusNodeId(rows: readonly PathRow[], currentIndex: number): string | null {
  if (rows.length === 0) return null;
  const i = Math.min(Math.max(currentIndex, 0), rows.length - 1);
  const here = rows[i]!.nodeId;
  for (let j = i + 1; j < rows.length; j++) {
    const row = rows[j]!;
    if (row.nodeId === here) continue;
    if (row.Kind === "Landmark" || row.ShowGoal || row.Icon !== "Straight") {
      return row.nodeId;
    }
  }
  return null;
}

/** いまの手順の手前の地点。末尾（出口）では、ここに向かって来た向きを出す。 */
export function prevFocusNodeId(rows: readonly PathRow[], currentIndex: number): string | null {
  if (rows.length === 0) return null;
  const i = Math.min(Math.max(currentIndex, 0), rows.length - 1);
  const here = rows[i]!.nodeId;
  for (let j = i - 1; j >= 0; j--) {
    if (rows[j]!.nodeId !== here) return rows[j]!.nodeId;
  }
  return null;
}

/**
 * 地図を寄せる Path 区間。直進の split 行は「この node へ向かう途中」なので
 * 手前→いま。曲がり・地点の行は、いま→次の曲がり／出口。
 */
export function focusSegment(
  rows: readonly PathRow[],
  currentIndex: number,
): { fromNodeId: string | null; toNodeId: string | null } {
  if (rows.length === 0) return { fromNodeId: null, toNodeId: null };
  const i = Math.min(Math.max(currentIndex, 0), rows.length - 1);
  const here = rows[i]!;
  const following = rows[i + 1];
  const approaching =
    here.Kind === "Move" && here.Icon === "Straight" && following?.nodeId === here.nodeId;
  if (approaching) {
    return { fromNodeId: prevFocusNodeId(rows, i), toNodeId: here.nodeId };
  }
  const next = nextFocusNodeId(rows, i);
  if (next) return { fromNodeId: here.nodeId, toNodeId: next };
  return { fromNodeId: prevFocusNodeId(rows, i), toNodeId: here.nodeId };
}

/** 直進の手順 = 手前の節と次の節のあいだ。 */
export function isBetweenNodes(rows: readonly PathRow[], currentIndex: number): boolean {
  if (rows.length === 0) return false;
  const i = Math.min(Math.max(currentIndex, 0), rows.length - 1);
  const here = rows[i]!;
  if (here.Kind !== "Move" || here.Icon !== "Straight") return false;
  const segment = focusSegment(rows, i);
  return segment.fromNodeId !== null && segment.toNodeId !== null && segment.fromNodeId !== segment.toNodeId;
}

/** 自分の改札→集合と、集合→出口を 1 本の地図にする。 */
export function mapOfRoute(route: RouteResponse, participantId: string): RouteMap | null {
  if (!route.map) return null;
  const mine = route.map.participants.find((row) => row.participantId === participantId);
  if (!mine) return route.map.onward ?? null;
  if (!route.map.onward) return mine;
  return mergeRouteMaps(mine, route.map.onward);
}

// ---------------------------------------------------------------- Handoff

export function handoffFrom(label: string): string {
  return label.length > 0 ? `出口 ${label} を出たところから` : "地上出口を出たところから";
}

// ---------------------------------------------------------------- 画面7: 近くの地点の行

export type HereRow = { nodeId: string; nameJa: string; detailJa: string; distanceJa: string };

/**
 * GET /v1/landmarks の応答を画面7の行に変える。距離は表示側で丸める
 * (docs/RECOMMENDER.md「distanceM は丸めない(表示側で丸める)」)。
 * 「約」は付けない(既存の手順行「直進する · 40m」と同じ形)。
 */
export function hereRowsOf(landmarks: readonly Landmark[]): HereRow[] {
  return landmarks.map((l) => ({
    nodeId: l.nodeId,
    nameJa: l.nameJa,
    detailJa: l.floorLabel ?? "",
    distanceJa: `${Math.round(l.distanceM)}m`,
  }));
}

/** 復元先の初期アンカー。明示のアンカーが無ければ、最初の未確認の確認点。 */
export function fallbackAnchorNodeId(confirmations: readonly ConfirmationPoint[]): string | null {
  return confirmations.find((c) => c.status === "pending")?.nodeId ?? null;
}
