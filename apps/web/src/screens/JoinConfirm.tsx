import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { AppBar } from "../components/AppBar.js";
import { Button } from "../components/Button.js";
import { Consent } from "../components/Consent.js";
import { ErrorNotice } from "../components/ErrorNotice.js";
import { Field } from "../components/Field.js";

export type JoinConfirmProps = {
  name?: string;
  onNameChange?: (value: string) => void;
  onSubmit?: () => void;
  submitDisabled?: boolean;
  /** 参加の送信自体が失敗した(送れませんでした)。 */
  error?: boolean;
  onRetry?: () => void;
  /** トークンが無効になってここへ戻された(参加をやり直してください)。 */
  sessionExpired?: boolean;
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
  notice: {
    margin: 0,
    color: color["--color-text-secondary"],
  },
});

export function JoinConfirm({
  name,
  onNameChange,
  onSubmit,
  submitDisabled,
  error,
  onRetry,
  sessionExpired,
}: JoinConfirmProps) {
  const wired = onSubmit !== undefined;
  return (
    <div className={stylexClassName(styles.root)}>
      <AppBar Title="参加の確認" Back="Shown" />
      <div className={stylexClassName(styles.content)}>
        {wired && sessionExpired ? (
          <p className={stylexClassName(type["UI/Small/Regular"], styles.notice)}>
            参加をやり直してください
          </p>
        ) : null}
        <Field
          Label="名前"
          Value={wired ? name || "表示する名前を入れる" : "表示する名前を入れる"}
          assistiveText="ルームの中で他の参加者に見えます"
          Content={wired && name ? "Filled" : "Empty"}
          onValueChange={onNameChange}
        />
        <Consent Kind="Route" />
        <Consent Kind="Camera" />
        <Consent Kind="Expiry" />
        {wired && error ? <ErrorNotice onRetry={onRetry} /> : null}
        <div className={stylexClassName(styles.fill)}>
          <Button
            Label="同意して参加する"
            Size="Large"
            Style="Primary"
            onClick={onSubmit}
            State={wired && submitDisabled ? "Disabled" : "Default"}
          />
        </div>
      </div>
    </div>
  );
}
