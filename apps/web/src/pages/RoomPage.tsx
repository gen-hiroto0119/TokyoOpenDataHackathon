// "/r/:roomId" : セッション無→画面2、entry 無→画面3、以降はタブで画面4/5。
// 410/404 は終了画面に、401/403(と自分がルームから消えているとき)は
// セッションを消して画面2へ戻す。
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { ApiError, api } from "../api.js";
import { AppBar } from "../components/AppBar.js";
import { Button } from "../components/Button.js";
import type { ReportSelected } from "../components/Report.js";
import { Status } from "../components/Status.js";
import { TabBar, type TabBarSelected } from "../components/TabBar.js";
import {
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
import { fallbackAnchorNodeId, handoffFrom, hereRowsOf, myLegOf, rowsOfLeg } from "../route-view.js";
import { ArrivalInfo } from "../screens/ArrivalInfo.js";
import { CandidateCompare, type CandidateCompareCandidate } from "../screens/CandidateCompare.js";
import { Here } from "../screens/Here.js";
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
import { primeRoomRecommendations, useCatalog, useRoom, useRoomRecommendations } from "../swr.js";
import { useRoomSocket } from "../ws.js";

const shellStyles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    width: 390,
    height: 844,
    overflow: "hidden",
    backgroundColor: color["--color-surface-shell"],
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
    <div className={stylexClassName(shellStyles.root)}>
      <p className={stylexClassName(shellStyles.message)}>{message}</p>
      <Button Label="新しいルームを作る" Size="Large" Style="Primary" onClick={onCreateNew} />
    </div>
  );
}

