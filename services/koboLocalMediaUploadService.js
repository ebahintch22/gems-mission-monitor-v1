const fs = require("node:fs");
const path = require("node:path");
const KoboMediaUploadLog = require("../models/KoboMediaUploadLog");
const KoboMediaAttachment = require("../models/KoboMediaAttachment");
const MediaFile = require("../models/MediaFile");
const SoumissionCollecte = require("../models/SoumissionCollecte");
const { DEFAULT_DOWNLOAD_ROOT } = require("./koboAssetDownloadService");
const { ingestLocalMedia } = require("./mediaIngestionService");
const { inspectLocalFile } = require("./wasabiStorageService");

const KOBO_MEDIA_ROLE = "photo_kobo";
const SITE_MEDIA_ROLE = "photo_site";
const RUNNING_UPLOAD_JOBS = new Map();

function startLocalKoboMediaUploadJob(input = {}) {
  const options = normalizeUploadOptions(input);
  const files = listLocalKoboAssetFiles(options);
  const manifest = createInitialManifest({
    ...options,
    files,
    startedAt: new Date().toISOString()
  });
  const logId = KoboMediaUploadLog.create({
    manifest,
    actorUserId: input.actorUserId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent
  });

  RUNNING_UPLOAD_JOBS.set(manifest.job_id, {
    manifest,
    logId,
    cancelRequested: false
  });

  uploadLocalKoboAssetsToWasabi({
    ...options,
    jobId: manifest.job_id,
    persistManifest: false,
    actorUserId: input.actorUserId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    ingestLocalMediaImpl: input.ingestLocalMediaImpl,
    env: input.env,
    fetchImpl: input.fetchImpl,
    onProgress: (progressManifest) => {
      const running = RUNNING_UPLOAD_JOBS.get(manifest.job_id);
      RUNNING_UPLOAD_JOBS.set(manifest.job_id, {
        manifest: progressManifest,
        logId,
        cancelRequested: running?.cancelRequested === true
      });
      KoboMediaUploadLog.update(logId, progressManifest);
    },
    shouldCancel: () => RUNNING_UPLOAD_JOBS.get(manifest.job_id)?.cancelRequested === true
  }).catch((error) => {
    manifest.status = "failed";
    manifest.errors.push({ error: error.message });
    manifest.updated_at = new Date().toISOString();
    KoboMediaUploadLog.update(logId, manifest);
  }).finally(() => {
    RUNNING_UPLOAD_JOBS.delete(manifest.job_id);
  });

  return {
    jobId: manifest.job_id,
    manifest
  };
}

function cancelLocalKoboMediaUploadJob(jobId) {
  const running = RUNNING_UPLOAD_JOBS.get(jobId);
  if (!running) {
    const stored = KoboMediaUploadLog.findByJobId(jobId);
    return {
      running: false,
      cancelled: false,
      manifest: stored?.manifest || null
    };
  }

  running.cancelRequested = true;
  running.manifest.cancel_requested = true;
  running.manifest.updated_at = new Date().toISOString();
  KoboMediaUploadLog.update(running.logId, running.manifest);
  return {
    running: true,
    cancelled: true,
    manifest: running.manifest
  };
}

function getLocalKoboMediaUploadStatus(jobId) {
  const running = RUNNING_UPLOAD_JOBS.get(jobId);
  if (running) {
    return {
      running: true,
      manifest: running.manifest
    };
  }

  const stored = KoboMediaUploadLog.findByJobId(jobId);
  return {
    running: false,
    manifest: stored?.manifest || null
  };
}

