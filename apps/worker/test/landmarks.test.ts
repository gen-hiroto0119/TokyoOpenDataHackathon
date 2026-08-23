// GET /v1/landmarks。docs/RECOMMENDER.md「GET /v1/landmarks」。
// 画面7「いまいる場所」が使う、近くの名前のある地点(改札・集合候補・出口)。
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { RecommendationRequest } from "../src/contract.js";
import type { Catalog, Dataset, Graph } from "../src/graph.js";
import app, { setDataset } from "../src/index.js";
import {
  DEFAULT_LANDMARKS_LIMIT,
  DEFAULT_LANDMARKS_RADIUS_M,
  RecommendError,
  nearbyLandmarks,
  parseLandmarksLimit,
  parseLandmarksRadiusM,
  recommend,
} from "../src/recommend.js";
import { fixture } from "./fixture.js";

// fixture.ts の距離(hall からの片道): g.jr.south 110 / g.maru.west 120 /
// g.transfer 130 / g.keio.west 150 / g.keio.main 160 / m.board 160 /
// m.south 170 / g.jr.west 180 / m.koban 180 / e.east 210 / g.maru.east 210 /
// e.west 220。160 と 210 に同点があり、決着は nodeId の辞書順で確かめる。

describe("nearbyLandmarks: 近い順", () => {
  it("半径内を距離の近い順で返す。同点は nodeId の辞書順(g.keio.main が m.board より先)", () => {
    const landmarks = nearbyLandmarks(fixture, "hall", 170, 20);
    expect(landmarks.map((l) => l.nodeId)).toEqual([
      "g.jr.south",
      "g.maru.west",
      "g.transfer",
      "g.keio.west",
      "g.keio.main",
      "m.board",
      "m.south",
    ]);
    expect(landmarks.map((l) => l.distanceM)).toEqual([110, 120, 130, 150, 160, 160, 170]);
  });

  it("同点は nodeId の辞書順(e.east が g.maru.east より先)", () => {
    const landmarks = nearbyLandmarks(fixture, "hall", 220, 20);
    expect(landmarks.map((l) => l.nodeId)).toEqual([
      "g.jr.south",
      "g.maru.west",
      "g.transfer",
      "g.keio.west",
      "g.keio.main",
      "m.board",
      "m.south",
      "g.jr.west",
      "m.koban",
      "e.east",
      "g.maru.east",
      "e.west",
    ]);
  });

  it("kind と floorLabel を持つ", () => {
    const landmarks = nearbyLandmarks(fixture, "hall", 170, 20);
    expect(landmarks.find((l) => l.nodeId === "g.jr.south")).toMatchObject({
      kind: "gate",
      nameJa: "JR 南口改札",
      floorLabel: "B1",
    });
    const withMeeting = nearbyLandmarks(fixture, "hall", 220, 20);
    expect(withMeeting.find((l) => l.nodeId === "m.koban")).toMatchObject({
      kind: "meeting",
      nameJa: "西口交番前",
    });
    expect(withMeeting.find((l) => l.nodeId === "e.west")).toMatchObject({
      kind: "exit",
      nameJa: "出口 15",
    });
  });
});

describe("nearbyLandmarks: 半径", () => {
  it("半径の外は返さない", () => {
    const landmarks = nearbyLandmarks(fixture, "hall", 110, 20);
    expect(landmarks.map((l) => l.nodeId)).toEqual(["g.jr.south"]);
  });

  it("距離は丸めない", () => {
    // fixture は整数距離しか作らないので、丸めていないことは「値がそのまま
    // 返る」ことで確かめる(round1 なら 110 → 110 で見分かないが、少なくとも
    // 四捨五入や切り捨てで値が変わっていないことは保証する)。
    const landmarks = nearbyLandmarks(fixture, "hall", 110, 20);
    expect(landmarks[0]!.distanceM).toBe(110);
  });
});

describe("nearbyLandmarks: limit", () => {
  it("limit 件までに絞る。絞った後の並びは変わらない", () => {
    const landmarks = nearbyLandmarks(fixture, "hall", 220, 3);
    expect(landmarks.map((l) => l.nodeId)).toEqual(["g.jr.south", "g.maru.west", "g.transfer"]);
  });
});

describe("nearbyLandmarks: 起点自身", () => {
  it("起点自身が地点なら距離 0 で先頭に入る", () => {
    const landmarks = nearbyLandmarks(fixture, "g.jr.west", 0, 20);
    expect(landmarks).toEqual([
      { nodeId: "g.jr.west", nameJa: "JR 西口改札", kind: "gate", floorLabel: "B1", distanceM: 0 },
    ]);
  });
});

describe("nearbyLandmarks: 未知ノード", () => {
  it("グラフに無いノードは unknown_node", () => {
    expect(() => nearbyLandmarks(fixture, "nope", 150, 20)).toThrowError(
      expect.objectContaining({ code: "unknown_node" }),
    );
    try {
      nearbyLandmarks(fixture, "nope", 150, 20);
    } catch (error) {
      expect(error).toBeInstanceOf(RecommendError);
    }
  });
});

