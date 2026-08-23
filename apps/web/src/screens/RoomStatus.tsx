import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import type { RoomRole } from "worker/src/room.js";
import { color } from "../tokens/color.stylex.js";
import { screen } from "../tokens/layout.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { AppBar } from "../components/AppBar.js";
import { Arrival, type ArrivalProgress } from "../components/Arrival.js";
import { Button } from "../components/Button.js";
import { ErrorNotice } from "../components/ErrorNotice.js";
import { Invite, type InviteState } from "../components/Invite.js";
import { Place } from "../components/Place.js";
import { Report, type ReportSelected } from "../components/Report.js";
import { TabBar, type TabBarSelected } from "../components/TabBar.js";

export type RoomStatusParticipantView = {
  id: string;
  Name: string;
  Detail: string;
  Initial: string;
  Progress: ArrivalProgress;
  ShowReport: boolean;
  Report: string;
};

export type RoomStatusProps = {
  destinationName?: string;
  me?: RoomStatusParticipantView | null;
  meReportSelected?: ReportSelected;
  onMeReportSelect?: (selected: Exclude<ReportSelected, "None">) => void;
  /** 自分以外の参加者。省略時はダミー表示のまま。 */
  others?: RoomStatusParticipantView[];
  /** 自分の役割。guest は「ルームから抜ける」、host は「ルームを解散する」を出す。 */
  role?: RoomRole;
  onLeave?: () => void;
  /** 直前の退出が失敗した。 */
  leaveError?: boolean;
  /** 解散の確認で「解散する」を押したときに呼ぶ。 */
  onDissolve?: () => void;
  /** 直前の解散が失敗した。 */
  dissolveError?: boolean;
  onTabSelect?: (selected: TabBarSelected) => void;
  /** ホストだけ渡す。ゲストには出さない。 */
  inviteLink?: string;
  inviteState?: InviteState;
  onInviteCopy?: () => void;
};

const styles = stylex.create({
  content: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-6"],
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
    padding: space["--space-6"],
    overflowX: "hidden",
    overflowY: "auto",
  },
  me: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-4"],
    width: "100%",
  },
  fill: {
    display: "grid",
    width: "100%",
  },
  confirm: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-4"],
    width: "100%",
  },
  confirmText: {
    margin: 0,
    color: color["--color-text-secondary"],
  },
  actions: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: space["--space-4"],
    width: "100%",
  },
});

export function RoomStatus({
  destinationName,
  me,
  meReportSelected,
  onMeReportSelect,
  others,
  role,
  onLeave,
  leaveError,
  onDissolve,
  dissolveError,
  onTabSelect,
  inviteLink,
  inviteState,
  onInviteCopy,
}: RoomStatusProps) {
  const wired = others !== undefined;
  const [confirmingDissolve, setConfirmingDissolve] = useState(false);

  if (!wired) {
    return (
      <div className={stylexClassName(screen.frame)}>
        <AppBar Title="ルーム" Back="Hidden" />
        <div className={stylexClassName(styles.content)}>
          <Place Kind="Meeting" Name="西口交番前" Detail="1階" Photo="Shown" />
          <div className={stylexClassName(styles.me)}>
            <Arrival
              Name="ひろと"
              Detail="丸ノ内線改札"
              Initial="ひ"
              Progress="Moving"
              ShowReport
              Report="予定通り"
            />
            <Report Selected="OnTime" />
          </div>
          <Arrival
            Name="かいる"
            Detail="西口交番前"
            Initial="か"
            Progress="Arrived"
            ShowReport
            Report="早く着く"
          />
          <Arrival
            Name="あきな"
            Detail="JR 西改札"
            Initial="あ"
            Progress="Pending"
            ShowReport
            Report="遅れる"
          />
        </div>
        <TabBar Selected="Room" onSelect={onTabSelect} />
      </div>
    );
  }

  return (
    <div className={stylexClassName(screen.frame)}>
      <AppBar Title="ルーム" Back="Hidden" />
      <div className={stylexClassName(styles.content)}>
        <Place Kind="Destination" Name={destinationName ?? ""} Detail="" Photo="Hidden" />
        {inviteLink ? (
          <Invite Link={inviteLink} State={inviteState} onCopy={onInviteCopy} />
        ) : null}
        {me ? (
          <div className={stylexClassName(styles.me)}>
            <Arrival
              Name={me.Name}
              Detail={me.Detail}
              Initial={me.Initial}
              Progress={me.Progress}
              ShowReport={me.ShowReport}
              Report={me.Report}
            />
            <Report Selected={meReportSelected ?? "None"} onSelect={onMeReportSelect} />
          </div>
        ) : null}
        {others.map((p) => (
          <Arrival
            key={p.id}
            Name={p.Name}
            Detail={p.Detail}
            Initial={p.Initial}
            Progress={p.Progress}
            ShowReport={p.ShowReport}
            Report={p.Report}
          />
        ))}
        {role === "guest" ? (
          <>
            <div className={stylexClassName(styles.fill)}>
              <Button Label="ルームから抜ける" Size="Medium" Style="Secondary" onClick={onLeave} />
            </div>
            {leaveError ? <ErrorNotice onRetry={onLeave} /> : null}
          </>
        ) : null}
        {role === "host" ? (
          confirmingDissolve ? (
            <div className={stylexClassName(styles.confirm)}>
              <p className={stylexClassName(type["UI/Small/Regular"], styles.confirmText)}>
                解散すると、参加者全員が開けなくなります
              </p>
              <div className={stylexClassName(styles.actions)}>
                <div className={stylexClassName(styles.fill)}>
                  <Button Label="解散する" Size="Medium" Style="Primary" onClick={onDissolve} />
                </div>
                <div className={stylexClassName(styles.fill)}>
                  <Button
                    Label="やめる"
                    Size="Medium"
                    Style="Secondary"
                    onClick={() => setConfirmingDissolve(false)}
                  />
                </div>
              </div>
              {dissolveError ? <ErrorNotice onRetry={onDissolve} /> : null}
            </div>
          ) : (
            <div className={stylexClassName(styles.fill)}>
              <Button
                Label="ルームを解散する"
                Size="Medium"
                Style="Secondary"
                onClick={() => setConfirmingDissolve(true)}
              />
            </div>
          )
        ) : null}
      </div>
      <TabBar Selected="Room" onSelect={onTabSelect} />
    </div>
  );
}
