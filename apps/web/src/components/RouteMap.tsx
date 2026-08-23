import { useEffect, useRef } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as stylex from "@stylexjs/stylex";
import type { RouteMap as RouteMapData, RouteMapMarkKind } from "worker/src/contract.js";
import { hereLngLat, segmentCamera } from "../route-map-camera.js";
import { color } from "../tokens/color.stylex.js";
import { space } from "../tokens/space.stylex.js";
import { type } from "../tokens/typography.stylex.js";
import { stylexClassName } from "../stylex-class-name.js";

const CONFIRM_FLOORS = ["B3F", "B2F", "B1F", "1F", "2F"] as const;
const KOSHU_OUT_NORTH = 35.6908;
const SPACE_COLORS = {
  shop: "#cfa775",
  stairs: "#58b4cf",
  elevator: "#806ee8",
  escalator: "#ee8b43",
  restroom: "#3887db",
  corridor: "#aeb8c2",
  room: "#d5d9de",
  ramp: "#70a85a",
  ticket: "#8d98a3",
  waiting: "#dfc989",
  other: "#c8cdd3",
} as const;

const MARK_COLORS: Record<RouteMapMarkKind, string> = {
  gate: "#dc2626",
  meeting: "#0f6e64",
  exit: "#ea580c",
  turn: "#6b7280",
  stairs: "#7c3aed",
  escalator: "#7c3aed",
  elevator: "#111827",
  node: "#6b7280",
};

export type RouteMapProps = {
  map: RouteMapData;
  floor: string;
  currentNodeId?: string | null;
  fromNodeId?: string | null;
  toNodeId?: string | null;
  hereBetween?: boolean;
  attributionJa?: string;
  onFloorChange?: (floor: string) => void;
};

type IndoorPack = {
  floors: GeoJSON.FeatureCollection;
  spaces: GeoJSON.FeatureCollection;
  drawings: GeoJSON.FeatureCollection;
};

type LngLat = [number, number];

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    position: "relative",
    width: "100%",
    height: 268,
    minHeight: 268,
    flexShrink: 0,
    overflow: "hidden",
    backgroundColor: color["--color-map-surface"],
    borderBottomWidth: space["--border-width"],
    borderBottomStyle: "solid",
    borderBottomColor: color["--color-border-subtle"],
  },
  canvas: {
    width: "100%",
    height: "100%",
  },
  floors: {
    boxSizing: "border-box",
    position: "absolute",
    left: space["--space-6"],
    bottom: space["--space-6"],
    zIndex: 1,
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space["--space-2"],
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  floor: {
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: space["--hit-area-touch-min"],
    height: space["--control-height-md"],
    margin: 0,
    paddingInline: space["--space-5"],
    borderWidth: space["--border-width"],
    borderStyle: "solid",
    borderRadius: space["--radius-md"],
    appearance: "none",
    cursor: "pointer",
  },
  floorIdle: {
    backgroundColor: color["--color-surface-float"],
    borderColor: color["--color-border-subtle"],
    color: color["--color-text-secondary"],
  },
  floorCurrent: {
    backgroundColor: color["--color-action"],
    borderColor: color["--color-action"],
    color: color["--color-text-on-action"],
  },
});

function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function boundsOf(coords: LngLat[]): [LngLat, LngLat] | null {
  if (coords.length === 0) return null;
  let minLng = 180;
  let minLat = 90;
  let maxLng = -180;
  let maxLat = -90;
  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  const padLat = Math.max((maxLat - minLat) * 0.18, 0.00035);
  const padLng = Math.max((maxLng - minLng) * 0.18, 0.00045);
  return [
    [minLng - padLng, minLat - padLat],
    [maxLng + padLng, maxLat + padLat],
  ];
}

function walkCoords(value: unknown, acc: LngLat[]) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    acc.push([value[0], value[1]]);
    return;
  }
  for (const next of value) walkCoords(next, acc);
}

function featureBox(features: GeoJSON.Feature[]): [LngLat, LngLat] | null {
  const coords: LngLat[] = [];
  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry || geometry.type === "GeometryCollection") continue;
    walkCoords(geometry.coordinates, coords);
  }
  return boundsOf(coords);
}

function isKoshuOut(feature: GeoJSON.Feature): boolean {
  const props = feature.properties ?? {};
  if (String(props.floor) !== "2out" || !feature.geometry) return false;
  const box = featureBox([feature]);
  return box !== null && box[1][1] < KOSHU_OUT_NORTH;
}

function maskAround(box: [LngLat, LngLat]): GeoJSON.Feature {
  const [[west, south], [east, north]] = box;
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-180, -85],
          [180, -85],
          [180, 85],
          [-180, 85],
          [-180, -85],
        ],
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
  };
}

