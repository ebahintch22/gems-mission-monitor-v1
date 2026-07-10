const fs = require("node:fs");
const path = require("node:path");
const { createKoboClient } = require("./koboSyncService");
const { extractResults } = require("./koboClient");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_DOWNLOAD_ROOT = path.join(PROJECT_ROOT, "data", "kobo-assets");
const IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|gif|webp|bmp|tiff?)($|\?)/i;

async function listKoboImageAssets({
  client,
  assetUid,
  startIndex = 1,
  endIndex = 25
} = {}) {
  const koboClient = createKoboClient(client);
  const range = normalizeRange(startIndex, endIndex);
  const payload = await koboClient.listAssetData(assetUid, { limit: range.endIndex });
  const submissions = extractResults(payload).slice(range.startIndex - 1, range.endIndex);
  const images = submissions.flatMap((submission, index) => (
    findImageAssetsInSubmission(submission, {
      assetUid,
      submissionOrdinal: range.startIndex + index
    })
  ));

  return {
    assetUid,
    startIndex: range.startIndex,
    endIndex: range.endIndex,
    submissionsRead: submissions.length,
    imageCount: images.length,
    images,
    payload
  };
}

async function downloadKoboImageAssets({
  client,
  assetUid,
  selectedImages = [],
  downloadRoot = DEFAULT_DOWNLOAD_ROOT
} = {}) {
  const koboClient = createKoboClient(client);
  const selections = normalizeSelectedImages(selectedImages);
  const summary = {
    assetUid,
    downloadRoot,
    requested: selections.length,
    downloaded: 0,
    skipped: 0,
    errors: [],
    files: []
  };

  fs.mkdirSync(downloadRoot, { recursive: true });

  for (const image of selections) {
    try {
      const targetPath = targetPathForImage(downloadRoot, assetUid, image);
      if (fs.existsSync(targetPath) && !image.overwrite) {
        summary.skipped += 1;
        summary.files.push({ ...image, status: "skipped_exists", path: targetPath });
        continue;
      }

      const response = await koboClient.download(image.url);
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, buffer);
      summary.downloaded += 1;
      summary.files.push({
        ...image,
        status: "downloaded",
        path: targetPath,
        bytes: buffer.length
      });
    } catch (error) {
      summary.errors.push({
        url: image.url,
        filename: image.filename,
        error: error.message
      });
    }
  }

  return summary;
}

function findImageAssetsInSubmission(submission, context = {}) {
  const submissionId = sourceSubmissionId(submission);
  const attachmentImages = attachmentImageAssets(submission, context, submissionId);
  const urlImages = urlImageAssets(submission, context, submissionId, attachmentImages);
  return [...attachmentImages, ...urlImages];
}

function attachmentImageAssets(submission, context, submissionId) {
  const attachments = Array.isArray(submission?._attachments) ? submission._attachments : [];
  return attachments
    .filter((attachment) => isImageAttachment(attachment))
    .map((attachment, index) => {
      const url = attachment.download_url || attachment.download_large_url || attachment.download_medium_url || attachment.url;
      return normalizeImageAsset({
        source: "attachment",
        assetUid: context.assetUid,
        submissionOrdinal: context.submissionOrdinal,
        submissionId,
        fieldPath: attachment.question_xpath || attachment.question_name || attachment.field || "",
        filename: attachment.filename || fileNameFromUrl(url) || `image-${index + 1}`,
        mimetype: attachment.mimetype || attachment.mime_type || "",
        url
      });
    })
    .filter((image) => image.url);
}

function urlImageAssets(submission, context, submissionId, knownImages) {
  const knownUrls = new Set(knownImages.map((image) => image.url));
  const urls = [];
  visitValue(submission, "", (value, fieldPath) => {
    if (typeof value !== "string" || !looksLikeImageUrl(value) || knownUrls.has(value)) {
      return;
    }
    urls.push(normalizeImageAsset({
      source: "url_field",
      assetUid: context.assetUid,
      submissionOrdinal: context.submissionOrdinal,
      submissionId,
      fieldPath,
      filename: fileNameFromUrl(value),
      mimetype: "",
      url: value
    }));
  });
  return urls;
}

