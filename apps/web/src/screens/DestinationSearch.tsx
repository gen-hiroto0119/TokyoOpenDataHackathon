import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { AppBar } from "../components/AppBar.js";
import { Field } from "../components/Field.js";
import { SearchResult } from "../components/SearchResult.js";
import type { CatalogDestination } from "worker/src/contract.js";

export type DestinationSearchProps = {
  /** プリセットの行き先一覧。省略時はダミー表示のまま。 */
  destinations?: CatalogDestination[];
  onSelect?: (destination: CatalogDestination) => void;
  onBack?: () => void;
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
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
    overflowX: "hidden",
    overflowY: "auto",
  },
  search: {
    boxSizing: "border-box",
    padding: space["--space-6"],
  },
  results: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    width: "100%",
    overflow: "hidden",
  },
  provider: {
    margin: 0,
    paddingInline: space["--space-6"],
    paddingTop: space["--space-5"],
    color: color["--color-text-tertiary"],
  },
});

export function DestinationSearch({ destinations, onSelect, onBack }: DestinationSearchProps) {
  const [query, setQuery] = useState("");
  const wired = destinations !== undefined;

  if (!wired) {
    return (
      <div className={stylexClassName(styles.root)}>
        <AppBar Title="行き先" Back="Shown" />
        <div className={stylexClassName(styles.content)}>
          <div className={stylexClassName(styles.search)}>
            <Field Label="行き先" Value="都庁" Content="Filled" State="Focus" showAssistive={false} />
          </div>
          <div className={stylexClassName(styles.results)}>
            <SearchResult
              Name="東京都庁"
              Detail="新宿区西新宿2-8-1"
              Distance="徒歩 12分"
              Photo="Shown"
            />
            <SearchResult
              Name="東京都庁 第二本庁舎"
              Detail="新宿区西新宿2-8-1"
              Distance="徒歩 13分"
              Photo="Hidden"
            />
            <SearchResult
              Name="東京都庁"
              Detail="新宿区西新宿2-8-1"
              Distance="徒歩 12分"
              Photo="Hidden"
            />
          </div>
          <p className={stylexClassName(type["UI/Caption/Bold"], styles.provider)}>
            検索結果の提供: Google
          </p>
        </div>
      </div>
    );
  }

  const trimmed = query.trim();
  const filtered = trimmed ? destinations.filter((d) => d.nameJa.includes(trimmed)) : destinations;

  return (
    <div className={stylexClassName(styles.root)}>
      <AppBar Title="行き先" Back="Shown" onBack={onBack} />
      <div className={stylexClassName(styles.content)}>
        <div className={stylexClassName(styles.search)}>
          <Field
            Label="行き先"
            Value={query || "行き先を検索"}
            Content={query ? "Filled" : "Empty"}
            State="Focus"
            showAssistive={false}
            onValueChange={setQuery}
          />
        </div>
        <div className={stylexClassName(styles.results)}>
          {filtered.map((d) => (
            <SearchResult
              key={d.catalogId}
              Name={d.nameJa}
              Detail=""
              Distance=""
              Photo="Hidden"
              onClick={() => onSelect?.(d)}
            />
          ))}
        </div>
        <p className={stylexClassName(type["UI/Caption/Bold"], styles.provider)}>
          検索結果の提供: Google
        </p>
      </div>
    </div>
  );
}
