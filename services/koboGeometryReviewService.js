const fs = require("node:fs");
const path = require("node:path");
const MediaFile = require("../models/MediaFile");
const { extractKoboGeometryBatch } = require("./koboGeometryExtractor");
const { DEFAULT_FORM_ID, loadChoiceList, loadMapping } = require("./formMappingService");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_NORMALIZED_PATH = path.join(
  PROJECT_ROOT,
  "KBase-docs",
  "kobo-data-sample",
  "kobo-response-2026-06-27T09-05-45_50-geometries-normalized.json"
);
const DEFAULT_SOURCE_PATH = path.join(
  PROJECT_ROOT,
  "KBase-docs",
  "kobo-data-sample",
  "kobo-response-2026-06-27T09-05-45_50.json"
);
const DEFAULT_STRATEGY_PATH = path.join(
  PROJECT_ROOT,
  "KBase-docs",
  "kobo-data-analysis",
  "extraction_scripts",
  "kobo_geometry_parser_strategy_by_version.json"
);
const GEOMETRY_EXTRACTIONS_ROOT = path.join(
  PROJECT_ROOT,
  "KBase-docs",
  "kobo-geometry-extractions"
);
const BATCHES_ROOT = path.join(GEOMETRY_EXTRACTIONS_ROOT, "batches");
const KOBO_ASSETS_ROOT = path.join(PROJECT_ROOT, "data", "kobo-assets");
const IMAGE_FILE_PATTERN = /\.(?:jpe?g|png|gif|webp|bmp|tiff?)$/i;

function loadKoboGeometryReviewData(options = {}) {
  const catalog = listKoboGeometryReviewCatalog();
  const selected = resolveSelectedOutput(options, catalog);
  const normalizedPath = selected?.filePath || options.normalizedPath || DEFAULT_NORMALIZED_PATH;
  const sourcePath = options.sourcePath || DEFAULT_SOURCE_PATH;
  const strategyPath = options.strategyPath || DEFAULT_STRATEGY_PATH;

  if (fs.existsSync(normalizedPath)) {
    return {
      source: "normalized_file",
      filePath: normalizedPath,
      payload: readJson(normalizedPath),
      catalog,
      selectedBatch: selected?.batch || "",
      selectedOutput: selected?.output || ""
    };
  }

  const sourcePayload = readJson(sourcePath);
  const strategy = readJson(strategyPath);
  return {
    source: "generated_from_source",
    filePath: sourcePath,
    payload: extractKoboGeometryBatch(sourcePayload, strategy),
    catalog,
    selectedBatch: "",
    selectedOutput: ""
  };
}

