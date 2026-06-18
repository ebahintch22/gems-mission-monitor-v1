const BBOX_CI = [-8.7, 4, -2.4, 10.8];
const MAX_DISTANCE_KM = 5;
const MIN_POLYGON_AREA_KM2 = 0.001;
const MAX_POLYGON_AREA_KM2 = 300;
const DEG_TOLERANCE = 1e-6;

const knownGpsFields = {
  "_geolocation": { geometryType: "Point", format: "Tableau [latitude, longitude]", crs: "WGS84 implicite" },
  "modA/gps_site": { geometryType: "Point", format: "Kobo geopoint: lat lon alt precision", crs: "WGS84 implicite" },
  "modA/gps_centre": { geometryType: "Point", format: "Kobo geopoint: lat lon alt precision", crs: "WGS84 implicite" },
  "modA/gps_manuel": { geometryType: "Coordonnées texte", format: "Texte libre", crs: "WGS84 supposé" },
  "modB/emprise_site": { geometryType: "Polygone", format: "Kobo geoshape: lat lon alt precision;...", crs: "WGS84 implicite" },
  "modB/emprise_site_manuel": { geometryType: "Coordonnées texte", format: "Texte libre", crs: "WGS84 supposé" },
  "batiment/batiment/coins_bat": { geometryType: "Polygone", format: "Kobo geoshape dans groupe répétitif", crs: "WGS84 implicite" },
  "batiment/batiment/coins_bat_coords": { geometryType: "Point", format: "Coordonnées textuelles", crs: "WGS84 supposé" },
  "modE/pylone_rep/modE/pylone_rep/gps_pylone": { geometryType: "Point", format: "Kobo geopoint dans groupe répétitif", crs: "WGS84 implicite" },
  "modE/pylone_rep/modE/pylone_rep/gps_pylone_coords": { geometryType: "Point", format: "Coordonnées textuelles", crs: "WGS84 supposé" },
  "modE/pylone_rep/modE/pylone_rep/gps_pylone_manuel": { geometryType: "Point", format: "Coordonnées textuelles", crs: "WGS84 supposé" },
  "modH/gps_raccord": { geometryType: "Point", format: "Kobo geopoint: lat lon alt precision", crs: "WGS84 implicite" },
  "modH/gps_raccord_coords": { geometryType: "Point", format: "Coordonnées textuelles", crs: "WGS84 supposé" },
  "modH/gps_raccord_manuel": { geometryType: "Coordonnées texte", format: "Texte libre", crs: "WGS84 supposé" }
};

const gpsFieldHints = /(gps|geo|lat|lon|coord|emprise|pylone|raccord)/i;
const ignoredFieldHints = /(nb_pylones|pylone$|ligne_vue|superficie|population|utilisateurs|surface)/i;

function buildSubmissionDiagnostic(submission, axis = "geometric") {
  if (axis !== "geometric") {
    return buildUnsupportedDiagnostic(submission, axis);
  }
  return buildGeometricDiagnostic(submission);
}

function buildUnsupportedDiagnostic(submission, axis) {
  return {
    axis,
    title: "Diagnostic non disponible",
    subtitle: displaySubmission(submission),
    quality: "Non évalué",
    summary: [{ label: "Axe demandé", value: axis }],
    sections: [{
      title: "Module à implémenter",
      description: "Cet axe de diagnostic est prévu dans l’architecture, mais il n’est pas encore disponible dans cette version.",
      items: []
    }],
    errors: []
  };
}

