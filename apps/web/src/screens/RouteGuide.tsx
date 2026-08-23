import { useEffect, useLayoutEffect, useRef, useState, type UIEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import type { RouteMap as RouteMapData } from "worker/src/contract.js";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";
import { AppBar } from "../components/AppBar.js";
import { Handoff } from "../components/Handoff.js";
import { Icon } from "../components/Icon.js";
import { Path } from "../components/Path.js";
import { RouteMap } from "../components/RouteMap.js";
import { TabBar, type TabBarSelected } from "../components/TabBar.js";
import { displayFloorLabel, focusSegment, rowIndexOfNode, type PathRow } from "../route-view.js";

/** Storybook / props 未指定時のフォールバック。実データは RoomPage が渡す。 */
const DEFAULT_ROWS: readonly PathRow[] = [
  {
    kind: "path",
    nodeId: "gate",
    Kind: "Landmark",
    Landmark: "丸ノ内線改札",
    Detail: "出て直進 · 30m",
    Icon: "Straight",
    floorLabel: "B1F",
  },
  {
    kind: "path",
    nodeId: "move-1",
    Kind: "Move",
    Detail: "直進する · 100m",
    Icon: "Straight",
    floorLabel: "B1F",
  },
  {
    kind: "path",
    nodeId: "meeting",
    Kind: "Landmark",
    Landmark: "西口交番前",
    Detail: "右へ曲がる · 40m",
    Goal: "集合場所",
    ShowGoal: true,
    Icon: "Right",
    floorLabel: "B1F",
  },
  {
    kind: "path",
    nodeId: "exit",
    Kind: "Landmark",
    Landmark: "出口 8",
    Detail: "直進 · 60m",
    Goal: "出口",
    ShowGoal: true,
    Icon: "Straight",
    floorLabel: "1F",
  },
];

export type RouteGuideProps = {
  rows?: readonly PathRow[];
  /** 復元・再計算で先頭に持ってきたい行の nodeId。無ければ 0 行目から。 */
  anchorNodeId?: string | null;
  HandoffFrom?: string;
  HandoffTo?: string;
  HandoffUncertain?: boolean;
  /** 「表示が違う」の送信がすでに済んだ。 */
  HandoffReported?: boolean;
  /** 送信中。 */
  HandoffCorrectBusy?: boolean;
  /** 直前の送信が失敗した。 */
  HandoffCorrectError?: boolean;
  map?: RouteMapData | null;
  attributionJa?: string;
  onOpenMap?: () => void;
  onCorrectExit?: (labelJa: string) => void;
  onTabSelect?: (selected: TabBarSelected) => void;
};

/** スナップ基準線: 手順リスト(.steps)下端から 22% 上(下寄り)。1 = 下端。
 * ratio は clientHeight を都度読むだけで、固定 px には依存しない。 */
const SNAP_LINE_RATIO = 0.78;
const STEPS_PAD_INLINE = 16; // space-6
/** ネイティブスナップ(慣性スクロール終了時の吸着先)を下寄り基準に揃える
 * ための scroll-padding-top。align は center のまま、有効領域の上端を
 * この割合だけ削ると、中心が下端から (1 - SNAP_LINE_RATIO) の位置に来る。 */
const SCROLL_PADDING_TOP = `${SNAP_LINE_RATIO * 200 - 100}%`; // 0.78 -> 56%

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    width: "100%",
    maxWidth: 480,
    height: "100dvh",
    minHeight: "100dvh",
    marginInline: "auto",
    overflow: "hidden",
    backgroundColor: color["--color-surface-shell"],
  },
  steps: {
    boxSizing: "border-box",
    width: "100%",
    margin: 0,
    paddingInline: STEPS_PAD_INLINE,
    paddingBlock: 0,
    overflowX: "hidden",
    overflowY: "auto",
    overscrollBehavior: "contain",
    scrollSnapType: "y mandatory",
    scrollSnapStop: "always",
    scrollPaddingTop: SCROLL_PADDING_TOP,
    scrollbarWidth: "none",
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
    "::-webkit-scrollbar": {
      display: "none",
    },
  },
  stepsInner: {
    boxSizing: "border-box",
    // 背骨線(spine)の絶対配置の基準。bounding rect ベースの計算に切り替えた
    // ため offsetParent 依存は無いが、spine の高さ(手順の実丈ぶんだけ)を
    // 決めるにはこの要素が位置指定を持つ必要がある。
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space["--space-6"],
    width: "100%",
    // スナップ用の上下余白はスクロール内容側に置く。スクロール枠に
    // padding すると、短い画面で枠の最小高さがタブバーを押し出す。
    paddingBlockStart: 380,
    paddingBlockEnd: 130,
  },
  spine: {
    boxSizing: "border-box",
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: 4,
    borderRadius: space["--radius-full"],
    backgroundColor: color["--color-map-route-muted"],
    // カードの背面を通る。カード側(.snap)に明示の z-index を与えて上に出す。
    zIndex: 0,
    pointerEvents: "none",
  },
  snap: {
    boxSizing: "border-box",
    position: "relative",
    zIndex: 1,
    width: "100%",
    flexShrink: 0,
    scrollSnapAlign: "center",
    scrollSnapStop: "always",
  },
  hereBadge: {
    boxSizing: "border-box",
    position: "absolute",
    top: "50%",
    right: space["--space-5"],
    transform: "translateY(-50%)",
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: space["--radius-full"],
    backgroundColor: color["--color-presence-self"],
    color: color["--color-surface-float"],
    boxShadow: "0 0 0 2px #ffffff, 0 1px 4px rgba(23, 35, 45, 0.20)",
    pointerEvents: "none",
  },
  visuallyHidden: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
});

