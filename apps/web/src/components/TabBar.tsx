import { Button as BaseButton } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { Icon, type IconName } from "./Icon.js";

export type TabBarSelected = "Route" | "Room";

export type TabBarProps = {
  Selected?: TabBarSelected;
  onSelect?: (Selected: TabBarSelected) => void;
};

const items: readonly TabBarSelected[] = ["Route", "Room"];

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
    minHeight: 56,
    height: "auto",
    margin: 0,
    paddingInline: 0,
    paddingTop: space["--space-3"],
    paddingBottom: "calc(6px + env(safe-area-inset-bottom))",
    backgroundColor: color["--color-surface-float"],
    borderTopWidth: space["--border-width"],
    borderTopStyle: "solid",
    borderTopColor: color["--color-border-subtle"],
    flexShrink: 0,
  },
  item: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: space["--space-1"],
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    height: space["--hit-area-touch-min"],
    margin: 0,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    cursor: "pointer",
    appearance: "none",
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
    outlineOffset: -3,
  },
  unselected: {
    color: color["--color-text-secondary"],
  },
  selected: {
    color: color["--color-text-primary"],
  },
  label: {
    margin: 0,
    whiteSpace: "nowrap",
  },
});

function itemCopy(kind: TabBarSelected): { Name: IconName; label: string } {
  switch (kind) {
    case "Route":
      return { Name: "Route", label: "経路" };
    case "Room":
      return { Name: "Room", label: "ルーム" };
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

function itemVisual(selected: boolean) {
  return selected ? styles.selected : styles.unselected;
}

function itemType(selected: boolean) {
  return selected ? type["UI/Caption/Bold"] : type["UI/Caption/Regular"];
}

export function TabBar({ Selected = "Room", onSelect }: TabBarProps) {
  return (
    <nav className={stylexClassName(styles.root)}>
      {items.map((kind) => {
        const { Name, label } = itemCopy(kind);
        const selected = Selected === kind;
        return (
          <BaseButton
            key={kind}
            aria-current={selected ? "page" : undefined}
            onClick={() => onSelect?.(kind)}
            className={stylexClassName(styles.item, itemVisual(selected))}
          >
            <Icon Name={Name} />
            <span className={stylexClassName(itemType(selected), styles.label)}>{label}</span>
          </BaseButton>
        );
      })}
    </nav>
  );
}
