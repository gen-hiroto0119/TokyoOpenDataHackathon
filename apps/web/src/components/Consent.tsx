import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";

export type ConsentKind = "Route" | "Camera" | "Expiry";

export type ConsentProps = {
  Kind?: ConsentKind;
};

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-2"],
    width: "100%",
    margin: 0,
    padding: space["--space-6"],
    backgroundColor: color["--color-surface-work"],
    borderWidth: space["--border-width"],
    borderStyle: "solid",
    borderColor: color["--color-border-subtle"],
    borderRadius: space["--radius-md"],
    overflow: "hidden",
  },
  title: {
    margin: 0,
    color: color["--color-text-primary"],
  },
  description: {
    margin: 0,
    color: color["--color-text-secondary"],
  },
});

function copy(Kind: ConsentKind) {
  switch (Kind) {
    case "Route":
      return {
        title: "到着駅と路線を共有します",
        description:
          "集合場所を選ぶために、あなたの到着駅と路線を他の参加者へ見せます。出発地の位置は送りません。",
      };
    case "Camera":
      return {
        title: "リアルタイム映像から読み取ります",
        description:
          "乗換案内の画面から路線と方面を、駅の案内板の写真から今いる場所の候補を読み取ります。",
      };
    case "Expiry":
      return {
        title: "6時間で消えます",
        description:
          "ルームと入力した内容は、作成から6時間で削除されます。期限は24時間先まで延ばせます。それ以降は開けません。",
      };
    default: {
      const _never: never = Kind;
      return _never;
    }
  }
}

export function Consent({ Kind = "Route" }: ConsentProps) {
  const { title, description } = copy(Kind);
  return (
    <div className={stylexClassName(styles.root)}>
      <p className={stylexClassName(type["UI/Medium/Bold"], styles.title)}>{title}</p>
      <p className={stylexClassName(type["UI/Small/Regular"], styles.description)}>{description}</p>
    </div>
  );
}
