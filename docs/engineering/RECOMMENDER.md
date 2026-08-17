# 推薦サービス

ここでいう推薦は、経路グラフ上の集合地点の順位付けである。LLM による推論や案内板の Vision はこのサービスの外に置く。

トラック A（[TOK-9](https://linear.app/hirotofurugen/issue/TOK-9)〜[TOK-12](https://linear.app/hirotofurugen/issue/TOK-12)）の設計正本。プロダクト方針は `docs/product/PRODUCT.md`、データ出典は `docs/research/RESEARCH.md`。

## 範囲

含む。

- 代表ケース（JR / 京王 / 丸ノ内線 → 新宿西側集合 → 出口から目的地へ Google Maps）の HTTP 入出力
- 東京都のナビゲーション網（HERE Venues nodes / links）からの経路計算
- 辞書式の集合地点順位と、日本語の推薦理由
- 改札・階・ランドマークの現地確認を、入力制約と応答上の確認点として扱う

含まない。

- 共有ルームの参加状態同期（Durable Objects。縦切りの TOK-20）
- 地図描画、PWA、Figma
- OCR / Vision / Live AI。それらは確認済みノード ID をこの API へ渡すだけにする
- Places の呼び出し（クライアントの仕事。この Worker は名前と緯度経度を受け取るだけ）、Google Maps Routes、PLATEAU 3D、Zig/WASM 経路コア

同じ入力なら同じ順位と理由を返す。学習済み重みや合成スコアは入れない。

## 境界

```text
クライアント / ルーム
        |
        |  POST /v1/recommendations
        v
推薦 Worker（ステートレス）
        |
        |  読み取り専用
        v
データセット一式
  - ナビ網（nodes / links）
  - 地点カタログ（入口・MEETABLE・屋外アンカー）
  - 出典マニフェスト
```

ルームは参加者の意図と確認済みノードを持ち、推薦が必要になったときだけこの API を呼ぶ。推薦 Worker はセッションを持たない。

## データ

### 出典

東京都都市整備局「新宿駅周辺の施設情報及び移動ルート」（CC BY 4.0、調査当時の情報）。ナビ網の正は HERE Venues のノードとリンクである。

| 元データ | 使うもの |
|---|---|
| Nav Node `id`, `mx`, `my`, `l[].lid`, `l[].gid` | 地点、階、施設ジオメトリへの参照 |
| Nav Link `n1`, `n2`, `d`, `dm`, `dz` | 通行可能な辺と距離（m）、階差 |
| Level Geometry `start_of_operation` / `end_of_operation` | 階段・エレベーター等の時間帯 |
| Entity / geometry の名称 | 表示名。合成点は作らない |

リンク方向 `d` は 1=順方向、2=逆方向、3=双方向。隣接リストはこの値で作る。

実装前に ZIP を取得し、`data/manifests/shinjuku-terminal.json` に取得日、配布 URL、SHA-256 を残す。マニフェストが無い状態では実データテストを完了扱いにしない。

### 前処理後の内部グラフ

```ts
type VerticalKind = "none" | "stairs" | "escalator" | "elevator" | "unknown";

type GraphNode = {
  id: string;
  levelIds: string[];
  geomIds: string[];
  nameJa: string | null;
};

type GraphLink = {
  id: string;
  from: string;
  to: string;
  distanceM: number;
  deltaZ: number;
  vertical: VerticalKind;
  hours: { start: string; end: string } | null;
};

type Graph = {
  datasetId: "tokyo.shinjuku-terminal";
  datasetVersion: string;
  graphHash: string;
  nodes: GraphNode[];
  links: GraphLink[];
};
```

`dz !== 0` で種別が取れない辺は `vertical: "unknown"` とし、段差なし制約では通行不可にする。時間帯が無い辺は通れるが、根拠は `hours_unknown` とする。

### 地点カタログ

HTTP は安定 ID を使う。東京都のノード ID は取り込み後にカタログへ結ぶ。未結のカタログ ID で実データ推薦を完了扱いにしない。

| catalogId | 役割 | 代表ケース |
|---|---|---|
| `entry.<路線>.<改札>` | 開始 | 路線ごとに改札を複数登録する。下記 |
| `dest.*` | 目的地 | プリセット。名前と緯度経度を持つ。Maps の `destination` |
| `exit.*` | 屋外アンカー | 出口。データ側のノードに緯度経度を持たせる。Maps の `origin` |
| （データ側の MEETABLE） | 集合候補 | 西口側の説明できる地点。3 件以上 |

### 集合候補の選び方

通路上の無名ノードは候補にしない。そのうえで、名前があるだけでも足りない。

**店舗は入れる。** 「◯◯の前で」は実際によく使う待ち合わせ方で、看板があるぶん初見でも見つけやすい。交番や広場だけに絞ると候補が薄くなり、全員の負担が偏らない地点を選べない。実データで確かめると、店舗を入れたときの候補は 20 件から 251 件になり、代表ケースの最長距離は 200m から 180m に縮んだ。

**同じ名前が駅に複数ある地点は外す。** 「ATM の前で」「券売機の前で」と言われても、新宿の地下にはいくつもある。`PRODUCT.md` の評価 5 が求める「固有性」はここで効かせる。名前の出現回数を数えて 1 件のものだけ残す。実データで 58 件が外れた。

**名前として使えないものを外す。** 番線番号（`11`）、区画コード（`D10`）、内部 ID（`Unit B3F-115`）は現地の案内表示と照らし合わせられない。設備の一般名（ATM、券売機、コインロッカー、トイレ）も外す。おむつ交換室のような、立って待つ場所でないものも外す。

**出場専用の改札は外す。** そこへ向かう人が入れない。入口の一覧からも外す。

**説明しやすさで階層を付ける。** 交番 5、案内所 4、広場・コンコース 3、改札 2、それ以外 1。学習しない。距離が同点のときだけ効く。

各地点に `evidence`: `hypothesis` | `field_confirmed` を付ける。**取り込んだ時点ではすべて `hypothesis`。** 仕様書が「調査当時の情報であり、店舗や出入口は現状と違うことがある」と書いているので、現地で確認したものだけ上げる。仮説を実測として返さない。

目的地は集合候補ではない。

### 開始点は改札にする

ホームや番線から改札までは計算できない。`docs/research/RESEARCH.md` のとおり、歩行グラフのノードは通路・階段・EV・改札まわりが主で、JR・小田急の番線名に対応するナビノードが無く、京王・丸ノ内のホーム名は見当たらない。だから開始点は改札にする。

**改札を手で選ばない。** JR 新宿は改札が多く、降りた車両の位置で使うものが変わる。代表を数件だけ手で書くと、書いた分に固定される。書き忘れた改札から来た人は、遠回りの改札を起点に計算されることになる。

だから **ZIP 取り込みで `barrier:gate` の名前のあるノードを全部拾う**。何件になるかは取り込むまで決めない。路線との対応は名前から作り、取り込み後に目視で確認する。

```ts
type EntryCatalogEntry = {
  catalogId: string;
  lineIds: string[];  // 1 つの改札が複数の路線に対応することがある
  nodeId: string;
  nameJa: string;
};
```

**`lineIds` は配列にする。** 連絡改札のように 1 つの改札が複数の路線を受け持つ場合がある。単数だと、その改札がどちらか一方の路線からしか選ばれない。

改札が増えても計算は変わらない。路線の改札集合が大きくなるだけで、多点始点最短がその中から一番近いものを選ぶ。

**改札は利用者に選ばせず、こちらで選ぶ。** 利用者は改札名を知らないことが多いし、何号車に乗っているかで最寄りは変わるが、それはこちらから分からない。そして改札は利用者の目的ではなく計算の途中でしかない。

だから入力は**路線**にする。その路線の改札すべてを始点にした多点始点最短で、候補までの距離を出す。各人の距離は「その路線のどの改札を使っても一番短い値」になる。行くのが大変な改札は自然に選ばれない。

選ばれた改札は応答に含めて、経路の最初の手順として出す。「丸ノ内線は西口改札から出る」と言えば、現地の案内表示と照合できる。同じ距離のときは `nodeId` の辞書順で決める。

`confirmed` があるときはそちらが優先する。現地で違う改札を出ていたら、そのノードから残経路を計算し直す。

**`entry` に改札を直接渡すこともできる。** 読み取りや手動選択で改札が確定している場合に使う。渡さなければ路線から選ぶ。

### 出口の選び方

このサービスが経路を出すのは改札から出口までで、その先は Maps に渡す。だから目的地について要るのは道順ではなく、**どの出口を使うか**だけである。

出口は目的地の緯度経度に最も近いものを 1 つ選ぶ。距離は直線でよい。屋外の歩行距離は要らないし、Routes API も使わない。「都庁なら西口、歌舞伎町なら東口」を外す可能性はほぼない。同じ距離なら `nodeId` の辞書順で決める。

出口が 1 つ固定だと、目的地を変えても案内先が変わらない。都庁は西口で正しいが、東口側を選んでも西口へ案内してしまう。だから出口は複数登録する。

集合後の進みやすさ（評価 4）は、選ばれた出口までの構内距離で見る。この計算は今までどおり構内グラフだけで完結する。

目的地は Places で検索して選ぶ。出口から先の徒歩案内をすでに Maps に渡しているので、目的地の選択も同じところから取る方が一貫する。プリセットだけだと「なぜこの数件だけなのか」になる。

**Places を呼ぶのはクライアントで、この API ではない。** 推薦 Worker が受け取るのは名前と緯度経度だけで、どこから来たかを知らない。だから契約は入力手段に依存しない。

クライアント側の条件。

- 課金を有効にした GCP プロジェクトとキー。PWA なのでキーはクライアントに出るため、リファラ制限をかける
- Google の地図の上に出さない場合、「Powered by Google」の表示義務がある
- Autocomplete はセッショントークン単位の課金。打鍵ごとに課金しない実装にする
- 検索範囲は新宿駅周辺にバイアスをかける。かけないと渋谷や品川が候補に出る

**プリセットはフォールバックとして残す。** キーが失効しても当日の流れが止まらないようにする。契約が同じなので、実装の分岐だけで済む。

### 出口をどう見つけるか

東京都のデータに「出口」という種別は無い。ただし**番号だけの名前を持つ地物**が B3F から 1F までまたがっている。逆ジオコーディングで確かめたところ、これは出入口番号だった（`7` → 京王 新宿駅 7番出入口）。取り込みではこれを出口として拾う。実データで 22 件。

番号だけでは利用者に伝わらない。どの路線の 7 番か分からないし、駅ごとに番号の振り方が違う。だから**名前は OpenStreetMap の逆ジオコーディングで引き、`data/annotations/exits.json` に残す**。

- 一度だけ引いて結果をリポジトリに置く。実行のたびに外へ問い合わせない
- 使用条件を守る（1 秒に 1 件、UA に連絡先、結果をキャッシュ）
- **出典表示が要る**: © OpenStreetMap contributors（ODbL）
- 逆ジオコーディングは一番近い地物を返すので、店名が返ることがある。「Travelex」「新宿サブナード 2」は出口の名前ではないので採らない。出口らしい名前だけ採り、残りは「7番出入口」のまま出す
- 引けた名前も**現地で確認するまで仮説**。案内表示と一致するとは限らない

出口ノードの緯度経度は都データから作る。ジオメトリの `location` を使う。`mx` / `my`（HERE のメルカトル）から変換する必要は無かった。

## HTTP 契約

`POST /v1/recommendations`

`Content-Type: application/json`。認証はハッカソン提出までは付けない。出発地の緯度経度、住所、連続 GPS は受け付けない。スキーマにその欄を置かない。

### リクエスト

```ts
type Accessibility = "any" | "step_free";

type CatalogRef = {
  kind: "catalog";
  id: string;
};

type NodeRef = {
  kind: "node";
  id: string;
};

type LineRef = {
  kind: "line";
  id: string;
};

type ParticipantInput = {
  id: string;
  entry: LineRef | CatalogRef | NodeRef;
  confirmed?: NodeRef;
};

type RecommendationRequest = {
  datasetId: "tokyo.shinjuku-terminal";
  destination: CatalogRef;
  participants: ParticipantInput[];
  constraints?: {
    accessibility?: Accessibility;
    asOf?: string;
  };
};
```

- `participants` は 2 人以上。代表ケースは 3 人。
- `entry` は開始点であり、出発地ではない。既定は `LineRef`（路線）で、その路線の改札のうち一番近いものをこちらが選ぶ。改札が分かっている場合だけ `CatalogRef` か `NodeRef` を渡す。
- `confirmed` がある人は、そのノードを新たな開始点として残経路を計算する。元経路上にある必要はない（迷ったあとの復帰）。
- `asOf` は ISO 8601。省略時は時間帯制約を掛けない。
- `constraints.accessibility` の省略時は `any`。

代表ケースの例。

```json
{
  "datasetId": "tokyo.shinjuku-terminal",
  "destination": { "kind": "catalog", "id": "dest.tokyo-metropolitan-government" },
  "participants": [
    { "id": "jr", "entry": { "kind": "catalog", "id": "entry.jr.west" } },
    { "id": "keio", "entry": { "kind": "catalog", "id": "entry.keio.west" } },
    { "id": "marunouchi", "entry": { "kind": "catalog", "id": "entry.marunouchi.west" } }
  ],
  "constraints": { "accessibility": "any" }
}
```

### 応答

```ts
type ReasonCode =
  | "feasible"
  | "minimax"
  | "min_sum"
  | "onward"
  | "landmark"
  | "step_free"
  | "hours";

type ConfirmationKind = "gate" | "floor" | "landmark" | "branch";
type ConfirmationStatus = "pending" | "confirmed" | "skipped";

type ConfirmationPoint = {
  nodeId: string;
  kind: ConfirmationKind;
  nameJa: string;
  status: ConfirmationStatus;
};

type StepKind = "landmark" | "move";
type StepTurn = "straight" | "right" | "left" | "slight_right" | "slight_left";
type StepVertical = "none" | "stairs" | "escalator" | "elevator";

type Step = {
  kind: StepKind;
  nodeId: string;
  nameJa: string | null;
  turn: StepTurn;
  vertical: StepVertical;
  distanceM: number;
  floorLabel: string | null;
};

type Leg = {
  participantId: string;
  entry: { nodeId: string; catalogId: string | null; nameJa: string };
  distanceM: number;
  costSeconds: number;
  floorChanges: number;
  branchCount: number;
  steps: Step[];
  pathNodeIds: string[];
  pathLinkIds: string[];
  confirmations: ConfirmationPoint[];
};

type MeetingCandidate = {
  rank: number;
  meeting: {
    nodeId: string;
    catalogId: string | null;
    nameJa: string;
    floorLabel: string;
    evidence: "hypothesis" | "field_confirmed";
  };
  scores: {
    maxDistanceM: number;
    sumDistanceM: number;
    onwardDistanceM: number;
    explainability: number;
  };
  reasons: { code: ReasonCode; textJa: string }[];
  legs: Leg[];
  onward: {
    distanceM: number;
    pathNodeIds: string[];
    outdoorAnchor: { nodeId: string; catalogId: string; nameJa: string; lat: number; lng: number; mapsDirUrl: string };
  };
};

type RecommendationResponse = {
  dataset: {
    id: "tokyo.shinjuku-terminal";
    version: string;
    graphHash: string;
    attributionJa: string;
  };
  walkingSpeedMps: number;
  ranked: MeetingCandidate[];
  infeasible: { nodeId: string; nameJa: string; reason: ReasonCode; textJa: string }[];
};
```

- `ranked` は評価順で並べる。先頭が推薦、2 件目以降が次点。空配列はエラーにせず、候補ゼロとして返す場合と、接続不能のエラーを分ける（後述）。
- `costSeconds` は表示用で、`round(distanceM / walkingSpeedMps)`。既定の歩行速度は `1.2`。順位付けには使わない。
- `floorChanges` は経路上の `abs(deltaZ)` の合計。`branchCount` は経路上で次数が 3 以上のノード数。どちらも画面表示用で、順位のキーにしない。**どちらもその人の改札から集合地点までの値**であり、集合地点から出口までは含まない。人によって違うので、全員をまとめた 1 つの値にはならない。
- `entry` はその人に選ばれた改札。`entry` に路線を渡したときは、こちらが選んだものが入る。画面はこれを経路の最初の手順として出す。
- `explainability` はカタログに書いた整数（大きいほど説明しやすい）。学習しない。
- `mapsDirUrl` は出口到着時に開く Google Maps の徒歩経路 URL。Routes API は使わない。街路の折れ線も返さない。
- 形は [Maps URLs の Directions](https://developers.google.com/maps/documentation/urls/get-started#directions-action)。`origin` は出口（座標 `lat,lng` があればそれを使い、無ければ出口の `nameJa`）、`destination` はリクエストの目的地の表示名、`travelmode` は `walking`。値は URL エンコードする。
- 代表ケースの論理形: `https://www.google.com/maps/dir/?api=1&origin={出口}&destination=東京都庁&travelmode=walking`
- 画面は出口到着のときにこの URL を開く。地図の線や凡例にはしない。
- `attributionJa` は東京都データのクレジット文面。

`steps` は経路を画面の手順に変えたもの。ノードをそのまま並べない。無名ノードが大半なので、そのまま出すと「名前のない点」が延々と並ぶ。

- 名前のあるノード、方向が変わるノード、階が変わるノード、次数 3 以上のノードで区切る
- 区切りの間の無名ノードは 1 つの `kind: "move"` にまとめ、`distanceM` は合計にする
- 区切りのノードは `kind: "landmark"` にして `nameJa` を入れる
- `turn` は前の辺と次の辺の角度から決める。しきい値はコードに固定し、学習しない
- `vertical` は `dz !== 0` の辺の種別。取れないときは `stairs` 扱いにせず、段差なし制約で通行不可にした方針に合わせる

最初の `steps` は必ずその人の改札（`entry`）になる。

確認点 `confirmations` は各レッグの経路上から機械的に取る。

1. 開始改札（`gate`）
2. 階が変わる直前のノード（`floor`）
3. 次数 3 以上の分岐（`branch`）
4. 集合ランドマーク（`landmark`）

`confirmed` で指定されたノード以前は `confirmed`、それ以外は `pending`。クライアントが明示的に飛ばした場合だけ `skipped` を送る（現状のリクエストには含めず、ルーム側が次回呼び出しで開始点を進める）。

### エラー

| HTTP | code | とき |
|---|---|---|
| 400 | `unknown_catalog` | カタログ ID が無い |
| 400 | `unknown_node` | ノード ID がグラフに無い |
| 400 | `invalid_participants` | 人数不足、ID 重複 |
| 409 | `dataset_mismatch` | ワーカーが持つデータセットと `datasetId` が違う |
| 422 | `disconnected` | 開始点から MEETABLE へ届く人が欠けている |
| 422 | `no_feasible_meeting` | 制約下で全員が届く集合候補が無い |

`disconnected` はグラフの欠け、`no_feasible_meeting` は制約（段差なし・時間帯）で落ちた場合。両方とも、届いた人・落ちた候補は `details` にノード ID を付ける。

## 計算

先に出口を決める。目的地の緯度経度に最も近い `exit.*` を 1 つ選ぶ。直線距離。同点は `nodeId` の辞書順。以降の計算はこの出口だけを使う。

そのうえで、全員について、通行可能な辺だけで最短距離（`dm` の和）を取る。始点の決め方は次の順。

1. `confirmed` があればそのノード 1 点
2. `entry` が改札（`CatalogRef` / `NodeRef`）ならそのノード 1 点
3. `entry` が路線（`LineRef`）ならその路線の改札すべてを始点にした多点始点最短

3 の場合、その人の距離は「どの改札を使っても一番短い値」になる。選ばれた改札は `legs[].entry` に入れて返す。同じ距離なら `nodeId` の辞書順。

候補ごとに全員分の距離と、候補から選ばれた出口までの距離を求める。

通行可能。

1. 向きが合っている。
2. `asOf` があるとき、時間帯外の辺は使わない。
3. `step_free` のとき、`vertical` が `stairs` / `escalator` / `unknown` の辺は使わない。エレベーターは時間帯内なら使う。

並べ方は `PRODUCT.md` の順で、同点だけ次へ進む。

1. 全員が候補へ届き、必須のアクセシビリティを満たす。
2. 全員のうち最大の `distanceM` が最小。
3. 全員の `distanceM` の和が最小。
4. 候補から選ばれた出口までの `distanceM` が最小。
5. `explainability` が大きい。

それでも同点なら `nodeId` の辞書順。デモ用に順位を揺らさない。

`reasons` は実際に効いた段だけを入れる。例: 最大負担で一位が決まったら `minimax` を入れ、合計は入れない。段差なし指定があるときだけ `step_free` を入れる。文言はコードから組み立て、その場の散文をモデルに書かせない。

## 実行

- Cloudflare Workers 上の Hono。
- グラフは Worker 起動時に読み、リクエストごとにパースし直さない。
- この API の経路に Durable Object を置かない。
- 計算は Isolate 内の TypeScript。WASM 化は縦切りのあとで、同じ入出力契約のまま入れ替える。

## テスト

実データが無くても契約を固定する。

1. 小さな固定グラフ（改札 6・3 路線ぶん、MEETABLE 3、出口 2、階段 1 本）をリポジトリに置く。
2. 代表ケースで順位・理由コード・確認点がゴールデンと一致する。
3. 路線で渡したとき、`legs[].entry` に一番近い改札が入る。改札を直接渡したときはその改札のまま。
3a. 複数の路線に対応する改札が、どちらの路線からも始点になる。近い方が選ばれ、遠ければ選ばれない。
4. 目的地の緯度経度を変えると、選ばれる出口が変わる。
5. 一人の `confirmed` を途中ノードにすると、その人の開始が変わり、他者は改札のまま。
6. `step_free` で階段しかない候補が `infeasible` になる。
7. `steps` で無名ノードが 1 つの `move` にまとまり、名前のあるノードで区切られる。
8. 同じ JSON を二度投げてバイト一致（順位と理由）。

ZIP 取り込み後に、同じ契約で実データテストを足す。ゴールデンのノード ID はカタログ経由にし、取り込みのたびに生 ID をテストへ直書きしない。

## コードの置き場

| ファイル | 中身 |
|---|---|
| `src/contract.ts` | この文書の HTTP 契約の型。正本はこの文書で、コードは写し |
| `src/graph.ts` | 前処理後の内部グラフと地点カタログ。隣接リスト、次数 |
| `src/recommend.ts` | 通行可能性、多点始点最短、出口の選択、順位付け、手順、確認点 |
| `src/index.ts` | Hono の口。ステートレス |
| `test/fixture.ts` | 小さな固定グラフ（改札 6・3 路線、集合候補 3、出口 2、階段 1 本） |
| `test/recommend.test.ts` | ゴールデンテスト |

## 実装順

1. この契約の型と、小さなグラフでのゴールデンテスト（TOK-9）。
2. ZIP 取り込み、カタログ結線、実データでの到達（TOK-10）。ノード確定はカタログの作業。
3. 理由コードと負担フィールドをゴールデンに含める（TOK-11）。契約上は 1 と同時でよい。
4. `confirmed` と `confirmations`（TOK-12）。

画面（トラック B）が参照してよい応答フィールドは、`ranked[].meeting`、`scores`、`reasons[].textJa`、`legs[]` の `entry`・距離・階移動・分岐・`steps`・確認点、`onward.outdoorAnchor` である。