function buildGeometricDiagnostic(submission) {
  const raw = parseRawData(submission.raw_data_json);
  const flat = flatten(raw);
  const fieldRows = collectGpsFields(flat);
  const geometries = fieldRows.flatMap((field) => parseGeometryField(field));
  const issues = [];

  geometries.forEach((geometry) => {
    issues.push(...validateGeometry(geometry));
  });
  issues.push(...validateSubmissionDistances(geometries));
  if (!geometries.length) {
    issues.push({
      severity: "error",
      field: "-",
      rule: "Absence de géométrie",
      message: "Aucune donnée GPS exploitable n’a été détectée pour cette soumission.",
      suggestion: "Vérifier la présence des champs GPS dans la soumission Kobo."
    });
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const quality = errorCount > 0 ? "Mauvais" : warningCount > 0 ? "Moyen" : "Bon";

  return {
    axis: "geometric",
    title: "Diagnostic de conformité géométrique / spatiale",
    subtitle: displaySubmission(submission),
    quality,
    map: buildDiagnosticMap(geometries),
    summary: [
      { label: "Soumission", value: displaySubmission(submission) },
      { label: "Champs GPS détectés", value: fieldRows.length },
      { label: "Géométries exploitables", value: geometries.length },
      { label: "Anomalies bloquantes", value: errorCount },
      { label: "Alertes", value: warningCount }
    ],
    sections: [
      {
        title: "Inventaire des champs GPS",
        description: "Champs contenant des coordonnées, géométries Kobo ou valeurs textuelles assimilables.",
        items: fieldRows.map((field) => ({
          field: field.path,
          type: field.definition.geometryType,
          format: field.definition.format,
          crs: field.definition.crs,
          filled: isFilled(field.value) ? "Oui" : "Non"
        }))
      },
      {
        title: "Géométries interprétées",
        description: "Géométries extraites et utilisables pour les contrôles spatiaux.",
        items: geometries.map((geometry) => ({
          field: geometry.field,
          type: geometry.type,
          points: geometry.points.length,
          precision: maxPrecision(geometry.points) || "-"
        }))
      }
    ],
    errors: issues
  };
}

function buildDiagnosticMap(geometries) {
  const features = geometries
    .map((geometry) => geometryToFeature(geometry))
    .filter(Boolean);
  const allPoints = geometries.flatMap((geometry) => geometry.points);
  if (!features.length || !allPoints.length) {
    return null;
  }
  return {
    center: {
      latitude: allPoints.reduce((sum, point) => sum + point.lat, 0) / allPoints.length,
      longitude: allPoints.reduce((sum, point) => sum + point.lon, 0) / allPoints.length
    },
    featureCollection: {
      type: "FeatureCollection",
      features
    }
  };
}

function geometryToFeature(geometry) {
  const coordinates = geometry.points.map((point) => [point.lon, point.lat]);
  if (geometry.type === "point" && coordinates.length) {
    return {
      type: "Feature",
      properties: { field: geometry.field, geometryType: geometry.type },
      geometry: { type: "Point", coordinates: coordinates[0] }
    };
  }
  if (geometry.type === "line" && coordinates.length >= 2) {
    return {
      type: "Feature",
      properties: { field: geometry.field, geometryType: geometry.type },
      geometry: { type: "LineString", coordinates }
    };
  }
  if (geometry.type === "polygon" && coordinates.length >= 3) {
    const ring = sameCoordinatePair(coordinates[0], coordinates[coordinates.length - 1])
      ? coordinates
      : [...coordinates, coordinates[0]];
    return {
      type: "Feature",
      properties: { field: geometry.field, geometryType: geometry.type },
      geometry: { type: "Polygon", coordinates: [ring] }
    };
  }
  return null;
}

function parseRawData(rawDataJson) {
  if (!rawDataJson) return {};
  try {
    return JSON.parse(rawDataJson);
  } catch {
    return {};
  }
}

function displaySubmission(submission) {
  const raw = parseRawData(submission.raw_data_json);
  return [
    raw["modB/nom_officiel"],
    submission.display_submission_id,
    submission.source_submission_id,
    submission.id ? `#${submission.id}` : null
  ].filter(Boolean)[0] || "Soumission";
}

function flatten(row, prefix = "") {
  const out = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    const fullKey = prefix ? `${prefix}/${key}` : key;
    if (Array.isArray(value)) {
      out[fullKey] = value;
      value.forEach((item, index) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          Object.assign(out, flatten(item, `${fullKey}[${index}]`));
          Object.assign(out, flatten(item, fullKey));
        }
      });
    } else if (value && typeof value === "object") {
      Object.assign(out, flatten(value, fullKey));
    } else {
      out[fullKey] = value;
    }
  });
  return out;
}

function collectGpsFields(flat) {
  const paths = new Set([
    ...Object.keys(knownGpsFields),
    ...Object.keys(flat).filter((path) => gpsFieldHints.test(path) && !ignoredFieldHints.test(path))
  ]);

  return [...paths]
    .filter((path) => Object.prototype.hasOwnProperty.call(flat, path) || knownGpsFields[path])
    .map((path) => ({
      path,
      value: flat[path],
      definition: knownGpsFields[path] || {
        geometryType: inferGeometryType(path),
        format: "Champ détecté par nom",
        crs: "WGS84 supposé"
      }
    }))
    .filter((field) => isFilled(field.value));
}

