import { Button as BaseButton } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { Icon } from "./Icon.js";

export type AppBarBack = "Shown" | "Hidden";

export type AppBarProps = {
  Title?: string;
  Back?: AppBarBack;
  onBack?: () => void;
};

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: space["--space-4"],
    width: "100%",
    height: space["--control-height-lg"],
    margin: 0,
    paddingInline: space["--space-6"],
    paddingBlock: space["--space-2"],
    backgroundColor: color["--color-surface-float"],
    borderBottomWidth: space["--border-width"],
    borderBottomStyle: "solid",
    borderBottomColor: color["--color-border-subtle"],
    flexShrink: 0,
  },
  back: {
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: space["--hit-area-touch-min"],
    height: space["--hit-area-touch-min"],
    margin: 0,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: color["--color-text-primary"],
    cursor: "pointer",
    appearance: "none",
    flexShrink: 0,
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
  title: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    margin: 0,
    color: color["--color-text-primary"],
  },
});

function backControl(Back: AppBarBack, onBack?: () => void) {
  switch (Back) {
    case "Shown":
      return (
        <BaseButton aria-label="戻る" onClick={onBack} className={stylexClassName(styles.back)}>
          <Icon Name="Back" />
        </BaseButton>
      );
    case "Hidden":
      return null;
    default: {
      const _never: never = Back;
      return _never;
    }
  }
}

export function AppBar({
  Title = "集合場所の候補",
  Back = "Shown",
  onBack,
}: AppBarProps) {
  return (
    <header className={stylexClassName(styles.root)}>
      {backControl(Back, onBack)}
      <p className={stylexClassName(type["UI/Medium/Bold"], styles.title)}>{Title}</p>
    </header>
  );
}
