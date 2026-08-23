const FLOOR_ORDER = ["B3F", "B2F", "B1F", "1F", "2F", "3F", "4F"];
const FLOOR_STEP_M = 14;
const SCENE_ORIGIN = { lng: 139.7, lat: 35.69 };

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
};

const MARK_COLORS = {
  gate: 0xdc2626,
  meeting: 0x16a34a,
  exit: 0xea580c,
  turn: 0x6b7280,
  stairs: 0x7c3aed,
  escalator: 0x7c3aed,
  elevator: 0x111827,
  node: 0x6b7280,
};

// Space は「部屋の中の階段」のように意図的に重なる。
// 同じ高さで描くと深度が競合するため、意味の細かい設備ほど少し上へ置く。
const SPACE_KIND_LIFT_M = {
  other: 0,
  room: 0.01,
  corridor: 0.02,
  shop: 0.035,
  waiting: 0.04,
  ticket: 0.05,
  restroom: 0.06,
  ramp: 0.07,
  stairs: 0.08,
  escalator: 0.09,
  elevator: 0.1,
};

function floorLabel(value) {
  if (!value) return "";
  if (String(value).endsWith("F")) return String(value);
  if (value === "0" || value === "1") return "1F";
  return `${value}F`;
}

function floorIndex(value) {
  const index = FLOOR_ORDER.indexOf(floorLabel(value));
  return index < 0 ? 0 : index;
}

function altitudeOf(floor, originFloorIndex) {
  return (floorIndex(floor) - originFloorIndex) * FLOOR_STEP_M;
}

function addHeightProperties(collection, originFloorIndex, thicknessM, offsetM = 0) {
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) => {
      const label = floorLabel(feature.properties.floor);
      const base = altitudeOf(label, originFloorIndex) + offsetM;
      return {
        ...feature,
        properties: {
          ...feature.properties,
          floorLabel: label,
          base,
          top: base + thicknessM,
        },
      };
    }),
  };
}

function addSpaceHeightProperties(collection, originFloorIndex) {
  const result = addHeightProperties(collection, originFloorIndex, 0.05, 0.03);
  return {
    ...result,
    features: result.features.map((feature) => {
      const lift = SPACE_KIND_LIFT_M[feature.properties.kind] ?? 0;
      return {
        ...feature,
        properties: {
          ...feature.properties,
          base: feature.properties.base + lift,
          top: feature.properties.top + lift,
        },
      };
    }),
  };
}

const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#dfe3e8" },
      },
    ],
  },
  center: [139.7002, 35.6909],
  zoom: 16.4,
  pitch: 62,
  bearing: -28,
  maxPitch: 70,
  canvasContextAttributes: { antialias: true },
});