const routeStyles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    width: 390,
    height: 844,
    overflow: "hidden",
    backgroundColor: color["--color-surface-shell"],
  },
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
}: {
  state: "loading" | "error";
  onRetry?: () => void;
  onTabSelect?: (selected: TabBarSelected) => void;
}) {
  return (
    <div className={stylexClassName(routeStyles.root)}>
      <AppBar Title="経路" Back="Shown" />
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

  // ---------------------------------------------------------- 画面5: 集合候補
  const {
    data: recs,
    error: recsError,
    mutate: mutateRecs,
  } = useRoomRecommendations(terminal || !room ? null : roomId, room?.updatedAt);

  async function handleChoose(nodeId: string) {
    if (!session) return;
    try {
      const updated = await api.updateRoom(roomId, { meetingNodeId: nodeId }, session.token);
      await mutateRoom(updated, { revalidate: false });
    } catch (error) {
      handleUnauthorized(error);
    }
  }

  // ---------------------------------------------------- 画面6/7: 自分の経路・いまいる場所
  const [hereOpen, setHereOpen] = useState(false);
  const [anchorNodeId, setAnchorNodeId] = useState<string | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const [lastConfirmNodeId, setLastConfirmNodeId] = useState<string | null>(null);
  const [exitReport, setExitReport] = useState(() => loadExitReport(roomId));

  async function handleConfirmHere(nodeId: string) {
    if (!session) return;
    setLastConfirmNodeId(nodeId);
    setConfirmBusy(true);
    setConfirmError(false);
    try {
      const updatedRoom = await api.updateParticipant(
        roomId,
        session.participantId,
        { confirmed: { kind: "node", id: nodeId } },
        session.token,
      );
      await mutateRoom(updatedRoom, { revalidate: false });
      try {
        // 新しい updatedAt の推薦キーへ先回りしておく。失敗しても致命的ではない
        // — 画面6側の useRoomRecommendations が通常のフェッチでリカバーする。
        await primeRoomRecommendations(roomId, updatedRoom.updatedAt);
      } catch {
        // no-op
      }
      setAnchorNodeId(nodeId);
      setHereOpen(false);
    } catch (error) {
      if (!handleUnauthorized(error)) setConfirmError(true);
    } finally {
      setConfirmBusy(false);
    }
  }

  function handleRetryConfirmHere() {
    if (lastConfirmNodeId) void handleConfirmHere(lastConfirmNodeId);
  }

  function handleCorrectExit(exitCatalogId: string) {
    setExitReport(saveExitReport(roomId, exitCatalogId));
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
    return <div className={stylexClassName(shellStyles.root)} />;
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
      />
    );
  }

  if (!me) {
    // room.participants との突き合わせが済むまでの一瞬。useEffect が
    // セッションを消すので、すぐ上の分岐に落ちる。
    return <div className={stylexClassName(shellStyles.root)} />;
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
      />
    );
  }

  if (tab === "Room") {
    const lines = catalog?.lines ?? [];
    const meView = {
      id: me.id,
      Name: me.nameJa,
      Detail: lineNameOf(lines, me.entry),
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
        Detail: lineNameOf(lines, p.entry),
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
        onTabSelect={setTab}
      />
    );
  }

  // tab === "Route"
  if (room.meetingNodeId !== null) {
    // 集合場所が決まっている: 画面5(候補比較)ではなく画面6/7(自分の経路)。
    if (recsError) {
      return <RouteStatusScreen state="error" onRetry={() => void mutateRecs()} onTabSelect={setTab} />;
    }
    if (!recs || recs.kind === "waiting") {
      return <RouteStatusScreen state="loading" onTabSelect={setTab} />;
    }
    const my = myLegOf(recs.data, room.meetingNodeId, me.id);
    if (!my) {
      return <RouteStatusScreen state="error" onRetry={() => void mutateRecs()} onTabSelect={setTab} />;
    }

    if (hereOpen) {
      return (
        <Here
          Kind="List"
          rows={hereRowsOf(my.leg.confirmations)}
          busy={confirmBusy}
          error={confirmError}
          onBack={() => setHereOpen(false)}
          onConfirm={handleConfirmHere}
          onRetry={handleRetryConfirmHere}
        />
      );
    }

    const effectiveAnchor = anchorNodeId ?? fallbackAnchorNodeId(my.leg.confirmations);
    const exit = my.candidate.onward.exit;
    return (
      <RouteGuide
        key={effectiveAnchor ?? "start"}
        rows={rowsOfLeg(my.candidate, my.leg)}
        anchorNodeId={effectiveAnchor}
        HandoffFrom={handoffFrom(exit.label)}
        HandoffTo={room.destination.nameJa}
        HandoffUncertain={exit.evidence === "hypothesis"}
        HandoffCorrected={exitReport?.exitCatalogId === exit.catalogId}
        onOpenMap={() => window.open(exit.mapsDirUrl, "_blank", "noopener,noreferrer")}
        onCorrectExit={() => handleCorrectExit(exit.catalogId)}
        onOpenHere={() => setHereOpen(true)}
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

  if (recsError) {
    status = "error";
  } else if (!recs) {
    status = "loading";
  } else if (recs.kind === "waiting") {
    status = "waiting";
    waitingNames = recs.waitingFor
      .map((id) => nameOf(room.participants, id))
      .filter((n) => n.length > 0);
  } else {
    status = "ready";
    candidates = recs.data.ranked.map((c, index) => ({
      nodeId: c.meeting.nodeId,
      Name: c.meeting.nameJa,
      Floor: c.meeting.floorLabel,
      Reason: index === 0 ? (c.reasons[0]?.textJa ?? "") : "",
      Facts: factsLabel(c.onward.distanceM, recs.data.walkingSpeedMps),
      People: c.legs.map((leg) => ({
        Who: nameOf(room.participants, leg.participantId),
        Minutes: minutesLabel(leg.costSeconds),
        Effort: effortLabel(leg.floorChanges, leg.branchCount),
      })),
      Selected: room.meetingNodeId !== null && c.meeting.nodeId === room.meetingNodeId,
    }));
  }

  return (
    <CandidateCompare
      Action={action}
      status={status}
      candidates={candidates}
      waitingNames={waitingNames}
      onChoose={handleChoose}
      onRetry={() => void mutateRecs()}
      onTabSelect={setTab}
    />
  );
}
