# 実行計画・チーム運用

課題と進捗は Linear の TOK チームで管理する。仕様の正本は `docs/` と Figma のままにする。

- [Linear：TokyoOpenDataHackathon](https://linear.app/hirotofurugen/team/TOK/overview)
- [プロジェクト：東京都オープンデータハッカソン2026](https://linear.app/hirotofurugen/project/東京都オープンデータハッカソン2026-6bbe43de77fd)

## 提出までのゴール

最初に完成させる縦切りは次です。

```text
ホストが名前・行き先・期限を入れてルームを作り、招待リンクを配る
  -> 招待された人がリンクを開き、名前を入れ、共有範囲に同意する
  -> 各自が到着路線を入れる（乗換案内の画面から読み取るか、文で書く）
  -> 東京都の経路データから集合候補を比較する。人が増えるたび作り直す
  -> ホストが集合場所を決める
  -> 西口側のランドマークまで各自の経路を1手順ずつ表示する
  -> 二端末で到着状態と申告を共有する
  -> 手動ランドマーク確認で経路へ戻る
  -> 合流後、出口まで進み、出口から目的地へ Google Maps を開く
```

提出可能な公開Webを先に完成させ、WASM、OCR、Live AI、3Dは縦切りを壊さず追加します。

## 進め方：APIとデザインを並行させる

| トラック | 担当 | 完成の定義 | 依存 |
|---|---|---|---|
| A：推薦ロジックをAPIで完成させる | ひろと | 代表ケースの入出力がHTTP契約として固定され、テストで再現でき、現地確認状態が応答に含まれる | Figmaに依存しない |
| B：デザインシステムとcomponentを作る | ひろと＋デザイン担当 | Foundations確定、Must componentがFigmaで揃い、主要画面の状態が定義される | Aの応答fieldに依存 |

トラック A の HTTP 契約と計算の正本は [`docs/engineering/RECOMMENDER.md`](../engineering/RECOMMENDER.md)。画面と部品の正本は [`docs/product/SCREENS.md`](../product/SCREENS.md) と Figma。

## いまの状態

**トラック B が先行しています。** Figma に 26 ページ、画面 0〜6 が組んであります。残りは画面7（地点確認）、Sheet / Dialog、`status/attention` のトークン。

**トラック A は未着手です。** リポジトリにコードがありません。契約は固まっているので、TOK-9（型と小さなグラフでのゴールデンテスト）から始められます。

**データ取り込みが未着手です。** `data/manifests/shinjuku-terminal.json` がありません。これが無いと実データテストを完了扱いにできません。カタログの改札・出口・MEETABLE の実 ID も、取り込むまで確定しません。
