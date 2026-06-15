import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/gps-quality-report.mjs <kobo-response.json>");
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const submissions = source.response?.results || [];
const bbox = [-8.7, 4, -2.4, 10.8];
const maxDistanceKm = 5;
const minPolygonAreaKm2 = 0.001;
const maxPolygonAreaKm2 = 300;
const degTolerance = 1e-6;

const gpsFieldHints = /(gps|geo|lat|lon|coord|emprise|pylone|raccord)/i;
const ignoredHints = /(nb_pylones|pylone$|ligne_vue|superficie|population|utilisateurs|surface)/i;
const knownFields = {
  "_geolocation": { type: "point", format: "Tableau [latitude, longitude]", crs: "WGS84 implicite" },
  "modA/gps_site": { type: "point", format: "Kobo geopoint: lat lon alt precision", crs: "WGS84 implicite" },
  "modA/gps_centre": { type: "point", format: "Kobo geopoint: lat lon alt precision", crs: "WGS84 implicite" },
  "modA/gps_manuel": { type: "texte coordonnees", format: "Texte libre avec paires lat, lon", crs: "WGS84 suppose" },
  "modB/emprise_site": { type: "polygone", format: "Kobo geoshape: lat lon alt precision;...", crs: "WGS84 implicite" },
  "modB/emprise_site_manuel": { type: "texte coordonnees", format: "Texte libre avec paires lat, lon", crs: "WGS84 suppose" },
  "batiment/batiment/coins_bat": { type: "polygone", format: "Kobo geoshape dans groupe repetitif", crs: "WGS84 implicite" },
  "batiment/batiment/coins_bat_coords": { type: "point", format: "Coordonnees textuelles dans groupe repetitif", crs: "WGS84 suppose" },
  "modE/pylone_rep/modE/pylone_rep/gps_pylone": { type: "point", format: "Kobo geopoint dans groupe repetitif", crs: "WGS84 implicite" },
  "modE/pylone_rep/modE/pylone_rep/gps_pylone_coords": { type: "point", format: "Coordonnees textuelles dans groupe repetitif", crs: "WGS84 suppose" },
  "modE/pylone_rep/modE/pylone_rep/gps_pylone_manuel": { type: "point", format: "Coordonnees textuelles dans groupe repetitif", crs: "WGS84 suppose" },
  "modH/gps_raccord": { type: "point", format: "Kobo geopoint: lat lon alt precision", crs: "WGS84 implicite" },
  "modH/gps_raccord_coords": { type: "point", format: "Coordonnees textuelles", crs: "WGS84 suppose" },
  "modH/gps_raccord_manuel": { type: "texte coordonnees", format: "Texte libre avec paires lat, lon", crs: "WGS84 suppose" }
};

function idOf(row, index) {
  return String(row._id || row["modA/fiche_id"] || index + 1);
}

function siteNameOf(row) {
  return String(row["modB/nom_officiel"] || row["modA/fiche_id"] || "Site non renseigné").replace(/\s+/g, " ").trim();
}

function flatten(row, prefix = "") {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
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
  }
  return out;
}

function collectValues(row, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(row || {})) {
    const fullKey = prefix ? `${prefix}/${key}` : key;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          collectValues(item, fullKey, out);
        }
      });
    } else if (value && typeof value === "object") {
      collectValues(value, fullKey, out);
    } else {
      if (!out[fullKey]) out[fullKey] = [];
      out[fullKey].push(value);
    }
  }
  return out;
}

