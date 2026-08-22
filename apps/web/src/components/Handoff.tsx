import { useState } from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { Button } from "./Button.js";
import { ErrorNotice } from "./ErrorNotice.js";
import { Field } from "./Field.js";
import { Icon } from "./Icon.js";

export type HandoffState = "Ready" | "Waiting";

export type HandoffProps = {
  State?: HandoffState;
  From?: string;
  To?: string;
  /** 今の区間の到達点と残り距離(例: 「集合場所まで 120m · 西口交番前」
   * 「出口 8 まで 60m」)。画面6の現在行に追従して変わる。無指定なら出さない。 */
  RemainderJa?: string;
  /** 出口の名前が hypothesis(未確認)のとき、断定しない補足行を出す。 */
  Uncertain?: boolean;
  /** 「表示が違う」の送信がすでに済んだ。入力欄の代わりに送信済みの表示にする。 */
  Reported?: boolean;
  /** 送信中は入力欄とボタンを無効にする。 */
  CorrectBusy?: boolean;
  /** 直前の送信が失敗した。 */
  CorrectError?: boolean;
  onOpenMap?: () => void;
  /** 「送る」(ErrorNotice の「もう一度送る」も同じ)。現地の表示の文字を渡す。 */
  onCorrect?: (labelJa: string) => void;
};

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-5"],
    width: "100%",
    margin: 0,
    padding: space["--space-6"],
    backgroundColor: color["--color-surface-work"],
    borderWidth: space["--border-width"],
    borderStyle: "solid",
    borderColor: color["--color-border-subtle"],
    borderRadius: space["--radius-md"],
    flexShrink: 0,
  },
  route: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-2"],
    minWidth: 0,
  },
  fromRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: space["--space-control-gap"],
    width: "100%",
    minWidth: 0,
  },
  from: {
    margin: 0,
    color: color["--color-text-secondary"],
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  correction: {
    boxSizing: "border-box",
    margin: 0,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: color["--color-action"],
    cursor: "pointer",
    appearance: "none",
    flexShrink: 0,
    whiteSpace: "nowrap",
    outlineWidth: {
      default: 0,
      ":focus-visible": space["--focus-width"],
    },
    outlineStyle: {
      default: "none",
      ":focus-visible": "solid",
    },
    outlineColor: color["--color-focus"],
    outlineOffset: 0,
  },
  to: {
    margin: 0,
    color: color["--color-text-primary"],
  },
  uncertain: {
    margin: 0,
    color: color["--color-text-secondary"],
  },
  note: {
    margin: 0,
    color: color["--color-text-secondary"],
  },
  remainder: {
    margin: 0,
    color: color["--color-text-secondary"],
  },
  fill: {
    display: "grid",
    width: "100%",
  },
  corrected: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: space["--space-2"],
    margin: 0,
    color: color["--color-text-secondary"],
    flexShrink: 0,
  },
  correctionForm: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-4"],
    width: "100%",
  },
});

function noteCopy(State: HandoffState) {
  switch (State) {
    case "Ready":
      return "ここから先は地図アプリが案内します";
    case "Waiting":
      return "出口に着いたら開けます";
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

function buttonState(State: HandoffState) {
  switch (State) {
    case "Ready":
      return "Default" as const;
    case "Waiting":
      return "Disabled" as const;
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

/** fromRow の右側。送信済みなら「送りました」、入力欄を開いている間はボタンを隠す
 * (フォームは route の外に別ブロックで出す)。 */
function correctionToggle(Reported: boolean, open: boolean, onOpen: () => void) {
  if (Reported) {
    return (
      <span className={stylexClassName(type["UI/Caption/Regular"], styles.corrected)}>
        <Icon Name="Confirmed" />
        送りました
      </span>
    );
  }
  if (open) return null;
  return (
    <BaseButton onClick={onOpen} className={stylexClassName(type["UI/Caption/Regular"], styles.correction)}>
      表示が違う
    </BaseButton>
  );
}

/** 「表示が違う」で開く入力欄。現地の表示を書いて「送る」。失敗は ErrorNotice。 */
function correctionForm(
  open: boolean,
  Reported: boolean,
  draft: string,
  onDraftChange: (value: string) => void,
  busy: boolean,
  error: boolean,
  onSubmit: () => void,
) {
  if (!open || Reported) return null;
  const filled = draft.length > 0;
  const canSubmit = filled && !busy;
  return (
    <div className={stylexClassName(styles.correctionForm)}>
      <Field
        Label="現地の表示を書く"
        Value={filled ? draft : "現地の表示を書く"}
        Content={filled ? "Filled" : "Empty"}
        showAssistive={false}
        State={busy ? "Disabled" : "Default"}
        onValueChange={onDraftChange}
      />
      <div className={stylexClassName(styles.fill)}>
        <Button
          Label="送る"
          Size="Medium"
          Style="Primary"
          State={canSubmit ? "Default" : "Disabled"}
          onClick={canSubmit ? onSubmit : undefined}
        />
      </div>
      {error ? <ErrorNotice onRetry={onSubmit} /> : null}
    </div>
  );
}

function uncertainSlot(Uncertain: boolean) {
  if (!Uncertain) return null;
  return (
    <p className={stylexClassName(type["UI/Small/Regular"], styles.uncertain)}>
      出口の名前は未確認です。現地の看板を確かめてください
    </p>
  );
}

function remainderSlot(RemainderJa: string | undefined) {
  if (!RemainderJa) return null;
  return <p className={stylexClassName(type["UI/Small/Regular"], styles.remainder)}>{RemainderJa}</p>;
}

export function Handoff({
  State = "Ready",
  From = "出口 8 を出たところから",
  To = "東京都庁",
  RemainderJa,
  Uncertain = false,
  Reported = false,
  CorrectBusy = false,
  CorrectError = false,
  onOpenMap,
  onCorrect,
}: HandoffProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  function submit() {
    const value = draft.trim();
    if (!value || CorrectBusy) return;
    onCorrect?.(value);
  }

  return (
    <div className={stylexClassName(styles.root)}>
      <div className={stylexClassName(styles.route)}>
        <div className={stylexClassName(styles.fromRow)}>
          <p className={stylexClassName(type["UI/Small/Regular"], styles.from)}>{From}</p>
          {correctionToggle(Reported, open, () => setOpen(true))}
        </div>
        {remainderSlot(RemainderJa)}
        <p className={stylexClassName(type["Wayfinding/Landmark"], styles.to)}>{To}</p>
        {uncertainSlot(Uncertain)}
      </div>
      {correctionForm(open, Reported, draft, setDraft, CorrectBusy, CorrectError, submit)}
      <p className={stylexClassName(type["UI/Small/Regular"], styles.note)}>{noteCopy(State)}</p>
      <div className={stylexClassName(styles.fill)}>
        <Button
          Label="地図アプリで道順を見る"
          Size="Large"
          Style="Primary"
          State={buttonState(State)}
          onClick={onOpenMap}
        />
      </div>
    </div>
  );
}
