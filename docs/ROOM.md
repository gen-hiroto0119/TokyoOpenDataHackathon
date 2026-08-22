# 共有ルーム

ルームは待ち合わせ一件ぶんの状態を持つ。誰が来るか、どこから来るか、どこで集まると決めたか。
推薦の計算は持たない（契約は [`RECOMMENDER.md`](./RECOMMENDER.md)、手順は [`CORE.md`](./CORE.md)）。ルームは推薦を呼ぶ側。

## 決めたこと

**アカウントを作らない。** 参加はリンクと名前だけ。[`PRODUCT.md`](./PRODUCT.md) のとおり。

だから本人確認は**トークン**で行う。ルームを作った人に `hostToken`、参加した人に `participantToken` を一度だけ返す。以後の書き込みは `Authorization: Bearer <token>` で行う。トークンは保存された状態に対する権限であって、人の身元ではない。

**ルーム ID は推測できない値にする。** 招待リンクがそのまま参加の資格になるので、連番や短い ID にしない。`crypto.randomUUID()` を使う。

**期限を必ず持つ。** 待ち合わせは終わる。`expiresAt` を過ぎたルームは 410 を返し、Durable Object の alarm で消す。個人の申告が残り続けないようにする。

**書き込みは本人と主催者だけ。** 参加者は自分の情報だけ書ける。主催者は目的地・期限・集合場所の決定と、ルームの解散ができる。他人の到着情報は書けない。

**読み取りにトークンは要らない。** リンクを知っている人は状況を見られる。参加前に「誰がもう入っているか」を見せたいため。返す内容は名前と申告だけで、トークンは出さない。

## 状態

```ts
type RoomRole = "host" | "guest";
type ArrivalReport = "early" | "on_time" | "late";

type Participant = {
  id: string;
  nameJa: string;
  role: RoomRole;
  /** 到着する路線か改札。未入力のうちは null。 */
  entry: EntryRef | null;
  /** 現地で確認したノード。経路の再計算に使う。 */
  confirmed: NodeRef | null;
  /** 本人の申告。位置情報からは判断しない。 */
  report: ArrivalReport | null;
  joinedAt: string;
  updatedAt: string;
};

type Room = {
  id: string;
  datasetId: DatasetId;
  /** 主催者が入れた行き先。Places で選ぶかプリセット。 */
  destination: { catalogId: string | null; nameJa: string; lat: number; lng: number };
  /** 主催者が決めた集合場所。決まるまで null。 */
  meetingNodeId: string | null;
  expiresAt: string;
  participants: Participant[];
  createdAt: string;
  updatedAt: string;
};
```

`Participant.id` はトークンとは別。画面に出るのは `id` と `nameJa` だけ。

## HTTP 契約

すべて `application/json`。日時は ISO 8601。

### `POST /v1/rooms`

主催者がルームを作る。

```ts
type CreateRoomRequest = {
  datasetId: DatasetId;
  hostNameJa: string;
  destination: { catalogId: string | null; nameJa: string; lat: number; lng: number };
  /** 省略時は 6 時間後。上限は 24 時間。 */
  expiresAt?: string;
};

type CreateRoomResponse = {
  room: Room;
  /** 一度だけ返す。以後は再発行しない。 */
  hostToken: string;
  participantId: string;
  inviteUrl: string;
};
```

主催者も参加者の一人として `participants` に入る。役割が `host` なだけで、到着情報の入れ方は同じ。

### `GET /v1/rooms/:id`

誰でも読める。トークンは要らない。期限切れは 410。

### `POST /v1/rooms/:id/participants`

招待された人が名前を入れて参加する。

```ts
type JoinRequest = { nameJa: string };
type JoinResponse = { room: Room; participantId: string; participantToken: string };
```

**同意はここでは扱わない。** 何を共有するかの説明と同意は画面の仕事で、サーバーが記録すると「同意した証拠」を持つことになる。持たない。

### `PATCH /v1/rooms/:id/participants/:participantId`

自分の到着情報と申告を書く。本人のトークンが要る。