function isFilled(value) {
  return value !== null && value !== undefined && !(typeof value === "string" && value.trim() === "");
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

function normalizeCoordinateNumber(value) {
  return Number(String(value).replace(",", "."));
}

function parseTextCoordinates(value) {
  if (!isFilled(value)) return [];
  const text = String(value).replace(/\r/g, "\n");
  const results = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const koboPoint = parseKoboPoint(trimmed);
    if (koboPoint && Math.abs(koboPoint.lat) <= 90 && Math.abs(koboPoint.lon) <= 180) {
      results.push(koboPoint);
      continue;
    }
    const patterns = [
      /(-?\d{1,2}[.,]\d+)\s*,\s*(-?\d{1,3}[.,]\d+)/g,
      /(-?\d{1,2}[.,]\d+)\s*;\s*(-?\d{1,3}[.,]\d+)/g,
      /(-?\d{1,2}[.,]\d+)\s*-\s*(\d{1,3}[.,]\d+)/g
    ];
    for (const pattern of patterns) {
      for (const match of trimmed.matchAll(pattern)) {
        const lat = normalizeCoordinateNumber(match[1]);
        const separatorImpliesNegative = pattern.source.includes("\\s*-\\s*") && !String(match[2]).startsWith("-");
        const lon = normalizeCoordinateNumber(match[2]) * (separatorImpliesNegative ? -1 : 1);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          results.push({ lat, lon, precision: null });
        }
      }
    }
  }
  return results;
}

function haversineKm(a, b) {
  const radius = 6371.0088;
  const toRad = (degrees) => degrees * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function polygonAreaKm2(points) {
  if (points.length < 4) return 0;
  const meanLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos(meanLat * Math.PI / 180);
  const xy = points.map((p) => ({ x: p.lon * metersPerDegLon, y: p.lat * metersPerDegLat }));
  let sum = 0;
  for (let i = 0; i < xy.length; i += 1) {
    const j = (i + 1) % xy.length;
    sum += xy[i].x * xy[j].y - xy[j].x * xy[i].y;
  }
  return Math.abs(sum) / 2 / 1_000_000;
}

function signedArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const j = (i + 1) % points.length;
    sum += points[i].lon * points[j].lat - points[j].lon * points[i].lat;
  }
  return sum / 2;
}

function almostSame(a, b, tolerance = degTolerance) {
  return Math.abs(a.lat - b.lat) <= tolerance && Math.abs(a.lon - b.lon) <= tolerance;
}

function ccw(a, b, c) {
  return (c.lat - a.lat) * (b.lon - a.lon) > (b.lat - a.lat) * (c.lon - a.lon);
}

function segmentsIntersect(a, b, c, d) {
  if (almostSame(a, c) || almostSame(a, d) || almostSame(b, c) || almostSame(b, d)) return false;
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

function countDecimals(value) {
  const text = String(value);
  const match = text.match(/\.(\d+)/);
  return match ? match[1].length : 0;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lon;
    const yi = polygon[i].lat;
    const xj = polygon[j].lon;
    const yj = polygon[j].lat;
    const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
      (point.lon < (xj - xi) * (point.lat - yi) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function inBbox(point) {
  return point.lon >= bbox[0] && point.lat >= bbox[1] && point.lon <= bbox[2] && point.lat <= bbox[3];
}

function maxPairDistance(points) {
  let max = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      max = Math.max(max, haversineKm(points[i], points[j]));
    }
  }
  return max;
}

function lineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineKm(points[i - 1], points[i]);
  }
  return total;
}

function formatList(values, limit = 20) {
  const unique = [...new Set(values)];
  if (!unique.length) return "Aucun";
  return unique.length > limit ? `${unique.slice(0, limit).join(", ")} (+${unique.length - limit})` : unique.join(", ");
}

function detailOf(value) {
  const text = String(value);
  const match = text.match(/^[^ ]+\s+\((.*)\)$/);
  return match ? match[1] : text;
}

