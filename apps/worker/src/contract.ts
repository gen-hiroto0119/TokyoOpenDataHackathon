// HTTP の入出力の型。

import * as v from "valibot";

export type DatasetId = "tokyo.shinjuku-terminal";

export type Accessibility = "any" | "step_free";

export type LineRef = { kind: "line"; id: string };
export type CatalogRef = { kind: "catalog"; id: string };
export type NodeRef = { kind: "node"; id: string };

/** Places で選んだ目的地。名前と座標だけを受け取る。どこで検索したかは知らない。 */
export type PlaceRef = { kind: "place"; nameJa: string; lat: number; lng: number };

export type DestinationRef = CatalogRef | PlaceRef;

export type EntryRef = LineRef | CatalogRef | NodeRef;

export type ParticipantInput = {
  id: string;
  entry: EntryRef;
  confirmed?: NodeRef;
};

export type RecommendationRequest = {
  datasetId: DatasetId;
  destination: DestinationRef;
  participants: ParticipantInput[];
  constraints?: {
    accessibility?: Accessibility;
    asOf?: string;
  };
};

// ---------------------------------------------------------------- 入力検証
//
// POST /v1/recommendations の入力を Valibot で検証する（room.ts と同じやり方）。
// スキーマを手で型に合わせて書く（room.ts とは逆で、型からスキーマを導いてはいない）。

const LineRefSchema = v.object({
  kind: v.literal("line", "到着情報が読めません"),
  id: v.pipe(v.string("到着情報が読めません"), v.minLength(1, "到着情報が読めません")),
});
const CatalogRefSchema = v.object({
  kind: v.literal("catalog", "到着情報が読めません"),
  id: v.pipe(v.string("到着情報が読めません"), v.minLength(1, "到着情報が読めません")),
});
const NodeRefSchema = v.object({
  kind: v.literal("node", "確認した場所が読めません"),
  id: v.pipe(v.string("確認した場所が読めません"), v.minLength(1, "確認した場所が読めません")),
});
const EntryRefSchema = v.union(
  [LineRefSchema, CatalogRefSchema, NodeRefSchema],
  "到着情報が読めません",
);

// destination だけの CatalogRef。上の CatalogRefSchema と同じ形だが、
// エラーメッセージを「目的地」向けに変えるため独立させてある。
const DestinationCatalogRefSchema = v.object({
  kind: v.literal("catalog", "行き先が読めません"),
  id: v.pipe(v.string("行き先が読めません"), v.minLength(1, "行き先が読めません")),
});
const PlaceRefSchema = v.object({
  kind: v.literal("place", "行き先が読めません"),
  nameJa: v.pipe(v.string("行き先が読めません"), v.minLength(1, "行き先が読めません")),
  lat: v.pipe(v.number("行き先の位置が読めません"), v.finite("行き先の位置が読めません")),
  lng: v.pipe(v.number("行き先の位置が読めません"), v.finite("行き先の位置が読めません")),
});
// kind で分ける discriminated union。Places 由来(PlaceRef)かプリセット
// (CatalogRef)かで契約は同じ計算を通る(docs/RECOMMENDER.md「出口から先は Maps に渡す」)。
const DestinationRefSchema = v.variant(
  "kind",
  [DestinationCatalogRefSchema, PlaceRefSchema],
  "行き先が読めません",
);

const ParticipantInputSchema = v.object({
  id: v.pipe(v.string("参加者のIDが読めません"), v.minLength(1, "参加者のIDが読めません")),
  entry: EntryRefSchema,
  confirmed: v.optional(NodeRefSchema),
});

export const RecommendationRequestSchema = v.object({
  // ここは文字列であることだけを見る。値が既知のデータセットと違うかどうかの
  // 判定（409 dataset_mismatch）は recommend() に任せる。ここで literal にすると
  // 値違いが 400 に化けて、docs の 409 契約が届かなくなる。
  datasetId: v.pipe(v.string("データセットが読めません"), v.minLength(1, "データセットが読めません")),
  destination: DestinationRefSchema,
  participants: v.pipe(
    v.array(ParticipantInputSchema, "参加者が読めません"),
    v.minLength(2, "参加者は2人以上必要です"),
  ),
  constraints: v.optional(
    v.object({
      accessibility: v.optional(v.picklist(["any", "step_free"], "移動条件が読めません")),
      asOf: v.optional(v.pipe(v.string("時刻が読めません"), v.isoTimestamp("時刻が読めません"))),
    }),
  ),
});

// POST /v1/exit-reports の入力を Valibot で検証する。catalogId がカタログの
// 出口に無いかどうかは、ここではなく index.ts 側(dataset を持つ)で見る。
const MAX_EXIT_REPORT_LABEL_LENGTH = 40;

