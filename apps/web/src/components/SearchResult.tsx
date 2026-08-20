import { Button as BaseButton } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";

export type SearchResultPhoto = "Shown" | "Hidden";

export type SearchResultProps = {
  Name?: string;
  Detail?: string;
  Distance?: string;
  Photo?: SearchResultPhoto;
  onClick?: () => void;
};

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: space["--space-5"],
    width: "100%",
    margin: 0,
    paddingInline: space["--space-6"],
    paddingBlock: space["--space-5"],
    borderWidth: 0,
    borderBottomWidth: space["--border-width"],
    borderBottomStyle: "solid",
    borderBottomColor: color["--color-border-subtle"],
    backgroundColor: color["--color-surface-float"],
    color: "inherit",
    cursor: "pointer",
    appearance: "none",
    textAlign: "left",
    overflow: "hidden",
    outlineWidth: {
      default: 0,
      ":focus-visible": space["--focus-width"],
    },
    outlineStyle: {
      default: "none",
      ":focus-visible": "solid",
    },
    outlineColor: color["--color-focus"],
    outlineOffset: -3,
  },
  photo: {
    boxSizing: "border-box",
    width: 48,
    height: 48,
    borderRadius: space["--radius-sm"],
    backgroundColor: color["--color-surface-shell"],
    flexShrink: 0,
    overflow: "hidden",
  },
  body: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-1"],
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  name: {
    margin: 0,
    color: color["--color-text-primary"],
  },
  detail: {
    margin: 0,
    color: color["--color-text-secondary"],
  },
  distance: {
    margin: 0,
    color: color["--color-text-tertiary"],
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
});

function photoSlot(Photo: SearchResultPhoto) {
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

export function SearchResult({
  Name = "東京都庁",
  Detail = "新宿区西新宿2-8-1",
  Distance = "徒歩 12分",
  Photo = "Shown",
  onClick,
}: SearchResultProps) {
  return (
    <BaseButton onClick={onClick} className={stylexClassName(styles.root)}>
      {photoSlot(Photo)}
      <span className={stylexClassName(styles.body)}>
        <span className={stylexClassName(type["UI/Medium/Bold"], styles.name)}>{Name}</span>
        <span className={stylexClassName(type["UI/Small/Regular"], styles.detail)}>{Detail}</span>
      </span>
      <span className={stylexClassName(type["UI/Small/Regular"], styles.distance)}>{Distance}</span>
    </BaseButton>
  );
}
