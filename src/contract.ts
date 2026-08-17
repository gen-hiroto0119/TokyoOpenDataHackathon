// docs/engineering/RECOMMENDER.md の HTTP 契約。
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
  onward: {
    distanceM: number;
    pathNodeIds: string[];
    outdoorAnchor: {
      nodeId: string;
      catalogId: string;
      nameJa: string;
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
