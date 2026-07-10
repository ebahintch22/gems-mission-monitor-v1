const fs = require("node:fs");
const path = require("node:path");
const {
  COTE_IVOIRE_BOUNDS,
  parseKoboGeopointString,
  parseWktOrManualCoordinates,
  parseWktPoint
} = require("./koboGeometryExtractor");
const { valueAtPath } = require("./koboPayloadMapper");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const BATCHES_ROOT = path.join(PROJECT_ROOT, "KBase-docs", "kobo-geometry-extractions", "batches");
const DEFAULT_STRATEGY_PATH = path.join(
  PROJECT_ROOT,
  "KBase-docs",
  "kobo-data-analysis",
  "extraction_scripts",
  "kobo_geometry_parser_strategy_by_version.json"
);
const CENTER_FIELDS = ["modA/gps_centre", "modA/gps_manuel", "modA/gps_site"];
const PARSERS = {
  parse_kobo_geopoint_string: parseKoboGeopointString,
  parse_wkt_or_manual_coordinates: parseWktOrManualCoordinates,
  parse_wkt_point: parseWktPoint
};

function exportKoboSiteCenterPoints(options = {}) {
  if (!options.batch) {
    const error = new Error("Le parametre --batch est requis. Exemple: node scripts/export-kobo-site-center-points.mjs --batch 2026-07-02_sample-72");
    error.statusCode = 400;
    throw error;
  }

  const batchPath = resolveBatchPath(options.batch);
  const sourcePath = resolveSourcePath(batchPath, options.source);
  const strategyPath = options.strategy ? resolveProjectPath(options.strategy) : DEFAULT_STRATEGY_PATH;
  const sourcePayload = readJson(sourcePath, "fichier source Kobo brut");
  const strategy = readJson(strategyPath, "strategie de parsing");
  const submissions = normalizeSubmissions(sourcePayload);

  if (!submissions.length) {
    const error = new Error(`Le fichier source ne correspond pas au format Kobo attendu: ${path.relative(PROJECT_ROOT, sourcePath)}. Formats acceptes: tableau JSON, objet {results: [...]}, objet {response: {results: [...]}}.`);
    error.statusCode = 400;
    throw error;
  }

  const features = submissions
    .map((submission, index) => buildFeature(submission, index, strategy))
    .filter(Boolean);
  const outputPath = path.join(batchPath, "03_review", "site_center_points.geojson");
  const payload = {
    type: "FeatureCollection",
    name: "site_center_points",
    metadata: {
      schema_name: "g2m_kobo_site_center_points",
      schema_version: "0.1.0",
      generated_at: new Date().toISOString(),
      source: path.relative(PROJECT_ROOT, sourcePath),
      strategy: path.relative(PROJECT_ROOT, strategyPath),
      source_count: submissions.length,
      extracted_count: features.length,
      center_field_priority: CENTER_FIELDS
    },
    features
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return {
    ok: true,
    batchPath,
    sourcePath,
    strategyPath,
    outputPath,
    sourceCount: submissions.length,
    extractedCount: features.length,
    skippedCount: submissions.length - features.length
  };
}

function buildFeature(submission, index, strategyConfig) {
  const selected = selectSiteCenterPoint(submission, strategyConfig);
  if (!selected) {
    return null;
  }

  const [longitude, latitude] = selected.geometry.coordinates;
  return {
    type: "Feature",
    properties: {
      "modB/nom_officiel": valueOrNull(valueAtPath(submission, "modB/nom_officiel")),
      "modB/commune": valueOrNull(valueAtPath(submission, "modB/commune")),
      "modB/ministere": valueOrNull(valueAtPath(submission, "modB/ministere")),
      "modB/type_infra": valueOrNull(valueAtPath(submission, "modB/type_infra")),
      "modB/sous_type": valueOrNull(valueAtPath(submission, "modB/sous_type")),
      "modC/nb_batiments": valueOrNull(valueAtPath(submission, "modC/nb_batiments")),
      source_submission_id: getSourceSubmissionId(submission),
      kobo_id: submission._id ?? null,
      submission_index: index,
      source_field: selected.sourceField,
      parser: selected.parser,
      geometry_priority_rank: selected.priorityRank,
      raw_value: selected.rawValue,
      requires_review: selected.requiresReview,
      quality_status: selected.qualityStatus,
      warnings: selected.warnings,
      longitude,
      latitude
    },
    geometry: selected.geometry
  };
}

function selectSiteCenterPoint(submission, strategyConfig) {
  const versionField = strategyConfig.version_field || "__version__";
  const formVersion = valueAtPath(submission, versionField) || null;
  const strategyId = formVersion && strategyConfig.strategies?.[formVersion]
    ? formVersion
    : strategyConfig.fallback_strategy_id || "default";
  const strategy = strategyConfig.strategies?.[strategyId] || strategyConfig.strategies?.default || {};
  const candidates = centerCandidatesFromStrategy(strategy);

  for (const candidate of candidates) {
    const rawValue = valueAtPath(submission, candidate.field);
    const parsed = parseCenterCandidate(rawValue, candidate);
    if (parsed.ok) {
      return {
        sourceField: candidate.field,
        parser: candidate.parser,
        priorityRank: candidate.priorityRank,
        rawValue,
        requiresReview: Boolean(candidate.requires_review || parsed.requires_review),
        qualityStatus: parsed.warnings.length ? "warning" : "ok",
        warnings: parsed.warnings,
        geometry: parsed.geometry
      };
    }
  }

  return null;
}

function centerCandidatesFromStrategy(strategy) {
  const sourcePriority = Array.isArray(strategy.site_geometry?.source_priority)
    ? strategy.site_geometry.source_priority
    : [];
  return CENTER_FIELDS.map((field, index) => {
    const candidate = sourcePriority.find((entry) => entry.field === field) || {};
    return {
      ...candidate,
      field,
      parser: candidate.parser || defaultParserForCenterField(field),
      priorityRank: index + 1,
      requires_review: Boolean(candidate.requires_review || field === "modA/gps_manuel")
    };
  });
}

function defaultParserForCenterField(field) {
  return field === "modA/gps_manuel"
    ? "parse_wkt_or_manual_coordinates"
    : "parse_kobo_geopoint_string";
}

function parseCenterCandidate(rawValue, candidate) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return { ok: false, reason: "empty_value", warnings: [] };
  }

  const parser = PARSERS[candidate.parser];
  if (!parser) {
    return {
      ok: false,
      reason: "unknown_parser",
      warnings: [{ code: "unknown_parser", parser: candidate.parser }]
    };
  }

  const parsed = parser(rawValue);
  if (!parsed.ok || !parsed.geometry) {
    return {
      ok: false,
      reason: parsed.reason || "parse_failed",
      warnings: parsed.warnings || []
    };
  }

  const warnings = [...(parsed.warnings || [])];
  let geometry = parsed.geometry;
  if (geometry.type === "Polygon") {
    const centroid = polygonCentroid(geometry);
    if (!centroid) {
      return {
        ok: false,
        reason: "polygon_centroid_failed",
        warnings
      };
    }
    geometry = {
      type: "Point",
      coordinates: centroid
    };
    warnings.push({ code: "manual_polygon_centroid_used" });
  }

  if (geometry.type !== "Point" || !Array.isArray(geometry.coordinates)) {
    return {
      ok: false,
      reason: "not_a_point_geometry",
      warnings
    };
  }

  const coordinateWarnings = validatePointCoordinates(geometry.coordinates);
  if (coordinateWarnings.some((warning) => warning.severity === "error")) {
    return {
      ok: false,
      reason: "invalid_point_coordinates",
      warnings: [...warnings, ...coordinateWarnings]
    };
  }

  return {
    ok: true,
    geometry,
    requires_review: Boolean(candidate.requires_review || warnings.length),
    warnings: [...warnings, ...coordinateWarnings]
  };
}

