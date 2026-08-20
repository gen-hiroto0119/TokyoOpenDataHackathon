import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { AppBar } from "../components/AppBar.js";
import { ArrivalInput } from "../components/ArrivalInput.js";
import { Field } from "../components/Field.js";
import { Invite } from "../components/Invite.js";
import { Participant } from "../components/Participant.js";
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
    gap: space["--space-5"],
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
    padding: space["--space-6"],
    overflowX: "hidden",
    overflowY: "auto",
  },
});

export function RoomCreate() {
  return (
    <div className={stylexClassName(styles.root)}>
      <AppBar Title="ルーム作成" Back="Hidden" />
      <div className={stylexClassName(styles.content)}>
        <Field
          Label="名前"
          Value="表示する名前を入れる"
          assistiveText="ルームの中で他の参加者に見えます"
          Content="Empty"
        />
        <Field
          Label="行き先"
          Value="東京都庁"
          assistiveText="新宿駅の周辺から探します"
          Content="Filled"
        />
        <Field
          Label="ルーム期限"
          Value="2026年8月17日 18:00"
          assistiveText="この時刻を過ぎるとルームは開けません"
          Content="Empty"
        />
        <ArrivalInput State="Read" />
        <Invite />
        <Participant Name="かいる" Detail="下書き" Initial="か" Role="Invitee" Progress="Opened" />
        <Participant
          Name="あきな"
          Detail="招待メンバー · 未入力"
          Initial="あ"
          Role="Invitee"
          Progress="Invited"
        />
      </div>
      <TabBar Selected="Room" />
    </div>
  );
}
