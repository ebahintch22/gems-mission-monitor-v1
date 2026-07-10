const fs = require("node:fs");
const path = require("node:path");
const { valueAtPath } = require("./koboPayloadMapper");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const BATCHES_ROOT = path.join(PROJECT_ROOT, "KBase-docs", "kobo-geometry-extractions", "batches");

function exportKoboNetworkPoints(options = {}) {
  if (!options.batch) {
    const error = new Error("Le parametre --batch est requis. Exemple: node scripts/export-kobo-network-points.mjs --batch 2026-07-04_sample-90");
    error.statusCode = 400;
    throw error;
  }

  const batchPath = resolveBatchPath(options.batch);
  const extractionPath = resolveExtractionPath(batchPath, options.extraction);
  const sourcePath = resolveOptionalSourcePath(batchPath, options.source);
  const extraction = readJson(extractionPath, "fichier d'extraction normalisee");
  const rawSubmissions = sourcePath ? normalizeSubmissions(readJson(sourcePath, "fichier source Kobo brut")) : [];
  const rawBySubmission = indexRawSubmissions(rawSubmissions);
  const results = Array.isArray(extraction.results) ? extraction.results : [];

  const features = results.flatMap((submission, submissionIndex) => (
    buildSubmissionFeatures(submission, submissionIndex, rawBySubmission)
  ));
  const outputPath = options.output
    ? resolveProjectPath(options.output)
    : path.join(batchPath, "03_review", "network_points.geojson");
  const payload = {
    type: "FeatureCollection",
    name: "network_points",
    metadata: {
      schema_name: "g2m_kobo_network_points",
      schema_version: "0.1.0",
      generated_at: new Date().toISOString(),
      extraction: path.relative(PROJECT_ROOT, extractionPath),
      source: sourcePath ? path.relative(PROJECT_ROOT, sourcePath) : null,
      source_count: results.length,
      extracted_count: features.length
    },
    features
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return {
    ok: true,
    batchPath,
    extractionPath,
    sourcePath,
    outputPath,
    sourceCount: results.length,
    extractedCount: features.length,
    countsByNature: countBy(features, (feature) => feature.properties.nature_point)
  };
}

function buildSubmissionFeatures(submission, submissionIndex, rawBySubmission) {
  const rawSubmission = rawSubmissionFor(submission, rawBySubmission);
  const operatorName = firstNonEmpty(
    submission.site_description?.operator_name,
    submission.site_description?.operators,
    valueAtPath(rawSubmission, "modE/operateurs"),
    valueAtPath(rawSubmission, "modE/operateur"),
    valueAtPath(rawSubmission, "operateurs"),
    valueAtPath(rawSubmission, "operateur")
  );
  const commonProperties = {
    source_submission_id: submission.source_submission_id || null,
    kobo_id: submission.kobo_id || null,
    submission_index: submissionIndex,
    nom_officiel: submission.site_description?.official_name || null,
    region: submission.site_description?.region || null,
    localite: submission.site_description?.locality || null,
    date_soumission: submission.site_description?.submitted_at || null,
    operateur: valueOrNull(operatorName)
  };
  const features = [];

  if (isPointGeometry(submission.raccordement_geometry?.geometry)) {
    features.push(buildPointFeature({
      entry: submission.raccordement_geometry,
      geometry: submission.raccordement_geometry.geometry,
      commonProperties,
      naturePoint: "chambre_raccordement",
      pointIndex: 0
    }));
  }

  (submission.pylone_geometries || []).forEach((entry, index) => {
    if (!isPointGeometry(entry?.geometry)) {
      return;
    }
    features.push(buildPointFeature({
      entry,
      geometry: entry.geometry,
      commonProperties,
      naturePoint: "pylone",
      pointIndex: index
    }));
  });

  return features;
}

function buildPointFeature({ entry, geometry, commonProperties, naturePoint, pointIndex }) {
  const [longitude, latitude] = geometry.coordinates;
  const entryProperties = entry.properties || {};
  const operatorName = firstNonEmpty(
    entryProperties.operator_name,
    entryProperties.operator,
    entryProperties.operateur,
    commonProperties.operateur
  );
  return {
    type: "Feature",
    properties: {
      ...commonProperties,
      operateur: valueOrNull(operatorName),
      operator_source_field: entryProperties.operator_source_field || null,
      nature_point: naturePoint,
      point_index: pointIndex,
      source_field: entry.source_field || null,
      parser: entry.parser || null,
      repeat_path: entry.repeat_path || null,
      repeat_index: entry.repeat_index ?? null,
      raw_value: entry.raw_value ?? null,
      requires_review: Boolean(entry.requires_review),
      longitude,
      latitude
    },
    geometry: {
      type: "Point",
      coordinates: [longitude, latitude]
    }
  };
}

function resolveBatchPath(batch) {
  const batchText = String(batch || "").trim();
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

function resolveExtractionPath(batchPath, extraction) {
  if (extraction) {
    const extractionPath = resolveProjectPath(extraction);
    if (!fs.existsSync(extractionPath) || !fs.statSync(extractionPath).isFile()) {
      const error = new Error(`Fichier d'extraction introuvable: ${extraction}`);
      error.statusCode = 404;
      throw error;
    }
    return extractionPath;
  }

  const outputDir = path.join(batchPath, "02_output");
  const candidates = fs.existsSync(outputDir)
    ? fs.readdirSync(outputDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /geometries-normalized\.json$/i.test(entry.name) && !/-h1\.json$/i.test(entry.name))
      .map((entry) => path.join(outputDir, entry.name))
      .sort()
    : [];
  if (!candidates.length) {
    const error = new Error(`Aucun fichier *-geometries-normalized.json trouve dans ${path.relative(PROJECT_ROOT, outputDir)}.`);
    error.statusCode = 404;
    throw error;
  }
  return candidates[candidates.length - 1];
}

function resolveOptionalSourcePath(batchPath, source) {
  if (source) {
    const sourcePath = resolveProjectPath(source);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      const error = new Error(`Fichier source Kobo introuvable: ${source}`);
      error.statusCode = 404;
      throw error;
    }
    return sourcePath;
  }

  const sourceDirs = ["00_source", "00-source", "source", "sources"].map((name) => path.join(batchPath, name));
  const candidates = sourceDirs
    .filter((dirPath) => fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory())
    .flatMap((dirPath) => fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => path.join(dirPath, entry.name)))
    .sort();
  return candidates[candidates.length - 1] || null;
}

