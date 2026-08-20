# AGENTS.md

このリポジトリで作業するコーディングエージェント向けの手順書です。人間向けの説明は `README.md` と `docs/` を正とします。進捗、画面一覧、部品の完成度、技術スタックの案など、変わりやすい情報はここに書かないでください。

## 正本

- プロダクト方針: `docs/PRODUCT.md`
- 画面一覧と範囲: `docs/SCREENS.md`
- 推薦 API: `docs/RECOMMENDER.md`
- 経路の計算: `docs/CORE.md`
- 調査根拠: `docs/RESEARCH.md`
- データの棚卸し: `docs/DATA.md`
- UI: [Figma の Design System](https://www.figma.com/design/9QOfzNGvTkWdmvLVpWPj16/)（Foundations と Components）。`Concept Display` は探索用であり、実装の正本にしない。

仕様が必要なら上記を読み、ここに複製しない。調査メモでは事実と仮説を分けて扱う。

## 作業規則

- API と UI は混ぜない。範囲は `docs/PRODUCT.md` の縦切りに従う。
- UI は Figma の Foundations と Components に合わせる。手順は `.cursor/rules/figma-design-system.mdc`。無いものは先に足すか、足りない旨を明示する。
- `Concept Display` の見た目、情報設計、地名や路線の例を流用しない。
- 既存の命名（ノード、状態、トークン）を勝手に言い換えない。
- 利用者向け文言は日本語にする。書き方は `.cursor/rules/ui-copy.mdc`、実際の文言は Figma の `25 Copy`。無い文言をその場で書かない。足りなければ先に `25 Copy` へ足す。
- コミットと push は、ユーザーが明示したときだけ行う。
