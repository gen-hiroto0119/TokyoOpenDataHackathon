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
  buildAdjacency,
  degrees,
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

function angleDeg(from: GraphNode, via: GraphNode, to: GraphNode): number {
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

/**
 * 経路を画面の手順に変える。ノードをそのまま並べない。
 * 区切りは 名前のあるノード / 方向が変わる / 階が変わる / 次数3以上。
 * 区切りの間の無名ノードは 1 つの move にまとめる。
 */
function buildSteps(
  nodeIds: string[],
  linkIds: string[],
  nodes: Map<string, GraphNode>,
  links: Map<string, GraphLink>,
  degree: Map<string, number>,
): Step[] {
  const steps: Step[] = [];
  if (nodeIds.length === 0) return steps;

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

    const prev = nodes.get(nodeIds[i]!);
    const nextNode = i + 1 < linkIds.length ? nodes.get(nodeIds[i + 2]!) : undefined;
    const deg = degree.get(node.id) ?? 0;
    const turn = prev && nextNode ? turnOf(angleDeg(prev, node, nextNode)) : "straight";

    const isLast = i === linkIds.length - 1;
    const named = node.nameJa !== null;
    const floorChanged = link.deltaZ !== 0;
    const branches = deg >= 3;
    const turns = turn !== "straight";

    if (named || floorChanged || branches || turns || isLast) {
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

  return steps;
}

function buildConfirmations(
  nodeIds: string[],
  linkIds: string[],
  nodes: Map<string, GraphNode>,
  links: Map<string, GraphLink>,
  degree: Map<string, number>,
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
    if (node && (degree.get(node) ?? 0) >= 3) push(node, "branch");
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
  const degree = degrees(graph);

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

  // どの出口から出るかは「集合場所から出口までの徒歩 ＋ 出口から目的地までの直線」
  // の合計が一番短いもの。出口ごとに探索を回すと 72 回になるので、
  // 各出口の持ち出しコストを目的地までの直線距離にして多点探索を一度だけ回す。
  // 選ばれた出口は sourceId が持っている。
  //
  // 地上ぶんは直線に迂回率を掛けた見積もり。正確な経路は Maps に任せる。
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
    adjacency,
    links,
    pass,
    surfaceCost,
  );

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
      for (const nodeId of nodeIds) if ((degree.get(nodeId) ?? 0) >= 3) branchCount++;

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
        steps: buildSteps(nodeIds, linkIds, nodes, links, degree),
        pathNodeIds: nodeIds,
        pathLinkIds: linkIds,
        confirmations: buildConfirmations(
          nodeIds,
          linkIds,
          nodes,
          links,
          degree,
          request.participants.find((x) => x.id === p.id)?.confirmed?.id ?? null,
        ),
      });
    }

    if (!ok) {
      // 制約が原因か、そもそも繋がっていないかを分ける。
      let cause: ReasonCode = "feasible";
      if (accessibility === "step_free" || asOf !== null) {
        const relaxedReach = request.participants.every((p) =>
          shortestFrom(starts.get(p.id)!, adjacency, links, relaxed).has(meeting.nodeId),
        );
        if (relaxedReach) cause = accessibility === "step_free" ? "step_free" : "hours";
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
    const neighbour = scored[i + 1] ?? scored[i - 1];
    const reasons: { code: ReasonCode; textJa: string }[] = [];
    if (neighbour) {
      const code = decidingReason(s, neighbour);
      reasons.push({ code, textJa: REASON_TEXT[code] });
    } else {
      reasons.push({ code: "feasible", textJa: REASON_TEXT.feasible });
    }
    if (accessibility === "step_free") {
      reasons.push({ code: "step_free", textJa: REASON_TEXT.step_free });
    }
    const node = nodes.get(s.meeting.nodeId)!;
    const exit = exitById.get(s.exitNodeId)!;
    const onwardPath = tracePath(s.meeting.nodeId, fromExits);
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
