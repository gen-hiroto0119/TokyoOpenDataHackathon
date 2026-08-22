# 推薦サービス

ここでいう推薦は、経路グラフ上の集合地点の順位付けである。LLM による推論や案内板の Vision はこのサービスの外に置く。

トラック A（[TOK-9](https://linear.app/hirotofurugen/issue/TOK-9)〜[TOK-12](https://linear.app/hirotofurugen/issue/TOK-12)）の HTTP 契約の正本。計算の手順と向きは [`CORE.md`](./CORE.md)。プロダクト方針は [`PRODUCT.md`](./PRODUCT.md)、実データの中身は [`DATA.md`](./DATA.md)、調査根拠は [`RESEARCH.md`](./RESEARCH.md)。

## 範囲

含む。

- 代表ケース（JR / 京王 / 丸ノ内線 → 新宿西側で集合 → 出口まで案内 → そこから目的地へ Google Maps）の HTTP 入出力
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
  - 地点カタログ（改札・集合候補・出口・目的地）
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
  floorLabel: string | null;
  /** 駅ローカルの平面座標(m)。y+ は北。手順の方向と模式図に使う。 */
  x: number;
  y: number;
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
  attributionJa: string;
  nodes: GraphNode[];
  links: GraphLink[];
};
```

`dz !== 0` で種別が取れない辺は `vertical: "unknown"` とし、段差なし制約では通行不可にする。時間帯が無い辺は通れるが、根拠は `hours_unknown` とする。

### 地点カタログ

HTTP は安定 ID を使う。東京都のノード ID は取り込み後にカタログへ結ぶ。未結のカタログ ID で実データ推薦を完了扱いにしない。

| catalogId | 役割 | 代表ケース |
|---|---|---|
| `entry.<gid>.<nodeId>` | 開始 | 路線ごとに改札を複数登録する。下記 |
| `meet.<gid>` | 集合候補 | 名前が固有の地点。下記 |
| `exit.<gid>` | 出口 | `marker=entrance` の地物。看板の文字と緯度経度を持つ |
| `dest.*` | 目的地 | プリセット。名前と緯度経度を持つ。Maps の `destination` |

### 集合候補の選び方

通路上の無名ノードは候補にしない。そのうえで、名前があるだけでも足りない。

**店舗は入れる。** 「◯◯の前で」は実際によく使う待ち合わせ方で、看板があるぶん初見でも見つけやすい。交番や広場だけに絞ると候補が薄くなり、全員の負担が偏らない地点を選べない。実データで確かめると、店舗を入れたときの候補は 20 件から 242 件になり、代表ケースの最長距離は 200m から 180m に縮んだ。

**同じ名前が駅に複数ある地点は外す。** 「ATM の前で」「券売機の前で」と言われても、新宿の地下にはいくつもある。`PRODUCT.md` の評価 5 が求める「固有性」はここで効かせる。名前の出現回数を数えて 1 件のものだけ残す。実データで 58 件が外れた。

**名前として使えないものを外す。** 番線番号（`11`）、区画コード（`D10`）、内部 ID（`Unit B3F-115`）は現地の案内表示と照らし合わせられない。設備の一般名（ATM、券売機、コインロッカー、トイレ）も外す。おむつ交換室のような、立って待つ場所でないものも外す。

**出場専用の改札は外す。** そこへ向かう人が入れない。入口の一覧からも外す。

**説明しやすさで階層を付ける。** 交番 5、案内所 4、広場・コンコース 3、改札 2、それ以外 1。学習しない。距離が同点のときだけ効く。

**近くの設備は取り込みで測る。** エレベーター(`facility=elevator`)とトイレ(`bathroom` / `universalaccesstoilet` / `ostomate`)の地物に付くノードを始点にして、逆向きの隣接で多点始点最短を 1 回ずつ回す。集合候補ごとに「歩いて何 m か」が出るので、カタログに `elevatorM` / `restroomM` として持つ。直線距離では階をまたぐ設備を近いと誤る。届かないときは `null`。応答では 50m 以内かどうかの真偽にする。**設備は順位に使わない。** 画面に出すだけ。

各地点に `evidence`: `hypothesis` | `field_confirmed` を付ける。**取り込んだ時点ではすべて `hypothesis`。** 仕様書が「調査当時の情報であり、店舗や出入口は現状と違うことがある」と書いているので、現地で確認したものだけ上げる。仮説を実測として返さない。

目的地は集合候補ではない。

### 開始点は改札にする

ホームや番線から改札までは計算できない。[`DATA.md`](./DATA.md) のとおり、歩行グラフのノードは通路・階段・EV・改札まわりが主で、JR・小田急の番線名に対応するナビノードが無く、京王・丸ノ内のホーム名は見当たらない。だから開始点は改札にする。

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

**出口は `marker=entrance` の地物 96 件から取る。** 人が全件を見て 69 件がカタログに載る。拾い方と取りこぼしは [`DATA.md`](./DATA.md)。

**名前は看板のとおりに出す。修飾しない。** 番号は事業者ごとに振り直されていて、新宿駅に「7番出入口」は 3 つある。ただし曖昧なのは口頭で場所を指すときの話で、この案内では違う。利用者はすでに集合していて、こちらが出した経路をたどって一緒に歩く。目の前の看板の「7」を見つければよく、どの事業者の 7 番かを知る必要がない。歩かせている限り、文脈はこちらが供給している。

```ts
type ExitCatalogEntry = {
  catalogId: string;
  nodeId: string;
  label: string;   // 看板の文字。番号・記号・空のいずれか
  nameJa: string;  // `出口 7` または `地上出口`
  lat: number;
  lng: number;
};
```

**どの出口を使うかは、この式が最小のもの。**

```
集合場所から出口までの徒歩距離
  ＋ 出口から目的地までの直線距離 × 1.35
  ＋ 看板の文字が無ければ 60m