function stepState(index: number, current: number): "Done" | "Next" | "Later" {
  if (index < current) return "Done";
  if (index === current) return "Next";
  return "Later";
}

/** 見えている行の中で、スナップ基準線(下寄り)に一番近いものの index。
 * DOM は逆順(最上部が末尾の行)で描くため、ループ添字ではなく data-step
 * (論理 index)を読んで返す。 */
function nearestStep(root: HTMLDivElement): number {
  const line = root.getBoundingClientRect().top + root.clientHeight * SNAP_LINE_RATIO;
  const items = root.querySelectorAll("[data-step]");
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < items.length; i++) {
    const item = items.item(i);
    if (!(item instanceof HTMLElement)) continue;
    const index = Number(item.dataset.step);
    const rect = item.getBoundingClientRect();
    const dist = Math.abs(rect.top + rect.height / 2 - line);
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  }
  return best;
}

/** item の中心がスナップ基準線(下寄り)に来る scrollTop。scrollIntoView は
 * 使わない(iOS Safari がネストされたスクロール祖先まで一緒に動かすことが
 * ある)。offsetTop ではなく bounding rect の差分で計算するため、item と
 * root の間に位置指定を持つラッパー(stepsInner)を挟んでも崩れない。 */
function snapScrollTop(root: HTMLDivElement, item: HTMLElement): number {
  const rootRect = root.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const line = rootRect.top + rootRect.height * SNAP_LINE_RATIO;
  const itemCenter = itemRect.top + itemRect.height / 2;
  return root.scrollTop + (itemCenter - line);
}

/** 最下部(先頭の手順が下寄りスナップ位置)へのスクロール量。 */
function bottomScrollTop(root: HTMLDivElement): number {
  return root.scrollHeight - root.clientHeight;
}

function initialIndexOf(rows: readonly PathRow[], anchorNodeId: string | null | undefined): number {
  const anchored = rowIndexOfNode(rows, anchorNodeId ?? null);
  return anchored === -1 ? 0 : anchored;
}

function announcementOf(row: PathRow, position: number, total: number): string {
  const landmark = row.Kind === "Landmark" && row.Landmark ? `${row.Landmark} ` : "";
  const detail = row.Detail.replace(/\s*·\s*/g, " ");
  return `${position}/${total} ${landmark}${detail}`.trim();
}

