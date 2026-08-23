// "/r/:roomId" : セッション無→画面2、entry 無→画面3、以降はタブで画面4/5。
// 410/404 は終了画面に、401/403(と自分がルームから消えているとき)は
// セッションを消して画面2へ戻す。
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { screen } from "../tokens/layout.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { ApiError, api } from "../api.js";
import { AppBar } from "../components/AppBar.js";
import { Button } from "../components/Button.js";
import type { InviteState } from "../components/Invite.js";
import type { ReportSelected } from "../components/Report.js";
import { Status } from "../components/Status.js";
import { TabBar, type TabBarSelected } from "../components/TabBar.js";
import {
  arrivalDetailOf,
  assignedGateLegsOf,
  assignedGateNameOf,
  effortLabel,
  factsLabel,
  initialOf,
  lineNameOf,
  minutesLabel,
  nameOf,
  progressOf,
  reportLabelOf,
  reportOf,
  reportSelectedOf,
} from "../room-view.js";
import { fallbackAnchorNodeId, handoffFrom, mapOfRoute, myLegFromRoute, rowsOfRoute } from "../route-view.js";
import { ArrivalInfo } from "../screens/ArrivalInfo.js";
import {
  CandidateCompare,
  type CandidateCompareCandidate,
  type CandidateCompareInfeasible,
} from "../screens/CandidateCompare.js";
import { JoinConfirm } from "../screens/JoinConfirm.js";
import { RouteGuide } from "../screens/RouteGuide.js";
import { RoomStatus } from "../screens/RoomStatus.js";
import {
  type Session,
  clearSession,
  loadExitReport,
  loadSession,
  saveExitReport,
  saveSession,
} from "../session.js";
import {
  useCatalog,
  useRoom,
  useRoomRecommendations,
  useRoomRoute,
} from "../swr.js";
import { useRoomSocket } from "../ws.js";

const shellStyles = stylex.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
    textAlign: "center",
  },
  message: {
    margin: 0,
    color: color["--color-text-primary"],
  },
});

function TerminalScreen({
  message,
  onCreateNew,
}: {
  message: string;
  onCreateNew: () => void;
}) {
  return (
    <div className={stylexClassName(screen.frame, shellStyles.root)}>
      <p className={stylexClassName(shellStyles.message)}>{message}</p>
      <Button Label="新しいルームを作る" Size="Large" Style="Primary" onClick={onCreateNew} />
    </div>
  );
}

const routeStyles = stylex.create({
  content: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
    padding: 16,
    overflowX: "hidden",
    overflowY: "auto",
  },
});

/** 画面6(自分の経路)を出す前の読み込み中・失敗の枠。CandidateCompare と同じ Status を使う。 */
function RouteStatusScreen({
  state,
  onRetry,
  onTabSelect,
  onBack,
}: {
  state: "loading" | "error";
  onRetry?: () => void;
  onTabSelect?: (selected: TabBarSelected) => void;
  onBack?: () => void;
}) {
  return (
    <div className={stylexClassName(screen.frame)}>
      <AppBar Title="経路" Back={onBack ? "Shown" : "Hidden"} onBack={onBack} />
      <div className={stylexClassName(routeStyles.content)}>
        <Status State={state === "loading" ? "Progress" : "Failed"} onRetry={onRetry} />
      </div>
      <TabBar Selected="Route" onSelect={onTabSelect} />
    </div>
  );
}

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  if (!roomId) return null;
  // roomId が変わったら状態を作り直す(別ルームへ移ることは無い想定だが、安全のため)。
  return <RoomPageInner key={roomId} roomId={roomId} />;
}

type Terminal = "expired" | "dissolved" | null;

