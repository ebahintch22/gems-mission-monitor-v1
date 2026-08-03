const crypto = require("node:crypto");
const path = require("node:path");
const MediaFile = require("../models/MediaFile");
const {
  createMediaObjectKey,
  inspectLocalFile,
  uploadFile
} = require("./wasabiStorageService");

async function ingestLocalMedia({
  filePath,
  originalFilename,
  mimeType,
  source = "import",
  visibility = "private",
  createdBy = null,
  links = [],
  link,
  mediaId = crypto.randomUUID(),
  environment = process.env.NODE_ENV || "local",
  now = new Date(),
  uploadFileImpl = uploadFile,
  env = process.env,
  fetchImpl = fetch
} = {}) {
  if (!filePath) {
    throw new Error("Le chemin du fichier local est obligatoire.");
  }

  const normalizedLinks = normalizeLinks(link, links);
  const metadata = await inspectLocalFile(filePath, { contentType: mimeType });
  const filename = originalFilename || metadata.original_filename || path.basename(filePath);
  const objectKey = createMediaObjectKey({
    mediaId,
    originalFilename: filename,
    variant: "original",
    environment,
    now
  });

  const uploadResult = await uploadFileImpl({
    filePath,
    objectKey,
    contentType: metadata.mime_type,
    env,
    fetchImpl
  });

  const mediaFile = MediaFile.create({
    id: mediaId,
    bucket: uploadResult.bucket,
    object_key: uploadResult.object_key,
    original_filename: filename,
    stored_filename: path.basename(objectKey),
    mime_type: metadata.mime_type,
    media_type: metadata.media_type,
    size_bytes: uploadResult.size_bytes ?? metadata.size_bytes,
    checksum_sha256: uploadResult.checksum_sha256 || metadata.checksum_sha256,
    storage_provider: "wasabi",
    source,
    visibility,
    created_by: createdBy
  });

  const linkIds = normalizedLinks.map((entry, index) => MediaFile.createLink({
    media_file_id: mediaFile.id,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    entity_ref: entry.entity_ref,
    role: entry.role,
    caption: entry.caption,
    sort_order: entry.sort_order ?? index
  }));

  return {
    mediaFile,
    linksCreated: linkIds.length,
    linkIds,
    objectKey,
    upload: uploadResult,
    metadata
  };
}

function normalizeLinks(link, links) {
  const values = [];
  if (link) {
    values.push(link);
  }
  if (Array.isArray(links)) {
    values.push(...links);
  }

  return values
    .filter(Boolean)
    .map((entry) => {
      if (!entry.entity_type) {
        throw new Error("Le type d'entite du lien media est obligatoire.");
      }
      if (!entry.role) {
        throw new Error("Le role du lien media est obligatoire.");
      }
      return entry;
    });
}

module.exports = {
  ingestLocalMedia,
  normalizeLinks
};