```

出口ごとに探索を回すと出口の件数ぶん(69 回)になる。後ろ 2 項を各出口の持ち出しコストにし、**逆方向の隣接で全出口から多点始点最短を一度だけ回す。** 順方向で出口から探索すると、歩く向きが逆になる。手順は [`CORE.md`](./CORE.md)。選ばれた出口は `sourceId` が持っている。応答の `onward.distanceM` は持ち出しぶんを引いて、実際に歩く距離だけにする。`onward.pathNodeIds` は集合場所始まり、出口終わり。

**1.35 は市街地の迂回率。** 直線のまま足すと、駅の反対側にある目的地への地上ぶんを大きく短く見積もる。西口から歌舞伎町は直線 600m だが、実際は駅を回り込む。その結果「早く外に出た方が得」に倒れ、遠い側の出口が選ばれなくなる。

**60m は看板の無い出口への加点。** ラベルのある出口は現地で「7」の表示を見て確かめられる。無いものは着いても合っているか分からない。ほぼ同じ距離なら確かめられる方を選ぶ。差がこれを超えれば、無名でも近い方が勝つ。

### 出口から先は Maps に渡す

網は駅で終わっていて、出口から目的地までは計算できない（都庁は西端の 442m 外）。だから**出口を `origin` にした Google Maps の徒歩経路 URL** を返す。地上の経路と、地下道を通るかどうかは Maps が決める。

目的地は Places で検索して選ぶ。**Places を呼ぶのはクライアントで、この API ではない。** 推薦 Worker が受け取るのは名前と緯度経度だけで、どこから来たかを知らない。だから契約は入力手段に依存しない。`destination` は `CatalogRef`(プリセット)か `PlaceRef`(名前と座標)のどちらでもよく、計算は同じ。座標は出口の持ち出しコストに、名前は Maps の `destination` に使う。

クライアント側の条件。

- 課金を有効にした GCP プロジェクトとキー。PWA なのでキーはクライアントに出るため、リファラ制限をかける
- Google の地図の上に出さない場合、「Powered by Google」の表示義務がある
- Autocomplete はセッショントークン単位の課金。打鍵ごとに課金しない実装にする
- 検索範囲は新宿駅周辺にバイアスをかける。かけないと渋谷や品川が候補に出る

**プリセットはフォールバックとして残す。** キーが失効しても当日の流れが止まらないようにする。契約が同じなので、実装の分岐だけで済む。

## HTTP 契約

`Content-Type: application/json`。認証はハッカソン提出までは付けない。出発地の緯度経度、住所、連続 GPS は受け付けない。スキーマにその欄を置かない。

### `GET /v1/catalog`

**改札を持つ路線をすべて**と、目的地プリセット。グラフ・改札・集合候補・出口は出さない。画面がカタログ ID をハードコードしないため。

利用者は自分が乗ってきた路線を一覧から選ぶ。**載っていない路線があると、その人は参加できない。** だから代表ケースの 3 路線だけに絞らず、取り込んだ改札が 1 つでもある路線は出す。実データでは JR・京王・丸ノ内・小田急・大江戸の 5 つ。表示名はコードの対応表で持ち、改札があるのに名前が無い路線が出たらテストで落とす（取り込み直しで静かに消えないため）。

```ts
type CatalogLine = {
  id: string;
  nameJa: string;
};

