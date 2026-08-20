import * as stylex from "@stylexjs/stylex";
import { space } from "../tokens/space.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";

/** Figma Icon の Name 軸。 */
export const iconNames = [
  "Search",
  "Camera",
  "Offline",
  "Failed",
  "Back",
  "Route",
  "Room",
  "Straight",
  "Right",
  "Left",
  "SlightRight",
  "SlightLeft",
  "Stairs",
  "Escalator",
  "Elevator",
  "Restroom",
  "StepFree",
  "Walk",
  "Gathered",
  "Copy",
  "Confirmed",
  "Time",
  "Expand",
] as const;

export type IconName = (typeof iconNames)[number];

const glyph: Record<IconName, string> = {
  Search: "search",
  Camera: "photo_camera",
  Offline: "wifi_off",
  Failed: "cancel",
  Back: "arrow_back",
  Route: "route",
  Room: "group",
  Straight: "straight",
  Right: "turn_right",
  Left: "turn_left",
  SlightRight: "turn_slight_right",
  SlightLeft: "turn_slight_left",
  Stairs: "stairs",
  Escalator: "escalator",
  Elevator: "elevator",
  Restroom: "wc",
  StepFree: "accessible",
  Walk: "directions_walk",
  Gathered: "groups",
  Copy: "content_copy",
  Confirmed: "check_circle",
  Time: "schedule",
  Expand: "expand_more",
};

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "block",
    width: space["--icon-size-md"],
    height: space["--icon-size-md"],
    overflow: "hidden",
    color: "currentcolor",
    flexShrink: 0,
  },
  glyph: {
    fontSize: space["--icon-size-md"],
    width: space["--icon-size-md"],
    height: space["--icon-size-md"],
    color: "currentcolor",
    userSelect: "none",
  },
});

export type IconProps = {
  Name?: IconName;
};

export function Icon({ Name = "Search" }: IconProps) {
  return (
    <span className={stylexClassName(styles.root)} aria-hidden="true">
      <span className={`material-symbols-outlined ${stylexClassName(styles.glyph) ?? ""}`}>
        {glyph[Name]}
      </span>
    </span>
  );
}
