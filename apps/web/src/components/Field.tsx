import { Field as BaseField } from "@base-ui/react/field";
import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";

export type FieldContent = "Empty" | "Filled";
export type FieldState = "Default" | "Focus" | "Error" | "Disabled";

export type FieldProps = {
  Label?: string;
  Value?: string;
  assistiveText?: string;
  showAssistive?: boolean;
  Content?: FieldContent;
  State?: FieldState;
  name?: string;
  onValueChange?: (value: string) => void;
};

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-2"],
    width: "100%",
  },
  label: {
    color: color["--color-text-secondary"],
    margin: 0,
  },
  control: {
    boxSizing: "border-box",
    width: "100%",
    height: space["--control-height-lg"],
    margin: 0,
    paddingInline: space["--space-5"],
    paddingBlock: 0,
    borderRadius: space["--radius-md"],
    borderStyle: "solid",
    appearance: "none",
    outline: "none",
  },
  controlDefault: {
    backgroundColor: color["--color-surface-float"],
    borderWidth: {
      default: space["--border-width"],
      ":focus": space["--focus-width"],
    },
    borderColor: {
      default: color["--color-border-subtle"],
      ":focus": color["--color-focus"],
    },
  },
  controlFocus: {
    backgroundColor: color["--color-surface-float"],
    borderWidth: space["--focus-width"],
    borderColor: color["--color-focus"],
  },
  controlError: {
    backgroundColor: color["--color-surface-float"],
    borderWidth: space["--border-width-strong"],
    borderColor: color["--color-status-problem"],
  },
  controlDisabled: {
    backgroundColor: color["--color-disabled-surface"],
    borderWidth: space["--border-width"],
    borderColor: color["--color-disabled-border"],
  },
  valueEmpty: {
    color: color["--color-text-tertiary"],
    "::placeholder": {
      color: color["--color-text-tertiary"],
    },
  },
  valueFilled: {
    color: color["--color-text-primary"],
  },
  valueDisabled: {
    color: color["--color-disabled-text"],
    "::placeholder": {
      color: color["--color-disabled-text"],
    },
  },
  assistive: {
    margin: 0,
    color: color["--color-text-tertiary"],
  },
  assistiveError: {
    margin: 0,
    color: color["--color-status-problem"],
  },
});

function controlVisual(State: FieldState) {
  switch (State) {
    case "Default":
      return styles.controlDefault;
    case "Focus":
      return styles.controlFocus;
    case "Error":
      return styles.controlError;
    case "Disabled":
      return styles.controlDisabled;
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

export function Field({
  Label = "目的地",
  Value = "駅・施設名を入力",
  assistiveText = "例：東京都庁 展望室",
  showAssistive = true,
  Content = "Empty",
  State = "Default",
  name,
  onValueChange,
}: FieldProps) {
  const filled = Content === "Filled";
  const disabled = State === "Disabled";
  const valueStyle = disabled
    ? styles.valueDisabled
    : filled
      ? styles.valueFilled
      : styles.valueEmpty;
  const valueType = filled ? type["UI/Medium/Bold"] : type["UI/Medium/Regular"];
  const assistiveStyle = State === "Error" ? styles.assistiveError : styles.assistive;

  return (
    <BaseField.Root
      name={name}
      disabled={disabled}
      invalid={State === "Error"}
      className={stylexClassName(styles.root)}
    >
      <BaseField.Label className={stylexClassName(type["UI/Small/Regular"], styles.label)}>
        {Label}
      </BaseField.Label>
      <BaseField.Control
        value={filled ? Value : ""}
        placeholder={filled ? undefined : Value}
        onValueChange={onValueChange}
        className={stylexClassName(
          styles.control,
          valueType,
          controlVisual(State),
          valueStyle,
        )}
      />
      {showAssistive ? (
        State === "Error" ? (
          <BaseField.Error
            match
            className={stylexClassName(type["UI/Small/Regular"], assistiveStyle)}
          >
            {assistiveText}
          </BaseField.Error>
        ) : (
          <BaseField.Description
            className={stylexClassName(type["UI/Small/Regular"], assistiveStyle)}
          >
            {assistiveText}
          </BaseField.Description>
        )
      ) : null}
    </BaseField.Root>
  );
}
