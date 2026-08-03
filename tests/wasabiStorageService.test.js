const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  checksumSha256,
  createMediaObjectKey,
  createPresignedUrl,
  detectMimeTypeFromFilename,
  detectMediaType,
  getWasabiStatus,
  inspectLocalFile,
  uploadBuffer,
  uploadFile
} = require("../services/wasabiStorageService");

const env = {
  WASABI_ACCESS_KEY_ID: "access-test",
  WASABI_SECRET_ACCESS_KEY: "secret-test",
  WASABI_REGION: "eu-central-1",
  WASABI_BUCKET: "g2m-media-test",
  WASABI_ENDPOINT: "https://s3.eu-central-1.wasabisys.com"
};

test("createPresignedUrl genere une URL signee Wasabi compatible S3", () => {
  const url = new URL(createPresignedUrl({
    objectKey: "media/test/2026/07/id/original/photo.jpg",
    now: new Date("2026-07-14T10:00:00.000Z"),
    env
  }));

  assert.equal(url.origin, "https://s3.eu-central-1.wasabisys.com");
  assert.equal(url.pathname, "/g2m-media-test/media/test/2026/07/id/original/photo.jpg");
  assert.equal(url.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assert.equal(url.searchParams.get("X-Amz-Credential"), "access-test/20260714/eu-central-1/s3/aws4_request");
  assert.equal(url.searchParams.get("X-Amz-Date"), "20260714T100000Z");
  assert.equal(url.searchParams.get("X-Amz-Expires"), "900");
  assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "host");
  assert.match(url.searchParams.get("X-Amz-Signature"), /^[a-f0-9]{64}$/);
});

test("createMediaObjectKey normalise la convention de stockage", () => {
  const key = createMediaObjectKey({
    mediaId: "media-001",
    originalFilename: "Photo bâtiment 01.jpg",
    environment: "Préprod",
    now: new Date("2026-07-14T10:00:00.000Z")
  });

  assert.equal(key, "media/pr-prod/2026/07/media-001/original/Photo_bâtiment_01.jpg");
});

test("detectMediaType classe les principaux types de fichiers", () => {
  assert.equal(detectMediaType("image/jpeg", "photo.jpg"), "image");
  assert.equal(detectMediaType("video/mp4", "visite.mp4"), "video");
  assert.equal(detectMediaType("application/pdf", "rapport.pdf"), "pdf");
  assert.equal(detectMediaType("", "archive.zip"), "archive");
  assert.equal(detectMediaType("text/csv", "liste.csv"), "document");
  assert.equal(detectMediaType("application/octet-stream", "blob.bin"), "other");
});

test("detectMimeTypeFromFilename deduit les types MIME courants", () => {
  assert.equal(detectMimeTypeFromFilename("photo.JPG"), "image/jpeg");
  assert.equal(detectMimeTypeFromFilename("rapport.pdf"), "application/pdf");
  assert.equal(detectMimeTypeFromFilename("inconnu.bin"), "application/octet-stream");
});

test("getWasabiStatus indique si la configuration est complete", () => {
  assert.equal(getWasabiStatus(env).ready, true);
  assert.equal(getWasabiStatus({ ...env, WASABI_SECRET_ACCESS_KEY: "" }).ready, false);
});

test("inspectLocalFile calcule les metadonnees d'un fichier local", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "g2m-media-"));
  const filePath = path.join(dir, "photo-site.jpg");
  fs.writeFileSync(filePath, "image-test");

  try {
    const metadata = await inspectLocalFile(filePath);
    assert.equal(metadata.original_filename, "photo-site.jpg");
    assert.equal(metadata.stored_filename, "photo-site.jpg");
    assert.equal(metadata.mime_type, "image/jpeg");
    assert.equal(metadata.media_type, "image");
    assert.equal(metadata.size_bytes, 10);
    assert.equal(metadata.checksum_sha256, checksumSha256("image-test"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("uploadBuffer signe un PUT sans dependance reseau obligatoire", async () => {
  const calls = [];
  const result = await uploadBuffer({
    objectKey: "media/test/file.txt",
    body: "hello",
    contentType: "text/plain",
    env,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, text: async () => "" };
    }
  });

  assert.equal(result.bucket, "g2m-media-test");
  assert.equal(result.object_key, "media/test/file.txt");
  assert.equal(result.size_bytes, 5);
  assert.equal(result.checksum_sha256, checksumSha256("hello"));
  assert.equal(calls[0].url, "https://s3.eu-central-1.wasabisys.com/g2m-media-test/media/test/file.txt");
  assert.match(calls[0].options.headers.Authorization, /^AWS4-HMAC-SHA256 Credential=access-test\//);
});

test("uploadBuffer retente apres une erreur reseau temporaire", async () => {
  let attempts = 0;
  const result = await uploadBuffer({
    objectKey: "media/test/retry.txt",
    body: "retry",
    contentType: "text/plain",
    env,
    retryDelayMs: 0,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error("fetch failed");
        error.cause = { code: "ECONNRESET", message: "socket hang up" };
        throw error;
      }
      return { ok: true, status: 200, text: async () => "" };
    }
  });

  assert.equal(attempts, 2);
  assert.equal(result.size_bytes, 5);
});

test("uploadBuffer expose le detail technique d'une erreur reseau", async () => {
  await assert.rejects(
    uploadBuffer({
      objectKey: "media/test/error.txt",
      body: "error",
      contentType: "text/plain",
      env,
      retries: 1,
      fetchImpl: async () => {
        const error = new Error("fetch failed");
        error.cause = { code: "ETIMEDOUT", message: "connection timed out" };
        throw error;
      }
    }),
    /Upload Wasabi impossible: fetch failed - ETIMEDOUT - connection timed out/
  );
});

test("uploadFile charge un fichier local avant l'envoi Wasabi", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "g2m-media-"));
  const filePath = path.join(dir, "document.txt");
  fs.writeFileSync(filePath, "hello file");
  const calls = [];

  try {
    const result = await uploadFile({
      filePath,
      objectKey: "media/test/document.txt",
      env,
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return { ok: true, status: 200, text: async () => "" };
      }
    });

    assert.equal(result.size_bytes, 10);
    assert.equal(result.checksum_sha256, checksumSha256("hello file"));
    assert.equal(calls[0].options.headers["Content-Type"], "text/plain");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
