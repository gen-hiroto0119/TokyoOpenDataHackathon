import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";

export type PlaceKind = "Destination" | "Meeting" | "Exit";
export type PlacePhoto = "Shown" | "Hidden";

export type PlaceProps = {
  Kind?: PlaceKind;
  Name?: string;
  Detail?: string;
  Photo?: PlacePhoto;
  Credit?: string;
};

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space["--space-5"],
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
  body: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-2"],
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  label: {
    margin: 0,
    color: color["--color-text-secondary"],
  },
  name: {
    margin: 0,
    color: color["--color-text-primary"],
  },
  detail: {
    margin: 0,
    color: color["--color-text-secondary"],
  },
  credit: {
    margin: 0,
    color: color["--color-text-tertiary"],
  },
  photo: {
    boxSizing: "border-box",
    width: 64,
    height: 64,
    borderRadius: space["--radius-sm"],
    backgroundColor: color["--color-surface-shell"],
    flexShrink: 0,
    overflow: "hidden",
  },
});

function kindLabel(Kind: PlaceKind) {
  switch (Kind) {
    case "Destination":
      return "目的地";
    case "Meeting":
      return "集合場所";
    case "Exit":
      return "出口";
    default: {
      const _never: never = Kind;
      return _never;
    }
  }
}

function showsCredit(Kind: PlaceKind, Photo: PlacePhoto) {
  switch (Photo) {
    case "Hidden":
      return false;
    case "Shown":
      switch (Kind) {
        case "Destination":
          return false;
        case "Meeting":
          return true;
        case "Exit":
          return true;
        default: {
          const _never: never = Kind;
          return _never;
        }
      }
    default: {
      const _never: never = Photo;
      return _never;
    }
  }
}

function photoSlot(Photo: PlacePhoto) {
  switch (Photo) {
    case "Shown":
      return <span className={stylexClassName(styles.photo)} />;
    case "Hidden":
      return null;
    default: {
      const _never: never = Photo;
      return _never;
    }
  }
}

export function Place({
  Kind = "Destination",
  Name = "東京都庁",
  Detail = "新宿区西新宿2-8-1",
  Photo = "Shown",
  Credit = "写真: Google",
}: PlaceProps) {
  return (
    <div className={stylexClassName(styles.root)}>
      <div className={stylexClassName(styles.body)}>
        <p className={stylexClassName(type["UI/Caption/Bold"], styles.label)}>{kindLabel(Kind)}</p>
        <p className={stylexClassName(type["Wayfinding/Landmark"], styles.name)}>{Name}</p>
        <p className={stylexClassName(type["UI/Small/Regular"], styles.detail)}>{Detail}</p>
        {showsCredit(Kind, Photo) ? (
          <p className={stylexClassName(type["UI/Caption/Bold"], styles.credit)}>{Credit}</p>
        ) : null}
      </div>
      {photoSlot(Photo)}
    </div>
  );
}
