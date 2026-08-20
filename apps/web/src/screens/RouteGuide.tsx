import { useLayoutEffect, useRef, useState, type UIEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { AppBar } from "../components/AppBar.js";
import { Handoff } from "../components/Handoff.js";
import { type IconName } from "../components/Icon.js";
import { MapMarker } from "../components/Map.js";
import { Path, type PathKind, type PathState } from "../components/Path.js";
import { TabBar } from "../components/TabBar.js";

const PANE = 280;
const START = 1;

type HereAt = "Gate" | "Turn" | "Meeting";

type GuideStep =
  | {
      kind: "path";
      Kind: PathKind;
      Landmark?: string;
      Detail: string;
      Goal?: string;
      ShowGoal?: boolean;
      Icon: IconName;
    }
  | { kind: "handoff" };

const guide: readonly GuideStep[] = [
  {
    kind: "path",
    Kind: "Landmark",
    Landmark: "丸ノ内線改札",
    Detail: "出て直進 · 30m",
    Icon: "Straight",
  },
  { kind: "path", Kind: "Move", Detail: "直進する · 100m", Icon: "Straight" },
  {
    kind: "path",
    Kind: "Landmark",
    Landmark: "西口交番前",
    Detail: "右へ曲がる · 40m",
    Goal: "集合場所",
    ShowGoal: true,
    Icon: "Right",
  },
  {
    kind: "path",
    Kind: "Landmark",
    Landmark: "出口 8",
    Detail: "直進 · 60m",
    Goal: "出口",
    ShowGoal: true,
    Icon: "Straight",
  },
  { kind: "handoff" },
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
  map: {
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    overflow: "hidden",
    backgroundColor: color["--color-map-surface"],
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
  },
  canvas: {
    position: "relative",
    width: 390,
    height: 280,
    flexShrink: 0,
  },
  corridorEastWest: {
    position: "absolute",
    left: 20,
    top: 150,
    width: 350,
    height: space["--map-line-context"],
    backgroundColor: color["--color-map-route-context"],
  },
  corridorNorthSouth: {
    position: "absolute",
    left: 180,
    top: 30,
    width: space["--map-line-context"],
    height: 230,
    backgroundColor: color["--color-map-route-context"],
  },
  route: {
    position: "absolute",
    left: 60,
    top: 90,
    width: 240,
    height: 140,
    overflow: "visible",
    color: color["--color-map-route-selected"],
  },
  gate: {
    position: "absolute",
    left: 48,
    top: 218,
  },
  meeting: {
    position: "absolute",
    left: 288,
    top: 78,
  },
  hereGate: {
    position: "absolute",
    left: 48,
    top: 218,
  },
  hereTurn: {
    position: "absolute",
    left: 168,
    top: 138,
  },
  hereMeeting: {
    position: "absolute",
    left: 288,
    top: 78,
  },
  steps: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-6"],
    width: "100%",
    height: PANE,
    margin: 0,
    paddingInline: space["--space-6"],
    paddingBlock: 114,
    overflowX: "hidden",
    overflowY: "auto",
    scrollSnapType: "y mandatory",
    scrollSnapStop: "always",
    scrollbarWidth: "none",
    flexShrink: 0,
    "::-webkit-scrollbar": {
      display: "none",
    },
  },
  snap: {
    width: "100%",
    flexShrink: 0,
    scrollSnapAlign: "center",
    scrollSnapStop: "always",
  },
});

function stepState(index: number, current: number): PathState {
  if (index < current) return "Done";
  if (index === current) return "Next";
  return "Later";
}

function hereAt(current: number): HereAt {
  switch (current) {
    case 0:
      return "Gate";
    case 1:
      return "Turn";
    default:
      return "Meeting";
  }
}

function hereStyle(at: HereAt) {
  switch (at) {
    case "Gate":
      return styles.hereGate;
    case "Turn":
      return styles.hereTurn;
    case "Meeting":
      return styles.hereMeeting;
    default: {
      const _never: never = at;
      return _never;
    }
  }
}

function nearestStep(root: HTMLDivElement) {
  const mid = root.getBoundingClientRect().top + root.clientHeight / 2;
  const items = root.querySelectorAll("[data-step]");
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < items.length; i++) {
    const item = items.item(i);
    if (!(item instanceof HTMLElement)) continue;
    const rect = item.getBoundingClientRect();
    const dist = Math.abs(rect.top + rect.height / 2 - mid);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function RouteMap({ Here }: { Here: HereAt }) {
  return (
    <div className={stylexClassName(styles.map)}>
      <div className={stylexClassName(styles.canvas)}>
        <span className={stylexClassName(styles.corridorEastWest)} />
        <span className={stylexClassName(styles.corridorNorthSouth)} />
        <svg className={stylexClassName(styles.route)} viewBox="0 0 240 140" aria-hidden="true">
          <path
            d="M 0 140 L 0 60 L 120 60 L 120 0 L 240 0"
            fill="none"
            stroke="currentColor"
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className={stylexClassName(styles.gate)}>
          <MapMarker Kind="Gate" />
        </span>
        <span className={stylexClassName(styles.meeting)}>
          <MapMarker Kind="Meeting" />
        </span>
        <span className={stylexClassName(hereStyle(Here))}>
          <MapMarker Kind="Here" />
        </span>
      </div>
    </div>
  );
}

function stepCard(step: GuideStep, index: number, current: number) {
  switch (step.kind) {
    case "path":
      return (
        <Path
          State={stepState(index, current)}
          Kind={step.Kind}
          Landmark={step.Landmark}
          Detail={step.Detail}
          Goal={step.Goal}
          ShowGoal={step.ShowGoal}
          Icon={step.Icon}
        />
      );
    case "handoff":
      return <Handoff State="Waiting" />;
    default: {
      const _never: never = step;
      return _never;
    }
  }
}

export function RouteGuide() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(START);

  useLayoutEffect(() => {
    const root = scrollerRef.current;
    const item = root?.querySelector(`[data-step="${START}"]`);
    if (item instanceof HTMLElement) {
      item.scrollIntoView({ block: "center", behavior: "auto" });
    }
  }, []);

  function onScroll(event: UIEvent<HTMLDivElement>) {
    setCurrent(nearestStep(event.currentTarget));
  }

  return (
    <div className={stylexClassName(styles.root)}>
      <AppBar Title="経路" Back="Shown" />
      <RouteMap Here={hereAt(current)} />
      <div ref={scrollerRef} className={stylexClassName(styles.steps)} onScroll={onScroll}>
        {guide.map((step, index) => (
          <div key={index} data-step={index} className={stylexClassName(styles.snap)}>
            {stepCard(step, index, current)}
          </div>
        ))}
      </div>
      <TabBar Selected="Route" />
    </div>
  );
}
