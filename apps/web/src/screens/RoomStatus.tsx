import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { AppBar } from "../components/AppBar.js";
import { Arrival } from "../components/Arrival.js";
import { Place } from "../components/Place.js";
import { Report } from "../components/Report.js";
import { TabBar } from "../components/TabBar.js";

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

export function RoomStatus() {
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
      <TabBar Selected="Room" />
    </div>
  );
}
