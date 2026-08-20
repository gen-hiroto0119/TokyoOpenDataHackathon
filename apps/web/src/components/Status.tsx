import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { Button } from "./Button.js";
import { Icon } from "./Icon.js";

export type StatusState = "Progress" | "Failed";

export type StatusProps = {
  State?: StatusState;
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
    padding: space["--space-8"],
    borderRadius: space["--radius-md"],
    flexShrink: 0,
  },
  progress: {
    backgroundColor: color["--color-status-progress-soft"],
  },
  failed: {
    backgroundColor: color["--color-status-problem-soft"],
  },
  row: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: space["--space-4"],
    width: "100%",
    minWidth: 0,
  },
  iconProgress: {
    color: color["--color-text-primary"],
    flexShrink: 0,
  },
  iconFailed: {
    color: color["--color-status-problem"],
    flexShrink: 0,
  },
  message: {
    margin: 0,
    color: color["--color-text-primary"],
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  fill: {
    display: "grid",
    width: "100%",
  },
});

function surface(State: StatusState) {
  switch (State) {
    case "Progress":
      return styles.progress;
    case "Failed":
      return styles.failed;
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

function statusIcon(State: StatusState) {
  switch (State) {
    case "Progress":
      return (
        <span className={stylexClassName(styles.iconProgress)}>
          <Icon Name="Search" />
        </span>
      );
    case "Failed":
      return (
        <span className={stylexClassName(styles.iconFailed)}>
          <Icon Name="Failed" />
        </span>
      );
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

function statusMessage(State: StatusState) {
  switch (State) {
    case "Progress":
      return "集合地点を探しています";
    case "Failed":
      return "集合地点を出せませんでした";
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

function retrySlot(State: StatusState, onRetry?: () => void) {
  switch (State) {
    case "Progress":
      return null;
    case "Failed":
      return (
        <div className={stylexClassName(styles.fill)}>
          <Button Label="もう一度探す" Size="Medium" Style="Primary" onClick={onRetry} />
        </div>
      );
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

export function Status({ State = "Progress", onRetry }: StatusProps) {
  return (
    <div className={stylexClassName(styles.root, surface(State))}>
      <div className={stylexClassName(styles.row)}>
        {statusIcon(State)}
        <p className={stylexClassName(type["UI/Medium/Regular"], styles.message)}>{statusMessage(State)}</p>
      </div>
      {retrySlot(State, onRetry)}
    </div>
  );
}