type CatalogDestination = {
  catalogId: string;
  nameJa: string;
  lat: number;
  lng: number;
};

type CatalogResponse = {
  lines: CatalogLine[];
  destinations: CatalogDestination[];
};
```

`lines[].id` は `LineRef.id`（`line.jr` / `line.keio` / `line.marunouchi` / `line.odakyu` / `line.oedo`）。`destinations` は取り込み後のプリセット。

### `POST /v1/exit-reports`

出口の看板が応答と違ったときに、現地の表示を送る口。[`SCREENS.md`](./SCREENS.md) の「間違っていることを前提にする」を受ける。

```ts
type ExitReportRequest = {
  catalogId: string;
  /** 現地の看板に書いてある文字。空は受けない。 */
  labelJa: string;
};
```

- 認証は要らない。誰でも送れる。書き換えるのはデータではなくログである
- `catalogId` がカタログの出口に無ければ 400 `unknown_catalog`
- **受け取ったらログに出すだけで、保存しない。** 取り込みのラベルは人が確かめて `data/labels/exits.json` に戻すもので、送信をそのまま正にしない。仮説を実測として扱わないのと同じ理由
- 応答は 202。受け付けたことだけを返す

### `GET /health`

`{ ok: true, datasetVersion: string }`。載っているグラフの版。

### `POST /v1/recommendations`

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

/** Places で選んだ目的地。名前と座標だけを受け取る。どこで検索したかは知らない。 */
type PlaceRef = {
  kind: "place";
  nameJa: string;
  lat: number;
  lng: number;
};

type DestinationRef = CatalogRef | PlaceRef;

type ParticipantInput = {
  id: string;
  entry: LineRef | CatalogRef | NodeRef;
  confirmed?: NodeRef;
};

type RecommendationRequest = {
  datasetId: "tokyo.shinjuku-terminal";
  destination: DestinationRef;
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
- `asOf` は ISO 8601。時刻は日本の壁時計として字面の HH:MM を読む(オフセットは見ない)。省略時は時間帯制約を掛けない。
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
  | "hours"
  | "unreachable";

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
    facilities: {
      /** 集合場所から歩いて 50m 以内にエレベーターがある。 */
      elevator: boolean;
      /** 同じくトイレ（多機能・オストメイトを含む）。 */
      restroom: boolean;
      /** 全員がこの候補まで段差なしで行ける。経路で決まるので取り込みでは決めない。 */
      stepFree: boolean;
    };
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
    pathLinkIds: string[];
    steps: Step[];
    exit: {
      nodeId: string;
      catalogId: string;
      label: string;   // 看板の文字。空のこともある
      nameJa: string;
      evidence: "hypothesis" | "checked";
      lat: number;
      lng: number;
      mapsDirUrl: string;
    };
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
- `floorChanges` は経路上の `abs(deltaZ)` の合計。`branchCount` は経路上の実分岐(行き止まりの枝を除いた次数が 3 以上)のノード数。どちらも画面表示用で、順位のキーにしない。**どちらもその人の改札から集合地点までの値**。人によって違うので、全員をまとめた 1 つの値にはならない。
- `entry` はその人に選ばれた改札。`entry` に路線を渡したときは、こちらが選んだものが入る。画面はこれを経路の最初の手順として出す。
- `explainability` はカタログに書いた整数（大きいほど説明しやすい）。学習しない。
- `onward` は集合したあと全員で地上へ出るまで。`distanceM` は集合場所から出口までの徒歩距離で、出口選びに使った見積もりは含まない。
- `onward.steps` は集合場所→出口の手順。最初は集合場所、末尾は出口。`onward.pathLinkIds` は `pathNodeIds` と同じ向き。
- `infeasible[].reason` は落ちた原因。`step_free`(段差なし制約)、`hours`(時間帯)、`unreachable`(制約を外しても届かない=グラフの欠け)。`unreachable` は `infeasible` 専用で、`ranked` の理由には使わない。
- `onward.exit.label` は看板の文字。空のこともある。画面はこれをそのまま出す。言い換えない。
- `onward.exit.evidence` は名前の確からしさ。`checked` は人が見て確かめたもの、`hypothesis` は取り込んだだけのもの。**画面は後者を断定して書かず、直せる導線を出す。**
- `mapsDirUrl` は出口を出たあとに開く Google Maps の徒歩経路 URL。Routes API は使わない。街路の折れ線も返さない。
- 形は [Maps URLs の Directions](https://developers.google.com/maps/documentation/urls/get-started#directions-action)。`origin` は**出口の緯度経度**、`destination` はリクエストの目的地の表示名、`travelmode` は `walking`。値は URL エンコードする。
- 代表ケースの論理形: `https://www.google.com/maps/dir/?api=1&origin={出口の lat,lng}&destination=東京都庁&travelmode=walking`
- `attributionJa` は東京都データのクレジット文面。