function listKoboGeometryReviewCatalog() {
  if (!fs.existsSync(BATCHES_ROOT)) {
    return { batches: [] };
  }

  const batches = fs.readdirSync(BATCHES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const outputDir = path.join(BATCHES_ROOT, entry.name, "02_output");
      const outputs = fs.existsSync(outputDir)
        ? fs.readdirSync(outputDir, { withFileTypes: true })
          .filter((output) => output.isFile() && output.name.toLowerCase().endsWith(".json"))
          .map((output) => output.name)
          .sort()
        : [];
      const matchingDir = path.join(BATCHES_ROOT, entry.name, "06_matching");
      const matchingOutputs = fs.existsSync(matchingDir)
        ? fs.readdirSync(matchingDir, { withFileTypes: true })
          .filter((output) => output.isFile() && output.name.toLowerCase().endsWith(".geojson"))
          .map((output) => output.name)
          .sort()
        : [];

      return {
        name: entry.name,
        outputs,
        matchingOutputs
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  return { batches };
}

function loadKoboReferenceMatchingReview(options = {}) {
  const catalog = listKoboGeometryReviewCatalog();
  const selected = resolveSelectedMatchingOutput(options, catalog);
  if (!selected) {
    const error = new Error("Aucun fichier GeoJSON d'appariement n'est disponible.");
    error.statusCode = 404;
    throw error;
  }

  return {
    batch: selected.batch,
    output: selected.output,
    filePath: selected.filePath,
    payload: readJson(selected.filePath)
  };
}

function resolveSelectedOutput(options, catalog) {
  const requestedBatch = normalizeName(options.batch);
  const requestedOutput = normalizeName(options.output);

  if (!requestedBatch && !requestedOutput) {
    return resolveDefaultOutput(catalog);
  }

  if (!requestedBatch) {
    const error = new Error("Le parametre batch est requis lorsque output est fourni.");
    error.statusCode = 400;
    throw error;
  }

  const batch = catalog.batches.find((candidate) => candidate.name === requestedBatch);
  if (!batch) {
    const error = new Error(`Batch introuvable: ${requestedBatch}`);
    error.statusCode = 404;
    throw error;
  }

  const output = requestedOutput || preferredOutput(batch.outputs);
  if (!output || !batch.outputs.includes(output)) {
    const error = new Error(`Fichier de sortie introuvable dans le batch ${requestedBatch}.`);
    error.statusCode = 404;
    throw error;
  }

  return {
    batch: batch.name,
    output,
    filePath: path.join(BATCHES_ROOT, batch.name, "02_output", output)
  };
}

function resolveDefaultOutput(catalog) {
  const batchesWithOutputs = catalog.batches.filter((batch) => batch.outputs.length > 0);
  if (batchesWithOutputs.length === 0) {
    return null;
  }

  const batch = batchesWithOutputs[batchesWithOutputs.length - 1];
  const output = preferredOutput(batch.outputs);
  return {
    batch: batch.name,
    output,
    filePath: path.join(BATCHES_ROOT, batch.name, "02_output", output)
  };
}

function resolveSelectedMatchingOutput(options, catalog) {
  const requestedBatch = normalizeName(options.batch);
  const requestedOutput = normalizeName(options.output || options.matching);
  const defaultOutputName = normalizeName(options.defaultOutputName || "");

  if (!requestedBatch && !requestedOutput) {
    return resolveDefaultMatchingOutput(catalog, defaultOutputName || "matching_review.geojson");
  }

  if (!requestedBatch) {
    const error = new Error("Le parametre batch est requis lorsque matching est fourni.");
    error.statusCode = 400;
    throw error;
  }

  const batch = catalog.batches.find((candidate) => candidate.name === requestedBatch);
  if (!batch) {
    const error = new Error(`Batch introuvable: ${requestedBatch}`);
    error.statusCode = 404;
    throw error;
  }

  const output = requestedOutput || preferredMatchingOutput(batch.matchingOutputs || []);
  if (!output || !(batch.matchingOutputs || []).includes(output)) {
    const error = new Error(`Fichier d'appariement introuvable dans le batch ${requestedBatch}.`);
    error.statusCode = 404;
    throw error;
  }

  return {
    batch: batch.name,
    output,
    filePath: path.join(BATCHES_ROOT, batch.name, "06_matching", output)
  };
}

function resolveDefaultMatchingOutput(catalog, outputName = "matching_review.geojson") {
  const batchesWithOutputs = catalog.batches.filter((batch) => (
    (batch.matchingOutputs || []).includes(outputName)
  ));
  if (batchesWithOutputs.length === 0) {
    return null;
  }

  const batch = batchesWithOutputs[batchesWithOutputs.length - 1];
  return {
    batch: batch.name,
    output: outputName,
    filePath: path.join(BATCHES_ROOT, batch.name, "06_matching", outputName)
  };
}

function preferredMatchingOutput(outputs) {
  if (!outputs.length) {
    return "";
  }
  return outputs.includes("matching_review.geojson") ? "matching_review.geojson" : outputs[0];
}

function preferredOutput(outputs) {
  if (!outputs.length) {
    return "";
  }
  if (outputs.includes("geometries-normalized.all.json")) {
    return "geometries-normalized.all.json";
  }

  const canonicalOutput = outputs.find((output) => (
    /(^|-)geometries-normalized\.json$/i.test(output)
  ));

  return canonicalOutput || outputs[0];
}

function normalizeName(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (text.includes("/") || text.includes("\\") || text.includes("..")) {
    const error = new Error("Nom de batch ou de fichier invalide.");
    error.statusCode = 400;
    throw error;
  }
  return text;
}

function buildKoboGeometryReviewSummary(payload) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return {
    source_count: payload?.source_count || results.length,
    extracted_count: payload?.extracted_count || results.length,
    records: results.map((result, index) => {
      const report = result.geometry_quality_report || {};
      const siteDescription = result.site_description || {};
      return {
        index,
        source_submission_id: result.source_submission_id || "",
        kobo_id: result.kobo_id || "",
        official_name: siteDescription.official_name || "",
        locality: siteDescription.locality || "",
        form_version: result.form_version || "",
        strategy_id: result.strategy_id || "",
        status: report.status || "unknown",
        warning_count: Array.isArray(report.warnings) ? report.warnings.length : 0,
        error_count: Array.isArray(report.errors) ? report.errors.length : 0,
        has_site_geometry: Boolean(result.site_geometry?.geometry),
        building_count: Array.isArray(result.building_geometries) ? result.building_geometries.length : 0,
        has_raccordement_geometry: Boolean(result.raccordement_geometry?.geometry),
        pylone_count: Array.isArray(result.pylone_geometries) ? result.pylone_geometries.length : 0,
        requires_review: hasReviewFlag(result)
      };
    })
  };
}

function buildKoboGeometryReviewAssetIndex(options = {}) {
  const root = options.root || KOBO_ASSETS_ROOT;
  const bySubmissionId = {};

  if (fs.existsSync(root)) {
    appendLocalAssetIndex({ root, bySubmissionId });
  }

  appendDatabaseMediaIndex({ bySubmissionId });

  const total = Object.values(bySubmissionId).reduce((sum, images) => sum + images.length, 0);
  return { root, total, bySubmissionId };
}

function appendLocalAssetIndex({ root, bySubmissionId }) {
  for (const assetEntry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!assetEntry.isDirectory()) {
      continue;
    }
    const assetUid = assetEntry.name;
    const assetDir = path.join(root, assetUid);
    for (const submissionEntry of fs.readdirSync(assetDir, { withFileTypes: true })) {
      if (!submissionEntry.isDirectory()) {
        continue;
      }
      const submissionId = submissionEntry.name;
      const submissionDir = path.join(assetDir, submissionId);
      const images = fs.readdirSync(submissionDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && IMAGE_FILE_PATTERN.test(entry.name))
        .map((entry) => {
          const filePath = path.join(submissionDir, entry.name);
          const stat = fs.statSync(filePath);
          return {
            source: "local",
            asset_uid: assetUid,
            submission_id: submissionId,
            filename: entry.name,
            size_bytes: stat.size,
            url: [
              "/cartographie/extractions-kobo/assets",
              encodeURIComponent(assetUid),
              encodeURIComponent(submissionId),
              encodeURIComponent(entry.name)
            ].join("/")
          };
        });

      if (images.length) {
        bySubmissionId[submissionId] = (bySubmissionId[submissionId] || []).concat(images);
      }
    }
  }
}

