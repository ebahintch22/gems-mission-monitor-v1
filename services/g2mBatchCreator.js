const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const BATCHES_ROOT = path.join(PROJECT_ROOT, "KBase-docs", "kobo-geometry-extractions", "batches");
const STANDARD_BATCH_DIRECTORIES = [
  "00_source",
  "01_strategy",
  "02_output",
  "03_by-submission",
  "03_review",
  "04_reports",
  path.join("05_reference_layers", "sources"),
  "06_matching"
];

function createG2mBatch(batchName, options = {}) {
  const normalizedName = normalizeBatchName(batchName);
  const batchesRoot = options.batchesRoot || BATCHES_ROOT;
  const batchPath = path.join(batchesRoot, normalizedName);

  fs.mkdirSync(batchPath, { recursive: true });
  const directories = STANDARD_BATCH_DIRECTORIES.map((relativePath) => {
    const absolutePath = path.join(batchPath, relativePath);
    fs.mkdirSync(absolutePath, { recursive: true });
    return {
      relativePath,
      absolutePath
    };
  });

  return {
    batchName: normalizedName,
    batchPath,
    directories
  };
}

function normalizeBatchName(batchName) {
  const normalized = String(batchName || "").trim();
  if (!normalized) {
    throw new Error("Le nom du batch est requis. Exemple: node scripts/g2m-create-batch.mjs 2026-07-04_sample-90");
  }
  if (normalized.includes("/") || normalized.includes("\\") || normalized.includes("..")) {
    throw new Error("Nom de batch invalide: les separateurs de chemin et '..' sont interdits.");
  }
  if (!/^[A-Za-z0-9._-]+$/.test(normalized)) {
    throw new Error("Nom de batch invalide: seuls lettres, chiffres, points, tirets et underscores sont autorises.");
  }
  return normalized;
}

module.exports = {
  BATCHES_ROOT,
  STANDARD_BATCH_DIRECTORIES,
  createG2mBatch,
  normalizeBatchName
};
