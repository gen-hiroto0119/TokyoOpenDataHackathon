import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { AppBar } from "../components/AppBar.js";
import { ArrivalInput } from "../components/ArrivalInput.js";
import { Button } from "../components/Button.js";
import { ErrorNotice } from "../components/ErrorNotice.js";
import { Field } from "../components/Field.js";
import { Invite } from "../components/Invite.js";
import { Participant } from "../components/Participant.js";
import { TabBar } from "../components/TabBar.js";

export type RoomCreateMode = "Preview" | "Create";

export type RoomCreateProps = {
  /** Preview はダミー(招待後の見本)。Create は実際の作成フォーム。 */
  Mode?: RoomCreateMode;
  name?: string;
  onNameChange?: (value: string) => void;
  destinationName?: string | null;
  onDestinationClick?: () => void;
  /** ISO 8601。null のうちは既定(6時間後)のまま。 */
  expiresAtIso?: string | null;
  onExpiresAtChange?: (isoValue: string) => void;
  onSubmit?: () => void;
  submitDisabled?: boolean;
  error?: boolean;
  onRetry?: () => void;
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
    gap: space["--space-5"],
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
    padding: space["--space-6"],
    overflowX: "hidden",
    overflowY: "auto",
  },
  fill: {
    display: "grid",
    width: "100%",
  },
  expiryWrap: {
    position: "relative",
    width: "100%",
  },
  // 端末標準の日時ピッカーを Field の上に透明に重ねる。Field 自体の見た目は変えない。
  expiryInput: {
    boxSizing: "border-box",
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    margin: 0,
    padding: 0,
    border: 0,
    opacity: 0,
    cursor: "pointer",
  },
});

function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RoomCreate({
  Mode = "Preview",
  name,
  onNameChange,
  destinationName,
  onDestinationClick,
  expiresAtIso,
  onExpiresAtChange,
  onSubmit,
  submitDisabled,
  error,
  onRetry,
}: RoomCreateProps) {
  if (Mode === "Preview") {
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

  return (
    <div className={stylexClassName(styles.root)}>
      <AppBar Title="ルーム作成" Back="Hidden" />
      <div className={stylexClassName(styles.content)}>
        <Field
          Label="名前"
          Value={name || "表示する名前を入れる"}
          assistiveText="ルームの中で他の参加者に見えます"
          Content={name ? "Filled" : "Empty"}
          onValueChange={onNameChange}
        />
        <Field
          Label="行き先"
          Value={destinationName ?? "行き先を選ぶ"}
          assistiveText="新宿駅の周辺から探します"
          Content={destinationName ? "Filled" : "Empty"}
          readOnly
          onClick={onDestinationClick}
        />
        <div className={stylexClassName(styles.expiryWrap)}>
          <Field
            Label="ルーム期限"
            Value={expiresAtIso ? formatExpiry(expiresAtIso) : "期限を選ぶ(既定 6時間後)"}
            assistiveText="この時刻を過ぎるとルームは開けません"
            Content={expiresAtIso ? "Filled" : "Empty"}
            readOnly
          />
          <input
            type="datetime-local"
            aria-label="ルーム期限"
            className={stylexClassName(styles.expiryInput)}
            value={expiresAtIso ? toDatetimeLocalValue(expiresAtIso) : ""}
            onChange={(event) => {
              if (!event.target.value) return;
              const parsed = new Date(event.target.value);
              if (Number.isNaN(parsed.getTime())) return;
              onExpiresAtChange?.(parsed.toISOString());
            }}
          />
        </div>
        {error ? <ErrorNotice onRetry={onRetry} /> : null}
        <div className={stylexClassName(styles.fill)}>
          <Button
            Label="ルームを作る"
            Size="Large"
            Style="Primary"
            onClick={onSubmit}
            State={submitDisabled ? "Disabled" : "Default"}
          />
        </div>
      </div>
    </div>
  );
}
