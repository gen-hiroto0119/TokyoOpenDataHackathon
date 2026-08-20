import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { AppBar } from "../components/AppBar.js";
import {
  Candidate,
  type CandidateAction,
  type CandidatePersonProps,
} from "../components/Candidate.js";
import { TabBar } from "../components/TabBar.js";

export type CandidateCompareProps = {
  Action?: CandidateAction;
};

const people: CandidatePersonProps[] = [
  { Who: "ひろと", Minutes: "12分", Effort: "階1 · 分岐2" },
  { Who: "かいる", Minutes: "6分", Effort: "階0 · 分岐1" },
  { Who: "あきな", Minutes: "6分", Effort: "階1 · 分岐1" },
];

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    width: 390,
    height: 844,
    overflow: "hidden",
    backgroundColor: color["--color-surface-shell"],
  },
  content: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-5"],
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
    padding: space["--space-6"],
    overflowX: "hidden",
    overflowY: "auto",
  },
});

export function CandidateCompare({ Action = "Shown" }: CandidateCompareProps) {
  return (
    <div className={stylexClassName(styles.root)}>
      <AppBar Title="集合場所の候補" Back="Shown" />
      <div className={stylexClassName(styles.content)}>
        <Candidate
          Name="西口交番前"
          Floor="1階"
          Reason="一番長い人の移動が最も短い"
          Facts="出口まで 3分"
          Action={Action}
          People={people}
        />
        <Candidate
          Name="京王百貨店口"
          Floor="B1"
          Reason="一番長い人が 2分 長い"
          Facts="出口まで 5分"
          Action={Action}
          People={people}
        />
        <Candidate
          Name="小田急エース南館入口"
          Floor="B1"
          Reason="階段を通らない"
          Facts="出口まで 6分"
          Action={Action}
          People={people}
        />
      </div>
      <TabBar Selected="Room" />
    </div>
  );
}
