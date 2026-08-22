import type {
  Accessibility,
  ConfirmationPoint,
  Leg,
  MeetingCandidate,
  RecommendationRequest,
  RecommendationResponse,
  ReasonCode,
  Step,
  StepTurn,
  StepVertical,
} from "./contract.js";
import {
  branchDegrees,
  buildAdjacency,
  buildReverseAdjacency,
  indexLinks,
  indexNodes,
  type Adjacency,
  type Dataset,
  type GraphLink,
  type GraphNode,
} from "./graph.js";

export const WALKING_SPEED_MPS = 1.2;

/** 距離の同点判定。浮動小数の誤差だけを吸収する幅。 */
const EPS = 1e-9;

export class RecommendError extends Error {
  constructor(
    readonly code:
      | "unknown_catalog"
      | "unknown_node"
      | "unknown_line"
      | "invalid_participants"
      | "dataset_mismatch"
      | "disconnected"
      | "no_feasible_meeting",
    readonly messageJa: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

const REASON_TEXT: Record<ReasonCode, string> = {
  feasible: "全員が行ける",
  minimax: "一番長い人の移動が最も短い",
  min_sum: "全員の合計が最も短い",
  onward: "地上に出るまでが最も短い",
  landmark: "説明しやすい地点",
  // infeasible[].reason 専用。ranked[].reasons の decidingReason はこの値を返さない
  // （textJa は下の infeasible 組み立てで直接組む。ここは Record<ReasonCode, ...> を
  // 網羅させるためだけの定義）。
  unreachable: "全員が行ける経路がありません",
  step_free: "段差なしで行ける",
  hours: "いまの時間帯に通れる",
};

// ---------------------------------------------------------------- 通行可能性

type Passability = {
  accessibility: Accessibility;
  /** ISO 8601。省略時は時間帯を見ない。 */
  asOf: string | null;
};

/** `asOf` の時刻部分を分に直す。日付をまたぐ営業時間は素直に扱う。 */
function minutesOfDay(iso: string): number | null {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function withinHours(link: GraphLink, asOf: string | null): boolean {
  if (!link.hours || asOf === null) return true;
  const now = minutesOfDay(asOf);
  const start = minutesOfDay(`T${link.hours.start}`);
  const end = minutesOfDay(`T${link.hours.end}`);
  if (now === null || start === null || end === null) return true;
  return start <= end ? now >= start && now <= end : now >= start || now <= end;
}

function passable(link: GraphLink, p: Passability): boolean {
  if (!withinHours(link, p.asOf)) return false;
  if (p.accessibility === "step_free") {
    if (link.vertical === "stairs" || link.vertical === "escalator" || link.vertical === "unknown") {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------- 最短距離

type Reached = {
  distanceM: number;
  prevNodeId: string | null;
  prevLinkId: string | null;
  /** どの始点から届いたか。路線を渡されたときに選ばれた改札。 */
  sourceId: string;
};

/** (距離, nodeId) の順に取り出す最小ヒープ。取り出す順が決まれば結果も決まる。 */
class Heap {
  private readonly items: { id: string; d: number }[] = [];

  private less(a: { id: string; d: number }, b: { id: string; d: number }): boolean {
    if (a.d !== b.d) return a.d < b.d;
    return a.id < b.id;
  }

  push(item: { id: string; d: number }): void {
    this.items.push(item);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(this.items[i]!, this.items[parent]!)) break;
      [this.items[i], this.items[parent]] = [this.items[parent]!, this.items[i]!];
      i = parent;
    }
  }

  pop(): { id: string; d: number } | undefined {
    const top = this.items[0];
    if (top === undefined) return undefined;
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let small = i;
        if (l < this.items.length && this.less(this.items[l]!, this.items[small]!)) small = l;
        if (r < this.items.length && this.less(this.items[r]!, this.items[small]!)) small = r;
        if (small === i) break;
        [this.items[i], this.items[small]] = [this.items[small]!, this.items[i]!];
        i = small;
      }
    }
    return top;
  }

  get size(): number {
    return this.items.length;
  }
}

/**
 * 多点始点の最短距離。
 *
 * 距離が縮まるときだけ先行ノードを書き換える。同じ距離で書き換えると、
 * 先行ノードの鎖が輪になって経路をたどれなくなる。
 * 同点の決着は取り出す順（距離 → nodeId）が付ける。始点が並んだときは
 * nodeId の辞書順で先に取り出されたものが勝つ。同じ入力なら同じ結果になる。
 */
function shortestFrom(
  starts: string[],
  adjacency: Adjacency,
  links: Map<string, GraphLink>,
  p: Passability,
  /** 始点ごとの持ち出しコスト。省略すると 0。 */
  initialCost?: Map<string, number>,
): Map<string, Reached> {
  const best = new Map<string, Reached>();
  const queue = new Heap();

  for (const s of [...new Set(starts)].sort()) {
    const d = initialCost?.get(s) ?? 0;
    best.set(s, { distanceM: d, prevNodeId: null, prevLinkId: null, sourceId: s });
    queue.push({ id: s, d });
  }

  const done = new Set<string>();
  while (queue.size > 0) {
    const head = queue.pop();
    if (!head) break;
    if (done.has(head.id)) continue;
    done.add(head.id);
    const from = best.get(head.id);
    if (!from) continue;

    for (const edge of adjacency.get(head.id) ?? []) {
      if (done.has(edge.to)) continue;
      const link = links.get(edge.linkId);
      if (!link || !passable(link, p)) continue;
      const next = from.distanceM + link.distanceM;
      const known = best.get(edge.to);
      if (known && next >= known.distanceM - EPS) continue;
      best.set(edge.to, {
        distanceM: next,
        prevNodeId: head.id,
        prevLinkId: edge.linkId,
        sourceId: from.sourceId,
      });
      queue.push({ id: edge.to, d: next });
    }
  }
  return best;
}

function tracePath(target: string, reached: Map<string, Reached>): { nodeIds: string[]; linkIds: string[] } {
  const nodeIds: string[] = [];
  const linkIds: string[] = [];
  const seen = new Set<string>();
  let cursor: string | null = target;
  while (cursor !== null) {
    if (seen.has(cursor)) throw new Error(`path cycle at ${cursor}`);
    seen.add(cursor);
    nodeIds.push(cursor);
    const step: Reached | undefined = reached.get(cursor);
    if (!step || step.prevNodeId === null) break;
    if (step.prevLinkId !== null) linkIds.push(step.prevLinkId);
    cursor = step.prevNodeId;
  }
  nodeIds.reverse();
  linkIds.reverse();
  return { nodeIds, linkIds };
}

// ---------------------------------------------------------------- 手順

type XY = { x: number; y: number };

function angleDeg(from: XY, via: XY, to: XY): number {
  const ax = via.x - from.x;
  const ay = via.y - from.y;
  const bx = to.x - via.x;
  const by = to.y - via.y;
  const cross = ax * by - ay * bx;
  const dot = ax * bx + ay * by;
  return (Math.atan2(cross, dot) * 180) / Math.PI;
}

function turnOf(deg: number): StepTurn {
  const a = Math.abs(deg);
  if (a < 20) return "straight";
  if (a < 60) return deg > 0 ? "slight_left" : "slight_right";
  return deg > 0 ? "left" : "right";
}

function verticalOf(link: GraphLink): StepVertical {
  if (link.vertical === "stairs" || link.vertical === "escalator" || link.vertical === "elevator") {
    return link.vertical;
  }
  return "none";
}

/** (0,0) は座標未取得のセンチネル。ingest がノードの座標を取れなかった印。 */
function isSentinel(p: XY): boolean {
  return p.x === 0 && p.y === 0;
}

/**
 * 経路 1 本ぶんの「クリーン座標列」を作る。`nodeIds` と同じ長さ・同じ並びで返す。
 *
 * 1. (0,0) センチネル(座標未取得)のノードは、経路上の前後の実座標ノードから
 *    リンク距離按分で線形補間する。
 * 2. 連続する辺のなす角が 160° を超える尖点(巨大な地物の代表点への往復)は、
 *    実在しない迂回として同じ按分補間に置き換える。ノード自体は経路から
 *    落とさない（steps の対象のまま。座標だけを差し替える）。
 *
 * 按分・角度判定は「良い点」（未補間かつ尖点でない）だけを基準にする。
 * 補間すると新しい尖点が生まれることがあるため、安定するまで数回だけ
 * やり直す（実データでは 1 経路あたり尖点は 1〜2 個で、すぐ収束する）。
 */
function cleanRouteCoordinates(
  nodeIds: string[],
  linkIds: string[],
  nodes: Map<string, GraphNode>,
  links: Map<string, GraphLink>,
): XY[] {
  const n = nodeIds.length;
  const raw: XY[] = nodeIds.map((id) => {
    const node = nodes.get(id);
    return { x: node?.x ?? 0, y: node?.y ?? 0 };
  });
  if (n === 0) return raw;

  // 累積距離（先頭ノードからの道のり）。按分の重みに使う。
  const cum: number[] = [0];
  for (let i = 0; i < linkIds.length; i++) {
    cum.push(cum[i]! + (links.get(linkIds[i]!)?.distanceM ?? 0));
  }

  const coords = raw.slice();
  const bad = raw.map(isSentinel);

  const fillBad = (): void => {
    let i = 0;
    while (i < n) {
      if (!bad[i]) {
        i++;
        continue;
      }
      const start = i;
      let end = i;
      while (end < n && bad[end]) end++;
      const beforeIdx = start - 1;
      const afterIdx = end;
      const before = beforeIdx >= 0 ? coords[beforeIdx] : undefined;
      const after = afterIdx < n ? coords[afterIdx] : undefined;
      for (let j = start; j < end; j++) {
        if (before && after) {
          const span = cum[afterIdx]! - cum[beforeIdx]!;
          const t = span > 0 ? (cum[j]! - cum[beforeIdx]!) / span : 0.5;
          coords[j] = { x: before.x + (after.x - before.x) * t, y: before.y + (after.y - before.y) * t };
        } else if (before) {
          coords[j] = before;
        } else if (after) {
          coords[j] = after;
        }
      }
      i = end;
    }
  };

  fillBad();

  // 折り返しスパイク除去。同じ地物に寄って同一座標に潰れたノード列がある
  // ままだと、隣接ノード直参照の角度判定は turn 判定と同じ縮退座標バグに落ちる
  // （尖った代表点のすぐ隣が同一座標の重複ノードだと、角度が 0 に潰れて
  // 尖点を見逃す）。「同一座標の連続run＝1 つの地点」としてクラスタにまとめ、
  // クラスタの代表座標どうしで角度を取る。クラスタ分けは埋め終わった座標の
  // 値だけで決める（不良点フラグでは分けない）。値だけで見ないと、(0,0) を
  // 補間で埋めた結果たまたま前後と同じ座標になったノードが不良点フラグの
  // せいで別クラスタに割れ、そのクラスタどうしの角度が (0,0) ベクトルに
  // 潰れて尖点を見逃す。160° を超えたらクラスタ全体を「不良点」にして
  // 埋め直す。新しい尖点が生まれなくなるまで数回だけやり直す
  // （実データでは 1 経路あたり尖点は 1〜2 個で、すぐ収束する）。
  for (let pass = 0; pass < 4; pass++) {
    const clusters: { start: number; end: number }[] = [];
    let i = 0;
    while (i < n) {
      const start = i;
      let end = i + 1;
      while (end < n && coords[end]!.x === coords[start]!.x && coords[end]!.y === coords[start]!.y) {
        end++;
      }
      clusters.push({ start, end });
      i = end;
    }

    let foundSpike = false;
    for (let c = 1; c < clusters.length - 1; c++) {
      const prevRep = coords[clusters[c - 1]!.start]!;
      const curRep = coords[clusters[c]!.start]!;
      const nextRep = coords[clusters[c + 1]!.start]!;
      const deg = Math.abs(angleDeg(prevRep, curRep, nextRep));
      if (deg > 160) {
        const { start, end } = clusters[c]!;
        for (let j = start; j < end; j++) bad[j] = true;
        foundSpike = true;
      }
    }
    if (!foundSpike) break;
    fillBad();
  }

  return coords;
}

/**
 * 座標が異なる直近のノードの index を探す。同じ地物に寄って同一座標に
 * 潰れたノード列で、実在の曲がりを直進と誤らないための参照点。
 * 見つからなければ null。
 */
function nearestDifferentCoordIndex(coords: XY[], from: number, direction: 1 | -1): number | null {
  const at = coords[from]!;
  for (let i = from + direction; i >= 0 && i < coords.length; i += direction) {
    const c = coords[i]!;
    if (c.x !== at.x || c.y !== at.y) return i;
  }
  return null;
}

/**
 * 同じ向きの `move` を連続させない。区切りは名前・曲がり・階変化だけで決めるが、
 * 曲がらずに階変化だけが何度も続くと、隣り合う区切りがどちらも
 * `turn: "straight"` の無名 `move`（＝実際には曲がっていない「直進する」move）に
 * なりうる。そうした隣接ペアだけ 1 つに畳む。実際に曲がる move（`turn` が
 * `straight` でない）は同じ向きが連続しても畳まない。それぞれが現地で踏む
 * 別々の曲がり角であり、`kind: "landmark"` 同様それ自体が意味を持つ。
 */
function mergeSameDirectionMoves(steps: Step[]): Step[] {
  const out: Step[] = [];
  for (const step of steps) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.kind === "move" &&
      step.kind === "move" &&
      prev.turn === "straight" &&
      step.turn === "straight"
    ) {
      prev.distanceM = round1(prev.distanceM + step.distanceM);
      prev.nodeId = step.nodeId;
      prev.floorLabel = step.floorLabel;
      if (step.vertical !== "none") prev.vertical = step.vertical;
      continue;
    }
    out.push({ ...step });
  }
  return out;
}

