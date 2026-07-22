const crypto = require("node:crypto");
const db = require("../config/database");

class MediaFile {
  static create(input = {}) {
    const id = input.id || crypto.randomUUID();
    db.prepare(`
      INSERT INTO media_files (
        id,
        bucket,
        object_key,
        original_filename,
        stored_filename,
        mime_type,
        media_type,
        size_bytes,
        checksum_sha256,
        storage_provider,
        source,
        visibility,
        created_by
      ) VALUES (
        @id,
        @bucket,
        @object_key,
        @original_filename,
        @stored_filename,
        @mime_type,
        @media_type,
        @size_bytes,
        @checksum_sha256,
        @storage_provider,
        @source,
        @visibility,
        @created_by
      )
    `).run({
      id,
      bucket: input.bucket,
      object_key: input.object_key,
      original_filename: input.original_filename,
      stored_filename: input.stored_filename || input.original_filename,
      mime_type: input.mime_type,
      media_type: input.media_type,
      size_bytes: Number(input.size_bytes) || 0,
      checksum_sha256: input.checksum_sha256 || null,
      storage_provider: input.storage_provider || "wasabi",
      source: input.source || "manual_upload",
      visibility: input.visibility || "private",
      created_by: input.created_by || null
    });
    return this.findById(id);
  }

  static findById(id) {
    return db.prepare(`
      SELECT *
      FROM media_files
      WHERE id = ?
        AND deleted_at IS NULL
    `).get(id);
  }

  static createLink(input = {}) {
    const result = db.prepare(`
      INSERT INTO media_links (
        media_file_id,
        entity_type,
        entity_id,
        entity_ref,
        role,
        caption,
        sort_order
      ) VALUES (
        @media_file_id,
        @entity_type,
        @entity_id,
        @entity_ref,
        @role,
        @caption,
        @sort_order
      )
    `).run({
      media_file_id: input.media_file_id,
      entity_type: input.entity_type,
      entity_id: input.entity_id || null,
      entity_ref: input.entity_ref || null,
      role: input.role,
      caption: input.caption || null,
      sort_order: Number(input.sort_order) || 0
    });
    return result.lastInsertRowid;
  }

  static listForEntity({ entity_type, entity_id, entity_ref } = {}) {
    return db.prepare(`
      SELECT
        mf.*,
        ml.role,
        ml.caption,
        ml.sort_order,
        ml.entity_type,
        ml.entity_id,
        ml.entity_ref
      FROM media_links ml
      JOIN media_files mf ON mf.id = ml.media_file_id
      WHERE ml.entity_type = @entity_type
        AND (@entity_id IS NULL OR ml.entity_id = @entity_id)
        AND (@entity_ref IS NULL OR ml.entity_ref = @entity_ref)
        AND mf.deleted_at IS NULL
      ORDER BY ml.sort_order, mf.created_at
    `).all({
      entity_type,
      entity_id: entity_id || null,
      entity_ref: entity_ref || null
    });
  }

  static createVariant(input = {}) {
    const result = db.prepare(`
      INSERT INTO media_variants (
        media_file_id,
        variant_type,
        bucket,
        object_key,
        mime_type,
        size_bytes,
        width,
        height
      ) VALUES (
        @media_file_id,
        @variant_type,
        @bucket,
        @object_key,
        @mime_type,
        @size_bytes,
        @width,
        @height
      )
    `).run({
      media_file_id: input.media_file_id,
      variant_type: input.variant_type,
      bucket: input.bucket,
      object_key: input.object_key,
      mime_type: input.mime_type,
      size_bytes: Number(input.size_bytes) || 0,
      width: input.width || null,
      height: input.height || null
    });
    return result.lastInsertRowid;
  }

  static findVariant(mediaFileId, variantType) {
    return db.prepare(`
      SELECT *
      FROM media_variants
      WHERE media_file_id = ?
        AND variant_type = ?
    `).get(mediaFileId, variantType);
  }

  static softDelete(id) {
    return db.prepare(`
      UPDATE media_files
      SET deleted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND deleted_at IS NULL
    `).run(id).changes;
  }
}

module.exports = MediaFile;