async function uploadLocalKoboAssetsToWasabi({
  assetUid,
  submissionId,
  submissionIndexFrom,
  submissionIndexTo,
  submission_index_from: submissionIndexFromLegacy,
  submission_index_to: submissionIndexToLegacy,
  downloadRoot = DEFAULT_DOWNLOAD_ROOT,
  dryRun = false,
  deleteLocalAfterUpload = false,
  persistManifest = false,
  jobId,
  onProgress,
  actorUserId,
  ipAddress,
  userAgent,
  ingestLocalMediaImpl = ingestLocalMedia,
  env = process.env,
  fetchImpl = fetch,
  shouldCancel
} = {}) {
  const options = normalizeUploadOptions({
    assetUid,
    submissionId,
    submissionIndexFrom,
    submissionIndexTo,
    submission_index_from: submissionIndexFromLegacy,
    submission_index_to: submissionIndexToLegacy,
    downloadRoot,
    dryRun,
    deleteLocalAfterUpload
  });
  const startedAt = new Date().toISOString();
  const files = listLocalKoboAssetFiles(options);
  const summary = createInitialManifest({
    ...options,
    files,
    startedAt,
    jobId
  });
  notifyProgress(onProgress, summary);

  for (const file of files) {
    if (typeof shouldCancel === "function" && shouldCancel()) {
      markUploadCancelled(summary, onProgress);
      break;
    }
    let metadata;
    try {
      metadata = await inspectLocalFile(file.path);
      const submission = SoumissionCollecte.findBySourceSubmissionId(file.submission_id, file.asset_uid);
      const links = buildKoboMediaLinks({ file, submission });
      const existing = MediaFile.findLinkedByChecksum({
        checksum_sha256: metadata.checksum_sha256,
        entity_type: "submission",
        entity_ref: file.submission_id,
        role: KOBO_MEDIA_ROLE
      });

      if (existing) {
        const mapping = upsertKoboMediaAttachment({
          file,
          submission,
          mediaFile: existing,
          checksumSha256: metadata.checksum_sha256
        });
        summary.skipped += 1;
        summary.files.push({
          ...file,
          status: "skipped_existing_media",
          media_file_id: existing.id,
          kobo_media_attachment_id: mapping?.id || null,
          checksum_sha256: metadata.checksum_sha256,
          local_size_bytes: metadata.size_bytes,
          size_bytes: existing.size_bytes,
          links_created: ensureMediaLinks(existing.id, links)
        });
        continue;
      }

      if (dryRun) {
        summary.skipped += 1;
        summary.files.push({
          ...file,
          status: "dry_run",
          checksum_sha256: metadata.checksum_sha256,
          size_bytes: metadata.size_bytes,
          mime_type: metadata.mime_type,
          media_type: metadata.media_type
        });
        continue;
      }

      const result = await ingestLocalMediaImpl({
        filePath: file.path,
        originalFilename: file.filename,
        mimeType: metadata.mime_type,
        source: "kobo",
        visibility: "private",
        links,
        env,
        fetchImpl
      });

      summary.uploaded += 1;
      const mapping = upsertKoboMediaAttachment({
        file,
        submission,
        mediaFile: result.mediaFile,
        checksumSha256: result.mediaFile.checksum_sha256 || metadata.checksum_sha256
      });
      const entry = {
        ...file,
        status: "uploaded",
        media_file_id: result.mediaFile.id,
        kobo_media_attachment_id: mapping?.id || null,
        object_key: result.mediaFile.object_key,
        checksum_sha256: result.mediaFile.checksum_sha256,
        local_size_bytes: metadata.size_bytes,
        size_bytes: result.mediaFile.size_bytes,
        links_created: result.linksCreated
      };

      if (deleteLocalAfterUpload) {
        fs.unlinkSync(file.path);
        summary.deletedLocal += 1;
        entry.local_deleted = true;
      }

      summary.files.push(entry);
    } catch (error) {
      summary.errors.push({
        path: file.path,
        asset_uid: file.asset_uid,
        submission_id: file.submission_id,
        filename: file.filename,
        local_size_bytes: metadata?.size_bytes,
        error: error.message
      });
    }
    summary.updated_at = new Date().toISOString();
    notifyProgress(onProgress, summary);
  }

  if (summary.status !== "cancelled") {
    summary.status = summary.errors.length ? "completed_with_errors" : "completed";
  }
  summary.updated_at = new Date().toISOString();
  notifyProgress(onProgress, summary);
  if (persistManifest) {
    KoboMediaUploadLog.create({
      manifest: summary,
      actorUserId,
      ipAddress,
      userAgent
    });
  }

  return summary;
}

