import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { processMatchingOutputs, runReferenceMatching } = require("../services/koboReferenceMatcher");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));

try {
  if (args.koboPoints !== undefined) {
    const result = runNormalizedBuildingMatching(args);
    console.log(JSON.stringify({
      ok: true,
      mode: "emprises_batiment_normalized",
      batch: result.batch ? path.relative(projectRoot, result.batch) : null,
      koboPointsSource: result.koboPointsSource,
      koboPoints: result.koboPoints ? path.relative(projectRoot, result.koboPoints) : null,
      siteContours: path.relative(projectRoot, result.siteContours),
      buildingExtents: path.relative(projectRoot, result.buildingExtents),
      output: path.relative(projectRoot, result.output),
      centroidOutput: path.relative(projectRoot, result.centroidOutput),
      feature_count: result.featureCount,
      centroid_feature_count: result.centroidFeatureCount
    }, null, 2));
    process.exit(0);
  }

  const result = runReferenceMatching(args);
  console.log(JSON.stringify({
    ok: true,
    batch: path.relative(projectRoot, result.batchPath),
    extraction: path.relative(projectRoot, result.extractionPath),
    outputs: Object.fromEntries(Object.entries(result.outputs).map(([key, value]) => [key, path.relative(projectRoot, value)])),
    summary: result.summary
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error.message
  }, null, 2));
  process.exitCode = 1;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--batch") {
      parsed.batch = argv[index + 1];
      index += 1;
    } else if (arg === "--extraction") {
      parsed.extraction = argv[index + 1];
      index += 1;
    } else if (arg === "--source") {
      parsed.source = argv[index + 1];
      index += 1;
    } else if (arg === "--strategy") {
      parsed.strategy = argv[index + 1];
      index += 1;
    } else if (arg === "--site-contours") {
      parsed.siteContours = argv[index + 1];
      index += 1;
    } else if (arg === "--building-extents") {
      parsed.buildingExtents = argv[index + 1];
      index += 1;
    } else if (arg === "--kobo-points") {
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        parsed.koboPoints = next;
        index += 1;
      } else {
        parsed.koboPoints = true;
      }
    } else if (arg === "--tolerance-meters") {
      parsed.toleranceMeters = Number(argv[index + 1]);
      if (!Number.isFinite(parsed.toleranceMeters) || parsed.toleranceMeters < 0) {
        throw new Error("--tolerance-meters doit etre un nombre positif ou nul.");
      }
      index += 1;
    } else if (arg === "--normalized-buildings-output") {
      parsed.normalizedBuildingsOutput = argv[index + 1];
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    } else {
      throw new Error(`Argument inconnu: ${arg}`);
    }
  }
  return parsed;
}

function runNormalizedBuildingMatching(options) {
  const batchPath = options.batch ? resolveBatchPath(options.batch) : null;
  const centroidSource = loadBuildingCentroidSource(options, batchPath);
  const siteContoursPath = resolveInputPath(options.siteContours, batchPath, ["05_reference_layers", "sources", "contours_sites.geojson"], "Fichier contours_sites.geojson introuvable.");
  const buildingExtentsPath = resolveInputPath(options.buildingExtents, batchPath, ["05_reference_layers", "sources", "emprises_batiments.geojson"], "Fichier emprises_batiments.geojson introuvable.");
  const outputPath = options.normalizedBuildingsOutput
    ? path.resolve(projectRoot, options.normalizedBuildingsOutput)
    : path.join(batchPath || projectRoot, "06_matching", "emprises_batiment_normalized.geojson");
  const centroidOutputPath = path.join(path.dirname(outputPath), "centroid_batiment.geojson");

  const outputs = processMatchingOutputs(
    centroidSource.payload,
    readJson(siteContoursPath),
    readJson(buildingExtentsPath),
    { toleranceMeters: options.toleranceMeters }
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(outputs.buildingFootprints, null, 2)}\n`, "utf8");
  fs.writeFileSync(centroidOutputPath, `${JSON.stringify(outputs.centroidBatiment, null, 2)}\n`, "utf8");

  return {
    batch: batchPath,
    koboPoints: centroidSource.path,
    koboPointsSource: centroidSource.source,
    siteContours: siteContoursPath,
    buildingExtents: buildingExtentsPath,
    output: outputPath,
    centroidOutput: centroidOutputPath,
    featureCount: outputs.buildingFootprints.features.length,
    centroidFeatureCount: outputs.centroidBatiment.features.length
  };
}

function loadBuildingCentroidSource(options, batchPath) {
  if (options.koboPoints && options.koboPoints !== true) {
    const koboPointsPath = resolveInputPath(options.koboPoints, batchPath, ["03_review", "site_center_points.geojson"], "Fichier de points Kobo introuvable.");
    return {
      source: "explicit_geojson_points",
      path: koboPointsPath,
      payload: readJson(koboPointsPath)
    };
  }

  const extractionPath = resolveExtractionPath(options.extraction, batchPath);
  return {
    source: "building_centroids_from_extraction",
    path: extractionPath,
    payload: buildBuildingCentroidFeatureCollection(readJson(extractionPath))
  };
}

function resolveExtractionPath(explicitPath, batchPath) {
  if (explicitPath) {
    const candidate = path.resolve(projectRoot, explicitPath);
    if (!fs.existsSync(candidate)) {
      throw new Error(`Fichier d'extraction introuvable: ${explicitPath}`);
    }
    return candidate;
  }
  if (!batchPath) {
    throw new Error("Le parametre --batch ou --extraction est requis pour construire les centroides batiment depuis l'extraction Kobo.");
  }
  const outputDir = path.join(batchPath, "02_output");
  if (!fs.existsSync(outputDir)) {
    throw new Error("Aucun dossier 02_output n'a ete trouve. Lancez d'abord extract-kobo-geometries.mjs.");
  }
  const outputs = fs.readdirSync(outputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /geometries-normalized\.json$/i.test(entry.name) && !/-h1\.json$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (!outputs.length) {
    throw new Error("Aucune extraction normalisee *-geometries-normalized.json n'a ete trouvee dans 02_output.");
  }
  return path.join(outputDir, outputs[outputs.length - 1]);
}