export function RouteGuide({
  rows = DEFAULT_ROWS,
  anchorNodeId = null,
  HandoffFrom = "出口 8 を出たところから",
  HandoffTo = "東京都庁",
  HandoffUncertain = false,
  HandoffReported = false,
  HandoffCorrectBusy = false,
  HandoffCorrectError = false,
  map = null,
  attributionJa,
  onOpenMap,
  onCorrectExit,
  onTabSelect,
}: RouteGuideProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [current, setCurrent] = useState(() => initialIndexOf(rows, anchorNodeId));
  const [announcement, setAnnouncement] = useState("");
  const [pickedFloor, setPickedFloor] = useState<string | null>(null);

  const lastPathIndex = rows.length - 1;
  const handoffIndex = rows.length;
  const onHandoff = current === handoffIndex;
  const ready = rows.length > 0 && current >= lastPathIndex;
  const currentRow = onHandoff ? rows[lastPathIndex] : rows[current];
  const stepFloor = displayFloorLabel(currentRow?.floorLabel);
  const mapFloor =
    pickedFloor ??
    (stepFloor || (map?.floors[0] ?? "1F"));

  useLayoutEffect(() => {
    const root = scrollerRef.current;
    const startIndex = initialIndexOf(rows, anchorNodeId);
    if (root) {
      if (startIndex === 0) {
        // アンカー無し(または解決できないアンカー)は常に最下部
        // (先頭の手順が下寄りスナップ位置)へ。
        root.scrollTop = bottomScrollTop(root);
      } else {
        const item = root.querySelector(`[data-step="${startIndex}"]`);
        root.scrollTop = item instanceof HTMLElement ? snapScrollTop(root, item) : bottomScrollTop(root);
      }
    }
    setCurrent(startIndex);
    // rows / anchorNodeId が変わるのは再マウント(key)のときだけを想定している。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (onHandoff) {
        // 25 Copy「引き継ぎ / 補足（実行）」
        setAnnouncement("ここから先は地図アプリが案内します");
        return;
      }
      const row = rows[current];
      if (row) setAnnouncement(announcementOf(row, current + 1, rows.length));
    }, 500);
    return () => clearTimeout(timer);
  }, [current, onHandoff, rows]);

  useEffect(() => {
    setPickedFloor(null);
  }, [stepFloor]);

  function onScroll(event: UIEvent<HTMLDivElement>) {
    if (rafRef.current !== null) return;
    const root = event.currentTarget;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setCurrent(nearestStep(root));
    });
  }

  // 高速道路の案内板と同じ向き: 一番下が今の手順、上へ行くほど先。描画だけを
  // 逆順にする(rows 自体は route-view.ts が作る論理順のまま)。
  const displayRows = rows.map((row, index) => ({ row, index })).reverse();

  return (
    <div className={stylexClassName(styles.root)}>
      <AppBar Title="経路" Back="Hidden" />
      {map ? (
        <RouteMap
          map={map}
          floor={mapFloor}
          currentNodeId={currentRow?.nodeId ?? null}
          fromNodeId={focusSegment(rows, onHandoff ? lastPathIndex : current).fromNodeId}
          toNodeId={focusSegment(rows, onHandoff ? lastPathIndex : current).toNodeId}
          attributionJa={attributionJa}
          onFloorChange={(next) => setPickedFloor(next)}
        />
      ) : null}
      <div
        ref={scrollerRef}
        className={stylexClassName(styles.steps)}
        onScroll={onScroll}
        tabIndex={0}
        aria-label="経路の手順(下から上へ進む)"
      >
        <div className={stylexClassName(styles.stepsInner)}>
          {/* 背骨線: カード列の水平中央を貫く連続線。カードの背面を通る
              (カード側の .snap に z-index を与えて上に出す)。カード同士の
              隙間からだけ覗く。 */}
          <div className={stylexClassName(styles.spine)} aria-hidden="true" />
          {/* 構内手順の末尾 = 逆順表示の先頭。Figma 画面6 / 25 Copy「引き継ぎ」。 */}
          <div
            data-step={handoffIndex}
            className={stylexClassName(styles.snap)}
            aria-current={onHandoff ? "step" : undefined}
          >
            <Handoff
              State={ready ? "Ready" : "Waiting"}
              From={HandoffFrom}
              To={HandoffTo}
              Uncertain={HandoffUncertain}
              Reported={HandoffReported}
              CorrectBusy={HandoffCorrectBusy}
              CorrectError={HandoffCorrectError}
              onOpenMap={onOpenMap}
              onCorrect={onCorrectExit}
            />
            {onHandoff ? (
              <div className={stylexClassName(styles.hereBadge)} aria-hidden="true">
                <Icon Name="Navigation" Filled />
              </div>
            ) : null}
          </div>
          {displayRows.map(({ row, index }) => (
            <div
              key={`${row.nodeId}-${index}`}
              data-step={index}
              className={stylexClassName(styles.snap)}
              aria-current={index === current ? "step" : undefined}
            >
              <Path
                State={stepState(index, current)}
                Kind={row.Kind}
                Landmark={row.Landmark}
                Detail={row.Detail}
                Goal={row.Goal}
                ShowGoal={row.ShowGoal}
                Icon={row.Icon}
              />
              {/* 現在地パック: 現在行の PathBox 内、右側に添える。GPS の慣習色
                  である青は使わない。 */}
              {index === current ? (
                <div className={stylexClassName(styles.hereBadge)} aria-hidden="true">
                  <Icon Name="Navigation" Filled />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div aria-live="polite" className={stylexClassName(styles.visuallyHidden)}>
        {announcement}
      </div>
      <TabBar Selected="Route" onSelect={onTabSelect} />
    </div>
  );
}
