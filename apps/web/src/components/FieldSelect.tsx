import { Field as BaseField } from "@base-ui/react/field";
import { Select } from "@base-ui/react/select";
import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { type FieldContent, type FieldState } from "./Field.js";
import { Icon } from "./Icon.js";

export type FieldSelectOption = {
  value: string;
  label: string;
};

export type FieldSelectProps = {
  Label?: string;
  Value?: string;
  assistiveText?: string;
  showAssistive?: boolean;
  Content?: FieldContent;
  State?: FieldState;
  options?: ReadonlyArray<FieldSelectOption>;
  name?: string;
  onValueChange?: (value: string | null) => void;
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
  trigger: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space["--space-control-gap"],
    width: "100%",
    height: space["--control-height-lg"],
    margin: 0,
    paddingInline: space["--space-5"],
    paddingBlock: 0,
    borderRadius: space["--radius-md"],
    borderStyle: "solid",
    appearance: "none",
    outline: "none",
    textAlign: "left",
    cursor: "pointer",
  },
  triggerDefault: {
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
  triggerFocus: {
    backgroundColor: color["--color-surface-float"],
    borderWidth: space["--focus-width"],
    borderColor: color["--color-focus"],
  },
  triggerError: {
    backgroundColor: color["--color-surface-float"],
    borderWidth: space["--border-width-strong"],
    borderColor: color["--color-status-problem"],
  },
  triggerDisabled: {
    backgroundColor: color["--color-disabled-surface"],
    borderWidth: space["--border-width"],
    borderColor: color["--color-disabled-border"],
    cursor: "not-allowed",
  },
  value: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  valueEmpty: {
    color: color["--color-text-tertiary"],
  },
  valueFilled: {
    color: color["--color-text-primary"],
  },
  valueDisabled: {
    color: color["--color-disabled-text"],
  },
  icon: {
    color: "currentcolor",
    flexShrink: 0,
  },
  popup: {
    boxSizing: "border-box",
    margin: 0,
    paddingBlock: space["--space-2"],
    backgroundColor: color["--color-surface-float"],
    borderWidth: space["--border-width"],
    borderStyle: "solid",
    borderColor: color["--color-border-subtle"],
    borderRadius: space["--radius-md"],
    overflow: "hidden",
    outline: "none",
  },
  list: {
    boxSizing: "border-box",
    margin: 0,
    padding: 0,
    maxHeight: 280,
    overflowY: "auto",
  },
  item: {
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    minHeight: space["--hit-area-touch-min"],
    margin: 0,
    paddingInline: space["--space-5"],
    paddingBlock: space["--space-4"],
    cursor: "pointer",
    outline: "none",
    color: color["--color-text-primary"],
    backgroundColor: {
      default: "transparent",
      ":hover": color["--color-surface-work"],
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

function triggerVisual(State: FieldState) {
  switch (State) {
    case "Default":
      return styles.triggerDefault;
    case "Focus":
      return styles.triggerFocus;
    case "Error":
      return styles.triggerError;
    case "Disabled":
      return styles.triggerDisabled;
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

function valueVisual(State: FieldState, Content: FieldContent) {
  if (State === "Disabled") return styles.valueDisabled;
  switch (Content) {
    case "Empty":
      return styles.valueEmpty;
    case "Filled":
      return styles.valueFilled;
    default: {
      const _never: never = Content;
      return _never;
    }
  }
}

function selectedValue(
  Content: FieldContent,
  Value: string,
  options: ReadonlyArray<FieldSelectOption>,
) {
  switch (Content) {
    case "Empty":
      return null;
    case "Filled": {
      const match = options.find((option) => option.label === Value || option.value === Value);
      return match?.value ?? null;
    }
    default: {
      const _never: never = Content;
      return _never;
    }
  }
}

export function FieldSelect({
  Label = "到着する路線",
  Value = "路線を選ぶ",
  assistiveText = "例：東京都庁 展望室",
  showAssistive = true,
  Content = "Empty",
  State = "Default",
  options = [],
  name,
  onValueChange,
}: FieldSelectProps) {
  const disabled = State === "Disabled";
  const filled = Content === "Filled";
  const valueStyle = valueVisual(State, Content);
  const valueType = filled ? type["UI/Medium/Bold"] : type["UI/Medium/Regular"];
  const assistiveStyle = State === "Error" ? styles.assistiveError : styles.assistive;
  const placeholder = filled ? undefined : Value;

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
      <Select.Root
        items={options}
        defaultValue={selectedValue(Content, Value, options)}
        disabled={disabled}
        onValueChange={onValueChange}
      >
        <Select.Trigger
          className={stylexClassName(styles.trigger, triggerVisual(State), valueType, valueStyle)}
        >
          <Select.Value
            placeholder={placeholder}
            className={stylexClassName(styles.value, valueType, valueStyle)}
          />
          <Select.Icon className={stylexClassName(styles.icon)}>
            <Icon Name="Expand" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner sideOffset={4} style={{ zIndex: 10, width: "var(--anchor-width)" }}>
            <Select.Popup className={stylexClassName(styles.popup)}>
              <Select.List className={stylexClassName(styles.list)}>
                {options.map((option) => (
                  <Select.Item
                    key={option.value}
                    value={option.value}
                    label={option.label}
                    className={stylexClassName(type["UI/Medium/Bold"], styles.item)}
                  >
                    <Select.ItemText>{option.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
      {showAssistive ? (
        State === "Error" ? (
          <BaseField.Error match className={stylexClassName(type["UI/Small/Regular"], assistiveStyle)}>
            {assistiveText}
          </BaseField.Error>
        ) : (
          <BaseField.Description className={stylexClassName(type["UI/Small/Regular"], assistiveStyle)}>
            {assistiveText}
          </BaseField.Description>
        )
      ) : null}
    </BaseField.Root>
  );
}
