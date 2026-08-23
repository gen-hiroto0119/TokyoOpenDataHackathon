import * as stylex from "@stylexjs/stylex";
import { color } from "./color.stylex.js";

/** 画面の外枠。幅は端末に合わせ、広い画面では読み幅を超えない。 */
export const screen = stylex.create({
  frame: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    width: "100%",
    maxWidth: 480,
    height: "100dvh",
    minHeight: "100dvh",
    marginInline: "auto",
    overflow: "hidden",
    backgroundColor: color["--color-surface-shell"],
  },
});
