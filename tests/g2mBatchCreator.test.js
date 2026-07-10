const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  STANDARD_BATCH_DIRECTORIES,
  createG2mBatch,
  normalizeBatchName
} = require("../services/g2mBatchCreator");

test("createG2mBatch cree l'arborescence standard d'un batch", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "g2m-batch-creator-"));
  const result = createG2mBatch("2026-07-04_sample-90", { batchesRoot: tmp });

  assert.equal(result.batchName, "2026-07-04_sample-90");
  assert.equal(fs.existsSync(result.batchPath), true);
  STANDARD_BATCH_DIRECTORIES.forEach((relativePath) => {
    assert.equal(fs.statSync(path.join(result.batchPath, relativePath)).isDirectory(), true);
  });
});

test("normalizeBatchName refuse les noms ambigus ou dangereux", () => {
  assert.equal(normalizeBatchName(" 2026-07-04_sample-90 "), "2026-07-04_sample-90");
  assert.throws(() => normalizeBatchName(""), /nom du batch est requis/i);
  assert.throws(() => normalizeBatchName("../secret"), /Nom de batch invalide/);
  assert.throws(() => normalizeBatchName("batch/test"), /Nom de batch invalide/);
  assert.throws(() => normalizeBatchName("batch test"), /Nom de batch invalide/);
});
