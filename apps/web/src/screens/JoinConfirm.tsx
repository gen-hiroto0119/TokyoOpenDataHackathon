import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { AppBar } from "../components/AppBar.js";
import { Button } from "../components/Button.js";
import { Consent } from "../components/Consent.js";
import { Field } from "../components/Field.js";

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
});

export function JoinConfirm() {
  return (
    <div className={stylexClassName(styles.root)}>
      <AppBar Title="参加の確認" Back="Shown" />
      <div className={stylexClassName(styles.content)}>
        <Field
          Label="名前"
          Value="表示する名前を入れる"
          assistiveText="ルームの中で他の参加者に見えます"
          Content="Empty"
        />
        <Consent Kind="Route" />
        <Consent Kind="Camera" />
        <Consent Kind="Expiry" />
        <div className={stylexClassName(styles.fill)}>
          <Button Label="同意して参加する" Size="Large" Style="Primary" />
        </div>
      </div>
    </div>
  );
}
