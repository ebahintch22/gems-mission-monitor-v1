import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { createG2mBatch } = require("../services/g2mBatchCreator");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const args = process.argv.slice(2);

try {
  if (args.includes("--help") || args.includes("-h")) {
    printHelpAndExit();
  }

  const batchName = args[0];
  const result = createG2mBatch(batchName);
  console.log(JSON.stringify({
    ok: true,
    batch: result.batchName,
    path: path.relative(projectRoot, result.batchPath),
    directories: result.directories.map((directory) => directory.relativePath.replace(/\\/g, "/"))
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error.message
  }, null, 2));
  process.exitCode = 1;
}

function printHelpAndExit() {
  console.log([
    "Usage:",
    "  node scripts/g2m-create-batch.mjs <nom-du-batch>",
    "",
    "Exemple:",
    "  node scripts/g2m-create-batch.mjs 2026-07-04_sample-90",
    "",
    "Arborescence creee:",
    "  KBase-docs/kobo-geometry-extractions/batches/<batch>/00_source",
    "  KBase-docs/kobo-geometry-extractions/batches/<batch>/01_strategy",
    "  KBase-docs/kobo-geometry-extractions/batches/<batch>/02_output",
    "  KBase-docs/kobo-geometry-extractions/batches/<batch>/03_by-submission",
    "  KBase-docs/kobo-geometry-extractions/batches/<batch>/03_review",
    "  KBase-docs/kobo-geometry-extractions/batches/<batch>/04_reports",
    "  KBase-docs/kobo-geometry-extractions/batches/<batch>/05_reference_layers/sources",
    "  KBase-docs/kobo-geometry-extractions/batches/<batch>/06_matching"
  ].join("\n"));
  process.exit(0);
}
