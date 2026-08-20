import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { Icon, type IconName } from "./Icon.js";

export type PathState = "Next" | "Done" | "Later";
export type PathKind = "Landmark" | "Move";

export type PathProps = {
  State?: PathState;
  Kind?: PathKind;
  Landmark?: string;
  Detail?: string;
  Goal?: string;
  ShowGoal?: boolean;
  Icon?: IconName;
};

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space["--space-5"],
    width: "100%",
    margin: 0,
    padding: space["--space-5"],
    backgroundColor: color["--color-surface-work"],
    borderWidth: space["--border-width"],
    borderStyle: "solid",
    borderColor: color["--color-border-subtle"],
    borderRadius: space["--radius-md"],
    flexShrink: 0,
  },
  body: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-2"],
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  goal: {
    margin: 0,
    color: color["--color-text-secondary"],
  },
  landmark: {
    margin: 0,
  },
  detail: {
    margin: 0,
  },
  textPrimary: {
    color: color["--color-text-primary"],
  },
  textSecondary: {
    color: color["--color-text-secondary"],
  },
  textTertiary: {
    color: color["--color-text-tertiary"],
  },
  icon: {
    flexShrink: 0,
  },
});

function tone(State: PathState) {
  switch (State) {
    case "Next":
      return styles.textPrimary;
    case "Done":
      return styles.textTertiary;
    case "Later":
      return styles.textSecondary;
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

function landmarkType(State: PathState) {
  switch (State) {
    case "Next":
      return type["Wayfinding/Landmark"];
    case "Done":
    case "Later":
      return type["UI/Medium/Regular"];
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

function detailTone(State: PathState, Kind: PathKind) {
  switch (Kind) {
    case "Move":
      return tone(State);
    case "Landmark":
      switch (State) {
        case "Next":
        case "Later":
          return styles.textSecondary;
        case "Done":
          return styles.textTertiary;
        default: {
          const _never: never = State;
          return _never;
        }
      }
    default: {
      const _never: never = Kind;
      return _never;
    }
  }
}

function defaultIcon(State: PathState, Kind: PathKind): IconName {
  switch (Kind) {
    case "Landmark":
      switch (State) {
        case "Next":
          return "Right";
        case "Done":
        case "Later":
          return "Straight";
        default: {
          const _never: never = State;
          return _never;
        }
      }
    case "Move":
      return "Straight";
    default: {
      const _never: never = Kind;
      return _never;
    }
  }
}

function goalSlot(ShowGoal: boolean, Goal: string) {
  if (!ShowGoal) return null;
  return <p className={stylexClassName(type["UI/Caption/Bold"], styles.goal)}>{Goal}</p>;
}

function body(Kind: PathKind, State: PathState, Landmark: string, Detail: string, ShowGoal: boolean, Goal: string) {
  switch (Kind) {
    case "Landmark":
      return (
        <>
          {goalSlot(ShowGoal, Goal)}
          <p className={stylexClassName(landmarkType(State), styles.landmark, tone(State))}>{Landmark}</p>
          <p className={stylexClassName(type["UI/Small/Regular"], styles.detail, detailTone(State, Kind))}>{Detail}</p>
        </>
      );
    case "Move":
      return (
        <>
          {goalSlot(ShowGoal, Goal)}
          <p className={stylexClassName(type["Wayfinding/Instruction"], styles.detail, detailTone(State, Kind))}>
            {Detail}
          </p>
        </>
      );
    default: {
      const _never: never = Kind;
      return _never;
    }
  }
}

export function Path({
  State = "Next",
  Kind = "Landmark",
  Landmark = "西口交番前",
  Detail = "右へ曲がる · 40m",
  Goal = "集合場所",
  ShowGoal = false,
  Icon: IconNameProp,
}: PathProps) {
  const Name = IconNameProp ?? defaultIcon(State, Kind);
  return (
    <div className={stylexClassName(styles.root)}>
      <span className={stylexClassName(styles.icon, tone(State))}>
        <Icon Name={Name} />
      </span>
      <div className={stylexClassName(styles.body)}>{body(Kind, State, Landmark, Detail, ShowGoal, Goal)}</div>
    </div>
  );
}