function inferGeometryType(path) {
  if (/emprise|shape|polygon|coins/i.test(path)) return "Polygone";
  if (/line|trace|raccord/i.test(path)) return "Ligne ou point";
  return "Point";
}

function isFilled(value) {
  return value !== null && value !== undefined && !(typeof value === "string" && value.trim() === "");
}

function parseGeometryField(field) {
  const typeHint = field.definition.geometryType.toLowerCase();
  if (typeHint.includes("polygone")) {
    const points = parseKoboShape(field.value);
    return points.length ? [{ field: field.path, type: "polygon", points }] : [];
  }
  if (typeHint.includes("texte")) {
    const points = parseTextCoordinates(field.value);
    if (!points.length) return [];
    return [{
      field: field.path,
      type: points.length >= 4 && samePoint(points[0], points[points.length - 1]) ? "polygon" : points.length > 1 ? "line" : "point",
      points
    }];
  }
  const point = parseKoboPoint(field.value);
  return point ? [{ field: field.path, type: "point", points: [point] }] : [];
}

function parseKoboPoint(value) {
  if (!isFilled(value)) return null;
  if (Array.isArray(value) && value.length >= 2) {
    const lat = Number(value[0]);
    const lon = Number(value[1]);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon, precision: null } : null;
  }
  const parts = String(value).trim().split(/[ ,]+/).map(Number).filter(Number.isFinite);
  if (parts.length < 2) return null;
  return { lat: parts[0], lon: parts[1], precision: parts.length >= 4 ? parts[3] : null };
}

function parseKoboShape(value) {
  if (!isFilled(value)) return [];
  return String(value)
    .split(";")
    .map((part) => parseKoboPoint(part))
    .filter(Boolean);
}

function parseTextCoordinates(value) {
  if (!isFilled(value)) return [];
  const matches = String(value).match(/-?\d+(?:[.,]\d+)?[\s,]+-?\d+(?:[.,]\d+)?/g) || [];
  return matches.map((match) => {
    const parts = match.trim().split(/[\s,]+/).map((part) => Number(String(part).replace(",", ".")));
    if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
    const first = parts[0];
    const second = parts[1];
    return Math.abs(first) <= 10 && Math.abs(second) <= 10
      ? { lat: second, lon: first, precision: null }
      : { lat: first, lon: second, precision: null };
  }).filter(Boolean);
}

function validateGeometry(geometry) {
  const issues = [];
  geometry.points.forEach((point, index) => {
    if (!inLonLatBounds(point)) {
      issues.push(issue("error", geometry.field, "Coordonnées hors bornes", `Point ${index + 1} hors bornes longitude/latitude.`, "Vérifier l’ordre latitude/longitude et la saisie GPS."));
    } else if (!insideBbox(point, BBOX_CI)) {
      issues.push(issue("warning", geometry.field, "Hors zone d’étude", `Point ${index + 1} en dehors de l’emprise Côte d’Ivoire paramétrée.`, "Confirmer la localisation ou corriger la coordonnée."));
    }
    if (Number(point.precision) > 100) {
      issues.push(issue("warning", geometry.field, "Précision GPS faible", `Précision déclarée : ${point.precision} m.`, "Refaire le relevé si possible avec un signal GPS stabilisé."));
    }
  });

  if (geometry.type === "polygon") {
    issues.push(...validatePolygon(geometry));
  }
  if (geometry.type === "line" || geometry.type === "polygon") {
    geometry.points.slice(1).forEach((point, index) => {
      if (samePoint(point, geometry.points[index])) {
        issues.push(issue("warning", geometry.field, "Point dupliqué consécutif", `Points ${index + 1} et ${index + 2} identiques.`, "Supprimer le doublon si ce n’est pas une fermeture de polygone."));
      }
      if (distanceMeters(point, geometry.points[index]) < 0.1) {
        issues.push(issue("warning", geometry.field, "Micro-segment", `Segment ${index + 1}-${index + 2} inférieur à 0,1 m.`, "Vérifier s’il s’agit d’une erreur de mesure."));
      }
    });
  }
  return issues;
}