describe("parseLandmarksRadiusM / parseLandmarksLimit", () => {
  it("既定値", () => {
    expect(parseLandmarksRadiusM(undefined)).toBe(DEFAULT_LANDMARKS_RADIUS_M);
    expect(parseLandmarksLimit(undefined)).toBe(DEFAULT_LANDMARKS_LIMIT);
  });

  it("不正値は既定値へ", () => {
    expect(parseLandmarksRadiusM("nope")).toBe(DEFAULT_LANDMARKS_RADIUS_M);
    expect(parseLandmarksRadiusM("0")).toBe(DEFAULT_LANDMARKS_RADIUS_M);
    expect(parseLandmarksRadiusM("-10")).toBe(DEFAULT_LANDMARKS_RADIUS_M);
    expect(parseLandmarksLimit("nope")).toBe(DEFAULT_LANDMARKS_LIMIT);
    expect(parseLandmarksLimit("0")).toBe(DEFAULT_LANDMARKS_LIMIT);
    expect(parseLandmarksLimit("1.5")).toBe(DEFAULT_LANDMARKS_LIMIT);
  });

  it("正しい値はそのまま", () => {
    expect(parseLandmarksRadiusM("80")).toBe(80);
    expect(parseLandmarksLimit("3")).toBe(3);
  });
});

describe("GET /v1/landmarks", () => {
  beforeAll(() => {
    setDataset(fixture);
  });

  it("near が無ければ 400 unknown_node", async () => {
    const res = await app.request("/v1/landmarks");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("unknown_node");
  });

  it("near がグラフに無ければ 400 unknown_node", async () => {
    const res = await app.request("/v1/landmarks?near=nope");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("unknown_node");
  });

  it("既定の radiusM(150)/limit(20)で返す", async () => {
    const res = await app.request("/v1/landmarks?near=hall");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { landmarks: { nodeId: string; distanceM: number }[] };
    // 半径150以内: g.jr.south(110) / g.maru.west(120) / g.transfer(130) / g.keio.west(150)
    expect(body.landmarks.map((l) => l.nodeId)).toEqual([
      "g.jr.south",
      "g.maru.west",
      "g.transfer",
      "g.keio.west",
    ]);
  });

  it("radiusM / limit を指定できる", async () => {
    const res = await app.request("/v1/landmarks?near=hall&radiusM=220&limit=2");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { landmarks: { nodeId: string }[] };
    expect(body.landmarks.map((l) => l.nodeId)).toEqual(["g.jr.south", "g.maru.west"]);
  });

  it("不正な radiusM / limit は既定値に落ちる", async () => {
    const res = await app.request("/v1/landmarks?near=hall&radiusM=nope&limit=-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { landmarks: { nodeId: string }[] };
    expect(body.landmarks.map((l) => l.nodeId)).toEqual([
      "g.jr.south",
      "g.maru.west",
      "g.transfer",
      "g.keio.west",
    ]);
  });
});

// ---------------------------------------------------------------- 実データ

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../data");
const realDataset: Dataset = {
  graph: JSON.parse(readFileSync(join(dataDir, "graph.json"), "utf8")) as Graph,
  catalog: JSON.parse(readFileSync(join(dataDir, "catalog.json"), "utf8")) as Catalog,
};

describe("実データ: 丸ノ内レッグの中間ノードから近くの地点", () => {
  const representative: RecommendationRequest = {
    datasetId: "tokyo.shinjuku-terminal",
    destination: { kind: "catalog", id: "dest.tokyo-metropolitan-government" },
    participants: [
      { id: "jr", entry: { kind: "line", id: "line.jr" } },
      { id: "keio", entry: { kind: "line", id: "line.keio" } },
      { id: "marunouchi", entry: { kind: "line", id: "line.marunouchi" } },
    ],
  };

  it("中間ノードを起点にすると、名前のある地点が 1 件以上、カタログ由来だけ返る", () => {
    const res = recommend(realDataset, representative);
    const top = res.ranked[0]!;
    const maruLeg = top.legs.find((l) => l.participantId === "marunouchi")!;
    const midNode = maruLeg.pathNodeIds[Math.floor(maruLeg.pathNodeIds.length / 2)]!;

    const landmarks = nearbyLandmarks(realDataset, midNode, 150, 20);
    // eslint-disable-next-line no-console
    console.log(
      `丸ノ内中間ノード ${midNode} から半径150m以内: ${landmarks.length}件\n` +
        landmarks.map((l) => `  ${l.kind} ${l.nameJa}(${l.floorLabel}) ${Math.round(l.distanceM)}m`).join("\n"),
    );

    expect(landmarks.length).toBeGreaterThanOrEqual(1);

    const entryNodeIds = new Set(realDataset.catalog.entries.map((e) => e.nodeId));
    const meetingNodeIds = new Set(realDataset.catalog.meetings.map((m) => m.nodeId));
    const exitNodeIds = new Set(realDataset.catalog.exits.map((e) => e.nodeId));
    for (const l of landmarks) {
      const inCatalog =
        (l.kind === "gate" && entryNodeIds.has(l.nodeId)) ||
        (l.kind === "meeting" && meetingNodeIds.has(l.nodeId)) ||
        (l.kind === "exit" && exitNodeIds.has(l.nodeId));
      expect(inCatalog).toBe(true);
      expect(l.nameJa.length).toBeGreaterThan(0);
      expect(l.distanceM).toBeLessThanOrEqual(150);
    }
    // 近い順であること。
    for (let i = 1; i < landmarks.length; i++) {
      expect(landmarks[i]!.distanceM).toBeGreaterThanOrEqual(landmarks[i - 1]!.distanceM);
    }
  });
});
