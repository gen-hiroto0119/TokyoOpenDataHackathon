import * as stylex from "@stylexjs/stylex";
import { space } from "../tokens/space.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { Composer } from "./Composer.js";
import { FieldSelect, type FieldSelectOption } from "./FieldSelect.js";

export type ArrivalInputState = "Empty" | "Read";

export type ArrivalInputProps = {
  State?: ArrivalInputState;
  /** 選ばれている路線の表示ラベル。省略時はダミー表示のまま。 */
  Value?: string;
  /** 選べる路線。省略時はダミーの3路線。 */
  options?: ReadonlyArray<FieldSelectOption>;
  onValueChange?: (value: string | null) => void;
  /**
   * 読み取り(スクリーンショットからの自動入力)を出すか。既定は出さない。
   * 読み取りは縦切りに入っていない。実画面では出さない。
   * デザインシステムの Story だけ true にする。
   */
  ShowReader?: boolean;
};

const arrivalLines = [
  { value: "line.jr", label: "JR" },
  { value: "line.keio", label: "京王線" },
  { value: "line.marunouchi", label: "東京メトロ丸ノ内線" },
];

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-5"],
    width: "100%",
    overflow: "hidden",
  },
});

function lineField(
  State: ArrivalInputState,
  Value: string | undefined,
  options: ReadonlyArray<FieldSelectOption>,
  onValueChange: ((value: string | null) => void) | undefined,
) {
  switch (State) {
    case "Read":
      return (
        <FieldSelect
          Label="到着する路線"
          Value={Value ?? "東京メトロ丸ノ内線"}
          Content="Filled"
          showAssistive={false}
          options={options}
          onValueChange={onValueChange}
        />
      );
    case "Empty":
      return (
        <FieldSelect
          Label="到着する路線"
          Value={Value ?? "路線を選ぶ"}
          Content="Empty"
          showAssistive={false}
          options={options}
          onValueChange={onValueChange}
        />
      );
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

export function ArrivalInput({
  State = "Read",
  Value,
  options = arrivalLines,
  onValueChange,
  ShowReader = false,
}: ArrivalInputProps) {
  return (
    <div className={stylexClassName(styles.root)}>
      {ShowReader ? (
      <Composer
        Label="自分の到着情報"
        Prompt="スクリーンショットで自動入力"
        Hint="読み取った内容は下に出ます"
        State="Empty"
        AddActionLabel="追加する"
        SubmitActionLabel="読み取る"
      />
      ) : null}
      {lineField(State, Value, options, onValueChange)}
    </div>
  );
}
