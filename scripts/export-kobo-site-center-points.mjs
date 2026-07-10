import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { exportKoboSiteCenterPoints } = require("../services/koboSiteCenterPointsExporter");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));

try {
  const result = exportKoboSiteCenterPoints(args);
  console.log(JSON.stringify({
    ok: true,
    batch: path.relative(projectRoot, result.batchPath),
    source: path.relative(projectRoot, result.sourcePath),
    output: path.relative(projectRoot, result.outputPath),
    source_count: result.sourceCount,
    extracted_count: result.extractedCount,
    skipped_count: result.skippedCount
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
    } else if (arg === "--source") {
      parsed.source = argv[index + 1];
      index += 1;
    } else if (arg === "--strategy") {
      parsed.strategy = argv[index + 1];
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    } else {
      throw new Error(`Argument inconnu: ${arg}`);
    }
  }
  return parsed;
}

function printHelpAndExit() {
  console.log([
    "Usage:",
    "  node scripts/export-kobo-site-center-points.mjs --batch <batch> [options]",
    "",
    "Options:",
    "  --batch <batch>      Nom ou chemin du dossier batch. Obligatoire.",
    "  --source <json>      Fichier source Kobo brut explicite. Optionnel.",
    "  --strategy <json>    Strategie de parsing explicite. Optionnel.",
    "",
    "Entree attendue:",
    "  <batch>/00_source/*.json",
    "",
    "Sortie:",
    "  <batch>/03_review/site_center_points.geojson"
  ].join("\n"));
  process.exit(0);
}
