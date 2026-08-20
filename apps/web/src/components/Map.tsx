import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";

export type MapMarkerKind = "Gate" | "Meeting" | "Onward" | "Here" | "Member";
export type MapLineKind = "Context" | "Muted" | "Selected";

export type MapMarkerProps = {
  Kind?: MapMarkerKind;
  Initial?: string;
};

export type MapLineProps = {
  Kind?: MapLineKind;
};

type LegendRow =
  | { kind: "marker"; Marker: MapMarkerKind; Label: string }
  | { kind: "line"; Line: MapLineKind; Label: string };

const styles = stylex.create({
  marker: {
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: space["--icon-size-md"],
    height: space["--icon-size-md"],
    flexShrink: 0,
  },
  gate: {
    borderWidth: space["--map-marker-stroke"],
    borderStyle: "solid",
    borderColor: color["--color-text-primary"],
    borderRadius: space["--radius-full"],
    backgroundColor: color["--color-map-marker-arrival"],
  },
  meeting: {
    borderWidth: space["--map-marker-stroke"],
    borderStyle: "solid",
    borderColor: color["--color-map-surface"],
    borderRadius: space["--radius-full"],
    backgroundColor: color["--color-map-marker-meeting"],
  },
  here: {
    borderWidth: space["--map-marker-stroke"],
    borderStyle: "solid",
    borderColor: color["--color-presence-self"],
    borderRadius: space["--radius-full"],
    backgroundColor: color["--color-map-surface"],
  },
  core: {
    width: 8,
    height: 8,
    borderRadius: space["--radius-full"],
    backgroundColor: color["--color-presence-self"],
    flexShrink: 0,
  },
  member: {
    borderWidth: space["--map-marker-stroke"],
    borderStyle: "solid",
    borderColor: color["--color-map-surface"],
    borderRadius: space["--radius-full"],
    backgroundColor: color["--color-presence-other"],
    color: color["--color-text-on-action"],
  },
  initial: {
    margin: 0,
    lineHeight: 1,
  },
  onward: {
    boxSizing: "border-box",
    width: 17,
    height: 17,
    backgroundColor: color["--color-map-marker-handoff"],
    borderWidth: space["--map-marker-stroke"],
    borderStyle: "solid",
    borderColor: color["--color-text-primary"],
    transform: "rotate(45deg)",
    flexShrink: 0,
  },
  lineTrack: {
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    width: 64,
    height: 8,
    flexShrink: 0,
  },
  line: {
    width: "100%",
    borderRadius: space["--radius-full"],
  },
  context: {
    height: space["--map-line-context"],
    backgroundColor: color["--color-map-route-context"],
  },
  muted: {
    height: space["--map-line-muted"],
    backgroundColor: color["--color-map-route-muted"],
  },
  selected: {
    height: space["--map-line-selected"],
    backgroundColor: color["--color-map-route-selected"],
  },
  legend: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-4"],
    width: 176,
    margin: 0,
    padding: space["--space-8"],
    backgroundColor: color["--color-surface-work"],
    borderWidth: space["--border-width"],
    borderStyle: "solid",
    borderColor: color["--color-border-subtle"],
    borderRadius: space["--radius-md"],
    flexShrink: 0,
  },
  row: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: space["--space-4"],
  },
  glyph: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 64,
    flexShrink: 0,
  },
  label: {
    margin: 0,
    color: color["--color-text-primary"],
  },
});

function marker(Kind: MapMarkerKind, Initial: string) {
  switch (Kind) {
    case "Gate":
      return <span className={stylexClassName(styles.marker, styles.gate)} />;
    case "Meeting":
      return <span className={stylexClassName(styles.marker, styles.meeting)} />;
    case "Here":
      return (
        <span className={stylexClassName(styles.marker, styles.here)}>
          <span className={stylexClassName(styles.core)} />
        </span>
      );
    case "Member":
      return (
        <span className={stylexClassName(styles.marker, styles.member)}>
          <span className={stylexClassName(type["UI/Caption/Bold"], styles.initial)}>{Initial}</span>
        </span>
      );
    case "Onward":
      return (
        <span className={stylexClassName(styles.marker)}>
          <span className={stylexClassName(styles.onward)} />
        </span>
      );
    default: {
      const _never: never = Kind;
      return _never;
    }
  }
}

function lineKind(Kind: MapLineKind) {
  switch (Kind) {
    case "Context":
      return styles.context;
    case "Muted":
      return styles.muted;
    case "Selected":
      return styles.selected;
    default: {
      const _never: never = Kind;
      return _never;
    }
  }
}

export function MapMarker({ Kind = "Gate", Initial = "さ" }: MapMarkerProps) {
  return marker(Kind, Initial);
}

export function MapLine({ Kind = "Context" }: MapLineProps) {
  return (
    <span className={stylexClassName(styles.lineTrack)}>
      <span className={stylexClassName(styles.line, lineKind(Kind))} />
    </span>
  );
}

const legendRows: readonly LegendRow[] = [
  { kind: "marker", Marker: "Gate", Label: "改札" },
  { kind: "marker", Marker: "Here", Label: "今の手順" },
  { kind: "marker", Marker: "Meeting", Label: "集合" },
  { kind: "marker", Marker: "Member", Label: "参加者" },
  { kind: "marker", Marker: "Onward", Label: "目的地" },
  { kind: "line", Line: "Context", Label: "周辺経路" },
  { kind: "line", Line: "Muted", Label: "比較中" },
  { kind: "line", Line: "Selected", Label: "選定経路" },
];

function legendGlyph(row: LegendRow) {
  switch (row.kind) {
    case "marker":
      return <MapMarker Kind={row.Marker} />;
    case "line":
      return <MapLine Kind={row.Line} />;
    default: {
      const _never: never = row;
      return _never;
    }
  }
}

export function MapLegend() {
  return (
    <div className={stylexClassName(styles.legend)}>
      {legendRows.map((row) => (
        <div key={row.Label} className={stylexClassName(styles.row)}>
          <div className={stylexClassName(styles.glyph)}>{legendGlyph(row)}</div>
          <p className={stylexClassName(type["UI/Small/Regular"], styles.label)}>{row.Label}</p>
        </div>
      ))}
    </div>
  );
}
