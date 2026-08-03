process.env.DATABASE_PATH = ":memory:";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const db = require("../config/database");
const MediaFile = require("../models/MediaFile");
const { checksumSha256 } = require("../services/wasabiStorageService");
const {
  buildKoboMediaLinks,
  inferBusinessMediaRole,
  getLocalKoboMediaUploadManifest,
  getLocalKoboMediaUploadStatus,
  cancelLocalKoboMediaUploadJob,
  listLocalKoboAssetFiles,
  listLocalKoboMediaUploadManifests,
  startLocalKoboMediaUploadJob,
  uploadLocalKoboAssetsToWasabi
} = require("../services/koboLocalMediaUploadService");

test.after(() => db.close());

test("listLocalKoboAssetFiles inventorie le depot local Kobo", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g2m-kobo-local-"));
  const filePath = path.join(root, "asset-001", "submission-001", "photo-site.jpg");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "photo");

  try {
    const files = listLocalKoboAssetFiles({ downloadRoot: root, assetUid: "asset-001" });
    assert.equal(files.length, 1);
    assert.equal(files[0].asset_uid, "asset-001");
    assert.equal(files[0].submission_id, "submission-001");
    assert.equal(files[0].filename, "photo-site.jpg");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("listLocalKoboAssetFiles selectionne une plage de soumissions triee par date Kobo", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g2m-kobo-local-"));
  const assetUid = "asset-range";
  const files = [
    path.join(root, assetUid, "submission-late", "photo-late.jpg"),
    path.join(root, assetUid, "submission-early", "photo-early.jpg"),
    path.join(root, assetUid, "submission-middle", "photo-middle.jpg")
  ];
  files.forEach((filePath) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, path.basename(filePath));
  });
  const missionId = db.prepare(`
    INSERT INTO missions (name, region, status, kobo_asset_uid)
    VALUES ('Mission media range', 'Test', 'en_cours', @asset_uid)
  `).run({ asset_uid: assetUid }).lastInsertRowid;
  [
    ["submission-late", "2026-08-03T12:00:00.000Z"],
    ["submission-early", "2026-08-01T12:00:00.000Z"],
    ["submission-middle", "2026-08-02T12:00:00.000Z"]
  ].forEach(([submissionId, submittedAt]) => {
    db.prepare(`
      INSERT INTO soumissions_collecte (
        source, source_submission_id, kobo_asset_uid, mission_id,
        submitted_at, latitude, longitude, precision_m,
        statut_validation, anomaly_count, formulaire_type, raw_data_json
      ) VALUES (
        'kobo', @submission_id, @asset_uid, @mission_id,
        @submitted_at, 5, -4, 1,
        'a_verifier', 0, 'padci', '{}'
      )
    `).run({
      submission_id: submissionId,
      asset_uid: assetUid,
      mission_id: missionId,
      submitted_at: submittedAt
    });
  });

  try {
    const selected = listLocalKoboAssetFiles({
      downloadRoot: root,
      assetUid,
      submissionIndexFrom: 2,
      submissionIndexTo: 3
    });

    assert.deepEqual(selected.map((file) => file.submission_id), ["submission-middle", "submission-late"]);
    assert.deepEqual(selected.map((file) => file.filename), ["photo-middle.jpg", "photo-late.jpg"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("uploadLocalKoboAssetsToWasabi audite le depot local en dry-run", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g2m-kobo-local-"));
  const filePath = path.join(root, "asset-001", "submission-001", "photo-site.jpg");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "photo");

  try {
    const summary = await uploadLocalKoboAssetsToWasabi({
      downloadRoot: root,
      assetUid: "asset-001",
      dryRun: true
    });

    assert.equal(summary.requested, 1);
    assert.equal(summary.uploaded, 0);
    assert.equal(summary.skipped, 1);
    assert.equal(summary.files[0].status, "dry_run");
    assert.equal(summary.files[0].checksum_sha256, checksumSha256("photo"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("buildKoboMediaLinks rattache aussi le media au site si la soumission existe", () => {
  const links = buildKoboMediaLinks({
    file: {
      submission_id: "submission-linked",
      filename: "photo_batiment_01.jpg"
    },
    submission: {
      id: 42,
      raw_data_json: JSON.stringify({
        "modA/fiche_id": "PADCI-SITE-001",
        "modB/nom_officiel": "Site test"
      })
    }
  });

  assert.equal(links.length, 2);
  assert.equal(links[0].entity_type, "submission");
  assert.equal(links[0].entity_id, "42");
  assert.equal(links[0].entity_ref, "submission-linked");
  assert.equal(links[0].role, "photo_kobo");
  assert.equal(links[1].entity_type, "site");
  assert.equal(links[1].entity_ref, "PADCI-SITE-001");
  assert.equal(links[1].role, "photo_batiment");
  assert.equal(inferBusinessMediaRole("photo_pylone_2.jpg"), "photo_pylone");
  assert.equal(inferBusinessMediaRole("raccordement.png"), "photo_raccordement");
  assert.equal(inferBusinessMediaRole("site.jpg"), "photo_site");
});

test("uploadLocalKoboAssetsToWasabi persiste un manifeste de lot", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g2m-kobo-local-"));
  const filePath = path.join(root, "asset-manifest", "submission-manifest", "photo.jpg");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "manifest-photo");

  try {
    const summary = await uploadLocalKoboAssetsToWasabi({
      downloadRoot: root,
      assetUid: "asset-manifest",
      dryRun: true,
      persistManifest: true
    });
    const manifest = getLocalKoboMediaUploadManifest(summary.job_id);
    const recent = listLocalKoboMediaUploadManifests(5);

    assert.equal(manifest.job_id, summary.job_id);
    assert.equal(manifest.status, "completed");
    assert.equal(manifest.requested, 1);
    assert.equal(manifest.files[0].status, "dry_run");
    assert.ok(recent.some((entry) => entry.job_id === summary.job_id));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("uploadLocalKoboAssetsToWasabi televerse et renseigne les tables media", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g2m-kobo-local-"));
  const filePath = path.join(root, "asset-002", "submission-002", "photo-batiment.jpg");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "photo-building");
  const missionId = db.prepare(`
    INSERT INTO missions (name, region, status, kobo_asset_uid)
    VALUES ('Mission media local', 'Test', 'en_cours', 'asset-002')
  `).run().lastInsertRowid;
  const submissionDbId = db.prepare(`
    INSERT INTO soumissions_collecte (
      source, source_submission_id, kobo_asset_uid, mission_id,
      submitted_at, latitude, longitude, precision_m,
      statut_validation, anomaly_count, formulaire_type, raw_data_json
    ) VALUES (
      'kobo', 'submission-002', 'asset-002', @mission_id,
      '2026-08-02T12:00:00.000Z', 5, -4, 1,
      'a_verifier', 0, 'padci', @raw_data_json
    )
  `).run({
    mission_id: missionId,
    raw_data_json: JSON.stringify({
      "modA/fiche_id": "PADCI-SITE-002",
      "modB/nom_officiel": "Site rattache"
    })
  }).lastInsertRowid;

  try {
    const summary = await uploadLocalKoboAssetsToWasabi({
      downloadRoot: root,
      assetUid: "asset-002",
      ingestLocalMediaImpl: async (input) => {
        assert.equal(input.source, "kobo");
        assert.equal(input.links[0].entity_type, "submission");
        assert.equal(input.links[0].entity_ref, "submission-002");
        return require("../services/mediaIngestionService").ingestLocalMedia({
          ...input,
          mediaId: "media-local-upload-test",
          environment: "test",
          uploadFileImpl: async ({ objectKey }) => ({
            bucket: "g2m-media-test",
            object_key: objectKey,
            size_bytes: 14,
            checksum_sha256: checksumSha256("photo-building")
          })
        });
      }
    });

    assert.equal(summary.uploaded, 1);
    assert.equal(summary.errors.length, 0);
    assert.equal(summary.files[0].status, "uploaded");
    assert.equal(summary.files[0].media_file_id, "media-local-upload-test");
    assert.equal(summary.files[0].local_size_bytes, 14);
    assert.equal(summary.files[0].size_bytes, 14);

    const media = MediaFile.findById("media-local-upload-test");
    assert.equal(media.source, "kobo");
    const link = db.prepare("SELECT * FROM media_links WHERE media_file_id = ?").get(media.id);
    assert.equal(link.entity_type, "submission");
    assert.equal(link.entity_ref, "submission-002");
    assert.equal(link.role, "photo_kobo");
    const links = db.prepare("SELECT * FROM media_links WHERE media_file_id = ? ORDER BY sort_order").all(media.id);
    assert.equal(links.length, 2);
    assert.equal(links[0].entity_type, "submission");
    assert.equal(links[0].entity_id, String(submissionDbId));
    assert.equal(links[1].entity_type, "site");
    assert.equal(links[1].entity_ref, "PADCI-SITE-002");
    assert.equal(links[1].role, "photo_batiment");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("startLocalKoboMediaUploadJob expose la progression du televersement", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g2m-kobo-local-"));
  const filePath = path.join(root, "asset-job", "submission-job", "photo-job.jpg");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "photo-job");
  let releaseUpload;
  const uploadReleased = new Promise((resolve) => {
    releaseUpload = resolve;
  });

  try {
    const job = startLocalKoboMediaUploadJob({
      downloadRoot: root,
      assetUid: "asset-job",
      ingestLocalMediaImpl: async (input) => {
        await uploadReleased;
        return require("../services/mediaIngestionService").ingestLocalMedia({
          ...input,
          mediaId: "media-local-job-test",
          environment: "test",
          uploadFileImpl: async ({ objectKey }) => ({
            bucket: "g2m-media-test",
            object_key: objectKey,
            size_bytes: 9,
            checksum_sha256: checksumSha256("photo-job")
          })
        });
      }
    });

    const running = getLocalKoboMediaUploadStatus(job.jobId);
    assert.equal(running.running, true);
    assert.equal(running.manifest.status, "running");
    assert.equal(running.manifest.requested, 1);

    releaseUpload();
    const completed = await waitForUploadStatus(job.jobId, "completed");
    assert.equal(completed.running, false);
    assert.equal(completed.manifest.processed, 1);
    assert.equal(completed.manifest.uploaded, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("cancelLocalKoboMediaUploadJob arrete le televersement avant le fichier suivant", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g2m-kobo-local-"));
  const firstPath = path.join(root, "asset-cancel", "submission-cancel", "photo-1.jpg");
  const secondPath = path.join(root, "asset-cancel", "submission-cancel", "photo-2.jpg");
  fs.mkdirSync(path.dirname(firstPath), { recursive: true });
  fs.writeFileSync(firstPath, "photo-cancel-1");
  fs.writeFileSync(secondPath, "photo-cancel-2");
  let releaseUpload;
  const uploadReleased = new Promise((resolve) => {
    releaseUpload = resolve;
  });
  let uploadAttempts = 0;

  try {
    const job = startLocalKoboMediaUploadJob({
      downloadRoot: root,
      assetUid: "asset-cancel",
      ingestLocalMediaImpl: async (input) => {
        uploadAttempts += 1;
        await uploadReleased;
        return require("../services/mediaIngestionService").ingestLocalMedia({
          ...input,
          mediaId: "media-local-cancel-test",
          environment: "test",
          uploadFileImpl: async ({ objectKey }) => ({
            bucket: "g2m-media-test",
            object_key: objectKey,
            size_bytes: 14,
            checksum_sha256: checksumSha256("photo-cancel-1")
          })
        });
      }
    });

    await waitForUploadAttempts(() => uploadAttempts >= 1);
    const cancelled = cancelLocalKoboMediaUploadJob(job.jobId);
    assert.equal(cancelled.cancelled, true);
    assert.equal(cancelled.manifest.cancel_requested, true);

    releaseUpload();
    const completed = await waitForUploadStatus(job.jobId, "cancelled");
    assert.equal(completed.manifest.status, "cancelled");
    assert.equal(completed.manifest.processed, 1);
    assert.equal(completed.manifest.uploaded, 1);
    assert.equal(uploadAttempts, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("uploadLocalKoboAssetsToWasabi ignore un fichier deja lie a la soumission", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g2m-kobo-local-"));
  const filePath = path.join(root, "asset-003", "submission-003", "photo-site.jpg");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "same-photo");
  const checksum = checksumSha256("same-photo");

  try {
    MediaFile.create({
      id: "media-existing-kobo",
      bucket: "g2m-media-test",
      object_key: "media/test/existing/photo-site.jpg",
      original_filename: "photo-site.jpg",
      stored_filename: "photo-site.jpg",
      mime_type: "image/jpeg",
      media_type: "image",
      size_bytes: 10,
      checksum_sha256: checksum,
      source: "kobo"
    });
    MediaFile.createLink({
      media_file_id: "media-existing-kobo",
      entity_type: "submission",
      entity_ref: "submission-003",
      role: "photo_kobo"
    });

    const summary = await uploadLocalKoboAssetsToWasabi({
      downloadRoot: root,
      assetUid: "asset-003",
      ingestLocalMediaImpl: async () => {
        throw new Error("ne doit pas uploader");
      }
    });

    assert.equal(summary.uploaded, 0);
    assert.equal(summary.skipped, 1);
    assert.equal(summary.files[0].status, "skipped_existing_media");
    assert.equal(summary.files[0].media_file_id, "media-existing-kobo");
    assert.equal(summary.files[0].local_size_bytes, 10);
    assert.equal(summary.files[0].size_bytes, 10);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

async function waitForUploadStatus(jobId, expectedStatus) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = getLocalKoboMediaUploadStatus(jobId);
    if (status.manifest?.status === expectedStatus) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return getLocalKoboMediaUploadStatus(jobId);
}

async function waitForUploadAttempts(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