`steps` は経路を画面の手順に変えたもの。ノードをそのまま並べない。無名ノードが大半なので、そのまま出すと「名前のない点」が延々と並ぶ。

- 区切るのは、名前のあるノード、実際に曲がるノード(`turn` が `straight` でない)、階が変わるノードだけ
- **次数では区切らない。** 網は設備への行き止まり枝が多く(742 本)、次数 3 以上で切ると「直進する · 2m」が延々と並ぶ(実測: 代表ケースの丸ノ内で 31 行。曲がり・階・名前だけにすると 10 行)
- 区切りの間の無名ノードは 1 つの `kind: "move"` にまとめ、`distanceM` は合計にする。同じ向きの `move` は連続させない
- 区切りのノードは `kind: "landmark"` にして `nameJa` を入れる
- `turn` は前の辺と次の辺の角度から決める。しきい値はコードに固定し、学習しない
- 角度の計算は内部で座標を掃除してから行う: 「座標が異なる直近のノード」で角度を取り(同一座標に潰れたノード列で実在の曲がりを直進と誤らない)、座標の取れないノードは前後から補間し、巨大な地物の代表点への往復(なす角 160° 超の尖り)は実在しない迂回として除く。掃除した座標は turn 判定にだけ使い、応答には出さない(地図は置かない)
- `vertical` は `dz !== 0` の辺の種別。取れないときは `stairs` 扱いにせず、段差なし制約で通行不可にした方針に合わせる

最初の `steps` は必ずその人の改札（`entry`）になる。

確認点 `confirmations` は各レッグの経路上から機械的に取る。

1. 開始改札（`gate`）
2. 階が変わる直前のノード（`floor`）
3. 実分岐（`branch`）。行き止まりの枝（設備への袋小路）を除いた次数が 3 以上のノード。生の次数で数えると ATM やトイレへの枝がすべて分岐になり、確認点が溢れる
4. 集合ランドマーク（`landmark`）

`confirmed` で指定されたノード以前は `confirmed`、それ以外は `pending`。クライアントが明示的に飛ばした場合だけ `skipped` を送る（現状のリクエストには含めず、ルーム側が次回呼び出しで開始点を進める）。

### エラー

| HTTP | code | とき |
|---|---|---|
| 400 | `invalid_request` | JSON がスキーマに合わない(欄の欠け・型違い) |
| 400 | `unknown_catalog` | カタログ ID が無い |
| 400 | `unknown_node` | ノード ID がグラフに無い |
| 400 | `unknown_line` | 路線に対応する改札が無い |
| 400 | `invalid_participants` | 人数不足、ID 重複 |
| 409 | `dataset_mismatch` | ワーカーが持つデータセットと `datasetId` が違う |
| 422 | `disconnected` | 開始点から MEETABLE へ届く人が欠けている |
| 422 | `no_feasible_meeting` | 制約下で全員が届く集合候補が無い |