function listLocalKoboMediaUploadManifests(limit = 10) {
  return KoboMediaUploadLog.recent(limit).map((entry) => entry.manifest);
}

function getLocalKoboMediaUploadManifest(jobId) {
  return KoboMediaUploadLog.findByJobId(jobId)?.manifest || null;
}

function createInitialManifest({
  assetUid,
  submissionId,
  submissionIndexFrom,
  submissionIndexTo,
  downloadRoot,
  dryRun,
  deleteLocalAfterUpload,
  files,
  startedAt,
  jobId
}) {
  const initialStartedAt = startedAt || new Date().toISOString();
  return {
    job_id: jobId || createJobId({ assetUid, submissionId, startedAt: initialStartedAt }),
    mode: "local_staging",
    assetUid: assetUid || "",
    submissionId: submissionId || "",
    submissionIndexFrom: submissionIndexFrom || "",
    submissionIndexTo: submissionIndexTo || "",
    submissionSort: "submitted_at_asc_then_source_submission_id",
    downloadRoot,
    dryRun: Boolean(dryRun),
    deleteLocalAfterUpload: Boolean(deleteLocalAfterUpload),
    status: "running",
    requested: files.length,
    processed: 0,
    uploaded: 0,
    skipped: 0,
    deletedLocal: 0,
    errors: [],
    files: [],
    started_at: initialStartedAt,
    updated_at: initialStartedAt
  };
}

function notifyProgress(callback, summary) {
  summary.processed = summary.uploaded + summary.skipped + summary.errors.length;
  if (typeof callback === "function") {
    callback({
      ...summary,
      errors: summary.errors.map((entry) => ({ ...entry })),
      files: summary.files.map((entry) => ({ ...entry }))
    });
  }
}

function markUploadCancelled(summary, onProgress) {
  summary.status = "cancelled";
  summary.cancelled = true;
  summary.cancelled_at = new Date().toISOString();
  summary.updated_at = summary.cancelled_at;
  notifyProgress(onProgress, summary);
}

function normalizeUploadOptions(input = {}) {
  return {
    assetUid: String(input.assetUid || input.asset_uid || "").trim(),
    submissionId: String(input.submissionId || input.submission_id || "").trim(),
    submissionIndexFrom: normalizePositiveInteger(input.submissionIndexFrom || input.submission_index_from),
    submissionIndexTo: normalizePositiveInteger(input.submissionIndexTo || input.submission_index_to),
    downloadRoot: input.downloadRoot || input.download_root || DEFAULT_DOWNLOAD_ROOT,
    dryRun: input.dryRun === true || input.dry_run === true || input.dry_run === "on",
    deleteLocalAfterUpload: input.deleteLocalAfterUpload === true
      || input.delete_local_after_upload === true
      || input.delete_local_after_upload === "on"
  };
}

function buildKoboMediaLinks({ file, submission } = {}) {
  const links = [{
    entity_type: "submission",
    entity_id: submission?.id ? String(submission.id) : null,
    entity_ref: file.submission_id,
    role: KOBO_MEDIA_ROLE,
    caption: file.filename,
    sort_order: 0
  }];

  const siteRef = siteReferenceFromSubmission(submission);
  if (siteRef) {
    links.push({
      entity_type: "site",
      entity_id: submission?.id ? String(submission.id) : null,
      entity_ref: siteRef,
      role: inferBusinessMediaRole(file.filename),
      caption: file.filename,
      sort_order: 1
    });
  }

  return links;
}

