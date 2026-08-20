import * as stylex from "@stylexjs/stylex";

/** Figma: Eki-awase / Typography 変数. */
export const font = stylex.defineVars({
  "--font-family-ui": "BIZ UDPGothic, sans-serif",
  "--font-family-wayfinding": "Barlow Condensed, sans-serif",
  "--font-weight-regular": "400",
  "--font-weight-bold": "700",
  "--font-weight-wayfinding": "600",
});

/** Figma テキストスタイル。変数ではなく複合スタイル. */
export const type = stylex.create({
  "UI/Caption/Regular": {
    fontFamily: font["--font-family-ui"],
    fontSize: 12,
    fontWeight: 400,
    lineHeight: "16px",
    letterSpacing: 0,
  },
  "UI/Caption/Bold": {
    fontFamily: font["--font-family-ui"],
    fontSize: 12,
    fontWeight: 700,
    lineHeight: "16px",
    letterSpacing: 0,
  },
  "UI/Small/Regular": {
    fontFamily: font["--font-family-ui"],
    fontSize: 14,
    fontWeight: 400,
    lineHeight: "20px",
    letterSpacing: 0,
  },
  "UI/Small/Bold": {
    fontFamily: font["--font-family-ui"],
    fontSize: 14,
    fontWeight: 700,
    lineHeight: "20px",
    letterSpacing: 0,
  },
  "UI/Medium/Regular": {
    fontFamily: font["--font-family-ui"],
    fontSize: 16,
    fontWeight: 400,
    lineHeight: "24px",
    letterSpacing: 0,
  },
  "UI/Medium/Bold": {
    fontFamily: font["--font-family-ui"],
    fontSize: 16,
    fontWeight: 700,
    lineHeight: "24px",
    letterSpacing: 0,
  },
  "Body/Prose": {
    fontFamily: font["--font-family-ui"],
    fontSize: 16,
    fontWeight: 400,
    lineHeight: "28px",
    letterSpacing: 0,
  },
  "Wayfinding/Instruction": {
    fontFamily: font["--font-family-ui"],
    fontSize: 20,
    fontWeight: 700,
    lineHeight: "28px",
    letterSpacing: 0,
  },
  "Wayfinding/Landmark": {
    fontFamily: font["--font-family-ui"],
    fontSize: 24,
    fontWeight: 700,
    lineHeight: "32px",
    letterSpacing: 0,
  },
  "Wayfinding/Numeric": {
    fontFamily: font["--font-family-wayfinding"],
    fontSize: 32,
    fontWeight: 600,
    lineHeight: "36px",
    letterSpacing: 0,
  },
});