function validatePointCoordinates(coordinates) {
  const longitude = Number(coordinates?.[0]);
  const latitude = Number(coordinates?.[1]);
  const warnings = [];

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    warnings.push({ code: "coordinate_not_numeric", severity: "error" });
    return warnings;
  }

  if (longitude < COTE_IVOIRE_BOUNDS.minLongitude
    || longitude > COTE_IVOIRE_BOUNDS.maxLongitude
    || latitude < COTE_IVOIRE_BOUNDS.minLatitude
    || latitude > COTE_IVOIRE_BOUNDS.maxLatitude) {
    warnings.push({ code: "coordinate_outside_cote_ivoire_bounds", severity: "error" });
  }

  return warnings;
}

function polygonCentroid(geometry) {
  const ring = geometry.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length === 0) {
    return null;
  }

  const points = ring
    .map((point) => [Number(point[0]), Number(point[1])])
    .filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude));
  if (!points.length) {
    return null;
  }

  const unique = points.filter((point, index) => (
    index === 0 || point[0] !== points[0][0] || point[1] !== points[0][1]
  ));
  const centroidPoints = unique.length ? unique : points;
  return [
    centroidPoints.reduce((sum, point) => sum + point[0], 0) / centroidPoints.length,
    centroidPoints.reduce((sum, point) => sum + point[1], 0) / centroidPoints.length
  ];
}

function resolveBatchPath(batch) {
  const batchText = String(batch || "").trim();
  if (!batchText) {
    const error = new Error("Le parametre --batch est requis.");
    error.statusCode = 400;
    throw error;
  }

  const batchPath = path.isAbsolute(batchText)
    ? batchText
    : path.join(BATCHES_ROOT, batchText);
  if (!fs.existsSync(batchPath) || !fs.statSync(batchPath).isDirectory()) {
    const error = new Error(`Dossier batch introuvable: ${batchText}`);
    error.statusCode = 404;
    throw error;
  }
  return batchPath;
}

function resolveSourcePath(batchPath, source) {
  if (source) {
    const sourcePath = resolveProjectPath(source);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      const error = new Error(`Fichier source Kobo introuvable: ${source}`);
      error.statusCode = 404;
      throw error;
    }
    return sourcePath;
  }

  const sourceDirs = ["00_source", "00-source", "source", "sources"]
    .map((dirName) => path.join(batchPath, dirName));
  const candidates = sourceDirs
    .filter((dirPath) => fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory())
    .flatMap((dirPath) => fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => path.join(dirPath, entry.name)))
    .sort();

  if (!candidates.length) {
    const error = new Error(`Aucun fichier source Kobo JSON trouve dans le batch ${path.basename(batchPath)}. Dossier attendu: 00_source/.`);
    error.statusCode = 404;
    throw error;
  }

  return candidates[candidates.length - 1];
}

function normalizeSubmissions(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.response?.results)) {
    return payload.response.results;
  }
  if (Array.isArray(payload?.results)) {
    return payload.results;
  }
  return [];
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const wrapped = new Error(`Lecture du ${label} impossible: ${error.message}`);
    wrapped.statusCode = 400;
    throw wrapped;
  }
}

function resolveProjectPath(inputPath) {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(PROJECT_ROOT, inputPath);
}

function getSourceSubmissionId(submission) {
  return submission._uuid || submission.uuid || submission._id || null;
}

function valueOrNull(value) {
  return value === undefined || value === "" ? null : value;
}

module.exports = {
  CENTER_FIELDS,
  exportKoboSiteCenterPoints,
  normalizeSubmissions,
  selectSiteCenterPoint
};