map.on("load", async () => {
  const [floorsRaw, spacesRaw, linksRaw, routes, ends, connectors, nodeDistances, meta] = await Promise.all([
    fetch("./out/floors.geojson").then((response) => response.json()),
    fetch("./out/spaces.geojson").then((response) => response.json()),
    fetch("./out/links.geojson").then((response) => response.json()),
    fetch("./out/routes.geojson").then((response) => response.json()),
    fetch("./out/route-ends.geojson").then((response) => response.json()),
    fetch("./out/connectors.geojson").then((response) => response.json()),
    fetch("./out/node-distances.json").then((response) => response.json()),
    fetch("./out/path-meta.json").then((response) => response.json()),
  ]);

  const availableFloors = meta.floors ?? ["B1F"];
  const originFloorIndex = Math.min(...availableFloors.map(floorIndex));
  const floors = addHeightProperties(floorsRaw, originFloorIndex, 0.25, -0.25);
  const spaces = addSpaceHeightProperties(spacesRaw, originFloorIndex);

  document.getElementById("title").textContent =
    `垂直 ${availableFloors.join(" · ")}。面は国交省 Shapefile。確認用。`;

  map.addSource("floors", { type: "geojson", data: floors });
  map.addSource("spaces", { type: "geojson", data: spaces });
  map.addSource("links", { type: "geojson", data: linksRaw });

  map.addLayer({
    id: "floor-slabs",
    type: "fill-extrusion",
    source: "floors",
    paint: {
      "fill-extrusion-color": [
        "match",
        ["get", "floorLabel"],
        "B1F",
        "#8593a3",
        "1F",
        "#bac3cc",
        "2F",
        "#ced5dc",
        "#aab4bf",
      ],
      "fill-extrusion-base": ["get", "base"],
      "fill-extrusion-height": ["get", "top"],
      // 半透明の同一階ポリゴンは深度順が競合してちらつくため、不透明にする。
      "fill-extrusion-opacity": 1,
      "fill-extrusion-vertical-gradient": false,
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
      "fill-extrusion-base": ["get", "base"],
      "fill-extrusion-height": ["get", "top"],
      "fill-extrusion-opacity": 1,
      "fill-extrusion-vertical-gradient": false,
    },
  });

  map.addLayer({
    id: "links-line",
    type: "line",
    source: "links",
    layout: { visibility: "none" },
    paint: { "line-color": "#7b8794", "line-width": 1.2, "line-opacity": 0.7 },
  });

  const sceneOriginMercator = maplibregl.MercatorCoordinate.fromLngLat(SCENE_ORIGIN, 0);
  const mercatorUnitsPerMeter = sceneOriginMercator.meterInMercatorCoordinateUnits();
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const pathGroup = new THREE.Group();
  const materials = new Map();
  let renderer = null;

  scene.add(pathGroup);

  function material(color) {
    let value = materials.get(color);
    if (!value) {
      value = new THREE.MeshBasicMaterial({ color });
      materials.set(color, value);
    }
    return value;
  }

  function localPoint(lng, lat, altitudeM) {
    const point = maplibregl.MercatorCoordinate.fromLngLat({ lng, lat }, 0);
    return new THREE.Vector3(
      (point.x - sceneOriginMercator.x) / mercatorUnitsPerMeter,
      (sceneOriginMercator.y - point.y) / mercatorUnitsPerMeter,
      altitudeM,
    );
  }

  const cylinderUp = new THREE.Vector3(0, 1, 0);

  function addSegment(start, end, color, radiusM) {
    const direction = end.clone().sub(start);
    const length = direction.length();
    if (length < 0.05) return;

    const geometry = new THREE.CylinderGeometry(radiusM, radiusM, length, 8, 1, false);
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(cylinderUp, direction.normalize());
    pathGroup.add(mesh);
  }

  function addJoint(point, color, radiusM) {
    const geometry = new THREE.SphereGeometry(radiusM, 12, 8);
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.position.copy(point);
    pathGroup.add(mesh);
  }

  function addPolyline(coordinates, altitudes, color, radiusM) {
    const points = coordinates.map((coordinate, index) =>
      localPoint(coordinate[0], coordinate[1], altitudes[index] ?? altitudes[0]),
    );
    for (let index = 1; index < points.length; index += 1) {
      addSegment(points[index - 1], points[index], color, radiusM);
    }
    for (const point of points) addJoint(point, color, radiusM * 1.05);
  }

  function clearPath() {
    while (pathGroup.children.length > 0) {
      const object = pathGroup.children[0];
      pathGroup.remove(object);
      object.geometry?.dispose();
    }
  }

  function rebuildPath(selectedFloors, visible) {
    clearPath();
    if (!visible) {
      map.triggerRepaint();
      return;
    }

    for (const feature of routes.features) {
      const floor = floorLabel(feature.properties.floor);
      if (!selectedFloors.includes(floor)) continue;
      const altitude = altitudeOf(floor, originFloorIndex) + 1.45;
      const altitudes = feature.geometry.coordinates.map(() => altitude);
      addPolyline(feature.geometry.coordinates, altitudes, 0x2563eb, 0.42);
    }

    for (const feature of connectors.features) {
      const fromFloor = floorLabel(feature.properties.fromFloor);
      const toFloor = floorLabel(feature.properties.toFloor);
      if (!selectedFloors.includes(fromFloor) || !selectedFloors.includes(toFloor)) continue;
      const [start, end] = feature.geometry.coordinates;
      const startAltitude = altitudeOf(fromFloor, originFloorIndex) + 1.45;
      const endAltitude = altitudeOf(toFloor, originFloorIndex) + 1.45;
      const color = feature.properties.kind === "elevator" ? 0x111827 : 0x7c3aed;
      addPolyline([start, end], [startAltitude, endAltitude], color, 0.34);
      // 階移動は、手前と着地の両方を Path の切れ目として示す。
      addJoint(localPoint(start[0], start[1], startAltitude), color, 1.05);
      addJoint(localPoint(end[0], end[1], endAltitude), color, 1.05);
    }

    for (const feature of ends.features) {
      const floor = floorLabel(feature.properties.floor);
      if (!selectedFloors.includes(floor)) continue;
      if (["stairs", "escalator", "elevator"].includes(feature.properties.kind)) continue;
      const [lng, lat] = feature.geometry.coordinates;
      const altitude = altitudeOf(floor, originFloorIndex) + 1.9;
      const color = MARK_COLORS[feature.properties.kind] ?? MARK_COLORS.node;
      const radius = feature.properties.kind === "turn" ? 0.9 : 1.25;
      addJoint(localPoint(lng, lat, altitude), color, radius);
    }

    map.triggerRepaint();
  }

  map.addLayer({
    id: "path-3d",
    type: "custom",
    renderingMode: "3d",
    onAdd(_map, gl) {
      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;
    },
    render(_gl, matrix) {
      const projection = matrix?.defaultProjectionData?.mainMatrix ?? matrix;
      const projectionMatrix = new THREE.Matrix4().fromArray(projection);
      const modelMatrix = new THREE.Matrix4()
        .makeTranslation(sceneOriginMercator.x, sceneOriginMercator.y, sceneOriginMercator.z)
        .scale(
          new THREE.Vector3(
            mercatorUnitsPerMeter,
            -mercatorUnitsPerMeter,
            mercatorUnitsPerMeter,
          ),
        );
      camera.projectionMatrix.copy(projectionMatrix).multiply(modelMatrix);
      renderer.resetState();
      renderer.render(scene, camera);
    },
  });

  const floorBox = document.getElementById("floors");
  const floorInputs = availableFloors.map((floor, index) => {
    const id = `floor-${index}`;
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox" id="${id}" checked /> ${floor}`;
    floorBox.appendChild(label);
    return [id, floor];
  });

  function setVisible(id, visible) {
    map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }

  function renderNodeDistances(selectedFloors, visible) {
    const panel = document.getElementById("distances");
    const list = document.getElementById("distance-list");
    panel.hidden = !visible;
    list.replaceChildren();
    if (!visible) return;

    for (const item of nodeDistances) {
      if (!selectedFloors.includes(item.fromFloor) || !selectedFloors.includes(item.toFloor)) continue;
      const row = document.createElement("li");
      const floors =
        item.fromFloor === item.toFloor ? item.fromFloor : `${item.fromFloor}→${item.toFloor}`;
      row.append(document.createTextNode(`${floors}　${item.from} → ${item.to}　`));
      const distance = document.createElement("strong");
      distance.textContent = `${item.distanceM}m`;
      row.append(distance);
      list.append(row);
    }
  }

  function apply() {
    const selectedFloors = floorInputs
      .filter(([id]) => document.getElementById(id).checked)
      .map(([, floor]) => floor);
    const pathVisible = document.getElementById("who-jr").checked && selectedFloors.length > 0;
    const networkVisible = document.getElementById("net").checked;
    const surfacesVisible = document.getElementById("face").checked;
    const floorFilter = ["in", ["get", "floorLabel"], ["literal", selectedFloors]];

    map.setFilter("floor-slabs", floorFilter);
    map.setFilter("spaces-fill", floorFilter);
    setVisible("floor-slabs", surfacesVisible);
    setVisible("spaces-fill", surfacesVisible);
    setVisible("links-line", networkVisible);
    rebuildPath(selectedFloors, pathVisible);
    renderNodeDistances(selectedFloors, pathVisible);

    document.getElementById("legend-route").hidden = !pathVisible;
    document.getElementById("legend-net").hidden = !networkVisible;
    document.getElementById("legend-face").hidden = !surfacesVisible;
  }

  document.getElementById("who-jr").onchange = apply;
  document.getElementById("net").onchange = apply;
  document.getElementById("face").onchange = apply;
  for (const [id] of floorInputs) document.getElementById(id).onchange = apply;
  apply();
});
