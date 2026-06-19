const MAX_SELECTION_AREA_KM2 = 5;
const OVERPASS_TIMEOUT_MS = Number(process.env.OVERPASS_TIMEOUT_MS) || 30000;
const DEFAULT_OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

async function fetchOsmBuildings(selectionGeometry) {
  const polygon = normalizeSelectionPolygon(selectionGeometry);
  const areaKm2 = polygonAreaKm2(polygon);
  if (areaKm2 <= 0) {
    throw new Error("invalid_osm_selection_area");
  }
  if (areaKm2 > MAX_SELECTION_AREA_KM2) {
    throw new Error("osm_selection_area_too_large");
  }

  const payload = await queryOverpass(buildOverpassQuery(polygon));
  return {
    areaKm2,
    geojson: overpassToFeatureCollection(payload)
  };
}

async function queryOverpass(query) {
  const failures = [];
  for (const endpoint of overpassEndpoints()) {
    try {
      const payload = await queryOverpassEndpoint(endpoint, query);
      return payload;
    } catch (error) {
      failures.push(`${endpoint}: ${error.message}`);
    }
  }

  const error = new Error("overpass_request_failed");
  error.details = failures.join(" | ").slice(0, 900);
  throw error;
}

async function queryOverpassEndpoint(endpoint, query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "G2M-GemsMissionMonitor/1.0"
      },
      body: new URLSearchParams({ data: query }).toString(),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} ${response.statusText || ""} ${text.slice(0, 260)}`.trim());
    }

    return response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`timeout ${OVERPASS_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function overpassEndpoints() {
  const configured = process.env.OVERPASS_API_URLS || process.env.OVERPASS_API_URL || "";
  const urls = configured
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  return urls.length ? urls : DEFAULT_OVERPASS_URLS;
}

function buildOverpassQuery(polygon) {
  const poly = polygon
    .slice(0, -1)
    .map(([lng, lat]) => `${lat} ${lng}`)
    .join(" ");

  return `
    [out:json][timeout:25];
    (
      way["building"](poly:"${poly}");
      relation["building"](poly:"${poly}");
    );
    out tags geom;
  `;
}

function overpassToFeatureCollection(payload) {
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  const features = elements
    .map(overpassElementToFeature)
    .filter(Boolean);

  return {
    type: "FeatureCollection",
    features
  };
}

function overpassElementToFeature(element) {
  if (element.type === "way") {
    const ring = geometryToRing(element.geometry);
    if (!ring) {
      return null;
    }
    return {
      type: "Feature",
      properties: osmProperties(element),
      geometry: {
        type: "Polygon",
        coordinates: [ring]
      }
    };
  }

  if (element.type === "relation") {
    const rings = Array.isArray(element.members)
      ? element.members
        .filter((member) => member.role === "outer" && Array.isArray(member.geometry))
        .map((member) => geometryToRing(member.geometry))
        .filter(Boolean)
      : [];
    if (!rings.length) {
      return null;
    }
    return {
      type: "Feature",
      properties: osmProperties(element),
      geometry: {
        type: "MultiPolygon",
        coordinates: rings.map((ring) => [ring])
      }
    };
  }

  return null;
}

function osmProperties(element) {
  const tags = element.tags || {};
  return {
    ...tags,
    source: "osm",
    source_reference: `${element.type}/${element.id}`,
    building_code: tags.ref || tags.name || `OSM-${element.type}-${element.id}`,
    osm_type: element.type,
    osm_id: element.id
  };
}

function geometryToRing(geometry) {
  if (!Array.isArray(geometry) || geometry.length < 3) {
    return null;
  }
  const ring = geometry.map((point) => [Number(point.lon), Number(point.lat)]);
  if (ring.some(([lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat))) {
    return null;
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([...first]);
  }
  return ring.length >= 4 ? ring : null;
}

function normalizeSelectionPolygon(geometry) {
  if (!geometry || geometry.type !== "Polygon" || !Array.isArray(geometry.coordinates?.[0])) {
    throw new Error("invalid_osm_selection");
  }
  const ring = geometry.coordinates[0].map((point) => [Number(point[0]), Number(point[1])]);
  if (ring.length < 4 || ring.some(([lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat))) {
    throw new Error("invalid_osm_selection");
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([...first]);
  }
  return ring;
}

function polygonAreaKm2(ring) {
  if (!Array.isArray(ring) || ring.length < 4) {
    return 0;
  }
  const meanLat = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos(meanLat * Math.PI / 180);
  const projected = ring.map(([lng, lat]) => [lng * metersPerDegreeLng, lat * metersPerDegreeLat]);
  let area = 0;
  for (let index = 0; index < projected.length - 1; index += 1) {
    area += projected[index][0] * projected[index + 1][1] - projected[index + 1][0] * projected[index][1];
  }
  return Math.abs(area) / 2 / 1_000_000;
}

module.exports = {
  MAX_SELECTION_AREA_KM2,
  fetchOsmBuildings,
  normalizeSelectionPolygon,
  overpassEndpoints,
  polygonAreaKm2,
  overpassToFeatureCollection
};
