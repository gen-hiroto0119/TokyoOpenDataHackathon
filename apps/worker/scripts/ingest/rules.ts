// 名前から判定する純関数。
//
// 路線の判定はここには無い。改札と路線の対応は data/labels/gates.json に手で書く
// （名前だけでは JR と丸ノ内線の「西改札」を区別できない）。

// 出場専用の改札は入口にしない。ここから入ってくる人はいない。大文字小文字を区別する。
export const exitOnly = /出口専用|出場専用|Exitonly|Exit only/;

// 名前として使えないもの。番線番号（"11"）、区画コード（"D10"、"A1"）、
// 内部 ID（"Unit B3F-115"）は現地の案内表示と照らし合わせられないので、集合場所にできない。
export const codeName =
  /^[0-9]+$|^[A-Za-z]$|^[0-9A-Za-z][0-9A-Za-z\-\. ]{0,3}$|^(?i:Unit\s?[0-9A-Za-z]*-?[0-9]+)$/;

// 立って待つ場所ではないもの。
export const privateName = /おむつ|オムツ|授乳|multipurpose|Nursing/;

// 番線の名前（「3 埼京線 湘南新宿ライン」「小田急線 3 特急ロマンスカー」）。改札の内側なので集合場所にできない。
// 独立した数字の語か、番線・ホームの語があるもの。
export const platformName = /(^|\s)[0-9０-９]+\s|番線|ホーム/;

// 設備の一般名。駅に同じものが何個もあるので、言われても特定できない。
// `^` は先頭の選択肢（ATM）にしか掛からず、他の語は部分一致（「みずほATM」は非マッチ）。
export const genericName =
  /^ATM|券売機|精算機|コインロッカー|ロッカー|休憩所|待合室|トイレ|化粧室|お手洗|エレベーター|エスカレーター|階段|喫煙|自動販売機|給湯|AED|Vending|Locker|Restroom|Toilet|Elevator|Escalator|Stairs/i;

// 出口の表示名。看板に書いてあるとおりに出す。
//
// 番号は事業者ごとに振り直されていて、新宿駅に「7番出入口」は3つある。
// ただし曖昧なのは口頭で場所を指すときの話で、この経路案内では違う。
// 利用者はもう集合していて、こちらが出した経路をたどって一緒に歩く。
// 目の前の看板の「7」を見つければよく、どの事業者の7番かを知る必要がない。
// だから番号を直したり修飾したりせず、そのまま出す。
export function exitNameOf(label: string): string {
  if (label === "") return "地上出口";
  // 番号・記号は看板の文字なので「出口」を前に付ける。
  // 手で書いた「ルミネエスト 地下入口」のような文はそのまま出す。コードポイント数で数える。
  if ([...label].length <= 3) return "出口 " + label;
  return label;
}

/**
 * 集合候補の説明しやすさ。同点なら交番・広場・案内所が店舗に勝つようにする階層。
 * 交番5 / 案内所・インフォメーション4 / 広場・コンコース3 / 改札2 / その他1。
 */
export function explainOf(name: string): number {
  if (name.includes("交番")) return 5;
  if (name.includes("案内所") || name.includes("インフォメーション")) return 4;
  if (name.includes("広場") || name.includes("コンコース")) return 3;
  if (name.includes("改札")) return 2;
  return 1;
}

/**
 * 名前の照合用の正規化。NFKC → 小文字 → 空白・記号を落とす。
 * 「スターバックス コーヒー 新宿西口店」と「スターバックスコーヒー」の包含判定に使う。
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　・･\-‐–—~〜（）()「」.。,、'’´′`]/g, "");
}
