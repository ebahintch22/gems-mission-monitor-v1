import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { exportKoboNetworkPoints } = require("../services/koboNetworkPointsExporter");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));

try {
  const result = exportKoboNetworkPoints(args);
  console.log(JSON.stringify({
    ok: true,
    batch: path.relative(projectRoot, result.batchPath),
    extraction: path.relative(projectRoot, result.extractionPath),
    source: result.sourcePath ? path.relative(projectRoot, result.sourcePath) : null,
    output: path.relative(projectRoot, result.outputPath),
    source_count: result.sourceCount,
    extracted_count: result.extractedCount,
    counts_by_nature: result.countsByNature
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
    } else if (arg === "--output") {
      parsed.output = argv[index + 1];
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
    "  node scripts/export-kobo-network-points.mjs --batch <batch> [options]",
    "",
    "Options:",
    "  --batch <batch>        Nom ou chemin du dossier batch. Obligatoire.",
    "  --extraction <json>    Fichier d'extraction normalisee explicite. Optionnel.",
    "  --source <json>        Fichier source Kobo brut pour recuperer l'operateur. Optionnel.",
    "  --output <geojson>     Fichier GeoJSON de sortie explicite. Optionnel.",
    "",
    "Entrees par defaut:",
    "  <batch>/02_output/*-geometries-normalized.json",
    "  <batch>/00_source/*.json si disponible",
    "",
    "Sortie par defaut:",
    "  <batch>/03_review/network_points.geojson"
  ].join("\n"));
  process.exit(0);
}