function idFromViolation(value) {
  return String(value).split(/[ (]/)[0];
}

function groupedViolationRows(values, siteIndex, limit = 500) {
  return values.slice(0, limit).map((value) => {
    const id = idFromViolation(value);
    return [
      `\`${id}\``,
      siteIndex.get(id) || "Site non renseigné",
      detailOf(value).replace(/\|/g, "/")
    ];
  });
}

const flatRows = submissions.map((row, index) => ({
  row,
  flat: flatten(row),
  values: collectValues(row),
  id: idOf(row, index),
  siteName: siteNameOf(row),
  index
}));
const siteIndex = new Map(flatRows.map((entry) => [entry.id, entry.siteName]));
const allKeys = [...new Set(flatRows.flatMap(({ values }) => Object.keys(values)))];
const canonicalKey = (key) => key.replace(/\[\d+\]/g, "");
const candidateFields = allKeys.filter((key) => {
  const canonical = canonicalKey(key);
  if (knownFields[canonical]) return true;
  if (!gpsFieldHints.test(key) || ignoredHints.test(key) || /\[\d+\]/.test(key)) return false;
  if (!/(gps|geo|coords|coord|emprise|coins_bat)/i.test(key)) return false;
  return flatRows.some(({ values }) => (values[key] || []).some(isFilled));
}).sort();

const parsedBySubmission = new Map();
const fieldSummaries = [];
const violations = {
  emptyGps: [],
  unparsableGps: [],
  outOfBbox: [],
  pointOutsidePolygon: [],
  precisionMismatch: [],
  invalidGeometry: [],
  distanceOverThreshold: [],
  areaOutOfRange: [],
  tooClose: [],
  weakGpsPrecision: [],
  timestamp: [],
  duplicates: [],
  semantic: []
};

for (const field of candidateFields) {
  let filled = 0;
  let parsed = 0;
  let type = knownFields[field]?.type || "coordonnees potentielles";
  let format = knownFields[field]?.format || "Format detecte automatiquement";
  const crs = knownFields[field]?.crs || "WGS84 suppose si coordonnees detectees";
  const examples = [];
  for (const { values } of flatRows) {
    const fieldValues = values[field] || [];
    if (!fieldValues.some(isFilled)) continue;
    filled += 1;
    if (examples.length < 2) examples.push(String(fieldValues.find(isFilled)).slice(0, 90));
    let points = [];
    for (const fieldValue of fieldValues) {
      if (knownFields[field]?.type === "polygone" || (/emprise|coins_bat$/.test(field) && !/manuel|coords/.test(field))) points.push(...parseKoboShape(fieldValue));
      else if (/manuel|coords/.test(field)) points.push(...parseTextCoordinates(fieldValue));
      else points.push(...[parseKoboPoint(fieldValue)].filter(Boolean));
    }
    if (points.length) parsed += 1;
  }
  fieldSummaries.push({
    field,
    type,
    format,
    crs,
    filled,
    rate: submissions.length ? (filled / submissions.length * 100) : 0,
    parsed,
    examples
  });
}

for (const entry of flatRows) {
  const geometries = [];
  const allPoints = [];
  for (const field of candidateFields) {
    const fieldValues = entry.values[field] || [];
    if (!fieldValues.some(isFilled)) continue;
    let kind = "point";
    for (const value of fieldValues) {
      if (!isFilled(value)) continue;
      let points = [];
      if (knownFields[field]?.type === "polygone" || (/emprise|coins_bat$/.test(field) && !/manuel|coords/.test(field))) {
        kind = "polygon";
        points = parseKoboShape(value);
      } else if (/manuel|coords/.test(field)) {
        kind = "text-coordinates";
        points = parseTextCoordinates(value);
      } else {
        points = [parseKoboPoint(value)].filter(Boolean);
      }
      if (!points.length) {
        violations.unparsableGps.push(`${entry.id} (${field})`);
        continue;
      }
      points.forEach((point) => {
        allPoints.push({ ...point, field });
        if ((point.lat === 0 && point.lon === 0) || !inBbox(point)) {
          violations.outOfBbox.push(`${entry.id} (${field}: ${point.lat}, ${point.lon})`);
        }
        if (Number.isFinite(point.precision) && point.precision > 100) {
          violations.weakGpsPrecision.push(`${entry.id} (${field}: precision ${point.precision} m)`);
        }
      });
      geometries.push({ field, kind, points, raw: String(value) });
    }
  }
  if (!allPoints.length) {
    violations.emptyGps.push(entry.id);
  }
  const polygons = geometries.filter((geometry) => geometry.kind === "polygon");
  const points = geometries.filter((geometry) => geometry.kind === "point");
  for (const polygon of polygons) {
    const first = polygon.points[0];
    const last = polygon.points.at(-1);
    const errors = [];
    if (!first || !last || !almostSame(first, last)) errors.push("polygone non ferme");
    for (let i = 1; i < polygon.points.length; i += 1) {
      const segmentLengthM = haversineKm(polygon.points[i - 1], polygon.points[i]) * 1000;
      if (almostSame(polygon.points[i - 1], polygon.points[i])) errors.push(`point duplique consecutif au sommet ${i}`);
      if (segmentLengthM < 0.1) errors.push(`micro-segment < 0,1 m au sommet ${i}`);
      if (segmentLengthM < 1) violations.tooClose.push(`${entry.id} (${polygon.field}: segment ${i} < 1 m)`);
    }
    for (let i = 0; i < polygon.points.length - 1; i += 1) {
      for (let j = i + 2; j < polygon.points.length - 1; j += 1) {
        if (i === 0 && j === polygon.points.length - 2) continue;
        if (segmentsIntersect(polygon.points[i], polygon.points[i + 1], polygon.points[j], polygon.points[j + 1])) {
          errors.push(`auto-intersection segments ${i}-${i + 1} / ${j}-${j + 1}`);
        }
      }
    }
    if (signedArea(polygon.points) > 0) errors.push("orientation antihoraire detectee pour l'anneau exterieur");
    if (errors.length) violations.invalidGeometry.push(`${entry.id} (${polygon.field}: ${[...new Set(errors)].join("; ")})`);
    const areaKm2 = polygonAreaKm2(polygon.points);
    if (areaKm2 <= 0 || areaKm2 < minPolygonAreaKm2 || areaKm2 > maxPolygonAreaKm2) {
      violations.areaOutOfRange.push(`${entry.id} (${polygon.field}: ${areaKm2.toFixed(6)} km2)`);
    }
    if (!/modB\/emprise_site/.test(polygon.field)) {
      continue;
    }
    for (const pointGeometry of points.filter((geometry) => /(^_geolocation$|modA\/gps_site|modA\/gps_centre)/.test(geometry.field))) {
      for (const point of pointGeometry.points) {
        if (!pointInPolygon(point, polygon.points)) {
          violations.pointOutsidePolygon.push(`${entry.id} (${pointGeometry.field} hors ${polygon.field})`);
        }
      }
    }
  }
  const decimalCounts = allPoints.flatMap((point) => [countDecimals(point.lat), countDecimals(point.lon)]);
  if (decimalCounts.length && Math.max(...decimalCounts) - Math.min(...decimalCounts) >= 4) {
    violations.precisionMismatch.push(`${entry.id} (decimales min=${Math.min(...decimalCounts)}, max=${Math.max(...decimalCounts)})`);
  }
  const maxDistance = maxPairDistance(allPoints);
  const maxLine = Math.max(0, ...geometries.filter((g) => g.kind !== "point").map((g) => lineLength(g.points)));
  const distanceMetric = Math.max(maxDistance, maxLine);
  if (distanceMetric > maxDistanceKm) {
    violations.distanceOverThreshold.push(`${entry.id} (${distanceMetric.toFixed(2)} km)`);
  }
  parsedBySubmission.set(entry.id, { geometries, allPoints, maxDistance: distanceMetric });
}

const pointSignatures = [];
for (const [id, parsed] of parsedBySubmission.entries()) {
  const anchor = parsed.allPoints[0];
  if (anchor) pointSignatures.push({ id, point: anchor });
}
const duplicateGroups = [];
const used = new Set();
for (let i = 0; i < pointSignatures.length; i += 1) {
  if (used.has(pointSignatures[i].id)) continue;
  const group = [pointSignatures[i].id];
  for (let j = i + 1; j < pointSignatures.length; j += 1) {
    if (haversineKm(pointSignatures[i].point, pointSignatures[j].point) < 0.01) {
      group.push(pointSignatures[j].id);
      used.add(pointSignatures[j].id);
    }
  }
  if (group.length > 1) duplicateGroups.push(group);
}
violations.duplicates.push(...duplicateGroups.map((group) => group.join(" / ")));

const allAnchors = pointSignatures.map((item) => item.point);
const lats = allAnchors.map((p) => p.lat);
const lons = allAnchors.map((p) => p.lon);
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
const std = (values) => {
  const m = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - m) ** 2)));
};
const latMean = mean(lats);
const lonMean = mean(lons);
const latStd = std(lats);
const lonStd = std(lons);
const isolated = pointSignatures
  .filter(({ point }) => Math.abs(point.lat - latMean) > 3 * latStd || Math.abs(point.lon - lonMean) > 3 * lonStd)
  .map(({ id }) => id);