function appendDatabaseMediaIndex({ bySubmissionId }) {
  const medias = MediaFile.listForEntity({ entity_type: "submission" })
    .filter((media) => media.media_type === "image" && media.entity_ref);

  medias.forEach((media) => {
    const submissionId = String(media.entity_ref || "");
    bySubmissionId[submissionId] = bySubmissionId[submissionId] || [];
    bySubmissionId[submissionId].push({
      source: "wasabi",
      media_file_id: media.id,
      asset_uid: "",
      submission_id: submissionId,
      filename: media.original_filename,
      size_bytes: media.size_bytes,
      role: media.role,
      caption: media.caption,
      url: `/media/${encodeURIComponent(media.id)}/view`,
      thumbnail_url: `/media/${encodeURIComponent(media.id)}/thumbnail`,
      download_url: `/media/${encodeURIComponent(media.id)}/download`
    });
  });
}

function resolveKoboGeometryReviewAssetPath({ assetUid, submissionId, filename, root = KOBO_ASSETS_ROOT } = {}) {
  const parts = [assetUid, submissionId, filename].map((value) => String(value || "").trim());
  if (parts.some((part) => !part || part.includes("/") || part.includes("\\") || part.includes(".."))) {
    const error = new Error("Chemin d'asset Kobo invalide.");
    error.statusCode = 400;
    throw error;
  }
  if (!IMAGE_FILE_PATTERN.test(filename)) {
    const error = new Error("Type de fichier Kobo non pris en charge.");
    error.statusCode = 400;
    throw error;
  }

  const resolvedRoot = path.resolve(root);
  const filePath = path.resolve(resolvedRoot, assetUid, submissionId, filename);
  if (!filePath.startsWith(`${resolvedRoot}${path.sep}`)) {
    const error = new Error("Chemin d'asset Kobo invalide.");
    error.statusCode = 400;
    throw error;
  }
  if (!fs.existsSync(filePath)) {
    const error = new Error("Asset Kobo introuvable.");
    error.statusCode = 404;
    throw error;
  }
  return filePath;
}

