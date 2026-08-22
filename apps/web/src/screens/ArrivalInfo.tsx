import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { AppBar } from "../components/AppBar.js";
import { ArrivalInput } from "../components/ArrivalInput.js";
import { Button } from "../components/Button.js";
import { ErrorNotice } from "../components/ErrorNotice.js";
import type { FieldSelectOption } from "../components/FieldSelect.js";
import { Place } from "../components/Place.js";

export type ArrivalInfoProps = {
  destinationName?: string;
  /** GET /v1/catalog の lines をそのまま渡す。 */
  lineOptions?: ReadonlyArray<FieldSelectOption>;
  /** 選ばれている路線の表示名。未選択なら null。 */
  lineLabel?: string | null;
  onLineChange?: (value: string | null) => void;
  onSubmit?: () => void;
  submitDisabled?: boolean;
  error?: boolean;
  onRetry?: () => void;
};

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
  fill: {
    display: "grid",
    width: "100%",
  },
});

export function ArrivalInfo({
  destinationName,
  lineOptions,
  lineLabel,
  onLineChange,
  onSubmit,
  submitDisabled,
  error,
  onRetry,
}: ArrivalInfoProps) {
  const wired = onSubmit !== undefined;
  return (
    <div className={stylexClassName(styles.root)}>
      <AppBar Title="到着情報" Back="Shown" />
      <div className={stylexClassName(styles.content)}>
        {wired ? (
          <Place Kind="Destination" Name={destinationName ?? ""} Detail="" Photo="Hidden" />
        ) : (
          <Place Kind="Destination" Name="東京都庁" Detail="新宿区西新宿2-8-1" Photo="Shown" />
        )}
        {wired ? (
          <ArrivalInput
            State={lineLabel ? "Read" : "Empty"}
            Value={lineLabel ?? undefined}
            options={lineOptions ?? []}
            onValueChange={onLineChange}
          />
        ) : (
          <ArrivalInput State="Read" />
        )}
        {wired && error ? <ErrorNotice onRetry={onRetry} /> : null}
        <div className={stylexClassName(styles.fill)}>
          <Button
            Label="この内容で参加する"
            Size="Large"
            Style="Primary"
            onClick={onSubmit}
            State={wired && submitDisabled ? "Disabled" : "Default"}
          />
        </div>
      </div>
    </div>
  );
}
