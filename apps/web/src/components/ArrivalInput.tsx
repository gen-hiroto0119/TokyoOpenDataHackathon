import * as stylex from "@stylexjs/stylex";
import { space } from "../tokens/space.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { Composer } from "./Composer.js";
import { FieldSelect } from "./FieldSelect.js";

export type ArrivalInputState = "Empty" | "Read";

export type ArrivalInputProps = {
  State?: ArrivalInputState;
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

function lineField(State: ArrivalInputState) {
  switch (State) {
    case "Read":
      return (
        <FieldSelect
          Label="到着する路線"
          Value="東京メトロ丸ノ内線"
          Content="Filled"
          showAssistive={false}
          options={arrivalLines}
        />
      );
    case "Empty":
      return (
        <FieldSelect
          Label="到着する路線"
          Value="路線を選ぶ"
          Content="Empty"
          showAssistive={false}
          options={arrivalLines}
        />
      );
    default: {
      const _never: never = State;
      return _never;
    }
  }
}

export function ArrivalInput({ State = "Read" }: ArrivalInputProps) {
  return (
    <div className={stylexClassName(styles.root)}>
      <Composer
        Label="自分の到着情報"
        Prompt="スクリーンショットで自動入力"
        Hint="読み取った内容は下に出ます"
        State="Empty"
        AddActionLabel="追加する"
        SubmitActionLabel="読み取る"
      />
      {lineField(State)}
    </div>
  );
}
