import { afterAll, beforeAll, describe, expect, it } from "vitest";
import catalogJson from "../data/catalog.json" with { type: "json" };
import graphJson from "../data/graph.json" with { type: "json" };
import type { RecommendationRequest, RouteResponse } from "../src/contract.js";
import type { Catalog, Dataset, Graph } from "../src/graph.js";
import app, { setDataset } from "../src/index.js";
import { recommend } from "../src/recommend.js";
import { buildRoomRecommendations } from "../src/room-recommendations.js";
import { buildRoomRoute, pickRoute } from "../src/room-route.js";
import type { Room } from "../src/room.js";
import { fixture } from "./fixture.js";

/**
 * 決まった集合場所の経路（`pickRoute` / `buildRoomRoute` / POST /v1/routes）。
 * GET /v1/rooms/:id/route の Hono の口は Durable Object を介するため、
 * ルーム側は純関数として直接叩く（room-recommendations.test.ts と同じ）。
 */
const NOW = new Date().toISOString();

const representative: RecommendationRequest = {
  datasetId: "tokyo.shinjuku-terminal",
  destination: { kind: "catalog", id: "dest.tokyo-metropolitan-government" },
  participants: [
    { id: "jr", entry: { kind: "line", id: "line.jr" } },
    { id: "keio", entry: { kind: "line", id: "line.keio" } },
    { id: "marunouchi", entry: { kind: "line", id: "line.marunouchi" } },
  ],
};

const realDataset: Dataset = {
  graph: graphJson as Graph,
  catalog: catalogJson as Catalog,
};

function participant(id: string, entryId: string): Room["participants"][number] {
  return {
    id,
    nameJa: id,
    role: "guest",
    entry: { kind: "line", id: entryId },
    confirmed: null,
    report: null,
    joinedAt: NOW,
    updatedAt: NOW,
  };
}

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    datasetId: "tokyo.shinjuku-terminal",
    destination: {
      catalogId: "dest.tokyo-metropolitan-government",
      nameJa: "東京都庁",
      lat: 35.6896,
      lng: 139.6917,
    },
    meetingCatalogId: null,
    expiresAt: NOW,
    participants: [
      participant("jr", "line.jr"),
      participant("keio", "line.keio"),
      participant("marunouchi", "line.marunouchi"),
    ],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function distancesOf(route: Pick<RouteResponse, "legs" | "onward">) {
  return {
    legs: route.legs.map((leg) => leg.distanceM),
    onward: route.onward.distanceM,
  };
}

describe("POST /v1/routes", () => {
  beforeAll(() => {
    setDataset(fixture);
  });
  afterAll(() => {
    setDataset(realDataset);
  });

  const post = (body: unknown) =>
    app.request("/v1/routes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("meeting.kind=catalog ならその集合場所の legs/onward を返す。距離は recommend() と同じ", async () => {
    const rec = recommend(fixture, representative);
    const chosen = rec.ranked.find((row) => row.meeting.catalogId === "meet.koban");
    expect(chosen).toBeDefined();

    const res = await post({
      ...representative,
      meeting: { kind: "catalog", id: "meet.koban" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as RouteResponse;
    expect(body.meeting.nodeId).toBe(chosen!.meeting.nodeId);
    expect(body.meeting.catalogId).toBe("meet.koban");
    expect(body.rank).toBe(chosen!.rank);
    expect(body.legs).toEqual(chosen!.legs);
    expect(body.onward).toEqual(chosen!.onward);
    expect(distancesOf(body)).toEqual(distancesOf(chosen!));
    expect(body).not.toHaveProperty("ranked");
    expect(body).not.toHaveProperty("infeasible");
  });

  it("知らない集合場所は 400", async () => {
    const res = await post({
      ...representative,
      meeting: { kind: "catalog", id: "meet.no-such" },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; messageJa: string };
    expect(body.code).toBe("unknown_catalog");
    expect(body.messageJa.length).toBeGreaterThan(0);
  });
});

describe("pickRoute", () => {
  it("fixture の catalog 参照でも recommend() と同じ距離になる", () => {
    const rec = recommend(fixture, representative);
    const chosen = rec.ranked.find((row) => row.meeting.catalogId === "meet.koban");
    expect(chosen).toBeDefined();
    const route = pickRoute(rec, { kind: "catalog", id: "meet.koban" });
    expect(route.meeting.nodeId).toBe("m.koban");
    expect(route.legs).toEqual(chosen!.legs);
    expect(route.onward).toEqual(chosen!.onward);
    expect(distancesOf(route)).toEqual(distancesOf(chosen!));
  });

  it("infeasible にしか無い集合場所は no_feasible_meeting", () => {
    const rec = recommend(fixture, {
      ...representative,
      constraints: { accessibility: "step_free" },
    });
    expect(rec.infeasible.some((row) => row.nodeId === "m.south")).toBe(true);
    expect(() => pickRoute(rec, { kind: "node", id: "m.south" })).toThrowError(
      expect.objectContaining({ code: "no_feasible_meeting" }),
    );
  });

  it("ranked にも infeasible にも無いノードは unknown_node", () => {
    const rec = recommend(fixture, representative);
    expect(() => pickRoute(rec, { kind: "node", id: "nope" })).toThrowError(
      expect.objectContaining({ code: "unknown_node" }),
    );
  });
});

describe("GET /v1/rooms/:id/route", () => {
  it("meetingCatalogId が無いと invalid_request", () => {
    expect(() => buildRoomRoute(fixture, makeRoom())).toThrowError(
      expect.objectContaining({
        code: "invalid_request",
        messageJa: "集合場所が決まっていません",
      }),
    );
  });

  it("ホストが meetingCatalogId を決めたら、推薦と同じ集合場所の経路を返す", () => {
    const room = makeRoom({ meetingCatalogId: "meet.koban" });
    const recs = buildRoomRecommendations(fixture, room, 10);
    const route = buildRoomRoute(fixture, room);
    const chosen = recs.ranked.find((row) => row.meeting.nodeId === "m.koban");
    expect(chosen).toBeDefined();
    expect(route.meeting.nodeId).toBe(chosen!.meeting.nodeId);
    expect(route.rank).toBe(chosen!.rank);
    expect(route.legs).toEqual(chosen!.legs);
    expect(route.onward).toEqual(chosen!.onward);
    expect(route.map.participants).toHaveLength(route.legs.length);
    for (const row of route.map.participants) {
      expect(row.lines.length).toBeGreaterThan(0);
      expect(row.lines[0]!.coordinates.length).toBeGreaterThanOrEqual(2);
      expect(row.points.length).toBeGreaterThan(1);
    }
    expect(route.map.onward.marks.some((mark) => mark.kind === "exit")).toBe(true);
    expect(route.map.onward.points.length).toBeGreaterThan(1);
  });
});