```ts
type UpdateParticipantRequest = {
  nameJa?: string;
  entry?: EntryRef | null;
  confirmed?: NodeRef | null;
  report?: ArrivalReport | null;
};
```

主催者は他人のこの口を使えない。**主催者だからといって他人の到着情報を書き換えられるようにしない。**

### `DELETE /v1/rooms/:id/participants/:participantId`

抜ける。本人か主催者。主催者が自分を消すとルームごと消える。

### `PATCH /v1/rooms/:id`

主催者だけ。

```ts
type UpdateRoomRequest = {
  destination?: { catalogId: string | null; nameJa: string; lat: number; lng: number };
  expiresAt?: string;
  /** 集合場所を決める。候補の nodeId を渡す。 */
  meetingNodeId?: string | null;
};
```

### `DELETE /v1/rooms/:id`

主催者だけ。解散。

### `GET /v1/rooms/:id/recommendations`

ルームの状態から推薦を作って返す。中身は `POST /v1/recommendations` と同じ形。

**入力が足りないときは 409 を返す。** 2 人以上が `entry` を入れていることが条件。誰が足りないかを `details` に入れる。

**目的地は Places で選んだものでもよい。** `destination.catalogId` が null のときは、名前と座標を `PlaceRef` として推薦へ渡す([`RECOMMENDER.md`](./RECOMMENDER.md))。プリセットかどうかで断らない。

**`?limit` で `ranked` を上位に絞れる。既定は 10。** 形は変えず件数だけ絞る。`meetingNodeId` が決まっているときは、その候補が圏外でも必ず含める。`infeasible` は絞らない。全候補に `legs` を付けた応答は数 MB になるため、画面はこの口だけを使う。

推薦そのものはルームに保存しない。人が増えたり到着情報が変わったりするたびに変わるので、都度計算する。決まった集合場所だけが `meetingNodeId` として残る。

### `GET /v1/rooms/:id/ws`

WebSocket。**状態は流さず、変わったことだけを押す。** 状態の正本は `GET /v1/rooms/:id` のままで、通知を受けたクライアントが取り直す。同期の経路を二重に作らない。

- 読み取り専用なのでトークンは要らない(`GET` と同じ理由)。クライアントからのメッセージは読まない。
- 変更(参加・参加者の PATCH・退出・ルームの PATCH)を保存するたび、接続中の全員へ `{"type":"room_updated","updatedAt":"…"}` を送る。
- ルームが無ければ 404、期限切れなら 410 で Upgrade を断る。接続中に期限が来たら 4410、解散なら 4404 で閉じる。
- 実装は Durable Object の WebSocket Hibernation。`ping` には `pong` を自動応答し、通知が無い間は休止する。
- 切断時の復帰はポーリング(既定の再検証)が担う。WebSocket は速さの上乗せで、正しさはポーリングだけでも保たれる。

## エラー

| HTTP | code | とき |
|---|---|---|
| 400 | `invalid_request` | 名前が空、日時が読めない、期限が上限を超える |
| 401 | `unauthorized` | トークンが無い、または合わない |
| 403 | `forbidden` | 他人の情報を書こうとした、主催者でないのに主催者の操作をした |
| 404 | `room_not_found` | ルームが無い |
| 409 | `not_enough_participants` | 推薦に必要な入力が揃っていない |
| 410 | `room_expired` | 期限を過ぎた |

## 実装

**ルーム 1 件につき Durable Object 1 つ。** ID はルーム ID から `idFromName` で引く。状態は DO のストレージに 1 キーで持つ。参加者が数人なので分割しない。

**alarm で期限に消す。** `expiresAt` に alarm を張り、起きたら `deleteAll()`。ルームを更新するたびに張り直す。

**推薦 Worker は呼び出さない。** 同じ Worker の中で `recommend()` を直接呼ぶ。ネットワークを挟む理由がない。

トークンは `crypto.randomUUID()`。保存するのは SHA-256 のハッシュで、平文は返すときだけ。DO のストレージが漏れてもトークンが使えないようにする。
