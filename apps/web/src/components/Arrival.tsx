import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";

export type ArrivalProgress = "Pending" | "Moving" | "Arrived" | "OffPath";

export type ArrivalProps = {
  Name?: string;
  Detail?: string;
  Initial?: string;
  Progress?: ArrivalProgress;
  ShowReport?: boolean;
  Report?: string;
};

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: space["--space-5"],
    width: "100%",
    minHeight: 84,
    margin: 0,
    padding: space["--space-5"],
    backgroundColor: color["--color-surface-work"],
    borderWidth: space["--border-width"],
    borderStyle: "solid",
    borderColor: color["--color-border-subtle"],
  },
  avatar: {
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: space["--radius-full"],
    backgroundColor: color["--color-surface-shell"],
    color: color["--color-text-primary"],
    flexShrink: 0,
    overflow: "hidden",
  },
  identity: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-2"],
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  name: {
    margin: 0,
    color: color["--color-text-primary"],
  },
  detail: {
    margin: 0,
    color: color["--color-text-secondary"],
  },
  badge: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: space["--space-2"],
    paddingInline: space["--space-4"],
    paddingBlock: space["--space-2"],
    borderRadius: space["--radius-full"],
    flexShrink: 0,
    overflow: "hidden",
  },
  reportPending: {
    backgroundColor: color["--color-surface-shell"],
  },
  reportMoving: {
    backgroundColor: color["--color-status-attention-soft"],
  },
  reportArrived: {
    backgroundColor: color["--color-status-progress-soft"],
  },
  reportOffPath: {
    backgroundColor: color["--color-status-problem-soft"],
  },
  statusPending: {
    backgroundColor: color["--color-surface-shell"],
  },
  statusArrived: {
    backgroundColor: color["--color-status-progress-soft"],
  },
  statusOffPath: {
    backgroundColor: color["--color-status-problem-soft"],
  },
  marker: {
    width: 6,
    height: 6,
    borderRadius: space["--radius-full"],
    flexShrink: 0,
  },
  markerPending: {
    backgroundColor: color["--color-text-tertiary"],
  },
  markerArrived: {
    backgroundColor: color["--color-status-progress"],
  },
  markerOffPath: {
    backgroundColor: color["--color-status-problem"],
  },
  badgeLabel: {
    margin: 0,
    color: color["--color-text-primary"],
    whiteSpace: "nowrap",
  },
});

function reportSoft(Progress: ArrivalProgress) {
  switch (Progress) {
    case "Pending":
      return styles.reportPending;
    case "Moving":
      return styles.reportMoving;
    case "Arrived":
      return styles.reportArrived;
    case "OffPath":
      return styles.reportOffPath;
    default: {
      const _never: never = Progress;
      return _never;
    }
  }
}

function statusCopy(Progress: ArrivalProgress) {
  switch (Progress) {
    case "Pending":
      return "未確認";
    case "Moving":
      return "移動中";
    case "Arrived":
      return "到着";
    case "OffPath":
      return "経路外";
    default: {
      const _never: never = Progress;
      return _never;
    }
  }
}

function reportSlot(ShowReport: boolean, Report: string, Progress: ArrivalProgress) {
  if (!ShowReport) return null;
  return (
    <div className={stylexClassName(styles.badge, reportSoft(Progress))}>
      <span className={stylexClassName(type["UI/Caption/Bold"], styles.badgeLabel)}>{Report}</span>
    </div>
  );
}

function statusSlot(Progress: ArrivalProgress) {
  switch (Progress) {
    case "Moving":
      return null;
    case "Pending":
      return (
        <div className={stylexClassName(styles.badge, styles.statusPending)}>
          <span className={stylexClassName(styles.marker, styles.markerPending)} />
          <span className={stylexClassName(type["UI/Caption/Bold"], styles.badgeLabel)}>
            {statusCopy(Progress)}
          </span>
        </div>
      );
    case "Arrived":
      return (
        <div className={stylexClassName(styles.badge, styles.statusArrived)}>
          <span className={stylexClassName(styles.marker, styles.markerArrived)} />
          <span className={stylexClassName(type["UI/Caption/Bold"], styles.badgeLabel)}>
            {statusCopy(Progress)}
          </span>
        </div>
      );
    case "OffPath":
      return (
        <div className={stylexClassName(styles.badge, styles.statusOffPath)}>
          <span className={stylexClassName(styles.marker, styles.markerOffPath)} />
          <span className={stylexClassName(type["UI/Caption/Bold"], styles.badgeLabel)}>
            {statusCopy(Progress)}
          </span>
        </div>
      );
    default: {
      const _never: never = Progress;
      return _never;
    }
  }
}

export function Arrival({
  Name = "かいる",
  Detail = "改札前",
  Initial = "か",
  Progress = "Pending",
  ShowReport = false,
  Report = "予定通り",
}: ArrivalProps) {
  return (
    <div className={stylexClassName(styles.root)}>
      <div className={stylexClassName(styles.avatar)}>
        <span className={stylexClassName(type["UI/Small/Bold"])}>{Initial}</span>
      </div>
      <div className={stylexClassName(styles.identity)}>
        <p className={stylexClassName(type["UI/Medium/Bold"], styles.name)}>{Name}</p>
        <p className={stylexClassName(type["UI/Small/Regular"], styles.detail)}>{Detail}</p>
      </div>
      {reportSlot(ShowReport, Report, Progress)}
      {statusSlot(Progress)}
    </div>
  );
}