function upsertKoboMediaAttachment({ file, submission, mediaFile, checksumSha256 } = {}) {
  if (!file?.submission_id || !mediaFile?.id) {
    return null;
  }
  const attachment = findKoboAttachmentForLocalFile({ file, submission });
  return KoboMediaAttachment.upsert({
    media_file_id: mediaFile.id,
    kobo_asset_uid: file.asset_uid,
    source_submission_id: file.submission_id,
    submission_id: submission?.id,
    question_xpath: attachment?.question_xpath || attachment?.question_name || attachment?.field || file.field_path || "",
    attachment_filename: attachmentName(attachment) || file.filename,
    media_file_basename: attachment?.media_file_basename || file.filename,
    source_url: attachmentUrl(attachment) || file.url || "",
    mime_type: attachment?.mimetype || attachment?.mime_type || mediaFile.mime_type || "",
    checksum_sha256: checksumSha256 || mediaFile.checksum_sha256 || "",
    attachment_json: attachment || null,
    match_status: attachment ? "linked" : "fallback_filename"
  });
}

function findKoboAttachmentForLocalFile({ file, submission } = {}) {
  const raw = parseJson(submission?.raw_data_json);
  const attachments = Array.isArray(raw._attachments) ? raw._attachments : [];
  if (!attachments.length) {
    return null;
  }
  const fileNames = new Set([
    normalizedFilename(file.filename),
    normalizedFilename(file.original_filename),
    normalizedFilename(file.media_file_basename)
  ].filter(Boolean));
  const sourceUrl = String(file.url || "").trim();
  return attachments.find((attachment) => {
    const candidates = [
      attachmentName(attachment),
      attachment.media_file_basename,
      fileNameFromUrl(attachmentUrl(attachment))
    ].map(normalizedFilename).filter(Boolean);
    return candidates.some((candidate) => fileNames.has(candidate))
      || (sourceUrl && sourceUrl === attachmentUrl(attachment));
  }) || null;
}

function attachmentName(attachment = {}) {
  attachment = attachment || {};
  return attachment.filename || attachment.media_file_basename || attachment.name || "";
}

function attachmentUrl(attachment = {}) {
  attachment = attachment || {};
  return attachment.download_url || attachment.download_large_url || attachment.download_medium_url || attachment.url || "";
}

function fileNameFromUrl(url) {
  if (!url) {
    return "";
  }
  try {
    return path.basename(new URL(url).pathname);
  } catch {
    return path.basename(String(url).split("?")[0]);
  }
}

function normalizedFilename(value) {
  return sanitizePathSegment(path.basename(String(value || ""))).toLowerCase();
}

function ensureMediaLinks(mediaFileId, links) {
  return links.reduce((count, link) => {
    const linkId = MediaFile.createLinkIfMissing({
      ...link,
      media_file_id: mediaFileId
    });
    return linkId ? count + 1 : count;
  }, 0);
}

function siteReferenceFromSubmission(submission) {
  if (!submission?.raw_data_json) {
    return "";
  }
  const raw = parseJson(submission.raw_data_json);
  return valueAtPath(raw, "modA/fiche_id")
    || valueAtPath(raw, "modB/nom_officiel")
    || "";
}

function inferBusinessMediaRole(filename = "") {
  const normalized = normalizeText(filename);
  if (normalized.includes("batiment") || normalized.includes("bat")) {
    return "photo_batiment";
  }
  if (normalized.includes("pylone") || normalized.includes("pyl")) {
    return "photo_pylone";
  }
  if (normalized.includes("raccord")) {
    return "photo_raccordement";
  }
  return SITE_MEDIA_ROLE;
}

function listLocalKoboAssetFiles({
  assetUid,
  submissionId,
  submissionIndexFrom,
  submissionIndexTo,
  downloadRoot = DEFAULT_DOWNLOAD_ROOT
} = {}) {
  const root = path.resolve(downloadRoot);
  if (!fs.existsSync(root)) {
    return [];
  }

  const assetDirs = assetUid
    ? [path.join(root, sanitizePathSegment(assetUid))]
    : listDirectories(root);

  const files = [];
  assetDirs.forEach((assetDir) => {
    if (!fs.existsSync(assetDir)) {
      return;
    }
    const resolvedAssetUid = path.basename(assetDir);
    let submissionDirs = submissionId
      ? [path.join(assetDir, sanitizePathSegment(submissionId))]
      : listDirectories(assetDir);
    if (!submissionId) {
      submissionDirs = selectSubmissionDirsByRange({
        assetUid: resolvedAssetUid,
        submissionDirs,
        submissionIndexFrom,
        submissionIndexTo
      });
    }

    submissionDirs.forEach((submissionDir) => {
      if (!fs.existsSync(submissionDir)) {
        return;
      }
      const resolvedSubmissionId = path.basename(submissionDir);
      listFilesRecursive(submissionDir).forEach((filePath) => {
        files.push({
          asset_uid: resolvedAssetUid,
          submission_id: resolvedSubmissionId,
          filename: path.basename(filePath),
          path: filePath
        });
      });
    });
  });

  return files;
}