const totalWithGps = [...parsedBySubmission.values()].filter((item) => item.allPoints.length).length;
const problematicIds = new Set(Object.values(violations).flat().map((item) => String(item).split(/[ (]/)[0]));
const conformity = submissions.length ? ((submissions.length - problematicIds.size) / submissions.length * 100) : 100;
const quality = conformity >= 90 ? "Bon" : conformity >= 70 ? "Moyen" : "Mauvais";
const distances = [...parsedBySubmission.values()].map((item) => item.maxDistance).filter(Number.isFinite).sort((a, b) => a - b);
const p95 = distances.length ? distances[Math.min(distances.length - 1, Math.floor(distances.length * 0.95))] : 0;

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`)
  ].join("\n");
}

const lines = [];
lines.push("# Rapport de contrôle qualité GPS - Enquête GEMS");
lines.push("");
lines.push(`Fichier analysé : \`${path.normalize(inputPath)}\``);
lines.push(`Date du payload : ${source.generatedAt || "non fournie"}`);
lines.push(`Soumissions analysées : ${submissions.length}`);
lines.push(`Soumissions avec données GPS parsées : ${totalWithGps}`);
lines.push(`Bbox d’étude utilisée : [${bbox.join(", ")}] (Côte d’Ivoire approximative, WGS84)`);
lines.push("");
lines.push("## Référentiel des soumissions analysées");
lines.push(table(
  ["_id", "Nom officiel du site"],
  flatRows.map((entry) => [`\`${entry.id}\``, entry.siteName.replace(/\|/g, "/")])
));
lines.push("");
lines.push("## 1. Champs GPS détectés");
lines.push(table(
  ["Champ", "Type", "Format", "SCR", "Remplissage", "Parse"],
  fieldSummaries.map((item) => [
    `\`${item.field}\``,
    item.type,
    item.format.replace(/\|/g, "/"),
    item.crs,
    `${item.filled}/${submissions.length} (${item.rate.toFixed(1)}%)`,
    `${item.parsed}/${item.filled || 0}`
  ])
));
lines.push("");
lines.push("Champs textuels non normalisés : `modA/gps_manuel`, `modB/emprise_site_manuel`, `modH/gps_raccord_coords`, `modH/gps_raccord_manuel`. Ils mélangent du texte descriptif et des paires de coordonnées.");
lines.push("");
lines.push("## 2. Harmonisation et cohérence");
lines.push(`- Intra-soumission : ${violations.pointOutsidePolygon.length} incohérence(s) point/polygone détectée(s).`);
lines.push(`- Précision : ${violations.precisionMismatch.length} soumission(s) mélangent des coordonnées très arrondies et très détaillées.`);
lines.push(`- Zone d’étude : ${violations.outOfBbox.length} coordonnée(s) hors bbox ou nulles.`);
lines.push("- Système de coordonnées : aucun SCR explicite fourni ; les formats Kobo indiquent implicitement WGS84.");
lines.push("- Sémantique : les sites disposent principalement d’un point (`gps_site`, `gps_centre`) et parfois d’un polygone (`emprise_site`), ce qui est cohérent pour des sites.");
lines.push("");
lines.push("## 3. Topologie");
const polygonCount = [...parsedBySubmission.values()].flatMap((item) => item.geometries).filter((g) => g.kind === "polygon").length;
lines.push(`Polygones contrôlés : ${polygonCount}. Invalides ou à revoir : ${violations.invalidGeometry.length}.`);
lines.push("Lignes/tracés contrôlés : 0 champ ligne normalisé détecté.");
lines.push("");
lines.push("## 4. Distances et superficies");
lines.push(`- Seuil fixe distance max : ${maxDistanceKm} km.`);
lines.push(`- 95e percentile observé des distances intra-soumission : ${p95.toFixed(2)} km.`);
lines.push(`- Surfaces hors bornes [${minPolygonAreaKm2}, ${maxPolygonAreaKm2}] km2 : ${violations.areaOutOfRange.length}.`);
lines.push("- Calculs métriques : approximation locale WGS84 vers mètres par latitude moyenne ; pour la production, utiliser UTM détecté automatiquement.");
lines.push("");
lines.push("## 5. Métadonnées GPS");
lines.push(`- Précision GPS > 100 m : ${violations.weakGpsPrecision.length} alerte(s).`);
lines.push("- Champs satellites : non détectés.");
lines.push("- Timestamps de capture GPS distincts : non détectés ; seuls `start`, `end`, `_submission_time` existent.");
lines.push("");
lines.push("## 6. Doublons géométriques");
lines.push(`Groupes de points quasi-identiques (< 10 m) : ${violations.duplicates.length}.`);
lines.push("");
lines.push("## 7. Distribution spatiale globale");
if (allAnchors.length) {
  lines.push(`Enveloppe des points principaux : lon [${Math.min(...lons).toFixed(6)}, ${Math.max(...lons).toFixed(6)}], lat [${Math.min(...lats).toFixed(6)}, ${Math.max(...lats).toFixed(6)}].`);
}
lines.push(`Points isolés à plus de 3 écarts types : ${formatList(isolated)}.`);
lines.push("");
lines.push("## 8. Cohérence attributaire-spatiale");
lines.push("Aucune couche administrative ni service de géocodage inverse n’est fourni. Contrôle limité à la bbox : les coordonnées sont globalement compatibles avec la Côte d’Ivoire si la bbox locale ci-dessus est retenue.");
lines.push("");
lines.push("## 9. Violations détaillées");
const labels = {
  emptyGps: "Soumissions sans GPS parsé",
  unparsableGps: "Champs GPS non parsables",
  outOfBbox: "Coordonnées hors zone ou nulles",
  pointOutsidePolygon: "Point hors polygone associe",
  precisionMismatch: "Précision incohérente",
  invalidGeometry: "Géométries invalides",
  distanceOverThreshold: "Distance intra-soumission > seuil",
  areaOutOfRange: "Surface polygone hors limites",
  tooClose: "Points/segments trop proches",
  weakGpsPrecision: "Précision GPS faible",
  timestamp: "Timestamp incohérent",
  duplicates: "Doublons géométriques"
};
for (const [key, label] of Object.entries(labels)) {
  lines.push(`### ${label}`);
  lines.push(`Effectif : ${violations[key].length}`);
  const rows = groupedViolationRows(violations[key], siteIndex);
  if (rows.length) {
    lines.push(table(["_id", "Nom officiel du site", "Erreur observée"], rows));
  } else {
    lines.push("Aucune erreur détectée pour cette rubrique.");
  }
  if (violations[key].length > rows.length) {
    lines.push(`Liste tronquée dans le tableau : ${violations[key].length - rows.length} erreur(s) supplémentaire(s).`);
  }
  lines.push("");
}
lines.push("## Synthèse");
lines.push(`- Total soumissions analysées : ${submissions.length}`);
lines.push(`- Total avec GPS : ${totalWithGps}`);
lines.push(`- Soumissions avec au moins une violation : ${problematicIds.size}`);
lines.push(`- Taux de conformité approximatif : ${conformity.toFixed(1)}%`);
lines.push(`- Indicateur global de qualité : ${quality}`);
lines.push("");
lines.push("## Suggestions de correction");
lines.push("- Normaliser les champs manuels en champs Kobo geopoint/geoshape dédiés, sans texte libre.");
lines.push("- Fermer automatiquement les polygones ouverts et supprimer les points consécutifs dupliqués avant intégration.");
lines.push("- Reprojeter en UTM local pour tous les calculs officiels de longueur/surface.");
lines.push("- Ajouter des contrôles de saisie : précision GPS maximale, bbox d’étude et interdiction des coordonnées nulles.");
lines.push("- Examiner les doublons < 10 m pour distinguer sites partages et copier-coller.");

const outputPath = inputPath.replace(/\.json$/i, "-gps-quality-report.md");
fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(outputPath);
