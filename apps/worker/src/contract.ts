// docs/RECOMMENDER.md の HTTP 契約。
// ここが正本ではない。docs を直してからここを直す。

import * as v from "valibot";

export type DatasetId = "tokyo.shinjuku-terminal";

export type Accessibility = "any" | "step_free";

export type LineRef = { kind: "line"; id: string };
export type CatalogRef = { kind: "catalog"; id: string };
export type NodeRef = { kind: "node"; id: string };

export type EntryRef = LineRef | CatalogRef | NodeRef;

export type ParticipantInput = {
  id: string;
  entry: EntryRef;
  confirmed?: NodeRef;
};

export type RecommendationRequest = {
  datasetId: DatasetId;
  destination: CatalogRef;
  participants: ParticipantInput[];
  constraints?: {
    accessibility?: Accessibility;
    asOf?: string;
  };
};

// ---------------------------------------------------------------- 入力検証
//
// POST /v1/recommendations の入力を Valibot で検証する（room.ts と同じやり方）。
// ここは docs が正本の型が先にあるので、スキーマを手で型に合わせて書く
// （room.ts とは逆で、型からスキーマを導いてはいない）。

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
  destination: CatalogRefSchema,
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
