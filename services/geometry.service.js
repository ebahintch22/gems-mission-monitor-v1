function parseKoboGps(value) {
  if (Array.isArray(value) && value.length >= 2) {
    return buildPoint(value[0], value[1], value[2], value[3], "kobo_gps_array");
  }
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return invalidGeometry("gps_missing_coordinates", value);
  }
  return buildPoint(parts[0], parts[1], parts[2], parts[3], "kobo_gps");
}

function parseWktPoint(value) {
  const match = String(value || "").trim().match(/^POINT\s*\(\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*\)$/i);
  if (!match) {
    return invalidGeometry("invalid_wkt_point", value);
  }
  return buildPoint(match[2], match[1], null, null, "wkt_point");
}

function parseWktPolygon(value) {
  const source = String(value || "").trim();
  if (!source) {
    return invalidGeometry("polygon_missing_coordinates", value);
  }
  const normalized = source
    .replace(/^POLYGON\s*\(\(?/i, "")
    .replace(/\)?\)$/i, "")
    .replaceAll(",", ";");
  const points = normalized
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const coords = part.split(/\s+/).filter(Boolean);
      if (coords.length < 2) {
        return null;
      }
      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
    });
  if (points.length < 3 || points.some((point) => !point)) {
    return invalidGeometry("invalid_wkt_polygon", value);
  }
  const ring = closeRing(points);
  return {
    ok: true,
    type: "polygon",
    source: "wkt_polygon",
    points: ring,
    geojson: {
      type: "Polygon",
      coordinates: [ring.map((point) => [point.lon, point.lat])]
    }
  };
}

function parseKoboPolygon(value) {
  const source = String(value || "").trim();
  if (!source) {
    return invalidGeometry("polygon_missing_coordinates", value);
  }
  const points = source
    .split(";")
    .map((part) => parseKoboGps(part.trim()))
    .filter((result) => result.ok)
    .map((result) => result.point);
  if (points.length < 3) {
    return invalidGeometry("invalid_kobo_polygon", value);
  }
  const ring = closeRing(points);
  return {
    ok: true,
    type: "polygon",
    source: "kobo_polygon",
    points: ring,
    geojson: {
      type: "Polygon",
      coordinates: [ring.map((point) => [point.lon, point.lat])]
    }
  };
}

function parseGeometry(value, type = "gps") {
  if (type === "wktPoint") {
    return parseWktPoint(value);
  }
  if (type === "wktPolygon") {
    return String(value || "").trim().toUpperCase().startsWith("POLYGON")
      ? parseWktPolygon(value)
      : parseKoboPolygon(value);
  }
  return parseKoboGps(value);
}

function detectLongitudeSignIssue(points) {
  const longitudes = points
    .map((point) => Number(point?.lon))
    .filter(Number.isFinite);
  if (longitudes.length < 2) {
    return false;
  }
  const negative = longitudes.filter((lon) => lon < 0).length;
  const positive = longitudes.filter((lon) => lon > 0).length;
  return negative > 0 && positive > 0 && Math.min(negative, positive) === 1;
}

function buildPoint(latValue, lonValue, altitudeValue, precisionValue, source) {
  const lat = Number(latValue);
  const lon = Number(lonValue);
  const altitude = Number(altitudeValue);
  const precision = Number(precisionValue);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return invalidGeometry("invalid_point_coordinates", `${latValue} ${lonValue}`);
  }
  return {
    ok: true,
    type: "point",
    source,
    point: {
      lat,
      lon,
      altitude: Number.isFinite(altitude) ? altitude : null,
      precision: Number.isFinite(precision) ? precision : null
    },
    points: [{ lat, lon }],
    geojson: { type: "Point", coordinates: [lon, lat] }
  };
}

function closeRing(points) {
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && first.lat === last.lat && first.lon === last.lon) {
    return points;
  }
  return [...points, { ...first }];
}

function invalidGeometry(code, value) {
  return { ok: false, code, value };
}

module.exports = {
  detectLongitudeSignIssue,
  parseGeometry,
  parseKoboGps,
  parseKoboPolygon,
  parseWktPoint,
  parseWktPolygon
};
