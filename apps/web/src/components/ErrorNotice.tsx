// 書き込みに失敗したときだけに使う。文言はここに固定して、呼び出し側で発明しない。
import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { Button } from "./Button.js";

export type ErrorNoticeProps = {
  onRetry?: () => void;
};

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-4"],
    width: "100%",
    margin: 0,
    padding: space["--space-5"],
    backgroundColor: color["--color-status-problem-soft"],
    borderRadius: space["--radius-md"],
  },
  message: {
    margin: 0,
    color: color["--color-text-primary"],
  },
  fill: {
    display: "grid",
    width: "100%",
  },
});

export function ErrorNotice({ onRetry }: ErrorNoticeProps) {
  return (
    <div className={stylexClassName(styles.root)}>
      <p className={stylexClassName(type["UI/Small/Regular"], styles.message)}>送れませんでした</p>
      <div className={stylexClassName(styles.fill)}>
        <Button Label="もう一度送る" Size="Medium" Style="Secondary" onClick={onRetry} />
      </div>
    </div>
  );
}