/**
 * 経路を画面の手順に変える。ノードをそのまま並べない。
 * 区切りは 名前のあるノード / 実際に曲がる / 階が変わる だけ。次数では区切らない
 * （網は設備への行き止まり枝が多く、次数で切ると「直進する」move が延々と並ぶ）。
 * 区切りの間の無名ノードは 1 つの move にまとめる。
 */
function buildSteps(
  nodeIds: string[],
  linkIds: string[],
  nodes: Map<string, GraphNode>,
  links: Map<string, GraphLink>,
): Step[] {
  const steps: Step[] = [];
  if (nodeIds.length === 0) return steps;

  const coords = cleanRouteCoordinates(nodeIds, linkIds, nodes, links);

  const first = nodes.get(nodeIds[0]!);
  if (first) {
    steps.push({
      kind: "landmark",
      nodeId: first.id,
      nameJa: first.nameJa,
      turn: "straight",
      vertical: "none",
      distanceM: 0,
      floorLabel: first.floorLabel,
    });
  }

  let pending = 0;
  let pendingVertical: StepVertical = "none";

  for (let i = 0; i < linkIds.length; i++) {
    const link = links.get(linkIds[i]!);
    const node = nodes.get(nodeIds[i + 1]!);
    if (!link || !node) continue;

    pending += link.distanceM;
    const v = verticalOf(link);
    if (v !== "none") pendingVertical = v;

    const nodeIdx = i + 1;
    // 角度は「座標が異なる直近のノード」で取る。同じ地物に寄って同一座標に
    // 潰れたノード列で、実在の曲がりを直進と誤らない。曲がりは座標が変わった
    // 最初のノードだけに帰属させる。直前と同じ座標のノードにまで同じ曲がりを
    // 重複させると、1 つの曲がりが座標クラスタの人数ぶん複製されてしまう。
    const prevCoord = coords[nodeIdx - 1]!;
    const curCoord = coords[nodeIdx]!;
    const arrivesAtNewCoord = curCoord.x !== prevCoord.x || curCoord.y !== prevCoord.y;
    let turn: StepTurn = "straight";
    if (arrivesAtNewCoord) {
      const nextIdx = nearestDifferentCoordIndex(coords, nodeIdx, 1);
      if (nextIdx !== null) {
        turn = turnOf(angleDeg(prevCoord, curCoord, coords[nextIdx]!));
      }
    }

    const isLast = i === linkIds.length - 1;
    const named = node.nameJa !== null;
    const floorChanged = link.deltaZ !== 0;
    const turns = turn !== "straight";

    if (named || floorChanged || turns || isLast) {
      steps.push({
        kind: named || isLast ? "landmark" : "move",
        nodeId: node.id,
        nameJa: named ? node.nameJa : null,
        turn,
        vertical: pendingVertical,
        distanceM: round1(pending),
        floorLabel: node.floorLabel,
      });
      pending = 0;
      pendingVertical = "none";
    }
  }

  return mergeSameDirectionMoves(steps);
}