function routeCollection(map: RouteMapData, floor: string): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const [index, line] of map.lines.entries()) {
    if (line.floor !== floor) continue;
    features.push({
      type: "Feature",
      properties: { floor: line.floor, index },
      geometry: { type: "LineString", coordinates: line.coordinates },
    });
  }
  return { type: "FeatureCollection", features };
}

function connectorCollection(map: RouteMapData, floor: string): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const [index, row] of map.connectors.entries()) {
    if (row.fromFloor !== floor && row.toFloor !== floor) continue;
    features.push({
      type: "Feature",
      properties: { kind: row.kind, index },
      geometry: { type: "LineString", coordinates: row.coordinates },
    });
  }
  return { type: "FeatureCollection", features };
}

function markCollection(map: RouteMapData, floor: string, currentNodeId: string | null): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const mark of map.marks) {
    const markFloor = mark.floor == null ? "" : mark.floor;
    if (markFloor !== floor) continue;
    if (mark.kind === "turn" || mark.kind === "node") continue;
    features.push({
      type: "Feature",
      properties: {
        kind: mark.kind,
        nodeId: mark.nodeId,
        nameJa: mark.nameJa,
        current: mark.nodeId === currentNodeId ? 1 : 0,
      },
      geometry: { type: "Point", coordinates: [mark.lng, mark.lat] },
    });
  }
  return { type: "FeatureCollection", features };
}

function hereCollection(
  map: RouteMapData,
  floor: string,
  fromNodeId: string | null,
  toNodeId: string | null,
  currentNodeId: string | null,
  between: boolean,
): GeoJSON.FeatureCollection {
  const here = hereLngLat(map, floor, fromNodeId, toNodeId, currentNodeId, between);
  if (!here) return emptyCollection();
  const features: GeoJSON.Feature[] = [];
  features.push({
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: here },
  });
  return { type: "FeatureCollection", features };
}

function setSource(map: MapLibreMap, id: string, data: GeoJSON.FeatureCollection) {
  const source = map.getSource(id);
  if (source && source.type === "geojson") (source as GeoJSONSource).setData(data);
}

function focusCollection(coords: LngLat[]): GeoJSON.FeatureCollection {
  if (coords.length < 2) return emptyCollection();
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: coords },
      },
    ],
  };
}

