const crypto = require("node:crypto");
const db = require("../config/database");

class KoboMediaAttachment {
  static stableKey(input = {}) {
    return crypto.createHash("sha256").update([
      normalize(input.kobo_asset_uid),
      normalize(input.source_submission_id),
      normalize(input.question_xpath),
      normalize(input.attachment_filename),
      normalize(input.media_file_basename)
    ].join("|")).digest("hex");
  }

  static upsert(input = {}) {
    const row = normalizeInput(input);
    if (!row.media_file_id || !row.source_submission_id) {
      return null;
    }
    row.attachment_key = row.attachment_key || this.stableKey(row);

    db.prepare(`
      INSERT INTO kobo_media_attachments (
        media_file_id,
        kobo_asset_uid,
        source_submission_id,
        submission_id,
        attachment_key,
        question_xpath,
        attachment_filename,
        media_file_basename,
        source_url,
        mime_type,
        checksum_sha256,
        attachment_json,
        match_status
      ) VALUES (
        @media_file_id,
        @kobo_asset_uid,
        @source_submission_id,
        @submission_id,
        @attachment_key,
        @question_xpath,
        @attachment_filename,
        @media_file_basename,
        @source_url,
        @mime_type,
        @checksum_sha256,
        @attachment_json,
        @match_status
      )
      ON CONFLICT(attachment_key) DO UPDATE SET
        media_file_id = excluded.media_file_id,
        submission_id = excluded.submission_id,
        source_url = excluded.source_url,
        mime_type = excluded.mime_type,
        checksum_sha256 = excluded.checksum_sha256,
        attachment_json = excluded.attachment_json,
        match_status = excluded.match_status,
        updated_at = CURRENT_TIMESTAMP
    `).run(row);

    return this.findByKey(row.attachment_key);
  }

  static findByKey(attachmentKey) {
    return db.prepare(`
      SELECT *
      FROM kobo_media_attachments
      WHERE attachment_key = ?
    `).get(attachmentKey);
  }

  static listForSubmission({ kobo_asset_uid, source_submission_id, submission_id } = {}) {
    return db.prepare(`
      SELECT
        kma.*,
        mf.bucket,
        mf.object_key,
        mf.original_filename,
        mf.stored_filename,
        mf.media_type,
        mf.visibility,
        mf.deleted_at
      FROM kobo_media_attachments kma
      JOIN media_files mf ON mf.id = kma.media_file_id
      WHERE mf.deleted_at IS NULL
        AND (
          (@source_submission_id IS NOT NULL AND kma.source_submission_id = @source_submission_id)
          OR (@submission_id IS NOT NULL AND kma.submission_id = @submission_id)
        )
        AND (@kobo_asset_uid IS NULL OR kma.kobo_asset_uid IS NULL OR kma.kobo_asset_uid = @kobo_asset_uid)
      ORDER BY kma.question_xpath, kma.attachment_filename, kma.id
    `).all({
      kobo_asset_uid: nullIfEmpty(kobo_asset_uid),
      source_submission_id: nullIfEmpty(source_submission_id),
      submission_id: submission_id ? String(submission_id) : null
    });
  }
}

function normalizeInput(input) {
  return {
    media_file_id: input.media_file_id || null,
    kobo_asset_uid: nullIfEmpty(input.kobo_asset_uid),
    source_submission_id: String(input.source_submission_id || "").trim(),
    submission_id: input.submission_id ? String(input.submission_id) : null,
    attachment_key: input.attachment_key || null,
    question_xpath: nullIfEmpty(input.question_xpath),
    attachment_filename: nullIfEmpty(input.attachment_filename),
    media_file_basename: nullIfEmpty(input.media_file_basename),
    source_url: nullIfEmpty(input.source_url),
    mime_type: nullIfEmpty(input.mime_type),
    checksum_sha256: nullIfEmpty(input.checksum_sha256),
    attachment_json: input.attachment_json ? JSON.stringify(input.attachment_json) : null,
    match_status: input.match_status === "fallback_filename" ? "fallback_filename" : "linked"
  };
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function nullIfEmpty(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

module.exports = KoboMediaAttachment;