function validatePolygon(geometry) {
  const issues = [];
  const points = geometry.points;
  if (points.length < 4) {
    issues.push(issue("error", geometry.field, "Polygone incomplet", "Un polygone doit contenir au moins quatre points.", "Relever au minimum trois sommets et répéter le premier point à la fin."));
    return issues;
  }
  if (!samePoint(points[0], points[points.length - 1])) {
    issues.push(issue("error", geometry.field, "Polygone non fermé", "Le premier et le dernier point ne sont pas identiques.", "Recopier le premier point à la fin du polygone."));
  }
  if (hasSelfIntersection(points)) {
    issues.push(issue("error", geometry.field, "Auto-intersection", "Le contour du polygone se croise.", "Reprendre les sommets dans l’ordre réel du tour du bâtiment ou du site."));
  }
  const areaKm2 = polygonAreaKm2(points);
  if (areaKm2 <= 0 || areaKm2 < MIN_POLYGON_AREA_KM2 || areaKm2 > MAX_POLYGON_AREA_KM2) {
    issues.push(issue("warning", geometry.field, "Surface hors seuil", `Surface estimée : ${formatNumber(areaKm2)} km².`, "Vérifier l’emprise ou l’unité de saisie."));
  }
  return issues;
}

function validateSubmissionDistances(geometries) {
  const points = geometries.flatMap((geometry) => geometry.points.map((point) => ({ ...point, field: geometry.field })));
  if (points.length < 2) return [];
  let maxDistance = 0;
  let pair = null;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const distance = distanceKm(points[i], points[j]);
      if (distance > maxDistance) {
        maxDistance = distance;
        pair = [points[i], points[j]];
      }
    }
  }
  return maxDistance > MAX_DISTANCE_KM
    ? [issue("warning", `${pair[0].field} / ${pair[1].field}`, "Distance intra-soumission élevée", `Distance maximale estimée : ${formatNumber(maxDistance)} km.`, "Vérifier que toutes les coordonnées appartiennent bien au même site.")]
    : [];
}

function issue(severity, field, rule, message, suggestion) {
  return { severity, field, rule, message, suggestion };
}

function inLonLatBounds(point) {
  return point.lon >= -180 && point.lon <= 180 && point.lat >= -90 && point.lat <= 90;
}

function insideBbox(point, bbox) {
  return point.lon >= bbox[0] && point.lat >= bbox[1] && point.lon <= bbox[2] && point.lat <= bbox[3];
}

function samePoint(a, b) {
  return Math.abs(a.lat - b.lat) <= DEG_TOLERANCE && Math.abs(a.lon - b.lon) <= DEG_TOLERANCE;
}

function sameCoordinatePair(a, b) {
  return Math.abs(a[0] - b[0]) <= DEG_TOLERANCE && Math.abs(a[1] - b[1]) <= DEG_TOLERANCE;
}

function distanceKm(a, b) {
  const earthRadiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

function distanceMeters(a, b) {
  return distanceKm(a, b) * 1000;
}

function toRad(value) {
  return value * Math.PI / 180;
}

function polygonAreaKm2(points) {
  if (points.length < 4) return 0;
  const meanLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos(toRad(meanLat));
  let area = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const x1 = points[i].lon * metersPerDegLon;
    const y1 = points[i].lat * metersPerDegLat;
    const x2 = points[i + 1].lon * metersPerDegLon;
    const y2 = points[i + 1].lat * metersPerDegLat;
    area += (x1 * y2) - (x2 * y1);
  }
  return Math.abs(area / 2) / 1_000_000;
}

function hasSelfIntersection(points) {
  for (let i = 0; i < points.length - 1; i += 1) {
    for (let j = i + 2; j < points.length - 1; j += 1) {
      if (i === 0 && j === points.length - 2) continue;
      if (segmentsIntersect(points[i], points[i + 1], points[j], points[j + 1])) {
        return true;
      }
    }
  }
  return false;
}

function segmentsIntersect(a, b, c, d) {
  const ccw = (p1, p2, p3) => (p3.lat - p1.lat) * (p2.lon - p1.lon) > (p2.lat - p1.lat) * (p3.lon - p1.lon);
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

function maxPrecision(points) {
  return points.map((point) => Number(point.precision)).filter(Number.isFinite).sort((a, b) => b - a)[0];
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(value >= 10 ? 1 : 3) : "-";
}

module.exports = {
  buildSubmissionDiagnostic,
  buildGeometricDiagnostic
};
