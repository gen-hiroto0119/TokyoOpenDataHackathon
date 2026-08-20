import { Button as BaseButton } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";

export type ParticipantRole = "Host" | "Invitee";
export type ParticipantProgress = "Joined" | "Draft" | "Invited" | "Opened";

export type ParticipantProps = {
  Name?: string;
  Detail?: string;
  Initial?: string;
  Role?: ParticipantRole;
  Progress?: ParticipantProgress;
  onCopy?: () => void;
};

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-5"],
    width: "100%",
    minHeight: 84,
    margin: 0,
    padding: space["--space-5"],
    backgroundColor: color["--color-surface-work"],
    borderBottomWidth: space["--border-width"],
    borderBottomStyle: "solid",
    borderBottomColor: color["--color-border-subtle"],
  },
  main: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: space["--space-5"],
    width: "100%",
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
    backgroundColor: color["--color-status-progress-soft"],
    flexShrink: 0,
    overflow: "hidden",
  },
  marker: {
    width: 6,
    height: 6,
    borderRadius: space["--radius-full"],
    backgroundColor: color["--color-status-progress"],
    flexShrink: 0,
  },
  badgeLabel: {
    margin: 0,
    color: color["--color-text-primary"],
    whiteSpace: "nowrap",
  },
  action: {
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    minHeight: space["--hit-area-touch-min"],
    margin: 0,
    paddingInline: space["--space-5"],
    paddingBlock: space["--space-4"],
    borderWidth: 0,
    borderRadius: space["--radius-md"],
    backgroundColor: color["--color-action-soft"],
    color: color["--color-action"],
    cursor: "pointer",
    appearance: "none",
    outlineWidth: {
      default: 0,
      ":focus-visible": space["--focus-width"],
    },
    outlineStyle: {
      default: "none",
      ":focus-visible": "solid",
    },
    outlineColor: color["--color-focus"],
    outlineOffset: 0,
  },
});

function actionControl(Role: ParticipantRole, onCopy?: () => void) {
  switch (Role) {
    case "Host":
      return (
        <BaseButton onClick={onCopy} className={stylexClassName(type["UI/Small/Bold"], styles.action)}>
          リンクをコピー
        </BaseButton>
      );
    case "Invitee":
      return null;
    default: {
      const _never: never = Role;
      return _never;
    }
  }
}

function badgeLabel(Role: ParticipantRole, Progress: ParticipantProgress) {
  switch (Role) {
    case "Host":
      return "ホスト";
    case "Invitee":
      switch (Progress) {
        case "Draft":
          return "未送信";
        case "Invited":
          return "招待中";
        case "Opened":
          return "入力中";
        case "Joined":
          return "参加済み";
        default: {
          const _never: never = Progress;
          return _never;
        }
      }
    default: {
      const _never: never = Role;
      return _never;
    }
  }
}

export function Participant({
  Name = "ひろと",
  Detail = "下書き",
  Initial = "ひ",
  Role = "Host",
  Progress = "Draft",
  onCopy,
}: ParticipantProps) {
  return (
    <div className={stylexClassName(styles.root)}>
      <div className={stylexClassName(styles.main)}>
        <div className={stylexClassName(styles.avatar)}>
          <span className={stylexClassName(type["UI/Small/Bold"])}>{Initial}</span>
        </div>
        <div className={stylexClassName(styles.identity)}>
          <p className={stylexClassName(type["UI/Medium/Bold"], styles.name)}>{Name}</p>
          <p className={stylexClassName(type["UI/Small/Regular"], styles.detail)}>{Detail}</p>
        </div>
        <div className={stylexClassName(styles.badge)}>
          <span className={stylexClassName(styles.marker)} />
          <span className={stylexClassName(type["UI/Caption/Bold"], styles.badgeLabel)}>
            {badgeLabel(Role, Progress)}
          </span>
        </div>
      </div>
      {actionControl(Role, onCopy)}
    </div>
  );
}
