import { Button as BaseButton } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { Button } from "../components/Button.js";
import { ErrorNotice } from "../components/ErrorNotice.js";
import { Icon } from "../components/Icon.js";
import { Permission } from "../components/Permission.js";
import { SearchResult } from "../components/SearchResult.js";
import { Sheet } from "../components/Sheet.js";
import type { HereRow } from "../route-view.js";

export type HereKind = "Default" | "List" | "Ask" | "Denied";

export type HereProps = {
  Kind?: HereKind;
  /** 自分の leg の確認点(confirmations)。経路順。 */
  rows?: readonly HereRow[];
  /** 送信中は行のタップを受け付けない。 */
  busy?: boolean;
  /** 直前の送信が失敗した。 */
  error?: boolean;
  onBack?: () => void;
  onAllow?: () => void;
  onPickList?: () => void;
  onConfirm?: (nodeId: string) => void;
  onRetry?: () => void;
};

type PlaceRow = {
  Name: string;
  Detail: string;
  Distance: string;
};

const reading: readonly PlaceRow[] = [
  {
    Name: "丸ノ内線 連絡通路",
    Detail: "B1 · 経路から外れています",
    Distance: "写っています",
  },
  {
    Name: "東口方面 通路",
    Detail: "B1 · 経路から外れています",
    Distance: "近い",
  },
  {
    Name: "丸ノ内線改札",
    Detail: "B1 · 通過済み",
    Distance: "",
  },
];

/** Storybook / props 未指定時のフォールバック。実データは RoomPage が渡す。 */
const DEFAULT_ROWS: readonly HereRow[] = [
  { nodeId: "gate", nameJa: "丸ノ内線改札", detailJa: "改札" },
  { nodeId: "branch", nameJa: "中央通路との合流点", detailJa: "分岐" },
  { nodeId: "meeting", nameJa: "西口交番前", detailJa: "集合場所" },
];

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    position: "relative",
    width: 390,
    height: 844,
    overflow: "hidden",
    backgroundColor: color["--color-text-primary"],
  },
  camera: {
    position: "absolute",
    inset: 0,
    backgroundColor: color["--color-surface-scrim"],
  },
  back: {
    boxSizing: "border-box",
    position: "absolute",
    top: space["--space-6"],
    left: space["--space-6"],
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: space["--hit-area-touch-min"],
    height: space["--hit-area-touch-min"],
    margin: 0,
    padding: 0,
    borderWidth: 0,
    borderRadius: space["--radius-full"],
    backgroundColor: color["--color-surface-scrim"],
    color: color["--color-text-on-action"],
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
  chip: {
    boxSizing: "border-box",
    position: "absolute",
    top: space["--space-8"],
    left: "50%",
    zIndex: 2,
    transform: "translateX(-50%)",
    margin: 0,
    paddingInline: space["--space-5"],
    paddingBlock: space["--space-3"],
    borderRadius: space["--radius-full"],
    backgroundColor: color["--color-surface-scrim"],
    color: color["--color-text-on-action"],
    whiteSpace: "nowrap",
  },
  sheet: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
  },
  places: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    width: "100%",
    overflowX: "hidden",
    overflowY: "auto",
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
  },
  place: {
    flexShrink: 0,
    width: "100%",
  },
  action: {
    display: "grid",
    width: "100%",
    flexShrink: 0,
  },
  permission: {
    boxSizing: "border-box",
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: space["--space-6"],
  },
});

function places(rows: readonly PlaceRow[]) {
  return (
    <div className={stylexClassName(styles.places)}>
      {rows.map((row) => (
        <div key={row.Name} className={stylexClassName(styles.place)}>
          <SearchResult Name={row.Name} Detail={row.Detail} Distance={row.Distance} Photo="Hidden" />
        </div>
      ))}
    </div>
  );
}

/** 確認点(confirmations)の一覧。通過済みも選び直せるよう選択可能のまま出す。 */
function confirmationPlaces(
  rows: readonly HereRow[],
  busy: boolean,
  onConfirm?: (nodeId: string) => void,
) {
  return (
    <div className={stylexClassName(styles.places)}>
      {rows.map((row) => (
        <div key={row.nodeId} className={stylexClassName(styles.place)}>
          <SearchResult
            Name={row.nameJa}
            Detail={row.detailJa}
            Distance=""
            Photo="Hidden"
            onClick={busy ? undefined : () => onConfirm?.(row.nodeId)}
          />
        </div>
      ))}
    </div>
  );
}

function chip(Kind: HereKind) {
  switch (Kind) {
    case "Default":
      return <p className={stylexClassName(type["UI/Small/Bold"], styles.chip)}>案内板を読んでいます</p>;
    case "List":
    case "Ask":
    case "Denied":
      return null;
    default: {
      const _never: never = Kind;
      return _never;
    }
  }
}

function panel(
  Kind: HereKind,
  rows: readonly HereRow[],
  busy: boolean,
  error: boolean,
  onAllow?: () => void,
  onPickList?: () => void,
  onConfirm?: (nodeId: string) => void,
  onRetry?: () => void,
) {
  switch (Kind) {
    case "Default":
      return (
        <div className={stylexClassName(styles.sheet)}>
          <Sheet Height="Full">
            {places(reading)}
            <div className={stylexClassName(styles.action)}>
              <Button Label="一覧から選ぶ" Size="Large" Style="Primary" onClick={onPickList} />
            </div>
          </Sheet>
        </div>
      );
    case "List":
      return (
        <div className={stylexClassName(styles.sheet)}>
          <Sheet Height="Full">
            {confirmationPlaces(rows, busy, onConfirm)}
            {error ? (
              <div className={stylexClassName(styles.action)}>
                <ErrorNotice onRetry={onRetry} />
              </div>
            ) : null}
          </Sheet>
        </div>
      );
    case "Ask":
      return (
        <div className={stylexClassName(styles.permission)}>
          <Permission State="Ask" onAllow={onAllow} />
        </div>
      );
    case "Denied":
      return (
        <div className={stylexClassName(styles.permission)}>
          <Permission State="Denied" onPickList={onPickList} />
        </div>
      );
    default: {
      const _never: never = Kind;
      return _never;
    }
  }
}

export function Here({
  Kind = "Default",
  rows = DEFAULT_ROWS,
  busy = false,
  error = false,
  onBack,
  onAllow,
  onPickList,
  onConfirm,
  onRetry,
}: HereProps) {
  return (
    <div className={stylexClassName(styles.root)}>
      <div className={stylexClassName(styles.camera)} />
      <BaseButton aria-label="戻る" onClick={onBack} className={stylexClassName(styles.back)}>
        <Icon Name="Back" />
      </BaseButton>
      {chip(Kind)}
      {panel(Kind, rows, busy, error, onAllow, onPickList, onConfirm, onRetry)}
    </div>
  );
}
