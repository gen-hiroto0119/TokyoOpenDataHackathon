// docs/RECOMMENDER.md の HTTP 契約。
// ここが正本ではない。docs を直してからここを直す。

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

export type ReasonCode =
  | "feasible"
  | "minimax"
  | "min_sum"
  | "onward"
  | "landmark"
  | "step_free"
  | "hours";

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