`disconnected` はグラフの欠け、`no_feasible_meeting` は制約（段差なし・時間帯）で落ちた場合。両方とも、届いた人・落ちた候補は `details` にノード ID を付ける。

## 計算

手順と向きの正本は [`CORE.md`](./CORE.md)。

構内で出すのは改札→集合場所と、集合場所→出口。目的地はグラフ外で、出口の持ち出しコストにだけ使う。集合場所を先に一点決めてからルートを足すのではなく、全候補を採点してから並べる。

並べ方は `PRODUCT.md` の順。同点だけ次へ進む。デモ用に順位を揺らさない。`reasons` は 1 位にだけ入れ、実際に効いた段だけを入れる(2 位以降は空。[`CORE.md`](./CORE.md) の採点)。文言はコードから組み立て、その場の散文をモデルに書かせない。

## 実行

- Cloudflare Workers 上の Hono。
- グラフとカタログは `apps/worker/data/*.json` を起動時に import する。リクエストごとにパースし直さない。
- この API の経路に Durable Object を置かない。
- 計算は Isolate 内の TypeScript。WASM 化は縦切りのあとで、同じ入出力契約のまま入れ替える。

## テスト

実データが無くても契約を固定する。

1. 小さな固定グラフ（改札 7・3 路線ぶん、集合候補 3、出口 2、階段 1 本）をリポジトリに置く。
2. 代表ケースで順位・理由コード・確認点がゴールデンと一致する。
3. 路線で渡したとき、`legs[].entry` に一番近い改札が入る。改札を直接渡したときはその改札のまま。
3a. 複数の路線に対応する改札が、どちらの路線からも始点になる。近い方が選ばれ、遠ければ選ばれない。
4. 一人の `confirmed` を途中ノードにすると、その人の開始が変わり、他者は改札のまま。
5. `step_free` で階段しかない候補が `infeasible` になる。
6. `steps` で無名ノードが 1 つの `move` にまとまり、名前のあるノードで区切られる。
7. 目的地を変えると出口が変わり、`onward.exit.label` に看板の文字が入る。
8. 同じ JSON を二度投げてバイト一致（順位と理由）。
9. 片方向の辺で、集合場所→出口と出口→集合場所が一致しないとき、`onward` は集合場所→出口を使う。`pathNodeIds` は集合場所始まり。
10. `onward.steps` の最初は集合場所、末尾は出口。各 leg と onward の `steps[].distanceM` の和が、その区間の `distanceM` に一致する。同じ向きの `move` の行が連続しない。

ZIP 取り込み後に、同じ契約で実データテストを足す。ゴールデンのノード ID はカタログ経由にし、取り込みのたびに生 ID をテストへ直書きしない。

## コードの置き場

| ファイル | 中身 |
|---|---|
| `apps/worker/src/contract.ts` | この文書の HTTP 契約の型。正本はこの文書で、コードは写し |
| `apps/worker/src/graph.ts` | 前処理後の内部グラフと地点カタログ。順方向・逆方向の隣接、次数 |
| `apps/worker/src/recommend.ts` | 通行可能性、多点始点最短、順位付け、手順、確認点。計算は [`CORE.md`](./CORE.md) |
| `apps/worker/src/index.ts` | Hono の口。起動時にデータセットを載せる。ステートレス |
| `apps/worker/data/graph.json` | 取り込み後のナビ網 |
| `apps/worker/data/catalog.json` | 改札・集合候補・出口・目的地 |
| `apps/worker/test/fixture.ts` | 小さな固定グラフ（改札 7・3 路線、集合候補 3、出口 2、階段 1 本） |
| `apps/worker/test/recommend.test.ts` | ゴールデンテスト |

## 実装順

1. この契約の型と、小さなグラフでのゴールデンテスト（TOK-9）。
2. ZIP 取り込み、カタログ結線、実データでの到達（TOK-10）。ノード確定はカタログの作業。
3. 理由コードと負担フィールドをゴールデンに含める（TOK-11）。契約上は 1 と同時でよい。
4. `confirmed` と `confirmations`（TOK-12）。

画面（トラック B）が参照してよい応答フィールドは、`ranked[].meeting`、`scores`、`reasons[].textJa`、`legs[]` の `entry`・距離・階移動・分岐・`steps`・確認点、`onward` である。
