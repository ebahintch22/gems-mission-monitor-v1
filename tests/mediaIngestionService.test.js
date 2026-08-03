process.env.DATABASE_PATH = ":memory:";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const db = require("../config/database");
const { checksumSha256 } = require("../services/wasabiStorageService");
const { ingestLocalMedia, normalizeLinks } = require("../services/mediaIngestionService");

test.after(() => db.close());

test("normalizeLinks valide les liens media", () => {
  assert.deepEqual(normalizeLinks({ entity_type: "site", role: "photo_site" }, []).length, 1);
  assert.throws(() => normalizeLinks({ role: "photo_site" }, []), /type d'entite/);
  assert.throws(() => normalizeLinks({ entity_type: "site" }, []), /role/);
});

test("ingestLocalMedia uploade un fichier local et cree media_files puis media_links", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "g2m-ingestion-"));
  const filePath = path.join(dir, "Photo batiment 01.jpg");
  fs.writeFileSync(filePath, "photo-content");
  const uploads = [];

  try {
    const result = await ingestLocalMedia({
      filePath,
      mediaId: "media-ingestion-test",
      source: "kobo",
      environment: "test",
      now: new Date("2026-08-02T12:00:00.000Z"),
      link: {
        entity_type: "submission",
        entity_ref: "kobo-submission-001",
        role: "photo_kobo",
        caption: "Photo Kobo"
      },
      uploadFileImpl: async (input) => {
        uploads.push(input);
        return {
          bucket: "g2m-media-test",
          object_key: input.objectKey,
          size_bytes: 13,
          checksum_sha256: checksumSha256("photo-content")
        };
      }
    });

    assert.equal(result.mediaFile.id, "media-ingestion-test");
    assert.equal(result.mediaFile.bucket, "g2m-media-test");
    assert.equal(result.mediaFile.object_key, "media/test/2026/08/media-ingestion-test/original/Photo_batiment_01.jpg");
    assert.equal(result.mediaFile.original_filename, "Photo batiment 01.jpg");
    assert.equal(result.mediaFile.mime_type, "image/jpeg");
    assert.equal(result.mediaFile.media_type, "image");
    assert.equal(result.mediaFile.source, "kobo");
    assert.equal(result.linksCreated, 1);
    assert.equal(uploads[0].contentType, "image/jpeg");

    const link = db.prepare("SELECT * FROM media_links WHERE media_file_id = ?").get("media-ingestion-test");
    assert.equal(link.entity_type, "submission");
    assert.equal(link.entity_ref, "kobo-submission-001");
    assert.equal(link.role, "photo_kobo");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