function buildConfirmations(
  nodeIds: string[],
  linkIds: string[],
  nodes: Map<string, GraphNode>,
  links: Map<string, GraphLink>,
  /** 実分岐の次数（{@link branchDegrees}）。行き止まりの枝は数えない。 */
  branchDegree: Map<string, number>,
  confirmedNodeId: string | null,
): ConfirmationPoint[] {
  const out: ConfirmationPoint[] = [];
  const push = (nodeId: string, kind: ConfirmationPoint["kind"]) => {
    const node = nodes.get(nodeId);
    if (!node) return;
    if (out.some((c) => c.nodeId === nodeId)) return;
    out.push({ nodeId, kind, nameJa: node.nameJa ?? "", status: "pending" });
  };

  if (nodeIds.length > 0) push(nodeIds[0]!, "gate");
  for (let i = 0; i < linkIds.length; i++) {
    const link = links.get(linkIds[i]!);
    if (link && link.deltaZ !== 0) push(nodeIds[i]!, "floor");
    const node = nodeIds[i + 1];
    if (node && (branchDegree.get(node) ?? 0) >= 3) push(node, "branch");
  }
  if (nodeIds.length > 0) push(nodeIds[nodeIds.length - 1]!, "landmark");

  if (confirmedNodeId !== null) {
    const at = out.findIndex((c) => c.nodeId === confirmedNodeId);
    if (at >= 0) for (let i = 0; i <= at; i++) out[i]!.status = "confirmed";
  }
  return out;
}

