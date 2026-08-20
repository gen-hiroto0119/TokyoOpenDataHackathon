import { Button as BaseButton } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { Button } from "./Button.js";
import { Icon } from "./Icon.js";

export type ComposerState = "Empty" | "Editing" | "Processing" | "Disabled";

export type ComposerProps = {
  Label?: string;
  Prompt?: string;
  Hint?: string;
  ShowAddAction?: boolean;
  State?: ComposerState;
  AddActionLabel?: string;
  SubmitActionLabel?: string;
  onAdd?: () => void;
  onSubmit?: () => void;
  onPhoto?: () => void;
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
    padding: space["--space-5"],
    borderStyle: "solid",
    borderRadius: space["--radius-lg"],
  },
  empty: {
    backgroundColor: color["--color-surface-float"],
    borderWidth: space["--border-width"],
    borderColor: color["--color-border-subtle"],
  },
  editing: {
    backgroundColor: color["--color-surface-float"],
    borderWidth: space["--focus-width"],
    borderColor: color["--color-focus"],
  },
  processing: {
    backgroundColor: color["--color-surface-float"],
    borderWidth: space["--border-width-strong"],
    borderColor: color["--color-status-progress"],
  },
  disabled: {
    backgroundColor: color["--color-disabled-surface"],
    borderWidth: space["--border-width"],
    borderColor: color["--color-disabled-border"],
  },
  label: {
    margin: 0,
    height: 20,
  },
  labelDefault: {
    color: color["--color-text-primary"],
  },
  labelDisabled: {
    color: color["--color-disabled-text"],
  },
  inputArea: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: space["--space-4"],
    width: "100%",
    height: 96,
    overflow: "hidden",
  },
  photo: {
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: space["--hit-area-touch-min"],
    height: space["--hit-area-touch-min"],
    margin: 0,
    padding: 0,
    borderWidth: 0,
    borderRadius: space["--radius-full"],
    backgroundColor: color["--color-action-soft"],
    cursor: "pointer",
    appearance: "none",
    flexShrink: 0,
    overflow: "hidden",
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
  photoDefault: {
    color: color["--color-action"],
  },
  photoDisabled: {
    color: color["--color-disabled-text"],
    cursor: "not-allowed",
  },
  prompt: {
    margin: 0,
    width: "100%",
    textAlign: "center",
  },
  promptEmpty: {
    color: color["--color-text-tertiary"],
  },
  promptFilled: {
    color: color["--color-text-primary"],
  },
  promptDisabled: {
    color: color["--color-disabled-text"],
  },
  hintRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: space["--space-control-gap"],
    width: "100%",
    overflow: "hidden",
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: space["--radius-full"],
    backgroundColor: color["--color-status-progress"],
    flexShrink: 0,
  },
  hint: {
    margin: 0,
    flexGrow: 1,
    minWidth: 0,
  },
  hintDefault: {
    color: color["--color-text-secondary"],
  },
  hintProcessing: {
    color: color["--color-status-progress"],
  },
  hintDisabled: {
    color: color["--color-disabled-text"],
  },
  divider: {
    width: "100%",
    height: space["--border-width"],
    backgroundColor: color["--color-border-subtle"],
    flexShrink: 0,
  },
  dividerDisabled: {
    backgroundColor: color["--color-disabled-border"],
  },
  actions: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: space["--space-4"],
    width: "100%",
    height: space["--control-height-lg"],
    paddingInline: space["--space-1"],
    paddingBlock: space["--space-2"],
  },
  fill: {
    display: "grid",
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
});

function frameVisual(State: ComposerState) {
  switch (State) {
    case "Empty":
      return styles.empty;
    case "Editing":
      return styles.editing;
    case "Processing":
      return styles.processing;
    case "Disabled":
      return styles.disabled;
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

function promptVisual(State: ComposerState) {
  switch (State) {
    case "Empty":
      return styles.promptEmpty;
    case "Editing":
    case "Processing":
      return styles.promptFilled;
    case "Disabled":
      return styles.promptDisabled;
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

function hintVisual(State: ComposerState) {
  switch (State) {
    case "Empty":
    case "Editing":
      return styles.hintDefault;
    case "Processing":
      return styles.hintProcessing;
    case "Disabled":
      return styles.hintDisabled;
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

function submitLabel(State: ComposerState, SubmitActionLabel: string) {
  switch (State) {
    case "Processing":
      return "整理中";
    case "Empty":
    case "Editing":
    case "Disabled":
      return SubmitActionLabel;
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

function submitState(State: ComposerState) {
  switch (State) {
    case "Editing":
      return "Default" as const;
    case "Empty":
    case "Processing":
    case "Disabled":
      return "Disabled" as const;
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

function submitStyle(State: ComposerState) {
  switch (State) {
    case "Editing":
      return "Primary" as const;
    case "Empty":
    case "Processing":
    case "Disabled":
      return "Primary" as const;
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

function addState(State: ComposerState) {
  switch (State) {
    case "Empty":
    case "Editing":
      return "Default" as const;
    case "Processing":
    case "Disabled":
      return "Disabled" as const;
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

export function Composer({
  Label = "ルームの予定",
  Prompt = "例：AさんはJR埼京線、Bさんは丸ノ内線。10:30に都庁展望室へ行きたい",
  Hint = "目的地、時刻、参加者を簡単に入力してください",
  ShowAddAction = true,
  State = "Empty",
  AddActionLabel = "項目を追加",
  SubmitActionLabel = "下書きを整理",
  onAdd,
  onSubmit,
  onPhoto,
}: ComposerProps) {
  const disabled = State === "Disabled";
  const addDisabled = addState(State) === "Disabled";
  const submitDisabled = submitState(State) === "Disabled";

  return (
    <div className={stylexClassName(styles.root, frameVisual(State))}>
      <p
        className={stylexClassName(
          type["UI/Small/Bold"],
          styles.label,
          disabled ? styles.labelDisabled : styles.labelDefault,
        )}
      >
        {Label}
      </p>
      <div className={stylexClassName(styles.inputArea)}>
        <BaseButton
          disabled={disabled}
          onClick={onPhoto}
          className={stylexClassName(
            styles.photo,
            disabled ? styles.photoDisabled : styles.photoDefault,
          )}
        >
          <Icon Name="Camera" />
        </BaseButton>
        <p className={stylexClassName(type["UI/Medium/Regular"], styles.prompt, promptVisual(State))}>
          {Prompt}
        </p>
      </div>
      <div className={stylexClassName(styles.hintRow)}>
        {State === "Processing" ? <span className={stylexClassName(styles.indicator)} /> : null}
        <p className={stylexClassName(type["UI/Small/Regular"], styles.hint, hintVisual(State))}>
          {Hint}
        </p>
      </div>
      <div className={stylexClassName(styles.divider, disabled ? styles.dividerDisabled : null)} />
      <div className={stylexClassName(styles.actions)}>
        {ShowAddAction ? (
          <div className={stylexClassName(styles.fill)}>
            <Button
              Label={AddActionLabel}
              Style="Secondary"
              State={addState(State)}
              onClick={addDisabled ? undefined : onAdd}
            />
          </div>
        ) : null}
        <div className={stylexClassName(styles.fill)}>
          <Button
            Label={submitLabel(State, SubmitActionLabel)}
            Style={submitStyle(State)}
            State={submitState(State)}
            onClick={submitDisabled ? undefined : onSubmit}
          />
        </div>
      </div>
    </div>
  );
}