const REVIEW_CHOICE_FIELDS = [
  "modB.region",
  "modB.departement",
  "modB.sous_prefecture",
  "modB.ministere",
  "modB.type_infra",
  "modB.sous_type",
  "modB.milieu",
  "modB.statut_fonct",
  "modD.electricite",
  "modE.operateurs",
  "modE.pylone_rep.pylone_op",
  "modE.pylone_rep.type_pylone",
  "modE.pylone_rep.type_transmission",
  "modH.fibre_proximite",
  "modH.prop_fibre",
  "batiment.bat_statut",
  "batiment.bat_vocation",
  "batiment.lan",
  "batiment.faisab_cablage",
  "batiment.goulottes",
  "batiment.baie",
  "batiment.equip_actifs"
];

function buildKoboGeometryReviewChoiceIndex(formId = DEFAULT_FORM_ID) {
  const mapping = loadMapping(formId);
  const fields = Array.isArray(mapping.fields)
    ? mapping.fields
    : (mapping.sections || []).flatMap((section) => section.fields || []);
  const fieldByPath = new Map(fields
    .filter((field) => field.path)
    .map((field) => [normalizeChoicePath(field.path), field]));

  return REVIEW_CHOICE_FIELDS.reduce((index, fieldPath) => {
    const field = fieldByPath.get(normalizeChoicePath(fieldPath));
    if (!field?.choiceList) {
      return index;
    }

    const choices = loadChoiceList(formId, field.choiceList, mapping);
    if (!Array.isArray(choices) || choices.length === 0) {
      return index;
    }

    index[normalizeChoicePath(fieldPath)] = {
      multiple: String(field.type || "").startsWith("select_multiple"),
      choices: choices.reduce((choiceMap, choice) => {
        const name = String(choice.name);
        const label = choice.label || choice.name;
        choiceMap[name] = label;
        choiceMap[normalizeChoiceValue(name)] = label;
        return choiceMap;
      }, {})
    };
    return index;
  }, {});
}

function normalizeChoicePath(fieldPath) {
  return String(fieldPath || "").replaceAll("/", ".");
}

function normalizeChoiceValue(value) {
  return String(value || "").trim().toLowerCase();
}

function hasReviewFlag(result) {
  return Boolean(result.site_geometry?.requires_review)
    || Boolean(result.raccordement_geometry?.requires_review)
    || (result.building_geometries || []).some((geometry) => geometry.requires_review)
    || (result.pylone_geometries || []).some((geometry) => geometry.requires_review);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

module.exports = {
  DEFAULT_NORMALIZED_PATH,
  GEOMETRY_EXTRACTIONS_ROOT,
  KOBO_ASSETS_ROOT,
  buildKoboGeometryReviewAssetIndex,
  buildKoboGeometryReviewChoiceIndex,
  buildKoboGeometryReviewSummary,
  listKoboGeometryReviewCatalog,
  loadKoboReferenceMatchingReview,
  loadKoboGeometryReviewData,
  resolveKoboGeometryReviewAssetPath
};