function indexRawSubmissions(submissions) {
  return submissions.reduce((index, submission) => {
    rawSubmissionKeys(submission).forEach((key) => index.set(key, submission));
    return index;
  }, new Map());
}

function rawSubmissionFor(submission, rawBySubmission) {
  const keys = [
    submission.source_submission_id,
    submission.kobo_id
  ].filter((value) => value !== undefined && value !== null && value !== "");
  for (const key of keys) {
    if (rawBySubmission.has(String(key))) {
      return rawBySubmission.get(String(key));
    }
  }
  return null;
}

function rawSubmissionKeys(submission) {
  return [
    submission?._uuid,
    submission?.uuid,
    submission?._id,
    submission?.id
  ].filter((value) => value !== undefined && value !== null && value !== "").map(String);
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

function isPointGeometry(geometry) {
  return geometry?.type === "Point"
    && Array.isArray(geometry.coordinates)
    && Number.isFinite(Number(geometry.coordinates[0]))
    && Number.isFinite(Number(geometry.coordinates[1]));
}

function countBy(items, keyFn) {
  return items.reduce((counts, item) => {
    const key = keyFn(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function firstNonEmpty(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function valueOrNull(value) {
  return value === undefined || value === "" ? null : value;
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

module.exports = {
  exportKoboNetworkPoints,
  normalizeSubmissions
};