function RoomPageInner({ roomId }: { roomId: string }) {
  const navigate = useNavigate();
  const [terminal, setTerminal] = useState<Terminal>(null);
  const [session, setSession] = useState<Session | null>(() => loadSession(roomId));
  const [rejoinNotice, setRejoinNotice] = useState(false);
  const [tab, setTab] = useState<TabBarSelected>("Room");
  const [inviteCopiedAt, setInviteCopiedAt] = useState<number | null>(null);

  useEffect(() => {
    if (inviteCopiedAt === null) return;
    const id = window.setTimeout(() => setInviteCopiedAt(null), 2500);
    return () => window.clearTimeout(id);
  }, [inviteCopiedAt]);

  const inviteLink = `${location.origin}/r/${roomId}`;
  const inviteState: InviteState = inviteCopiedAt !== null ? "Copied" : "Default";

  async function handleInviteCopy() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteCopiedAt(Date.now());
    } catch {
      // コピーできなくてもボタンは Default のまま。
    }
  }

  const { data: room, error: roomError, mutate: mutateRoom } = useRoom(terminal ? null : roomId);
  useRoomSocket(terminal ? null : roomId);
  const { data: catalog } = useCatalog();

  useEffect(() => {
    if (roomError instanceof ApiError) {
      if (roomError.status === 410) {
        clearSession(roomId);
        setTerminal("expired");
      } else if (roomError.status === 404) {
        clearSession(roomId);
        setTerminal("dissolved");
      }
    }
  }, [roomError, roomId]);

  // セッションはあるのに自分がルームに見当たらない(トークンが失効した後の
  // ルーム再構成など)。参加をやり直させる。
  useEffect(() => {
    if (session && room && !room.participants.some((p) => p.id === session.participantId)) {
      clearSession(roomId);
      setSession(null);
      setRejoinNotice(true);
    }
  }, [session, room, roomId]);

  function handleUnauthorized(error: unknown): boolean {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      clearSession(roomId);
      setSession(null);
      setRejoinNotice(true);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------- 画面2: 参加
  const [joinName, setJoinName] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(false);

  async function handleJoin() {
    if (!joinName.trim()) return;
    setJoining(true);
    setJoinError(false);
    try {
      const result = await api.join(roomId, joinName);
      saveSession(roomId, {
        v: 1,
        participantId: result.participantId,
        token: result.participantToken,
        role: "guest",
        expiresAt: result.room.expiresAt,
      });
      setRejoinNotice(false);
      setSession(loadSession(roomId));
      await mutateRoom(result.room, { revalidate: false });
    } catch (error) {
      if (error instanceof ApiError && error.status === 410) {
        clearSession(roomId);
        setTerminal("expired");
        return;
      }
      if (error instanceof ApiError && error.status === 404) {
        clearSession(roomId);
        setTerminal("dissolved");
        return;
      }
      setJoinError(true);
    } finally {
      setJoining(false);
    }
  }

  // ---------------------------------------------------------- 画面3: 到着情報
  const me = room?.participants.find((p) => p.id === session?.participantId) ?? null;
  const [lineId, setLineId] = useState<string | null>(
    me?.entry?.kind === "line" ? me.entry.id : null,
  );
  const [savingEntry, setSavingEntry] = useState(false);
  const [entryError, setEntryError] = useState(false);

  async function handleSaveEntry() {
    if (!lineId || !session) return;
    setSavingEntry(true);
    setEntryError(false);
    try {
      const updated = await api.updateParticipant(
        roomId,
        session.participantId,
        { entry: { kind: "line", id: lineId } },
        session.token,
      );
      await mutateRoom(updated, { revalidate: false });
    } catch (error) {
      if (!handleUnauthorized(error)) setEntryError(true);
    } finally {
      setSavingEntry(false);
    }
  }

  // ---------------------------------------------------------- 画面4: 到着申告
  async function handleReportSelect(selected: Exclude<ReportSelected, "None">) {
    if (!session) return;
    try {
      const updated = await api.updateParticipant(
        roomId,
        session.participantId,
        { report: reportOf(selected) },
        session.token,
      );
      await mutateRoom(updated, { revalidate: false });
    } catch (error) {
      handleUnauthorized(error);
    }
  }

  // ---------------------------------------------------------- 画面4: 退出・解散
  const [leaveError, setLeaveError] = useState(false);
  const [dissolveError, setDissolveError] = useState(false);

  /** 参加者(guest)。確認は取らない — リンクがあれば入り直せる。 */
  async function handleLeave() {
    if (!session) return;
    setLeaveError(false);
    try {
      await api.leave(roomId, session.participantId, session.token);
      clearSession(roomId);
      navigate("/");
    } catch (error) {
      if (!handleUnauthorized(error)) setLeaveError(true);
    }
  }

  /** 主催者(host)。RoomStatus 側で確認を出したあとに呼ばれる。 */
  async function handleDissolve() {
    if (!session) return;
    setDissolveError(false);
    try {
      await api.dissolve(roomId, session.token);
      clearSession(roomId);
      navigate("/");
    } catch (error) {
      if (!handleUnauthorized(error)) setDissolveError(true);
    }
  }

  // ---------------------------------------------------------- 画面5: 集合候補
  // 集合場所が決まっているときは候補一覧を取らない。経路は route API だけ。
  const {
    data: recs,
    error: recsError,
    mutate: mutateRecs,
  } = useRoomRecommendations(
    terminal || !room || room.meetingCatalogId !== null ? null : roomId,
    room?.updatedAt,
  );

  // 画面6: 集合場所が決まっているときだけ 1 地点の経路を取る。
  const {
    data: route,
    error: routeError,
    mutate: mutateRoute,
  } = useRoomRoute(
    terminal || !room ? null : roomId,
    room?.meetingCatalogId ?? null,
    room?.updatedAt,
  );

  async function handleChoose(catalogId: string) {
    if (!session) return;
    try {
      const updated = await api.updateRoom(roomId, { meetingCatalogId: catalogId }, session.token);
      await mutateRoom(updated, { revalidate: false });
    } catch (error) {
      handleUnauthorized(error);
    }
  }

  // ---------------------------------------------------- 画面6: 自分の経路
  const [exitReport, setExitReport] = useState(() => loadExitReport(roomId));
  const [correctingExit, setCorrectingExit] = useState(false);
  const [correctExitError, setCorrectExitError] = useState(false);

  async function handleCorrectExit(exitCatalogId: string, labelJa: string) {
    setCorrectingExit(true);
    setCorrectExitError(false);
    try {
      await api.reportExit(exitCatalogId, labelJa);
      setExitReport(saveExitReport(roomId, exitCatalogId, labelJa));
    } catch {
      setCorrectExitError(true);
    } finally {
      setCorrectingExit(false);
    }
  }

  // ---------------------------------------------------------- 画面の導出

  if (terminal === "expired") {
    return (
      <TerminalScreen message="このルームは期限が過ぎています" onCreateNew={() => navigate("/")} />
    );
  }
  if (terminal === "dissolved") {
    return <TerminalScreen message="このルームは解散しました" onCreateNew={() => navigate("/")} />;
  }

  if (!room) {
    // 読み込み中。localStorage のキャッシュがあれば keepPreviousData が
    // ここへ来る前に埋める(地下対策)。
    return <div className={stylexClassName(screen.frame)} />;
  }

  if (!session) {
    return (
      <JoinConfirm
        name={joinName}
        onNameChange={setJoinName}
        onSubmit={handleJoin}
        submitDisabled={joining || !joinName.trim()}
        error={joinError}
        onRetry={handleJoin}
        sessionExpired={rejoinNotice}
        onBack={() => navigate("/")}
      />
    );
  }

  if (!me) {
    // room.participants との突き合わせが済むまでの一瞬。useEffect が
    // セッションを消すので、すぐ上の分岐に落ちる。
    return <div className={stylexClassName(screen.frame)} />;
  }

  if (me.entry === null) {
    const lineOptions = (catalog?.lines ?? []).map((l) => ({ value: l.id, label: l.nameJa }));
    const selectedLabel = lineId
      ? (catalog?.lines.find((l) => l.id === lineId)?.nameJa ?? null)
      : null;
    return (
      <ArrivalInfo
        destinationName={room.destination.nameJa}
        lineOptions={lineOptions}
        lineLabel={selectedLabel}
        onLineChange={setLineId}
        onSubmit={handleSaveEntry}
        submitDisabled={savingEntry || !lineId}
        error={entryError}
        onRetry={handleSaveEntry}
        inviteLink={session.role === "host" ? inviteLink : undefined}
        inviteState={inviteState}
        onInviteCopy={handleInviteCopy}
      />
    );
  }

  if (tab === "Room") {
    const lines = catalog?.lines ?? [];
    const gateLegs = assignedGateLegsOf(
      room.meetingCatalogId !== null,
      recs?.kind === "ready" ? recs.data.ranked[0]?.legs : undefined,
      route?.kind === "ready" ? route.data.legs : undefined,
    );
    const meView = {
      id: me.id,
      Name: me.nameJa,
      Detail: arrivalDetailOf(lineNameOf(lines, me.entry), assignedGateNameOf(gateLegs, me.id)),
      Initial: initialOf(me.nameJa),
      Progress: progressOf(me),
      ShowReport: me.report !== null,
      Report: reportLabelOf(me.report),
    };
    const others = room.participants
      .filter((p) => p.id !== me.id)
      .map((p) => ({
        id: p.id,
        Name: p.nameJa,
        Detail: arrivalDetailOf(lineNameOf(lines, p.entry), assignedGateNameOf(gateLegs, p.id)),
        Initial: initialOf(p.nameJa),
        Progress: progressOf(p),
        ShowReport: p.report !== null,
        Report: reportLabelOf(p.report),
      }));
    return (
      <RoomStatus
        destinationName={room.destination.nameJa}
        me={meView}
        meReportSelected={reportSelectedOf(me.report)}
        onMeReportSelect={handleReportSelect}
        others={others}
        role={session.role}
        onLeave={handleLeave}
        leaveError={leaveError}
        onDissolve={handleDissolve}
        dissolveError={dissolveError}
        onTabSelect={setTab}
        inviteLink={session.role === "host" ? inviteLink : undefined}
        inviteState={inviteState}
        onInviteCopy={handleInviteCopy}
      />
    );
  }

  // tab === "Route"
  if (room.meetingCatalogId !== null) {
    // 集合場所が決まっている: 画面5(候補比較)ではなく画面6(自分の経路)。
    if (routeError) {
      return (
        <RouteStatusScreen
          state="error"
          onRetry={() => void mutateRoute()}
          onTabSelect={setTab}
          onBack={() => setTab("Room")}
        />
      );
    }
    if (!route || route.kind === "waiting") {
      return <RouteStatusScreen state="loading" onTabSelect={setTab} onBack={() => setTab("Room")} />;
    }
    const my = myLegFromRoute(route.data, me.id);
    if (!my) {
      return (
        <RouteStatusScreen
          state="error"
          onRetry={() => void mutateRoute()}
          onTabSelect={setTab}
          onBack={() => setTab("Room")}
        />
      );
    }

    const effectiveAnchor = fallbackAnchorNodeId(my.leg.confirmations);
    const exit = my.route.onward.exit;
    return (
      <RouteGuide
        key={effectiveAnchor ?? "start"}
        rows={rowsOfRoute(my.route, my.leg)}
        map={mapOfRoute(my.route, me.id)}
        attributionJa={my.route.dataset.attributionJa}
        anchorNodeId={effectiveAnchor}
        HandoffFrom={handoffFrom(exit.label)}
        HandoffTo={room.destination.nameJa}
        HandoffUncertain={exit.evidence === "hypothesis"}
        HandoffReported={exitReport?.exitCatalogId === exit.catalogId}
        HandoffCorrectBusy={correctingExit}
        HandoffCorrectError={correctExitError}
        onOpenMap={() => window.open(exit.mapsDirUrl, "_blank", "noopener,noreferrer")}
        onCorrectExit={(labelJa) => void handleCorrectExit(exit.catalogId, labelJa)}
        onTabSelect={setTab}
      />
    );
  }

  // 集合場所が未決定: 画面5(候補比較)。
  const isHost = session.role === "host";
  const action = isHost ? "Shown" : "Hidden";

  let status: "loading" | "waiting" | "ready" | "error";
  let candidates: CandidateCompareCandidate[] = [];
  let waitingNames: string[] = [];
  let errorMessage: string | undefined;
  let infeasible: CandidateCompareInfeasible[] = [];

  if (recsError) {
    // 422 no_feasible_meeting / disconnected 等。サーバーの理由(messageJa)を
    // そのまま画面5へ渡す — クライアントで文を作らない(推薦理由と同じ方針)。
    status = "error";
    if (recsError instanceof ApiError) errorMessage = recsError.body.messageJa;
  } else if (!recs) {
    status = "loading";
  } else if (recs.kind === "waiting") {
    status = "waiting";
    waitingNames = recs.waitingFor
      .map((id) => nameOf(room.participants, id))
      .filter((n) => n.length > 0);
  } else {
    infeasible = recs.data.infeasible.map((p) => ({
      nodeId: p.nodeId,
      Name: p.nameJa,
      Reason: p.textJa,
    }));
    if (recs.data.ranked.length === 0) {
      // 応答は返ったが候補ゼロ。エラーと同じ扱いにする(サーバーからの理由は無い)。
      status = "error";
    } else {
      status = "ready";
      candidates = recs.data.ranked.map((c, index) => ({
        catalogId: c.meeting.catalogId,
        nodeId: c.meeting.nodeId,
        Name: c.meeting.nameJa,
        Floor: c.meeting.floorLabel,
        Reason: index === 0 ? (c.reasons[0]?.textJa ?? "") : "",
        Facts: factsLabel(c.onward.distanceM, recs.data.walkingSpeedMps),
        // facilities はまだ応答に無いことがある(worker 側の契約拡張が別作業中)。
        // 無くても壊れないよう、既定は false にする。設備は順位に使わない(docs/RECOMMENDER.md)。
        ShowElevator: c.meeting.facilities?.elevator ?? false,
        ShowRestroom: c.meeting.facilities?.restroom ?? false,
        ShowStepFree: c.meeting.facilities?.stepFree ?? false,
        People: c.legs.map((leg) => ({
          Who: nameOf(room.participants, leg.participantId),
          Minutes: minutesLabel(leg.costSeconds),
          Effort: effortLabel(leg.floorChanges, leg.branchCount),
        })),
        Selected: room.meetingCatalogId !== null && c.meeting.catalogId === room.meetingCatalogId,
      }));
    }
  }

  return (
    <CandidateCompare
      Action={action}
      status={status}
      candidates={candidates}
      waitingNames={waitingNames}
      errorMessage={errorMessage}
      infeasible={infeasible}
      onChoose={handleChoose}
      onRetry={() => void mutateRecs()}
      onTabSelect={setTab}
      onBack={() => setTab("Room")}
    />
  );
}
