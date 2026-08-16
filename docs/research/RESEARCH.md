# 調査メモと根拠

仕様上の事実、ローカル解析、仮説を分けて記録します。URLや内容は変更される可能性があるため、実装時に再確認してください。

## 東京都の新宿駅周辺施設データ

- [東京都オープンデータカタログ](https://catalog.data.metro.tokyo.lg.jp/dataset/t000008d0000000037)
- [東京都都市整備局：新宿駅周辺の施設・経路データ](https://www.toshiseibi.metro.tokyo.lg.jp/kotsu_butsuryu/kotsuseisaku/kotsu_suishin/shinjuku_shisetsu)
- [配布ZIP](https://www.toshiseibi.metro.tokyo.lg.jp/kiban/shinjuku_terminal/pdf/shisetsu_root.zip)
- [仕様書PDF](https://www.toshiseibi.metro.tokyo.lg.jp/kiban/shinjuku_terminal/pdf/shisetsu_siyousho.pdf)
- ライセンス：CC BY 4.0。取得日、配布URL、SHA-256は[`data/manifests/shinjuku-terminal.json`](../../data/manifests/shinjuku-terminal.json)を正とする。

### 仕様上の事実

対象は地下街等の公共的屋内空間が主で、対象施設の敷地内屋外も含む。格納するのは施設情報（位置、名称、形状、階、階段・エレベーターの利用時間）とナビゲーション情報（結節点、結節点間の線、紐付け）。形式は HERE Venues の GeoJSON と navnet5。調査当時の情報であり、店舗や出入口は現状と違うことがある、と仕様書に書いてある。公開は令和5年2月28日。令和2年3月公開分へ、令和4年度業務で利用時間を足して更新したものである。

国土交通省の「新宿駅周辺屋内地図」（G空間情報センター、バスタ新宿＋新宿駅の Shapefile / GeoPDF）は別データセットである。

### ローカル解析（ZIP 実体、2026-08-16）

配布ZIPはコミュニティ「新宿駅」1件。階は B5F〜4F（MB2F, M1F を含む）。エンティティ 423、階ジオメトリ約 15,556、ナビノード 2,506、リンク 2,653。リンク距離の合計は約 17.3 km。ほぼ双方向。座標の広がりはおおむね東経 139.6965〜139.7037、北緯 35.6865〜35.6953（駅構内とその直近）。

名前のある地点には JR・京王・小田急・丸ノ内線・都営大江戸線の改札、西口交番、観光案内所、トイレ／EV／階段、店舗が含まれる。ジオメトリ側の `facility` には hallway, stairs, escalator, elevator, bathroom, ramp, gate 等がある。1F の大半は線路（`railwaytie`）であり、歩行経路の正は `v5_nav.json` である。

エンティティ名に西武新宿、バスタ新宿、都営新宿線、都庁は出てこない。都庁の座標は上記の範囲の西側にあり、このZIPだけでは都庁まで辿れない。階段・EVの時間帯は一部の地物にだけ付いている。ナビのノード／リンク自体には種別プロパティが無い。

改札は地点と `barrier:gate` としてある。JR・小田急の番線名もあるが、対応ジオメトリにナビノードは付いていない。京王・丸ノ内のホーム名は見当たらない。歩行グラフのノードは通路・階段・EV・改札まわりが主で、改札内ホームからの経路計算には使えない。

### 関連オープンデータ（役割の違い）

- [都市整備局の組織ページ（t000008）](https://catalog.data.metro.tokyo.lg.jp/organization/t000008)のうち、構内の施設＋歩行ルートは上記 `t000008d0000000037` が該当する。同じ組織の[都市の3Dデジタルマップ（区部・多摩部）](https://catalog.data.metro.tokyo.lg.jp/dataset/t000008d2000000017)は建物・道路の都市模型で、構内の名前付き地点や歩行グラフではない。
- [新宿駅西部の歩行空間ネットワーク（2020年10月、更新予定なし）](https://catalog.data.metro.tokyo.lg.jp/dataset/t000029d0000000007)はデジタルサービス局。道路上の段差・幅員を含む屋外歩道のノード／リンク。西口から都庁方面の屋外には使える可能性があるが、構内グラフとは別系統で、自動では繋がらない。
- [新宿区PLATEAU 2025](https://www.geospatial.jp/ckan/dataset/plateau-13104-shinjuku-ku-2025) の地下街モデルは LOD1 と LOD4.1。床・天井・内壁・部屋・扉・窓・階段／エスカレータ等の形状はある。テクスチャ、家具、POI名、経路、階ラベルは仕様上別データとの結合が必要。交通（道路）モデルは屋外。PLATEAU Station Navi 事例は、これに施設管理者の BIM と独自のネットワーク／POI を足している。

## 3Dデータ

- [新宿区PLATEAU 2025](https://www.geospatial.jp/ckan/dataset/plateau-13104-shinjuku-ku-2025)
- [新宿地下街LOD4.1 3D Tiles](https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/13104-ubld-lod4-2025/tileset.json)
- [地下街モデルLOD4.1の定義](https://www.mlit.go.jp/plateaudocument/toc4/toc4_16/toc4_16_01/toc4_16_01_05/%E5%9C%B0%E4%B8%8B%E8%A1%97%E3%83%A2%E3%83%87%E3%83%AB_lod4_1%E3%81%AE%E5%AE%9A%E7%BE%A9_/)

確認済みの方向性：床、天井、内壁、部屋、扉、窓、階段／エスカレーター等の屋内形状はある一方、テクスチャ、家具、POI名、経路、階ラベルは別データとの結合が必要です。

## Google Maps とのつなぎ

### 決めたこと

出口に着いたら [Maps URLs の Directions](https://developers.google.com/maps/documentation/urls/get-started#directions-action) を開く。`origin` は出口、`destination` は目的地、`travelmode` は `walking`。Routes API は使わない。契約は `docs/engineering/RECOMMENDER.md` の `mapsDirUrl`。

### 仮説

消費者向け Maps は新宿の出口名や地下鉄の出口番号を示すことが多い。開発者向け Routes API が返すのは駅の屋外側からの徒歩であり、構内の階つき歩行グラフではない。都データの改札・出口番号（A1 等）と Maps の地点を名前と座標で対応づければ、`origin` に使える。JR の「西口」は広場側の点になりやすく、改札ノードと1対1とは限らない。現地で標識と Maps の表示を照合する。

## 2D地図への載せ方

### 事実

階ジオメトリ `geojson-level-geom-*.geojson` は WGS84 の経度緯度で、MapLibre の GeoJSON ソースにそのまま載せられる。1F は約 6 MB あり、大半は線路（`traffic: railwaytie`）。歩く用に出すのは `hallway` / `stairs` / `escalator` / `elevator` / `unit` / `barrier:gate` に限る。

ナビノードの `mx` / `my` は HERE のメルカトルで、EPSG:3857 ではない。図面のアフィン `d[].t` でローカル座標へ、コミュニティの `ref_frame.transform` で緯度経度へ変換できる。JR西口ではジオメトリの `location` と数メートルずれた。ノード 2,506 のうち 2,457 は紐づくジオメトリの `location` を持てる。gid が 0 の 43 件はアフィン側を使う。

MapLibre GL JS は同一 GeoJSON に fill（区画）・line（経路）・circle（地点）を重ね、`setFilter` で階を切り替えられる。経路は `pathNodeIds` を経度緯度の LineString にする。

### 仮説（第一目標）

最初は B1F と 2F の歩行面＋経路折れ線＋改札／集合の点で足りる。1F 全地物や fill-extrusion の 3D は出さない。背景は無地か薄い OSM。前処理で線路を除いた階 GeoJSON と、ノード ID→緯度経度表をリポジトリに置く。

## 既存事例

- [PLATEAU Station Navi](https://www.mlit.go.jp/plateau/use-case/bz25-05/)

2.5D／3D／AR／VRによる個人向けナビゲーションの既存事例があります。本企画は複数人の収束、公平性、集合後の目的地、共有ルーム、ランドマーク確信度を中心に差別化します。

## Web屋内測位の制約

- [W3C Geolocation](https://www.w3.org/TR/geolocation/)
- [W3C Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/)

Geolocationは測位元に依存せず、実位置を保証しません。`accuracy`は水平位置の信頼半径で、`altitude`は取得不能な場合があり、階番号のフィールドはありません。高精度要求もヒントであり、構内の連続位置や階判定をMVP要件にしません。

### 屋内の現在地推定（使えるもの／使えないもの）

PWA で新宿構内の青点を連続追従する公式手段はない。推定の単位は緯度経度ではなく、経路グラフ上のノード（または辺）とする。

| 方法 | 事実 | この企画での扱い |
|---|---|---|
| 最後に確認したノード | 参加時の改札、手動、案内板 | 第一の現在地。推薦の `confirmed` |
| 予定経路＋経過時間 | 辺の距離はデータにある。歩行速度は仮定 | 残経路上の区間にぼかす。確定にはしない |
| 案内板の文字（OCR / Live） | 改札名・出口番号は強い | 経路上の候補へスナップ。自動確定しない |
| W3C Geolocation | 地下では不安定。階なし | 駅の外に出たか、の粗い判定だけ |
| 端末の方位 | DeviceOrientation。地下では不安定 | 向きの補助。位置には使わない |
| BLE / Wi-Fi フィンガープリント | 国交省実証のビーコンは撤去済み。iOS の Safari は iBeacon スキャン不可 | MVP では使わない |
| 気圧で階を読む | ブラウザに標準の気圧 API はない | 使わない |
| Visual SLAM / ARCore | ネイティブ向け。駅の参照地図も無い | PWA の第一目標には入れない |

## ランドマーク認識

認識の意味を次の3段階に分けます。

1. 種類認識：「改札」「交番」「階段」が写っている。
2. 固有物認識：「JR西改札」「西口交番」である。
3. 地点特定：経路グラフの特定ノードである。

一般的なVisionは1に強く、2は固有文字や参照画像が必要です。3は直前ノード・階・予定経路を使った候補制約なしに信用しません。

| 手掛かり | 見込み | 扱い |
|---|---|---|
| 改札名、出口番号、路線／駅番号、施設名と矢印の組合せ | 強い | OCRと候補制約の主情報 |
| 西口交番、特徴的アート、固有店舗 | 中 | 参照写真と近傍候補を併用 |
| 路線ロゴ、案内板色、柱番号 | 補助 | 単独で確定しない |
| 一般的な通路、階段、改札機、同一チェーン店 | 弱い | 手動選択へ戻す |

関連研究・実装資料：

- [TextPlace: Visual Place Recognition Through Reading Scene Text](https://openaccess.thecvf.com/content_ICCV_2019/html/Hong_TextPlace_Visual_Place_Recognition_and_Topological_Localization_Through_Reading_Scene_ICCV_2019_paper.html)
- [TextInPlace](https://arxiv.org/abs/2503.06501)
- [Google ML Kit Text Recognition](https://developers.google.com/ml-kit/vision/text-recognition/v2/android)
- [Cloudflare Workers AI Vision tutorial](https://developers.cloudflare.com/workers-ai/guides/tutorials/llama-vision-tutorial/)
- [Cloudflare Workers AI models](https://developers.cloudflare.com/workers-ai/models/)

## ランドマーク現地評価案

代表ランドマーク15〜20件を対象に、正面、斜め、遠距離、混雑／遮蔽、明暗、複数端末で撮影します。似た通路や同一チェーン店舗を誤認用データとして含めます。

比較対象：

- OCRのみ
- Visionの自由回答
- 経路候補を制約したOCR + Vision

指標：

- Top-1正解率
- Top-3に正解が含まれる率
- 判定を棄権できた率
- 高信頼なのに誤った率
- 応答時間と1確認あたり費用

自動確定しきい値は先に数値を決めず、現地データ上で許容する誤確定率から調整します。MVPでは上位1件でも利用者確認を挟みます。

## 現地で確認すること

- JR、京王、丸ノ内線の候補改札から西口交番まで実際に通れるか
- 各分岐で見える文字、矢印、路線色、ランドマーク
- 同じ案内文が複数地点で反復していないか
- 工事柵、閉鎖、時間帯による通行制限
- 車椅子／ベビーカー経路
- 西口交番を集合地点として視認・滞留できるか
- 都庁へ向かう導線の分かりやすさ

## Live AI

- [Gemini Live API capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities)
- [Gemini Live API ephemeral tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens)
- [Gemini Live API tool use](https://ai.google.dev/gemini-api/docs/live-api/tools)
- [Gemini Live API best practices](https://ai.google.dev/gemini-api/docs/live-api/best-practices)
- [Gemini Live API session management](https://ai.google.dev/gemini-api/docs/live-api/session-management)
- [Gemini Developer API zero data retention](https://ai.google.dev/gemini-api/docs/zdr)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API terms](https://ai.google.dev/gemini-api/terms)
- [OpenAI Realtime guide](https://developers.openai.com/api/docs/guides/realtime)
- [OpenAI Realtime WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc)
- [OpenAI Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data)
- [OpenAI GPT-Realtime-2.1 model](https://developers.openai.com/api/docs/models/gpt-realtime-2.1)

Gemini Liveは音声、テキスト、画像フレームを双方向WebSocketで扱います。動画入力はJPEG／PNGの画像列で、公式上は最大1fpsです。ブラウザ直結ではバックエンドが短命トークンを発行します。無圧縮の音声＋映像セッションは短時間に制限されるため、本企画では1回60〜90秒にします。

OpenAI RealtimeはブラウザでWebRTCを推奨し、短命クライアントシークレットを使えます。2026-08-09時点の比較候補`gpt-realtime-2.1`は音声と画像入力には対応しますが、動画入力は非対応です。看板確認では、音声を継続しながら利用者操作で静止画を追加する構成になります。

Gemini Developer APIの無料枠は入力と出力が製品改善に使われ得ます。Paid Servicesではプロンプト等を製品改善へ使わないと規定されています。現地画像を外部へ送るPoCでは有料プロジェクトを使い、送信前の明示同意と画像最小化を行います。
