import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { Button } from "./Button.js";
import { Icon, type IconName } from "./Icon.js";

export type CandidateState = "Default" | "Selected";
export type CandidateAction = "Shown" | "Hidden";

export type CandidatePersonProps = {
  Who?: string;
  Minutes?: string;
  Effort?: string;
};

export type CandidateProps = {
  Name?: string;
  Floor?: string;
  Reason?: string;
  Facts?: string;
  ShowElevator?: boolean;
  ShowRestroom?: boolean;
  ShowStepFree?: boolean;
  State?: CandidateState;
  Action?: CandidateAction;
  People?: CandidatePersonProps[];
  onChoose?: () => void;
};

const defaultPeople: CandidatePersonProps[] = [
  { Who: "ひろと", Minutes: "12分", Effort: "階1 · 分岐2" },
  { Who: "かいる", Minutes: "6分", Effort: "階0 · 分岐1" },
  { Who: "あきな", Minutes: "6分", Effort: "階1 · 分岐1" },
];

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-5"],
    width: "100%",
    margin: 0,
    padding: space["--space-6"],
    backgroundColor: color["--color-surface-work"],
    borderStyle: "solid",
    borderRadius: space["--radius-md"],
    flexShrink: 0,
  },
  defaultChrome: {
    borderWidth: space["--border-width"],
    borderColor: color["--color-border-subtle"],
  },
  selectedChrome: {
    borderWidth: space["--border-width-strong"],
    borderColor: color["--color-action"],
  },
  place: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-2"],
    minWidth: 0,
    overflow: "hidden",
  },
  name: {
    margin: 0,
    color: color["--color-text-primary"],
  },
  floor: {
    margin: 0,
    color: color["--color-text-secondary"],
  },
  facilities: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: space["--space-4"],
    color: color["--color-text-primary"],
  },
  reason: {
    margin: 0,
    color: color["--color-text-primary"],
  },
  facts: {
    margin: 0,
    color: color["--color-text-secondary"],
  },
  times: {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space["--space-5"],
    width: "100%",
  },
  person: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-2"],
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  who: {
    margin: 0,
    color: color["--color-text-secondary"],
  },
  minutes: {
    margin: 0,
    color: color["--color-text-primary"],
  },
  effort: {
    margin: 0,
    color: color["--color-text-tertiary"],
  },
  fill: {
    display: "grid",
    width: "100%",
  },
});

function chrome(State: CandidateState) {
  switch (State) {
    case "Default":
      return styles.defaultChrome;
    case "Selected":
      return styles.selectedChrome;
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

function facilityIcons(ShowElevator: boolean, ShowRestroom: boolean, ShowStepFree: boolean) {
  const names: IconName[] = [];
  if (ShowElevator) names.push("Elevator");
  if (ShowRestroom) names.push("Restroom");
  if (ShowStepFree) names.push("StepFree");
  if (names.length === 0) return null;
  return (
    <div className={stylexClassName(styles.facilities)}>
      {names.map((Name) => (
        <Icon key={Name} Name={Name} />
      ))}
    </div>
  );
}

function timesRow(People: CandidatePersonProps[]) {
  if (People.length === 0) return null;
  return (
    <div className={stylexClassName(styles.times)}>
      {People.map((person) => (
        <CandidatePerson
          key={person.Who}
          Who={person.Who}
          Minutes={person.Minutes}
          Effort={person.Effort}
        />
      ))}
    </div>
  );
}

function actionSlot(Action: CandidateAction, onChoose?: () => void) {
  switch (Action) {
    case "Shown":
      return (
        <div className={stylexClassName(styles.fill)}>
          <Button Label="この地点にする" Size="Medium" Style="Secondary" onClick={onChoose} />
        </div>
      );
    case "Hidden":
      return null;
    default: {
      const _never: never = Action;
      return _never;
    }
  }
}

export function CandidatePerson({
  Who = "ひろと",
  Minutes = "12分",
  Effort = "階1 · 分岐2",
}: CandidatePersonProps) {
  return (
    <div className={stylexClassName(styles.person)}>
      <p className={stylexClassName(type["UI/Caption/Bold"], styles.who)}>{Who}</p>
      <p className={stylexClassName(type["UI/Medium/Bold"], styles.minutes)}>{Minutes}</p>
      <p className={stylexClassName(type["UI/Caption/Bold"], styles.effort)}>{Effort}</p>
    </div>
  );
}

export function Candidate({
  Name = "B1 案内板前",
  Floor = "B1",
  Reason = "集合後は都庁方面へ歩く",
  Facts = "出口まで 3分",
  ShowElevator = true,
  ShowRestroom = true,
  ShowStepFree = true,
  State = "Default",
  Action = "Shown",
  People = defaultPeople,
  onChoose,
}: CandidateProps) {
  return (
    <div className={stylexClassName(styles.root, chrome(State))}>
      <div className={stylexClassName(styles.place)}>
        <p className={stylexClassName(type["Wayfinding/Landmark"], styles.name)}>{Name}</p>
        <p className={stylexClassName(type["UI/Small/Regular"], styles.floor)}>{Floor}</p>
      </div>
      {facilityIcons(ShowElevator, ShowRestroom, ShowStepFree)}
      <p className={stylexClassName(type["UI/Small/Regular"], styles.reason)}>{Reason}</p>
      <p className={stylexClassName(type["UI/Small/Regular"], styles.facts)}>{Facts}</p>
      {timesRow(People)}
      {actionSlot(Action, onChoose)}
    </div>
  );
}
