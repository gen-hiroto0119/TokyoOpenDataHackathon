import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { Button } from "./Button.js";

export type InviteState = "Default" | "Copied" | "Disabled";

export type InviteProps = {
  Link?: string;
  State?: InviteState;
  onCopy?: () => void;
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
    backgroundColor: color["--color-surface-work"],
    borderWidth: space["--border-width"],
    borderStyle: "solid",
    borderColor: color["--color-border-subtle"],
    borderRadius: space["--radius-md"],
  },
  title: {
    margin: 0,
    color: color["--color-text-primary"],
  },
  link: {
    margin: 0,
    color: color["--color-text-secondary"],
  },
  fill: {
    display: "grid",
    width: "100%",
  },
});

function buttonLabel(State: InviteState) {
  switch (State) {
    case "Default":
    case "Disabled":
      return "リンクをコピー";
    case "Copied":
      return "コピーしました";
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

export function Invite({
  Link = "あつまっぷ.example/join/nishi-1",
  State = "Default",
  onCopy,
}: InviteProps) {
  return (
    <div className={stylexClassName(styles.root)}>
      <p className={stylexClassName(type["UI/Medium/Bold"], styles.title)}>招待リンク</p>
      <p className={stylexClassName(type["UI/Small/Regular"], styles.link)}>{Link}</p>
      <div className={stylexClassName(styles.fill)}>
        <Button
          Label={buttonLabel(State)}
          Style="Secondary"
          State={State === "Disabled" ? "Disabled" : "Default"}
          onClick={State === "Disabled" ? undefined : onCopy}
        />
      </div>
    </div>
  );
}
