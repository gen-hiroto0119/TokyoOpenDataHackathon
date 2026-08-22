import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { AppBar } from "../components/AppBar.js";
import { Arrival, type ArrivalProgress } from "../components/Arrival.js";
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
  onTabSelect?: (selected: TabBarSelected) => void;
};

const styles = stylex.create({
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
});

export function RoomStatus({
  destinationName,
  me,
  meReportSelected,
  onMeReportSelect,
  others,
  onTabSelect,
}: RoomStatusProps) {
  const wired = others !== undefined;

  if (!wired) {
    return (
      <div className={stylexClassName(styles.root)}>
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
    <div className={stylexClassName(styles.root)}>
      <AppBar Title="ルーム" Back="Hidden" />
      <div className={stylexClassName(styles.content)}>
        <Place Kind="Destination" Name={destinationName ?? ""} Detail="" Photo="Hidden" />
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
      </div>
      <TabBar Selected="Room" onSelect={onTabSelect} />
    </div>
  );
}