// ---------------------------------------------------------------- 本体

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * 地上を歩く距離の見積もりに掛ける係数。
 *
 * 直線距離をそのまま使うと、駅の反対側にある目的地への地上ぶんを大きく
 * 短く見積もる。西口から歌舞伎町は直線 600m だが、実際は駅を回り込む。
 * その結果「早く外に出た方が得」に倒れ、遠い側の出口が選ばれなくなる。
 * 市街地の迂回率としてよく使われる 1.35 を掛けて釣り合いを取る。
 * 地上の本当の経路は Maps が出す。ここでは出口どうしを比べられれば足りる。
 */
const SURFACE_DETOUR = 1.35;

/**
 * 看板の文字がない出口に足す分。
 *
 * ラベルのある出口は現地で「7」の表示を見て確かめられる。無いものは
 * たどり着いても合っているか分からない。ほぼ同じ距離なら確かめられる方を選ぶ。
 * 距離の差がこれを超えれば、無名でも近い方が勝つ。
 */
const UNLABELLED_PENALTY_M = 60;

/** 直線距離。地上ぶんの見積もりにだけ使う。経路の長さには使わない。 */
function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** 出口から目的地への徒歩経路。地上のことは Maps の方が詳しい。 */
function mapsDirUrl(
  exit: { lat: number; lng: number },
  destinationNameJa: string,
): string {
  const origin = `${exit.lat},${exit.lng}`;
  return (
    "https://www.google.com/maps/dir/?api=1" +
    `&origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destinationNameJa)}` +
    "&travelmode=walking"
  );
}

