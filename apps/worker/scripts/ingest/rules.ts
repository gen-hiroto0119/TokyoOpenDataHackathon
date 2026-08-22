// 正規表現群と、名前から判定する純関数。
//
// 移植元: tools/ingest/main.go。等価移植が絶対条件なので、Go の各パターンと
// セマンティクスが完全に一致することを確認したうえで JS の RegExp に落としている
// （scratchpad/research-ingest.md §1 の R14/R15/R18/R25/R31 に対応）。
//
// 正規表現の移し方の注意:
//   - Go の `(?i)` はパターン全体に掛かる。第2選択肢が無条件になる `line.jr` の
//     `(?i)\bJR|JR` は実質 `/JR/i` と同値（研究レポートの癖 (f)）なのでそのまま簡約した。
//     他の路線パターンは一字一句 Go と同じ文字列を使い、フラグだけ /i に付け替えている。
//   - `exitOnly` と `privateName` は Go 側に `(?i)` が無いので大文字小文字を区別する
//     （JS 側も無フラグ）。直したくなっても直さない。
//   - `codeName` の `(?i:Unit ...)` は Go 特有のインライン修飾子だが、Node v24 の V8 は
//     ECMAScript のインライン修飾子グループ（TC39 regexp-modifiers）を実装しており、
//     `(?i:...)` をそのまま貼り付けて Go と同じ挙動になることを実測済み
//     （scratchpad/regex_check.go と regex_check.mjs の出力が全ケースで一致）。
//   - `genericName` は Go の `(?i)^ATM|券売機|...` をそのまま `/^ATM|券売機|.../i` に変換した。
//     `^` は先頭の選択肢（ATM）にしか掛からず、他の語は部分一致のままになる。これは
//     Go でも同じ挙動（「みずほATM」は非マッチ）で、意図的にそのまま再現している。

export type LinePattern = { lineID: string; re: RegExp };

export const linePatterns: LinePattern[] = [
  { lineID: "line.jr", re: /JR/i },
  { lineID: "line.keio", re: /Keio|京王/i },
  { lineID: "line.odakyu", re: /Odakyu|小田急/i },
  { lineID: "line.oedo", re: /Oedo|大江戸/i },
  { lineID: "line.marunouchi", re: /Marunouchi|丸ノ内/i },
  { lineID: "line.shinjuku", re: /ShinjukuLine|都営新宿/i },
  { lineID: "line.seibu", re: /Seibu|西武/i },
];

// 出場専用の改札は入口にしない。ここから入ってくる人はいない。大文字小文字を区別する。
export const exitOnly = /出口専用|出場専用|Exitonly|Exit only/;

// 名前として使えないもの。番線番号（"11"）、区画コード（"D10"、"A1"）、
// 内部 ID（"Unit B3F-115"）は現地の案内表示と照らし合わせられないので、集合場所にできない。
export const codeName =
  /^[0-9]+$|^[A-Za-z]$|^[0-9A-Za-z][0-9A-Za-z\-\. ]{0,3}$|^(?i:Unit\s?[0-9A-Za-z]*-?[0-9]+)$/;

// 立って待つ場所ではないもの。
export const privateName = /おむつ|オムツ|授乳|multipurpose|Nursing/;

// 設備の一般名。駅に同じものが何個もあるので、言われても特定できない。
export const genericName =
  /^ATM|券売機|精算機|コインロッカー|ロッカー|休憩所|待合室|トイレ|化粧室|お手洗|エレベーター|エスカレーター|階段|喫煙|自動販売機|給湯|AED|Vending|Locker|Restroom|Toilet|Elevator|Escalator|Stairs/i;

/** 名前から路線 ID を判定する。ヒットした順ではなく lineID の辞書順で返す。 */
export function linesOf(name: string): string[] {
  const out: string[] = [];
  for (const p of linePatterns) {
    if (p.re.test(name)) out.push(p.lineID);
  }
  out.sort();
  return out;
}

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
  // 手で書いた「ルミネエスト 地下入口」のような文はそのまま出す。
  // rune 数（コードポイント数）で数える。Go の len([]rune(label)) に対応。
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
