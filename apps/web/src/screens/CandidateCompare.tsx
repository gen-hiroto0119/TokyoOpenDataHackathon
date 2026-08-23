import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { screen } from "../tokens/layout.stylex.js";
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
  catalogId: string | null;
  nodeId: string;
  Name: string;
  Floor: string;
  Reason: string;
  Facts: string;
  ShowElevator: boolean;
  ShowRestroom: boolean;
  ShowStepFree: boolean;
  People: CandidatePersonProps[];
  Selected: boolean;
};

/** 集合場所にできなかった地点(応答の infeasible[])。 */
export type CandidateCompareInfeasible = {
  nodeId: string;
  Name: string;
  Reason: string;
};

/** 上位いくつまで出すか。残りは「ほか N 件」にまとめる。 */
const INFEASIBLE_SHOWN = 3;

export type CandidateCompareProps = {
  Action?: CandidateAction;
  /** 省略時はダミー表示のまま(Storybook 用)。 */
  status?: CandidateCompareStatus;
  candidates?: CandidateCompareCandidate[];
  /** 到着情報待ちの参加者名(2人未満のとき)。 */
  waitingNames?: string[];
  /** status="error" のときのサーバーの理由(messageJa)。無ければ既定文言のみ出す。 */
  errorMessage?: string;
  /** 応答の infeasible[]。空なら何も出さない。 */
  infeasible?: CandidateCompareInfeasible[];
  onChoose?: (catalogId: string) => void;
  onRetry?: () => void;
  onTabSelect?: (selected: TabBarSelected) => void;
  onBack?: () => void;
};

const people: CandidatePersonProps[] = [
  { Who: "ひろと", Minutes: "12分", Effort: "階1 · 分岐2" },
  { Who: "かいる", Minutes: "6分", Effort: "階0 · 分岐1" },
  { Who: "あきな", Minutes: "6分", Effort: "階1 · 分岐1" },
];

const styles = stylex.create({
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
  infeasible: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-2"],
    width: "100%",
    margin: 0,
  },
  infeasibleText: {
    margin: 0,
    color: color["--color-text-secondary"],
  },
});

export function CandidateCompare({
  Action = "Shown",
  status,
  candidates,
  waitingNames = [],
  errorMessage,
  infeasible = [],
  onChoose,
  onRetry,
  onTabSelect,
  onBack,
}: CandidateCompareProps) {
  if (status === undefined) {
    return (
      <div className={stylexClassName(screen.frame)}>
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
    <div className={stylexClassName(screen.frame)}>
      <AppBar Title="集合場所の候補" Back={onBack ? "Shown" : "Hidden"} onBack={onBack} />
      <div className={stylexClassName(styles.content)}>
        {status === "loading" ? <Status State="Progress" /> : null}
        {status === "error" ? (
          <Status State="Failed" Detail={errorMessage} onRetry={onRetry} />
        ) : null}
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
          ? (candidates ?? []).map((c) => {
              const catalogId = c.catalogId;
              return (
                <Candidate
                  key={catalogId ?? c.nodeId}
                  Name={c.Name}
                  Floor={c.Floor}
                  Reason={c.Reason}
                  Facts={c.Facts}
                  ShowElevator={c.ShowElevator}
                  ShowRestroom={c.ShowRestroom}
                  ShowStepFree={c.ShowStepFree}
                  State={c.Selected ? "Selected" : "Default"}
                  Action={catalogId ? Action : "Hidden"}
                  People={c.People}
                  onChoose={catalogId ? () => onChoose?.(catalogId) : undefined}
                />
              );
            })
          : null}
        {infeasible.length > 0 ? (
          <div className={stylexClassName(styles.infeasible)}>
            {infeasible.slice(0, INFEASIBLE_SHOWN).map((point) => (
              <p
                key={point.nodeId}
                className={stylexClassName(type["UI/Small/Regular"], styles.infeasibleText)}
              >
                {point.Name} · {point.Reason}
              </p>
            ))}
            {infeasible.length > INFEASIBLE_SHOWN ? (
              <p className={stylexClassName(type["UI/Small/Regular"], styles.infeasibleText)}>
                ほか{infeasible.length - INFEASIBLE_SHOWN}件
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <TabBar Selected="Route" onSelect={onTabSelect} />
    </div>
  );
}