function selectSubmissionDirsByRange({
  assetUid,
  submissionDirs,
  submissionIndexFrom,
  submissionIndexTo
}) {
  const sorted = sortSubmissionDirs(assetUid, submissionDirs);
  const from = normalizePositiveInteger(submissionIndexFrom);
  const to = normalizePositiveInteger(submissionIndexTo);
  if (!from && !to) {
    return sorted;
  }
  const start = from ? from - 1 : 0;
  const end = to || sorted.length;
  if (end < start + 1) {
    return [];
  }
  return sorted.slice(start, end);
}

function sortSubmissionDirs(assetUid, submissionDirs) {
  const orderMap = buildSubmissionOrderMap(assetUid);
  return [...submissionDirs].sort((left, right) => {
    const leftId = path.basename(left);
    const rightId = path.basename(right);
    const leftOrder = orderMap.get(leftId);
    const rightOrder = orderMap.get(rightId);
    if (leftOrder && rightOrder && leftOrder.index !== rightOrder.index) {
      return leftOrder.index - rightOrder.index;
    }
    if (leftOrder && !rightOrder) {
      return -1;
    }
    if (!leftOrder && rightOrder) {
      return 1;
    }
    return leftId.localeCompare(rightId, "fr", { numeric: true, sensitivity: "base" });
  });
}

function buildSubmissionOrderMap(assetUid) {
  const rows = SoumissionCollecte.koboSubmissionOrder(assetUid);
  return rows.reduce((orderMap, row, index) => {
    const sourceId = String(row.source_submission_id || "");
    if (!sourceId) {
      return orderMap;
    }
    const value = {
      index,
      submitted_at: row.submitted_at,
      id: row.id
    };
    orderMap.set(sourceId, value);
    orderMap.set(sanitizePathSegment(sourceId), value);
    return orderMap;
  }, new Map());
}

function normalizePositiveInteger(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : "";
}

function listDirectories(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name));
}

function listFilesRecursive(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "fr", { numeric: true, sensitivity: "base" }));
  return entries.flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return listFilesRecursive(entryPath);
    }
    return entry.isFile() ? [entryPath] : [];
  });
}

function sanitizePathSegment(value) {
  return String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 180);
}

function createJobId({ assetUid, submissionId, startedAt }) {
  const suffix = [assetUid || "all-assets", submissionId || "all-submissions"]
    .map(sanitizePathSegment)
    .filter(Boolean)
    .join("_");
  return `${startedAt.slice(0, 19).replaceAll(":", "-")}_${suffix || "kobo-media"}`;
}

function parseJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function valueAtPath(source, fieldPath) {
  if (!source || !fieldPath) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(source, fieldPath)) {
    return source[fieldPath];
  }
  return String(fieldPath).split("/").reduce((current, part) => {
    if (current && Object.prototype.hasOwnProperty.call(current, part)) {
      return current[part];
    }
    return undefined;
  }, source);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

module.exports = {
  KOBO_MEDIA_ROLE,
  SITE_MEDIA_ROLE,
  buildKoboMediaLinks,
  findKoboAttachmentForLocalFile,
  getLocalKoboMediaUploadManifest,
  getLocalKoboMediaUploadStatus,
  cancelLocalKoboMediaUploadJob,
  inferBusinessMediaRole,
  listLocalKoboAssetFiles,
  listLocalKoboMediaUploadManifests,
  startLocalKoboMediaUploadJob,
  upsertKoboMediaAttachment,
  uploadLocalKoboAssetsToWasabi
};