export const ExitReportRequestSchema = v.object({
  catalogId: v.pipe(v.string("出口が読めません"), v.minLength(1, "出口が読めません")),
  labelJa: v.pipe(
    v.string("現地の表示を入れてください"),
    v.trim(),
    v.minLength(1, "現地の表示を入れてください"),
    v.maxLength(
      MAX_EXIT_REPORT_LABEL_LENGTH,
      `現地の表示は${MAX_EXIT_REPORT_LABEL_LENGTH}文字までです`,
    ),
  ),
});

/** GET /v1/catalog。グラフ・改札・集合候補・出口は含めない。 */
export type CatalogLine = {
  id: string;
  nameJa: string;
};

export type CatalogDestination = {
  catalogId: string;
  nameJa: string;
  lat: number;
  lng: number;
};

export type CatalogResponse = {
  lines: CatalogLine[];
  destinations: CatalogDestination[];
};

/** POST /v1/exit-reports。出口の看板が応答と違ったときに現地の表示を送る口。 */
export type ExitReportRequest = {
  catalogId: string;
  /** 現地の看板に書いてある文字。空は受けない。 */
  labelJa: string;
};

export type ExitReportResponse = { ok: true };

export type ReasonCode =
  | "feasible"
  | "minimax"
  | "min_sum"
  | "onward"
  | "landmark"
  | "step_free"
  | "hours"
  | "unreachable";

export type ConfirmationKind = "gate" | "floor" | "landmark" | "branch";
export type ConfirmationStatus = "pending" | "confirmed" | "skipped";

export type ConfirmationPoint = {
  nodeId: string;
  kind: ConfirmationKind;
  nameJa: string;
  status: ConfirmationStatus;
};

export type StepKind = "landmark" | "move";
export type StepTurn = "straight" | "right" | "left" | "slight_right" | "slight_left";
export type StepVertical = "none" | "stairs" | "escalator" | "elevator";

export type Step = {
  kind: StepKind;
  nodeId: string;
  nameJa: string | null;
  turn: StepTurn;
  vertical: StepVertical;
  distanceM: number;
  floorLabel: string | null;
};

export type Leg = {
  participantId: string;
  entry: { nodeId: string; catalogId: string | null; nameJa: string };
  distanceM: number;
  costSeconds: number;
  floorChanges: number;
  branchCount: number;
  steps: Step[];
  pathNodeIds: string[];
  pathLinkIds: string[];
  confirmations: ConfirmationPoint[];
};

export type MeetingCandidate = {
  rank: number;
  meeting: {
    nodeId: string;
    catalogId: string | null;
    nameJa: string;
    floorLabel: string;
    evidence: "hypothesis" | "field_confirmed";
    facilities: {
      /** 集合場所から歩いて 50m 以内にエレベーターがある。 */
      elevator: boolean;
      /** 同じくトイレ(多機能・オストメイトを含む)。 */
      restroom: boolean;
      /** 全員がこの候補まで段差なしで行ける。経路で決まるので取り込みでは決めない。 */
      stepFree: boolean;
    };
  };
  scores: {
    maxDistanceM: number;
    sumDistanceM: number;
    onwardDistanceM: number;
    explainability: number;
  };
  reasons: { code: ReasonCode; textJa: string }[];
  legs: Leg[];
  /** 集合したあと、全員で地上へ出るまで。ここから先は Maps に渡す。 */
  onward: {
    distanceM: number;
    pathNodeIds: string[];
    pathLinkIds: string[];
    /** 集合場所→出口の手順。最初は集合場所、末尾は出口。 */
    steps: Step[];
    exit: {
      nodeId: string;
      catalogId: string;
      /** 看板の文字。新宿駅に同じ番号が複数あるが、経路を出しているので迷わない。 */
      label: string;
      nameJa: string;
      /**
       * 名前の確からしさ。`checked` は人が見て確かめたもの、
       * `hypothesis` は取り込んだだけのもの。画面は後者を断定して書かない。
       */
      evidence: "hypothesis" | "checked";
      lat: number;
      lng: number;
      mapsDirUrl: string;
    };
  };
};

export type RecommendationResponse = {
  dataset: {
    id: DatasetId;
    version: string;
    graphHash: string;
    attributionJa: string;
  };
  walkingSpeedMps: number;
  ranked: MeetingCandidate[];
  infeasible: { nodeId: string; nameJa: string; reason: ReasonCode; textJa: string }[];
};

/** GET /v1/landmarks。画面7「いまいる場所」が使う、近くの名前のある地点。 */
export type LandmarkKind = "gate" | "meeting" | "exit";

export type Landmark = {
  nodeId: string;
  nameJa: string;
  kind: LandmarkKind;
  floorLabel: string | null;
  /** near から歩いた距離。丸めない(表示側で丸める)。 */
  distanceM: number;
};

export type LandmarksResponse = { landmarks: Landmark[] };

export type ErrorCode =
  | "invalid_request"
  | "unknown_catalog"
  | "unknown_node"
  | "unknown_line"
  | "invalid_participants"
  | "dataset_mismatch"
  | "disconnected"
  | "no_feasible_meeting";

export type ErrorResponse = {
  code: ErrorCode;
  messageJa: string;
  details?: Record<string, unknown>;
};
