import { Button as BaseButton } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";

export type ButtonSize = "Medium" | "Large";
export type ButtonStyle = "Primary" | "Secondary";
export type ButtonState = "Default" | "Hover" | "Focus" | "Pressed" | "Disabled";

export type ButtonProps = {
  Label?: string;
  Size?: ButtonSize;
  Style?: ButtonStyle;
  State?: ButtonState;
  onClick?: () => void;
};

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: space["--space-control-gap"],
    margin: 0,
    borderRadius: space["--radius-md"],
    appearance: "none",
    cursor: "pointer",
    whiteSpace: "nowrap",
    textAlign: "center",
  },
  medium: {
    height: space["--control-height-md"],
    paddingInline: space["--space-6"],
    paddingBlock: 0,
  },
  large: {
    height: space["--control-height-lg"],
    paddingInline: space["--space-7"],
    paddingBlock: 0,
  },
  primaryInteractive: {
    borderWidth: 0,
    borderStyle: "none",
    backgroundColor: {
      default: color["--color-action"],
      ":hover": color["--color-action-hover"],
      ":active": color["--color-action-pressed"],
    },
    color: color["--color-text-on-action"],
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
  primaryHover: {
    borderWidth: 0,
    borderStyle: "none",
    backgroundColor: color["--color-action-hover"],
    color: color["--color-text-on-action"],
    outlineWidth: 0,
  },
  primaryFocus: {
    borderWidth: 0,
    borderStyle: "none",
    backgroundColor: color["--color-action"],
    color: color["--color-text-on-action"],
    outlineWidth: space["--focus-width"],
    outlineStyle: "solid",
    outlineColor: color["--color-focus"],
    outlineOffset: 0,
  },
  primaryPressed: {
    borderWidth: 0,
    borderStyle: "none",
    backgroundColor: color["--color-action-pressed"],
    color: color["--color-text-on-action"],
    outlineWidth: 0,
  },
  secondaryInteractive: {
    borderWidth: {
      default: space["--border-width"],
      ":active": space["--border-width-strong"],
    },
    borderStyle: "solid",
    borderColor: {
      default: color["--color-action"],
      ":hover": color["--color-action-hover"],
      ":active": color["--color-action-pressed"],
    },
    backgroundColor: {
      default: color["--color-surface-work"],
      ":hover": color["--color-action-soft"],
      ":active": color["--color-action-soft"],
    },
    color: {
      default: color["--color-action"],
      ":hover": color["--color-action-hover"],
      ":active": color["--color-action-pressed"],
    },
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
  secondaryHover: {
    borderWidth: space["--border-width"],
    borderStyle: "solid",
    borderColor: color["--color-action-hover"],
    backgroundColor: color["--color-action-soft"],
    color: color["--color-action-hover"],
    outlineWidth: 0,
  },
  secondaryFocus: {
    borderWidth: space["--border-width"],
    borderStyle: "solid",
    borderColor: color["--color-action"],
    backgroundColor: color["--color-surface-work"],
    color: color["--color-action"],
    outlineWidth: space["--focus-width"],
    outlineStyle: "solid",
    outlineColor: color["--color-focus"],
    outlineOffset: 0,
  },
  secondaryPressed: {
    borderWidth: space["--border-width-strong"],
    borderStyle: "solid",
    borderColor: color["--color-action-pressed"],
    backgroundColor: color["--color-action-soft"],
    color: color["--color-action-pressed"],
    outlineWidth: 0,
  },
  disabled: {
    borderWidth: space["--border-width"],
    borderStyle: "solid",
    borderColor: color["--color-disabled-border"],
    backgroundColor: color["--color-disabled-surface"],
    color: color["--color-disabled-text"],
    cursor: "not-allowed",
    outlineWidth: 0,
  },
});

function visual(Style: ButtonStyle, State: ButtonState) {
  if (State === "Disabled") return styles.disabled;
  switch (Style) {
    case "Primary":
      switch (State) {
        case "Default":
          return styles.primaryInteractive;
        case "Hover":
          return styles.primaryHover;
        case "Focus":
          return styles.primaryFocus;
        case "Pressed":
          return styles.primaryPressed;
        default: {
          const _never: never = State;
          return _never;
        }
      }
    case "Secondary":
      switch (State) {
        case "Default":
          return styles.secondaryInteractive;
        case "Hover":
          return styles.secondaryHover;
        case "Focus":
          return styles.secondaryFocus;
        case "Pressed":
          return styles.secondaryPressed;
        default: {
          const _never: never = State;
          return _never;
        }
      }
    default: {
      const _never: never = Style;
      return _never;
    }
  }
}

export function Button({
  Label = "集合地点に決める",
  Size = "Medium",
  Style = "Primary",
  State = "Default",
  onClick,
}: ButtonProps) {
  const sizeStyle = Size === "Large" ? styles.large : styles.medium;
  return (
    <BaseButton
      disabled={State === "Disabled"}
      onClick={onClick}
      className={stylexClassName(styles.root, type["UI/Medium/Bold"], sizeStyle, visual(Style, State))}
    >
      {Label}
    </BaseButton>
  );
}