function buildBuildingCentroidFeatureCollection(extractionPayload) {
  const results = Array.isArray(extractionPayload?.results) ? extractionPayload.results : [];
  const features = [];
  results.forEach((submission, submissionIndex) => {
    const siteDescription = submission.site_description || {};
    (submission.building_geometries || []).forEach((building, buildingIndex) => {
      const centroid = building.properties?.centroid_point;
      if (centroid?.type !== "Point" || !Array.isArray(centroid.coordinates)) {
        return;
      }
      const buildingProperties = { ...(building.properties || {}) };
      delete buildingProperties.centroid_point;
      features.push({
        type: "Feature",
        properties: {
          submission_index: submissionIndex,
          building_index: buildingIndex,
          submission_group_id: submission.source_submission_id || submission.kobo_id || `submission-${submissionIndex + 1}`,
          source_submission_id: submission.source_submission_id || null,
          kobo_id: submission.kobo_id || null,
          form_version: submission.form_version || null,
          site_official_name: siteDescription.official_name || null,
          site_region: siteDescription.region || null,
          site_locality: siteDescription.locality || null,
          site_submitted_at: siteDescription.submitted_at || null,
          source_field: building.source_field || null,
          parser: building.parser || null,
          repeat_path: building.repeat_path || null,
          repeat_index: building.repeat_index ?? buildingIndex,
          raw_value: building.raw_value ?? null,
          requires_review: Boolean(building.requires_review),
          quality_status: submission.geometry_quality_report?.status || null,
          ...buildingProperties
        },
        geometry: {
          type: "Point",
          coordinates: [...centroid.coordinates]
        }
      });
    });
  });

  return {
    type: "FeatureCollection",
    name: "building_centroids_from_kobo_extraction",
    features
  };
}

function resolveBatchPath(batchName) {
  const direct = path.resolve(projectRoot, batchName);
  const candidate = fs.existsSync(direct)
    ? direct
    : path.join(projectRoot, "KBase-docs", "kobo-geometry-extractions", "batches", batchName);
  if (!fs.existsSync(candidate)) {
    throw new Error(`Batch introuvable: ${batchName}`);
  }
  return candidate;
}

function resolveInputPath(explicitPath, batchPath, relativeParts, errorMessage) {
  const candidates = [];
  if (explicitPath && explicitPath !== true) {
    candidates.push(path.resolve(projectRoot, explicitPath));
  }
  if (batchPath) {
    candidates.push(path.join(batchPath, ...relativeParts));
    if (relativeParts.includes("sources")) {
      candidates.push(path.join(batchPath, ...relativeParts.map((part) => (part === "sources" ? "source" : part))));
      candidates.push(path.join(batchPath, "05_reference_layers", relativeParts[relativeParts.length - 1]));
    }
  }
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(errorMessage);
  }
  return found;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function printHelpAndExit() {
  console.log([
    "Usage:",
    "  node scripts/match-kobo-reference-layers.mjs [options]",
    "",
    "Options:",
    "  --batch <batch>                 Nom ou chemin du batch. Par defaut: dernier batch avec GeoJSON de reference.",
    "  --extraction <json>             Fichier d'extraction normalisee Kobo a utiliser.",
    "  --source <json>                 Source Kobo brute si 02_output est vide.",
    "  --strategy <json>               Strategie de parsing si 02_output est vide.",
    "  --site-contours <geojson>       GeoJSON contours_sites explicite.",
    "  --building-extents <geojson>    GeoJSON emprises_batiments explicite.",
    "  --kobo-points [geojson]         Active le mode emprises normalisees. Sans fichier: construit les centroides batiment depuis l'extraction normalisee.",
    "  --tolerance-meters <number>     Tolerance de proximite en metres. Defaut: 50.",
    "  --normalized-buildings-output <geojson>",
    "                                  Sortie du mode emprises normalisees. Defaut: 06_matching/emprises_batiment_normalized.geojson.",
    "",
    "Sorties:",
    "  <batch>/06_matching/site_matching.json",
    "  <batch>/06_matching/building_matching.json",
    "  <batch>/06_matching/matching_review.geojson",
    "  <batch>/06_matching/matching_report.md",
    "  <batch>/06_matching/emprises_batiment_normalized.geojson si --kobo-points est utilise",
    "  <batch>/06_matching/centroid_batiment.geojson si --kobo-points est utilise"
  ].join("\\n"));
  process.exit(0);
}