export function recommend(dataset: Dataset, request: RecommendationRequest): RecommendationResponse {
  const { graph, catalog } = dataset;

  if (request.datasetId !== graph.datasetId) {
    throw new RecommendError("dataset_mismatch", "データセットが違います", {
      expected: graph.datasetId,
      received: request.datasetId,
    });
  }
  if (request.participants.length < 2) {
    throw new RecommendError("invalid_participants", "参加者が2人未満です");
  }
  const ids = new Set<string>();
  for (const p of request.participants) {
    if (ids.has(p.id)) {
      throw new RecommendError("invalid_participants", "参加者のIDが重複しています", { id: p.id });
    }
    ids.add(p.id);
  }

  const nodes = indexNodes(graph);
  const links = indexLinks(graph);
  const adjacency = buildAdjacency(graph);
  const reverseAdjacency = buildReverseAdjacency(graph);
  // 実分岐の次数。行き止まりの枝（設備への袋小路）は数えない。branchCount と
  // confirmations の branch 判定、旧 steps の区切り判定に使っていたが、
  // steps は次数で区切らなくなった（docs/RECOMMENDER.md「steps は経路を…」）。
  const branchDegree = branchDegrees(graph);

  const destination = catalog.destinations.find((d) => d.catalogId === request.destination.id);
  if (!destination) {
    throw new RecommendError("unknown_catalog", "目的地が見つかりません", {
      catalogId: request.destination.id,
    });
  }

  if (catalog.exits.length === 0) {
    throw new RecommendError("unknown_catalog", "出口が登録されていません");
  }

  const accessibility = request.constraints?.accessibility ?? "any";
  const asOf = request.constraints?.asOf ?? null;
  const pass: Passability = { accessibility, asOf };
  const relaxed: Passability = { accessibility: "any", asOf: null };

  // 参加者ごとの始点を決める。
  const starts = new Map<string, string[]>();
  for (const p of request.participants) {
    let list: string[];
    if (p.confirmed) {
      if (!nodes.has(p.confirmed.id)) {
        throw new RecommendError("unknown_node", "確認済みノードがグラフにありません", {
          participantId: p.id,
          nodeId: p.confirmed.id,
        });
      }
      list = [p.confirmed.id];
    } else if (p.entry.kind === "line") {
      const lineId = p.entry.id;
      list = catalog.entries.filter((e) => e.lineIds.includes(lineId)).map((e) => e.nodeId);
      if (list.length === 0) {
        throw new RecommendError("unknown_line", "路線に対応する改札がありません", {
          participantId: p.id,
          lineId: p.entry.id,
        });
      }
    } else if (p.entry.kind === "catalog") {
      const found = catalog.entries.find((e) => e.catalogId === p.entry.id);
      if (!found) {
        throw new RecommendError("unknown_catalog", "改札が見つかりません", {
          participantId: p.id,
          catalogId: p.entry.id,
        });
      }
      list = [found.nodeId];
    } else {
      if (!nodes.has(p.entry.id)) {
        throw new RecommendError("unknown_node", "開始ノードがグラフにありません", {
          participantId: p.id,
          nodeId: p.entry.id,
        });
      }
      list = [p.entry.id];
    }
    for (const nodeId of list) {
      if (!nodes.has(nodeId)) {
        throw new RecommendError("unknown_node", "カタログのノードがグラフにありません", { nodeId });
      }
    }
    starts.set(p.id, list);
  }

  const reachedByParticipant = new Map<string, Map<string, Reached>>();
  for (const p of request.participants) {
    reachedByParticipant.set(p.id, shortestFrom(starts.get(p.id)!, adjacency, links, pass));
  }
  // どの集合候補にも届かない人がいれば、グラフの欠け。
  const unreachable = request.participants.filter((p) => {
    const reached = reachedByParticipant.get(p.id)!;
    return !catalog.meetings.some((m) => reached.has(m.nodeId));
  });
  if (unreachable.length > 0) {
    throw new RecommendError("disconnected", "集合候補まで届かない参加者がいます", {
      participantIds: unreachable.map((p) => p.id),
    });
  }

  // 意味上ほしいのは集合場所→出口。出口から順方向に探すと向きが逆になる。
  // 逆隣接で全出口を始点にした多点最短を 1 回取り、持ち出しコスト（地上の見積もり）
  // を始点の初期コストにする。選ばれた出口は sourceId が持っている。
  const exitById = new Map(catalog.exits.map((e) => [e.nodeId, e]));
  const surfaceCost = new Map(
    catalog.exits.map(
      (e) =>
        [
          e.nodeId,
          haversineM(e, destination) * SURFACE_DETOUR + (e.label === "" ? UNLABELLED_PENALTY_M : 0),
        ] as const,
    ),
  );
  const fromExits = shortestFrom(
    catalog.exits.map((e) => e.nodeId),
    reverseAdjacency,
    links,
    pass,
    surfaceCost,
  );

  // infeasible の原因判定（制約が理由か、そもそもグラフが欠けているか）に使う
  // 「制約を外したら届くか」を、候補ごとに探索し直さず、参加者ごと(P 回)＋出口側
  // (1 回)だけ事前計算しておく。候補数ぶん(実データで 242 件)探索を回し直すと、
  // 段差なし応答が 6 倍以上遅くなる（実測 24ms → 162ms）。
  const needsCauseCheck = accessibility === "step_free" || asOf !== null;
  const relaxedReachedByParticipant = needsCauseCheck
    ? new Map(
        request.participants.map(
          (p) => [p.id, shortestFrom(starts.get(p.id)!, adjacency, links, relaxed)] as const,
        ),
      )
    : null;
  const relaxedFromExits = needsCauseCheck
    ? shortestFrom(catalog.exits.map((e) => e.nodeId), reverseAdjacency, links, relaxed, surfaceCost)
    : null;

  type Scored = {
    meeting: (typeof catalog.meetings)[number];
    maxDistanceM: number;
    sumDistanceM: number;
    onwardDistanceM: number;
    exitNodeId: string;
    explainability: number;
    legs: Leg[];
  };

  const scored: Scored[] = [];
  const infeasible: RecommendationResponse["infeasible"] = [];

  for (const meeting of catalog.meetings) {
    const node = nodes.get(meeting.nodeId);
    if (!node) {
      throw new RecommendError("unknown_node", "集合候補がグラフにありません", {
        nodeId: meeting.nodeId,
      });
    }
    const onward = fromExits.get(meeting.nodeId);
    const legs: Leg[] = [];
    let ok = onward !== undefined;

    for (const p of request.participants) {
      const reached = reachedByParticipant.get(p.id)!.get(meeting.nodeId);
      if (!reached) {
        ok = false;
        break;
      }
      const { nodeIds, linkIds } = tracePath(meeting.nodeId, reachedByParticipant.get(p.id)!);
      const entryNode = nodes.get(reached.sourceId)!;
      const entryCatalog = catalog.entries.find((e) => e.nodeId === reached.sourceId);
      let floorChanges = 0;
      for (const linkId of linkIds) floorChanges += Math.abs(links.get(linkId)?.deltaZ ?? 0);
      let branchCount = 0;
      for (const nodeId of nodeIds) if ((branchDegree.get(nodeId) ?? 0) >= 3) branchCount++;

      legs.push({
        participantId: p.id,
        entry: {
          nodeId: entryNode.id,
          catalogId: entryCatalog?.catalogId ?? null,
          nameJa: entryCatalog?.nameJa ?? entryNode.nameJa ?? "",
        },
        distanceM: round1(reached.distanceM),
        costSeconds: Math.round(reached.distanceM / WALKING_SPEED_MPS),
        floorChanges,
        branchCount,
        steps: buildSteps(nodeIds, linkIds, nodes, links),
        pathNodeIds: nodeIds,
        pathLinkIds: linkIds,
        confirmations: buildConfirmations(
          nodeIds,
          linkIds,
          nodes,
          links,
          branchDegree,
          request.participants.find((x) => x.id === p.id)?.confirmed?.id ?? null,
        ),
      });
    }

    if (!ok) {
      // 制約が原因か、そもそも繋がっていないか（グラフの欠け）を分ける。
      // 参加者側（改札→集合場所）・出口側（集合場所→出口）のどちらが落ちていても、
      // 緩和すれば両方とも届くときだけ制約が原因。それでも届かなければグラフの欠け。
      let cause: ReasonCode = "unreachable";
      if (relaxedReachedByParticipant && relaxedFromExits) {
        const participantsReachRelaxed = request.participants.every((p) =>
          relaxedReachedByParticipant.get(p.id)!.has(meeting.nodeId),
        );
        const exitReachesRelaxed = relaxedFromExits.has(meeting.nodeId);
        if (participantsReachRelaxed && exitReachesRelaxed) {
          cause = accessibility === "step_free" ? "step_free" : "hours";
        }
      }
      infeasible.push({
        nodeId: meeting.nodeId,
        nameJa: meeting.nameJa,
        reason: cause,
        textJa:
          cause === "step_free"
            ? "段差なしでは行けません"
            : cause === "hours"
              ? "いまの時間帯は通れません"
              : "全員が行ける経路がありません",
      });
      continue;
    }

    scored.push({
      meeting,
      maxDistanceM: round1(Math.max(...legs.map((l) => l.distanceM))),
      sumDistanceM: round1(legs.reduce((a, l) => a + l.distanceM, 0)),
      // 持ち出しぶん（地上の見積もりとラベルの加点）を引いて、歩く距離だけを残す。
      onwardDistanceM: round1(onward!.distanceM - (surfaceCost.get(onward!.sourceId) ?? 0)),
      exitNodeId: onward!.sourceId,
      explainability: meeting.explainability,
      legs,
    });
  }

  if (scored.length === 0) {
    throw new RecommendError("no_feasible_meeting", "条件を満たす集合場所がありません", {
      infeasibleNodeIds: infeasible.map((i) => i.nodeId),
    });
  }

  // 並べ方は PRODUCT.md の順。同点だけ次へ進む。最後は nodeId の辞書順。
  const keys = ["maxDistanceM", "sumDistanceM", "onwardDistanceM"] as const;
  scored.sort((a, b) => {
    for (const k of keys) {
      if (Math.abs(a[k] - b[k]) > EPS) return a[k] - b[k];
    }
    if (a.explainability !== b.explainability) return b.explainability - a.explainability;
    return a.meeting.nodeId < b.meeting.nodeId ? -1 : 1;
  });

  const decidingReason = (a: Scored, b: Scored): ReasonCode => {
    if (Math.abs(a.maxDistanceM - b.maxDistanceM) > EPS) return "minimax";
    if (Math.abs(a.sumDistanceM - b.sumDistanceM) > EPS) return "min_sum";
    if (Math.abs(a.onwardDistanceM - b.onwardDistanceM) > EPS) return "onward";
    if (a.explainability !== b.explainability) return "landmark";
    return "feasible";
  };

  const ranked: MeetingCandidate[] = scored.map((s, i) => {
    // reasons を入れるのは 1 位だけ（CORE.md）。2 位以降は根拠を並び順で示す。
    const reasons: { code: ReasonCode; textJa: string }[] = [];
    if (i === 0) {
      const neighbour = scored[1];
      if (neighbour) {
        const code = decidingReason(s, neighbour);
        reasons.push({ code, textJa: REASON_TEXT[code] });
      } else {
        reasons.push({ code: "feasible", textJa: REASON_TEXT.feasible });
      }
      if (accessibility === "step_free") {
        reasons.push({ code: "step_free", textJa: REASON_TEXT.step_free });
      }
    }
    const node = nodes.get(s.meeting.nodeId)!;
    const exit = exitById.get(s.exitNodeId)!;
    const onwardPath = tracePath(s.meeting.nodeId, fromExits);
    // 逆探索の復元は出口始まりなので、もう一度反転して集合場所→出口にする。
    onwardPath.nodeIds.reverse();
    onwardPath.linkIds.reverse();
    return {
      rank: i + 1,
      meeting: {
        nodeId: s.meeting.nodeId,
        catalogId: s.meeting.catalogId,
        nameJa: s.meeting.nameJa,
        floorLabel: node.floorLabel ?? "",
        evidence: s.meeting.evidence,
      },
      scores: {
        maxDistanceM: s.maxDistanceM,
        sumDistanceM: s.sumDistanceM,
        onwardDistanceM: s.onwardDistanceM,
        explainability: s.explainability,
      },
      reasons,
      legs: s.legs,
      onward: {
        distanceM: s.onwardDistanceM,
        pathNodeIds: onwardPath.nodeIds,
        pathLinkIds: onwardPath.linkIds,
        steps: buildSteps(onwardPath.nodeIds, onwardPath.linkIds, nodes, links),
        exit: {
          nodeId: exit.nodeId,
          catalogId: exit.catalogId,
          label: exit.label,
          nameJa: exit.nameJa,
          evidence: exit.evidence,
          lat: exit.lat,
          lng: exit.lng,
          mapsDirUrl: mapsDirUrl(exit, destination.nameJa),
        },
      },
    };
  });

  return {
    dataset: {
      id: graph.datasetId,
      version: graph.datasetVersion,
      graphHash: graph.graphHash,
      attributionJa: graph.attributionJa,
    },
    walkingSpeedMps: WALKING_SPEED_MPS,
    ranked,
    infeasible,
  };
}
