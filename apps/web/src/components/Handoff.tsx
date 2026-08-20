import { Button as BaseButton } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { Button } from "./Button.js";

export type HandoffState = "Ready" | "Waiting";

export type HandoffProps = {
  State?: HandoffState;
  From?: string;
  To?: string;
  onOpenMap?: () => void;
  onCorrect?: () => void;
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
  note: {
    margin: 0,
    color: color["--color-text-secondary"],
  },
  fill: {
    display: "grid",
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

export function Handoff({
  State = "Ready",
  From = "出口 8 を出たところから",
  To = "東京都庁",
  onOpenMap,
  onCorrect,
}: HandoffProps) {
  return (
    <div className={stylexClassName(styles.root)}>
      <div className={stylexClassName(styles.route)}>
        <div className={stylexClassName(styles.fromRow)}>
          <p className={stylexClassName(type["UI/Small/Regular"], styles.from)}>{From}</p>
          <BaseButton onClick={onCorrect} className={stylexClassName(type["UI/Caption/Regular"], styles.correction)}>
            表示が違う
          </BaseButton>
        </div>
        <p className={stylexClassName(type["Wayfinding/Landmark"], styles.to)}>{To}</p>
      </div>
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
