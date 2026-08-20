# 駅あわせ（仮称）

東京都オープンデータを使い、巨大駅で別々の路線から来る人たちにとって、分かりやすく公平で、その後の目的地にも進みやすい待ち合わせ場所を提案するWebアプリです。責務は駅構内と出口までとし、その先の徒歩はGoogle Mapsへ渡します。

現在は東京都オープンデータ・ハッカソンに向けた企画／技術検証段階です。最初の対象は新宿駅西側、次の目的地は東京都庁を想定しています。

## 代表ユースケース

- JR・京王線・東京メトロ丸ノ内線で来る3人が新宿駅で集合する。
- 全員にとって移動負担が偏りすぎず、説明しやすいランドマークを選ぶ。
- 集合後は出口まで案内し、出口に着いたら出口から目的地への Google Maps 徒歩経路を開く。
- 構内GPSを過信せず、改札や目の前の案内板から現在地を確認しながら進む。

## 決めていること

- **アカウントを作りません。** 参加は招待リンクと名前だけです。
- **位置を測りません。** 駅の中では現在地を出せないので、利用者が確認しながら進みます。地図の点は測った位置ではなく、その人が確認したところに出します。
- **改札は選ばせません。** 路線を入れると、その路線の改札のうち一番近いものをこちらが選びます。
- **行き先は新宿駅の周辺から選べます。** 行き先に一番近い出口を使います。
- **集合場所はホストが決めます。** 候補は人が増えるたびに作り直しますが、決めた地点は動かしません。
- **合成スコアを出しません。** 順位は説明できる条件の順で決め、画面には内訳を出します。

## 現在の案

- UI：モバイルWeb（390 × 844）、2D地図を基本とし3D表示は追加機能
- 推薦サービス：Hono + TypeScript（Cloudflare Workers）
- 実行基盤：Cloudflare Workers + Durable Objects
- 配布形態：スマホファーストのPWA（ホーム画面起動、静的asset、専用offline画面）
- 行き先の検索：Google Places（クライアント側）。推薦 Worker は名前と緯度経度を受け取るだけ
- 出口から先：Google Maps URLs。Routes API は使いません

## ドキュメント

| 文書 | 中身 |
|---|---|
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | 解く問題、利用体験、集合地点の評価、MVP、成功条件 |
| [`docs/SCREENS.md`](docs/SCREENS.md) | 画面と部品。決めたことと採らなかったこと |
| [`docs/RECOMMENDER.md`](docs/RECOMMENDER.md) | 推薦 API の HTTP 契約と計算 |
| [`docs/RESEARCH.md`](docs/RESEARCH.md) | データ出典、屋内測位の制約、Live AI の検討 |
| [`docs/DATA.md`](docs/DATA.md) | 実データを取り込んで数えた棚卸し。機能ごとの可否 |
| [`AGENTS.md`](AGENTS.md) | コーディングエージェント向けの手順書 |

## 出典

- 経路と施設のデータ：東京都都市整備局「新宿駅周辺の施設情報及び移動ルート」（CC BY 4.0）

## 共有場所

- [Figma：Design System](https://www.figma.com/design/9QOfzNGvTkWdmvLVpWPj16/)
- [Linear：課題管理（TOK）](https://linear.app/hirotofurugen/team/TOK/overview)
- [FigJam：東京都オープンデータハッカソン2026](https://www.figma.com/board/rRtafsilo9x1TwHtres9pD/)
- [ハッカソン公式サイト](https://odhackathon.metro.tokyo.lg.jp/)
- [東京都オープンデータカタログ](https://portal.data.metro.tokyo.lg.jp/)