function addRouteLayers(map: MapLibreMap) {
  map.addSource("route", { type: "geojson", data: emptyCollection() });
  map.addSource("focus", { type: "geojson", data: emptyCollection() });
  map.addSource("connectors", { type: "geojson", data: emptyCollection() });
  map.addSource("marks", { type: "geojson", data: emptyCollection() });
  map.addSource("here", { type: "geojson", data: emptyCollection() });
  map.addLayer({
    id: "route-line",
    type: "line",
    source: "route",
    paint: {
      "line-color": "#2563eb",
      "line-width": 5,
      "line-opacity": 0.55,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  map.addLayer({
    id: "focus-line",
    type: "line",
    source: "focus",
    paint: {
      "line-color": "#2563eb",
      "line-width": 7,
      "line-opacity": 0.98,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  map.addLayer({
    id: "connector-line",
    type: "line",
    source: "connectors",
    paint: {
      "line-color": ["match", ["get", "kind"], "elevator", "#111827", "#7c3aed"],
      "line-width": 3.5,
      "line-dasharray": [1.2, 1.2],
    },
    layout: { "line-cap": "round" },
  });
  map.addLayer({
    id: "marks-circle",
    type: "circle",
    source: "marks",
    paint: {
      "circle-color": [
        "match",
        ["get", "kind"],
        "gate",
        MARK_COLORS.gate,
        "meeting",
        MARK_COLORS.meeting,
        "exit",
        MARK_COLORS.exit,
        "stairs",
        MARK_COLORS.stairs,
        "escalator",
        MARK_COLORS.escalator,
        "elevator",
        MARK_COLORS.elevator,
        MARK_COLORS.turn,
      ],
      "circle-radius": ["case", ["==", ["get", "current"], 1], 7, 5],
      "circle-stroke-width": ["case", ["==", ["get", "current"], 1], 3, 1.5],
      "circle-stroke-color": ["case", ["==", ["get", "current"], 1], "#303d48", "#ffffff"],
    },
  });
  map.addLayer({
    id: "here-circle",
    type: "circle",
    source: "here",
    paint: {
      "circle-color": "#303d48",
      "circle-radius": 6,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });
}

function addIndoorLayers(map: MapLibreMap, indoor: IndoorPack) {
  map.addSource("floors", { type: "geojson", data: indoor.floors });
  map.addSource("spaces", { type: "geojson", data: indoor.spaces });
  map.addSource("drawings", { type: "geojson", data: indoor.drawings });
  map.addLayer({
    id: "floors-fill",
    type: "fill-extrusion",
    source: "floors",
    paint: {
      "fill-extrusion-color": "#bac3cc",
      "fill-extrusion-height": 1.2,
      "fill-extrusion-opacity": 0.85,
    },
  });
  map.addLayer({
    id: "spaces-fill",
    type: "fill-extrusion",
    source: "spaces",
    paint: {
      "fill-extrusion-color": [
        "match",
        ["get", "kind"],
        "shop",
        SPACE_COLORS.shop,
        "stairs",
        SPACE_COLORS.stairs,
        "elevator",
        SPACE_COLORS.elevator,
        "escalator",
        SPACE_COLORS.escalator,
        "restroom",
        SPACE_COLORS.restroom,
        "corridor",
        SPACE_COLORS.corridor,
        "room",
        SPACE_COLORS.room,
        "ramp",
        SPACE_COLORS.ramp,
        "ticket",
        SPACE_COLORS.ticket,
        "waiting",
        SPACE_COLORS.waiting,
        SPACE_COLORS.other,
      ],
      "fill-extrusion-height": 3.2,
      "fill-extrusion-opacity": 0.88,
    },
  });
  map.addLayer({
    id: "drawings-line",
    type: "line",
    source: "drawings",
    paint: { "line-color": "#1f2937", "line-width": 0.8, "line-opacity": 0.85 },
  });
}

function applyFloor(map: MapLibreMap, indoor: IndoorPack | null, floor: string) {
  if (!map.getStyle()) return;
  const onGround = floor === "1F";
  const onKoshu = floor === "2F";
  const showMap = onGround || onKoshu;
  const filter: maplibregl.FilterSpecification = ["==", ["get", "floorLabel"], floor];
  if (map.getLayer("spaces-fill")) map.setFilter("spaces-fill", filter);
  if (map.getLayer("drawings-line")) map.setFilter("drawings-line", filter);
  if (map.getLayer("floors-fill")) {
    map.setFilter("floors-fill", onKoshu ? ["all", filter, ["!=", ["get", "floor"], "2out"]] : filter);
    map.setLayoutProperty("floors-fill", "visibility", onGround ? "none" : "visible");
  }
  if (map.getLayer("basemap")) {
    map.setLayoutProperty("basemap", "visibility", showMap ? "visible" : "none");
  }
  if (!indoor || !map.getSource("mapMask")) return;
  const maskFeats = onGround
    ? [...indoor.floors.features, ...indoor.spaces.features, ...indoor.drawings.features].filter(
        (feature) => feature.properties?.floorLabel === "1F",
      )
    : onKoshu
      ? [...indoor.floors.features, ...indoor.spaces.features].filter(isKoshuOut)
      : [];
  const maskBox = featureBox(maskFeats);
  setSource(map, "mapMask", {
    type: "FeatureCollection",
    features: maskBox ? [maskAround(maskBox)] : [],
  });
  map.setLayoutProperty("map-mask", "visibility", showMap && maskBox ? "visible" : "none");
}

function applyCamera(
  map: MapLibreMap,
  camera: { center: LngLat; zoom: number; bearing: number; pitch: number },
  duration: number,
) {
  if (
    !Number.isFinite(camera.center[0]) ||
    !Number.isFinite(camera.center[1]) ||
    !Number.isFinite(camera.zoom) ||
    !Number.isFinite(camera.bearing) ||
    !Number.isFinite(camera.pitch)
  ) {
    return;
  }
  try {
    map.resize();
    map.easeTo({
      center: camera.center,
      zoom: camera.zoom,
      bearing: camera.bearing,
      pitch: camera.pitch,
      duration,
      essential: true,
    });
  } catch {
    // 壊れた transform のまま例外を上げると地図ごと消える。
  }
}

function fitSegment(
  map: MapLibreMap,
  data: RouteMapData,
  floor: string,
  fromNodeId: string | null,
  toNodeId: string | null,
) {
  if (!map.getStyle()) return;
  const root = map.getContainer();
  const camera = segmentCamera(data, floor, fromNodeId, toNodeId, {
    width: Math.max(root.clientWidth, 1),
    height: Math.max(root.clientHeight, 1),
  });
  if (camera) {
    setSource(map, "focus", emptyCollection());
    const host = root.parentElement;
    if (host instanceof HTMLElement) {
      host.dataset.cameraZoom = camera.zoom.toFixed(2);
      host.dataset.cameraBearing = camera.bearing.toFixed(1);
    }
    applyCamera(map, camera, 480);
    return;
  }
  const mark = data.marks.find((row) => (row.floor ?? "") === floor) ?? data.marks[0];
  if (!mark || !Number.isFinite(mark.lng) || !Number.isFinite(mark.lat)) return;
  applyCamera(map, { center: [mark.lng, mark.lat], zoom: 17.2, bearing: 0, pitch: 50 }, 0);
}

export function RouteMap({
  map: data,
  floor,
  currentNodeId = null,
  fromNodeId = null,
  toNodeId = null,
  hereBetween = false,
  attributionJa,
  onFloorChange,
}: RouteMapProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const indoorRef = useRef<IndoorPack | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const floors = data.floors.filter((label) =>
    CONFIRM_FLOORS.includes(label as (typeof CONFIRM_FLOORS)[number]),
  );
  const shownFloors = floors.length > 0 ? floors : [...CONFIRM_FLOORS];

  useEffect(() => {
    const root = rootRef.current;
    if (!root || mapRef.current) return;
    const map = new maplibregl.Map({
      container: root,
      style: {
        version: 8,
        sources: {
          basemap: {
            type: "raster",
            tiles: ["https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "",
            bounds: [139.694, 35.685, 139.708, 35.698],
          },
          mapMask: { type: "geojson", data: emptyCollection() },
        },
        layers: [
          { id: "background", type: "background", paint: { "background-color": "#dfe3e8" } },
          {
            id: "basemap",
            type: "raster",
            source: "basemap",
            layout: { visibility: "none" },
            paint: { "raster-opacity": 0.45 },
          },
          {
            id: "map-mask",
            type: "fill",
            source: "mapMask",
            layout: { visibility: "none" },
            paint: { "fill-color": "#dfe3e8" },
          },
        ],
      },
      center: [139.7002, 35.6909],
      zoom: 17.8,
      pitch: 50,
      bearing: 0,
      maxPitch: 70,
      attributionControl: false,
    });
    mapRef.current = map;
    let cancelled = false;

    const onError = () => {
      // MapLibre の error を握りつぶし、キャンバスは残す。
    };
    map.on("error", onError);
    map.on("load", () => {
      void (async () => {
        try {
          const indoor = (await fetch("/map/indoor.json").then((res) => {
            if (!res.ok) throw new Error("indoor missing");
            return res.json();
          })) as IndoorPack;
          if (cancelled || !map.getStyle()) return;
          indoorRef.current = indoor;
          addIndoorLayers(map, indoor);
        } catch {
          if (cancelled) return;
          indoorRef.current = null;
        }
        if (cancelled || !map.getStyle()) return;
        try {
          if (!map.getSource("route")) addRouteLayers(map);
          const current = dataRef.current;
          setSource(map, "route", routeCollection(current, floor));
          setSource(map, "connectors", connectorCollection(current, floor));
          setSource(map, "marks", markCollection(current, floor, currentNodeId));
          setSource(map, "here", hereCollection(current, floor, fromNodeId, toNodeId, currentNodeId, hereBetween));
          applyFloor(map, indoorRef.current, floor);
          map.resize();
          fitSegment(map, current, floor, fromNodeId, toNodeId);
        } catch {
          // レイヤ追加の失敗で unmount しない。
        }
      })();
    });

    const observer = new ResizeObserver(() => {
      if (cancelled || !map.getStyle()) return;
      try {
        map.resize();
      } catch {
        // 破棄直後の resize は無視。
      }
    });
    observer.observe(root);

    return () => {
      cancelled = true;
      observer.disconnect();
      map.off("error", onError);
      try {
        map.remove();
      } catch {
        // 二重 remove しない。
      }
      if (mapRef.current === map) mapRef.current = null;
    };
    // 地図インスタンスはマウント時だけ。階と経路の更新は下の effect。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pathKey = `${data.floors.join("|")}:${data.lines.length}:${data.marks.length}:${data.points?.length ?? 0}`;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getStyle() || !map.isStyleLoaded()) return;
    const current = dataRef.current;
    try {
      setSource(map, "route", routeCollection(current, floor));
      setSource(map, "connectors", connectorCollection(current, floor));
      setSource(map, "marks", markCollection(current, floor, currentNodeId));
      setSource(map, "here", hereCollection(current, floor, fromNodeId, toNodeId, currentNodeId, hereBetween));
      applyFloor(map, indoorRef.current, floor);
      fitSegment(map, current, floor, fromNodeId, toNodeId);
    } catch {
      // 手順切り替えで例外が出ても地図は残す。
    }
  }, [floor, pathKey, currentNodeId, fromNodeId, toNodeId, hereBetween]);

  return (
    <div className={stylexClassName(styles.root)}>
      <div ref={rootRef} className={stylexClassName(styles.canvas)} aria-label="経路" />
      {shownFloors.length > 1 ? (
        <ul className={stylexClassName(styles.floors)}>
          {shownFloors.map((label) => (
            <li key={label}>
              <button
                type="button"
                aria-pressed={label === floor}
                className={stylexClassName(
                  type["UI/Caption/Bold"],
                  styles.floor,
                  label === floor ? styles.floorCurrent : styles.floorIdle,
                )}
                onClick={() => onFloorChange?.(label)}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