function normalizeImageAsset(image) {
  return {
    id: imageAssetId(image),
    source: image.source,
    asset_uid: image.assetUid || "",
    submission_ordinal: image.submissionOrdinal || null,
    submission_id: image.submissionId || "",
    field_path: image.fieldPath || "",
    filename: sanitizeFileName(image.filename || fileNameFromUrl(image.url) || "image"),
    mimetype: image.mimetype || "",
    url: image.url || ""
  };
}

function imageAssetId(image) {
  return Buffer.from([
    image.assetUid,
    image.submissionId,
    image.fieldPath,
    image.filename,
    image.url
  ].join("|")).toString("base64url");
}

function normalizeSelectedImages(selectedImages) {
  return (Array.isArray(selectedImages) ? selectedImages : [selectedImages])
    .map((value) => {
      if (!value) {
        return null;
      }
      if (typeof value === "string") {
        return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
      }
      return value;
    })
    .filter((image) => image && image.url);
}

function encodeSelectedImage(image) {
  return Buffer.from(JSON.stringify(image)).toString("base64url");
}

function targetPathForImage(downloadRoot, assetUid, image) {
  const assetDir = sanitizeFileName(assetUid || image.asset_uid || "asset");
  const submissionDir = sanitizeFileName(image.submission_id || `submission-${image.submission_ordinal || "unknown"}`);
  const filename = uniqueSafeFileName(image.filename || fileNameFromUrl(image.url) || "image");
  return path.join(downloadRoot, assetDir, submissionDir, filename);
}

function normalizeRange(startIndex, endIndex) {
  const start = Number(startIndex);
  const end = Number(endIndex);
  if (!Number.isInteger(start) || start <= 0) {
    throw new Error("L'indice de debut doit etre un entier positif.");
  }
  if (!Number.isInteger(end) || end < start) {
    throw new Error("L'indice de fin doit etre superieur ou egal a l'indice de debut.");
  }
  return {
    startIndex: start,
    endIndex: Math.min(end, 1000)
  };
}

function isImageAttachment(attachment) {
  const mime = String(attachment?.mimetype || attachment?.mime_type || "");
  const url = attachment?.download_url || attachment?.download_large_url || attachment?.download_medium_url || attachment?.url || "";
  const filename = attachment?.filename || "";
  return mime.startsWith("image/") || IMAGE_EXTENSION_PATTERN.test(filename) || IMAGE_EXTENSION_PATTERN.test(url);
}

function looksLikeImageUrl(value) {
  return /^https?:\/\//i.test(value) && IMAGE_EXTENSION_PATTERN.test(value);
}

function fileNameFromUrl(url) {
  if (!url) {
    return "";
  }
  try {
    const parsed = new URL(url);
    return decodeURIComponent(path.basename(parsed.pathname));
  } catch {
    return path.basename(String(url).split("?")[0]);
  }
}

function uniqueSafeFileName(filename) {
  const safe = sanitizeFileName(filename || "image");
  return path.extname(safe) ? safe : `${safe}.bin`;
}

function sanitizeFileName(value) {
  return String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 180) || "image";
}

function sourceSubmissionId(submission) {
  return String(submission?._uuid || submission?.uuid || submission?._id || submission?.id || "");
}

function visitValue(value, fieldPath, visitor) {
  visitor(value, fieldPath);
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitValue(item, `${fieldPath}/${index}`, visitor));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => {
      const nextPath = fieldPath ? `${fieldPath}/${key}` : key;
      visitValue(entry, nextPath, visitor);
    });
  }
}

module.exports = {
  DEFAULT_DOWNLOAD_ROOT,
  downloadKoboImageAssets,
  encodeSelectedImage,
  findImageAssetsInSubmission,
  listKoboImageAssets,
  normalizeSelectedImages
};
