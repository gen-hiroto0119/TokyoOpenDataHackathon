import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { AppBar } from "../components/AppBar.js";
import {
  Candidate,
  type CandidateAction,
  type CandidatePersonProps,
} from "../components/Candidate.js";
import { Status } from "../components/Status.js";
import { TabBar, type TabBarSelected } from "../components/TabBar.js";

export type CandidateCompareStatus = "loading" | "waiting" | "ready" | "error";

export type CandidateCompareCandidate = {
  nodeId: string;
  Name: string;
  Floor: string;
  Reason: string;
  Facts: string;
  People: CandidatePersonProps[];
  Selected: boolean;
};

export type CandidateCompareProps = {
  Action?: CandidateAction;
  /** 省略時はダミー表示のまま(Storybook 用)。 */
  status?: CandidateCompareStatus;
  candidates?: CandidateCompareCandidate[];
  /** 到着情報待ちの参加者名(2人未満のとき)。 */
  waitingNames?: string[];
  onChoose?: (nodeId: string) => void;
  onRetry?: () => void;
  onTabSelect?: (selected: TabBarSelected) => void;
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
  waiting: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-3"],
    width: "100%",
    margin: 0,
    padding: space["--space-6"],
    backgroundColor: color["--color-surface-work"],
    borderWidth: space["--border-width"],
    borderStyle: "solid",
    borderColor: color["--color-border-subtle"],
    borderRadius: space["--radius-md"],
  },
  waitingText: {
    margin: 0,
    color: color["--color-text-secondary"],
  },
});

export function CandidateCompare({
  Action = "Shown",
  status,
  candidates,
  waitingNames = [],
  onChoose,
  onRetry,
  onTabSelect,
}: CandidateCompareProps) {
  if (status === undefined) {
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
        <TabBar Selected="Room" onSelect={onTabSelect} />
      </div>
    );
  }

  return (
    <div className={stylexClassName(styles.root)}>
      <AppBar Title="集合場所の候補" Back="Shown" />
      <div className={stylexClassName(styles.content)}>
        {status === "loading" ? <Status State="Progress" /> : null}
        {status === "error" ? <Status State="Failed" onRetry={onRetry} /> : null}
        {status === "waiting" ? (
          <div className={stylexClassName(styles.waiting)}>
            <p className={stylexClassName(type["UI/Medium/Regular"], styles.waitingText)}>
              2人以上の到着情報がそろうと候補が出ます
            </p>
            {waitingNames.map((name, index) => (
              <p
                key={index}
                className={stylexClassName(type["UI/Small/Regular"], styles.waitingText)}
              >
                {name}さんの到着情報を待っています
              </p>
            ))}
          </div>
        ) : null}
        {status === "ready"
          ? (candidates ?? []).map((c) => (
              <Candidate
                key={c.nodeId}
                Name={c.Name}
                Floor={c.Floor}
                Reason={c.Reason}
                Facts={c.Facts}
                ShowElevator={false}
                ShowRestroom={false}
                ShowStepFree={false}
                State={c.Selected ? "Selected" : "Default"}
                Action={Action}
                People={c.People}
                onChoose={() => onChoose?.(c.nodeId)}
              />
            ))
          : null}
      </div>
      <TabBar Selected="Route" onSelect={onTabSelect} />
    </div>
  );
}
