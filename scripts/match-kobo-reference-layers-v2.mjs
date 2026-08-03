import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { runSiteReferenceMatchingV2 } = require("../services/koboReferenceMatcher");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));

try {
  const result = runSiteReferenceMatchingV2(args);
  console.log(JSON.stringify({
    ok: true,
    mode: "site_reference_matching_v2",
    batch: path.relative(projectRoot, result.batchPath),
    extraction: path.relative(projectRoot, result.extractionPath),
    siteContours: path.relative(projectRoot, result.siteContoursPath),
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
    } else if (arg === "--centroid-output") {
      parsed.centroidOutput = argv[index + 1];
      index += 1;
    } else if (arg === "--csv-output") {
      parsed.csvOutput = argv[index + 1];
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
    "  node scripts/match-kobo-reference-layers-v2.mjs --batch <batch> [options]",
    "",
    "Options:",
    "  --batch <batch>              Nom ou chemin du batch.",
    "  --extraction <json>          Extraction Kobo normalisee V2 explicite.",
    "  --source <json>              Source Kobo brute si 02_output ne contient pas de V2.",
    "  --strategy <json>            Strategie de parsing si la V2 doit etre generee.",
    "  --site-contours <geojson>    GeoJSON contours_sites explicite.",
    "  --centroid-output <geojson>  Chemin de sortie des centroides batiments.",
    "  --csv-output <csv>           Chemin de sortie du CSV de correspondance sites/soumissions.",
    "",
    "Sorties par defaut:",
    "  <batch>/06_matching/centroid_batiment.geojson",
    "  <batch>/06_matching/site_submission_matching.csv",
    "",
    "V2:",
    "  - apparie uniquement contours_site et soumissions KoboToolBox",
    "  - ne lit pas emprises_batiment.geojson",
    "  - conserve dans les centroides les attributs batimentaires de l'extraction V2"
  ].join("\n"));
  process.exit(0);
}
