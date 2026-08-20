import * as stylex from "@stylexjs/stylex";
import { space } from "../tokens/space.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { Button } from "./Button.js";

export type ReportSelected = "None" | "Early" | "OnTime" | "Late";

export type ReportProps = {
  Selected?: ReportSelected;
  onSelect?: (Selected: Exclude<ReportSelected, "None">) => void;
};

const choices = ["Early", "OnTime", "Late"] as const;

type ReportChoice = (typeof choices)[number];

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: space["--space-control-gap"],
    width: "100%",
    margin: 0,
  },
  cell: {
    display: "grid",
    width: "100%",
  },
});

function choiceLabel(choice: ReportChoice) {
  switch (choice) {
    case "Early":
      return "早く着く";
    case "OnTime":
      return "予定通り";
    case "Late":
      return "遅れる";
    default: {
      const _never: never = choice;
      return _never;
    }
  }
}

function choiceStyle(Selected: ReportSelected, choice: ReportChoice) {
  switch (Selected) {
    case "None":
      return "Secondary" as const;
    case "Early":
    case "OnTime":
    case "Late":
      return Selected === choice ? ("Primary" as const) : ("Secondary" as const);
    default: {
      const _never: never = Selected;
      return _never;
    }
  }
}

export function Report({ Selected = "None", onSelect }: ReportProps) {
  return (
    <div role="radiogroup" aria-label="到着申告" className={stylexClassName(styles.root)}>
      {choices.map((choice) => (
        <div key={choice} className={stylexClassName(styles.cell)}>
          <Button
            Label={choiceLabel(choice)}
            Size="Medium"
            Style={choiceStyle(Selected, choice)}
            onClick={() => onSelect?.(choice)}
          />
        </div>
      ))}
    </div>
  );
}
