import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { Button } from "../components/Button.js";
import { Icon } from "../components/Icon.js";
import routes from "./signature/routes.svg";

const CYCLE = "5s";
const reduced = "@media (prefers-reduced-motion: reduce)" as const;

const walkJr = stylex.keyframes({
  "0%": { transform: "translate(0, 0)", opacity: 1 },
  "8%": { transform: "translate(0, 0)", opacity: 1 },
  "28%": { transform: "translate(222px, 80px)", opacity: 1 },
  "36%": { transform: "translate(222px, 80px)", opacity: 0 },
  "70%": { transform: "translate(222px, 80px)", opacity: 0 },
  "72%": { transform: "translate(0, 0)", opacity: 0 },
  "100%": { transform: "translate(0, 0)", opacity: 1 },
});

const walkMarunouchi = stylex.keyframes({
  "0%": { transform: "translate(0, 0)", opacity: 1 },
  "8%": { transform: "translate(0, 0)", opacity: 1 },
  "28%": { transform: "translate(222px, 0)", opacity: 1 },
  "36%": { transform: "translate(222px, 0)", opacity: 0 },
  "70%": { transform: "translate(222px, 0)", opacity: 0 },
  "72%": { transform: "translate(0, 0)", opacity: 0 },
  "100%": { transform: "translate(0, 0)", opacity: 1 },
});

const walkKeio = stylex.keyframes({
  "0%": { transform: "translate(0, 0)", opacity: 1 },
  "8%": { transform: "translate(0, 0)", opacity: 1 },
  "28%": { transform: "translate(222px, -80px)", opacity: 1 },
  "36%": { transform: "translate(222px, -80px)", opacity: 0 },
  "70%": { transform: "translate(222px, -80px)", opacity: 0 },
  "72%": { transform: "translate(0, 0)", opacity: 0 },
  "100%": { transform: "translate(0, 0)", opacity: 1 },
});

const meetingAppear = stylex.keyframes({
  "0%": { transform: "scale(0.2727)", opacity: 0 },
  "28%": { transform: "scale(0.2727)", opacity: 0 },
  "36%": { transform: "scale(1)", opacity: 1 },
  "70%": { transform: "scale(1)", opacity: 1 },
  "100%": { transform: "scale(0.2727)", opacity: 0 },
});

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    width: 390,
    height: 844,
    overflow: "hidden",
    backgroundColor: color["--color-surface-shell"],
    paddingTop: 72,
  },
  signature: {
    position: "relative",
    width: 390,
    height: 240,
    flexShrink: 0,
    overflow: "hidden",
    color: color["--color-text-primary"],
  },
  routes: {
    display: "block",
    width: 390,
    height: 240,
    pointerEvents: "none",
  },
  arrival: {
    boxSizing: "border-box",
    position: "absolute",
    zIndex: 1,
    width: 16,
    height: 16,
    borderWidth: space["--map-marker-stroke"],
    borderStyle: "solid",
    borderColor: color["--color-map-surface"],
    borderRadius: space["--radius-full"],
    backgroundColor: color["--color-map-route-muted"],
  },
  arrivalJr: { left: 16, top: 32 },
  arrivalMarunouchi: { left: 16, top: 112 },
  arrivalKeio: { left: 16, top: 192 },
  traveler: {
    position: "absolute",
    zIndex: 2,
    left: 12,
    color: color["--color-text-primary"],
    animationDuration: CYCLE,
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
    animationFillMode: "both",
  },
  travelerJr: {
    top: 28,
    animationName: { default: walkJr, [reduced]: null },
    opacity: { default: 1, [reduced]: 0 },
  },
  travelerMarunouchi: {
    top: 108,
    animationName: { default: walkMarunouchi, [reduced]: null },
    opacity: { default: 1, [reduced]: 0 },
  },
  travelerKeio: {
    top: 188,
    animationName: { default: walkKeio, [reduced]: null },
    opacity: { default: 1, [reduced]: 0 },
  },
  meeting: {
    boxSizing: "border-box",
    position: "absolute",
    left: 224,
    top: 98,
    zIndex: 3,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    borderWidth: space["--map-marker-stroke"],
    borderStyle: "solid",
    borderColor: color["--color-map-surface"],
    borderRadius: space["--radius-full"],
    backgroundColor: color["--color-map-marker-meeting"],
    color: color["--color-text-on-action"],
    transformOrigin: "center",
    animationName: { default: meetingAppear, [reduced]: null },
    animationDuration: CYCLE,
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
    animationFillMode: "both",
    opacity: { default: 0, [reduced]: 1 },
  },
  copy: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-6"],
    marginTop: space["--space-10"],
    paddingInline: space["--layout-page-gutter"],
  },
  title: {
    margin: 0,
    width: "100%",
    textAlign: "center",
    color: color["--color-text-primary"],
  },
  body: {
    margin: 0,
    width: "100%",
    color: color["--color-text-secondary"],
  },
  spacer: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
  },
  action: {
    boxSizing: "border-box",
    display: "grid",
    width: "100%",
    padding: space["--layout-page-gutter"],
  },
});

export type GettingStartedProps = {
  onStart?: () => void;
};

function Signature() {
  return (
    <div className={stylexClassName(styles.signature)} aria-hidden="true">
      <img className={stylexClassName(styles.routes)} src={routes} alt="" />
      <span className={stylexClassName(styles.arrival, styles.arrivalJr)} />
      <span className={stylexClassName(styles.arrival, styles.arrivalMarunouchi)} />
      <span className={stylexClassName(styles.arrival, styles.arrivalKeio)} />
      <span className={stylexClassName(styles.traveler, styles.travelerJr)}>
        <Icon Name="Walk" />
      </span>
      <span className={stylexClassName(styles.traveler, styles.travelerMarunouchi)}>
        <Icon Name="Walk" />
      </span>
      <span className={stylexClassName(styles.traveler, styles.travelerKeio)}>
        <Icon Name="Walk" />
      </span>
      <div className={stylexClassName(styles.meeting)}>
        <Icon Name="Gathered" />
      </div>
    </div>
  );
}

export function GettingStarted({ onStart }: GettingStartedProps) {
  return (
    <div className={stylexClassName(styles.root)}>
      <Signature />
      <div className={stylexClassName(styles.copy)}>
        <h1 className={stylexClassName(type["Wayfinding/Landmark"], styles.title)}>
          新宿駅での待ち合わせ
          <br />
          もう迷わない！
        </h1>
        <p className={stylexClassName(type["Body/Prose"], styles.body)}>
          全員の到着路線から、負担が偏らない集合場所を駅の経路データで選びます。
        </p>
      </div>
      <div className={stylexClassName(styles.spacer)} />
      <div className={stylexClassName(styles.action)}>
        <Button Label="はじめる" Size="Large" Style="Primary" onClick={onStart} />
      </div>
    </div>
  );
}
