import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { Button } from "./Button.js";
import { Icon } from "./Icon.js";

export type PermissionState = "Ask" | "Denied";

export type PermissionProps = {
  State?: PermissionState;
  onAllow?: () => void;
  onPickList?: () => void;
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
    overflow: "hidden",
    flexShrink: 0,
  },
  ask: {
    backgroundColor: color["--color-status-attention-soft"],
  },
  denied: {
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
  iconAsk: {
    color: color["--color-text-primary"],
    flexShrink: 0,
  },
  iconDenied: {
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

function surface(State: PermissionState) {
  switch (State) {
    case "Ask":
      return styles.ask;
    case "Denied":
      return styles.denied;
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

function permissionIcon(State: PermissionState) {
  switch (State) {
    case "Ask":
      return (
        <span className={stylexClassName(styles.iconAsk)}>
          <Icon Name="Camera" />
        </span>
      );
    case "Denied":
      return (
        <span className={stylexClassName(styles.iconDenied)}>
          <Icon Name="Camera" />
        </span>
      );
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

function permissionMessage(State: PermissionState) {
  switch (State) {
    case "Ask":
      return "案内板を写して、いまいる場所の候補を出します";
    case "Denied":
      return "カメラを使えませんでした";
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

function permissionAction(
  State: PermissionState,
  onAllow?: () => void,
  onPickList?: () => void,
) {
  switch (State) {
    case "Ask":
      return (
        <div className={stylexClassName(styles.fill)}>
          <Button Label="カメラを使う" Size="Medium" Style="Primary" onClick={onAllow} />
        </div>
      );
    case "Denied":
      return (
        <div className={stylexClassName(styles.fill)}>
          <Button Label="一覧から選ぶ" Size="Medium" Style="Primary" onClick={onPickList} />
        </div>
      );
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

export function Permission({ State = "Ask", onAllow, onPickList }: PermissionProps) {
  return (
    <div className={stylexClassName(styles.root, surface(State))}>
      <div className={stylexClassName(styles.row)}>
        {permissionIcon(State)}
        <p className={stylexClassName(type["UI/Medium/Regular"], styles.message)}>
          {permissionMessage(State)}
        </p>
      </div>
      {permissionAction(State, onAllow, onPickList)}
    </div>
  );
}
