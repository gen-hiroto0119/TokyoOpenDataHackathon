import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";

export type SheetHeight = "Peek" | "Full";

export type SheetProps = {
  Height?: SheetHeight;
  Title?: string;
  children?: ReactNode;
};

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: space["--space-5"],
    width: "100%",
    margin: 0,
    paddingTop: space["--space-5"],
    paddingInline: space["--space-6"],
    paddingBottom: space["--space-8"],
    backgroundColor: color["--color-surface-float"],
    borderTopLeftRadius: space["--radius-lg"],
    borderTopRightRadius: space["--radius-lg"],
    boxShadow: "0px -8px 24px 0px rgba(23, 35, 45, 0.14)",
    overflow: "hidden",
    flexShrink: 0,
  },
  peek: {
    height: 184,
  },
  full: {
    height: 408,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: space["--radius-full"],
    backgroundColor: color["--color-border-subtle"],
    flexShrink: 0,
  },
  title: {
    margin: 0,
    width: "100%",
    color: color["--color-text-primary"],
    flexShrink: 0,
  },
  body: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-4"],
    width: "100%",
    overflow: "hidden",
    flexShrink: 0,
  },
  bodyPeek: {
    height: 96,
  },
  bodyFull: {
    height: 320,
  },
});

function heightStyle(Height: SheetHeight) {
  switch (Height) {
    case "Peek":
      return styles.peek;
    case "Full":
      return styles.full;
    default: {
      const _never: never = Height;
      return _never;
    }
  }
}

function bodyStyle(Height: SheetHeight) {
  switch (Height) {
    case "Peek":
      return styles.bodyPeek;
    case "Full":
      return styles.bodyFull;
    default: {
      const _never: never = Height;
      return _never;
    }
  }
}

export function Sheet({
  Height = "Peek",
  Title = "いまいる場所を選ぶ",
  children,
}: SheetProps) {
  return (
    <div className={stylexClassName(styles.root, heightStyle(Height))}>
      <div className={stylexClassName(styles.handle)} />
      <p className={stylexClassName(type["UI/Medium/Bold"], styles.title)}>{Title}</p>
      <div className={stylexClassName(styles.body, bodyStyle(Height))}>{children}</div>
    </div>
  );
}
