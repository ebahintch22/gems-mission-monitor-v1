const db = require("../config/database");

const ACTION = "kobo.advanced_sync";

class KoboAdvancedSyncLog {
  static create({ manifest, actorUserId, ipAddress, userAgent }) {
    const result = db.prepare(`
      INSERT INTO audit_logs (
        actor_user_id, action, entity_type, entity_id,
        ip_address, user_agent, details_json
      ) VALUES (
        @actor_user_id, @action, @entity_type, @entity_id,
        @ip_address, @user_agent, @details_json
      )
    `).run({
      actor_user_id: actorUserId || null,
      action: ACTION,
      entity_type: "kobo_asset",
      entity_id: manifest.asset_uid,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      details_json: JSON.stringify(manifest)
    });

    return result.lastInsertRowid;
  }

  static update(logId, manifest) {
    db.prepare(`
      UPDATE audit_logs
      SET details_json = @details_json
      WHERE id = @id
        AND action = @action
    `).run({
      id: logId,
      action: ACTION,
      details_json: JSON.stringify(manifest)
    });
  }

  static findByJobId(jobId) {
    const row = db.prepare(`
      SELECT id, details_json, created_at
      FROM audit_logs
      WHERE action = ?
        AND json_extract(details_json, '$.job_id') = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `).get(ACTION, jobId);

    return row ? mapRow(row) : null;
  }

  static recent(limit = 10) {
    return db.prepare(`
      SELECT id, details_json, created_at
      FROM audit_logs
      WHERE action = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(ACTION, limit).map(mapRow);
  }
}

function mapRow(row) {
  return {
    id: row.id,
    created_at: row.created_at,
    manifest: parseJson(row.details_json)
  };
}

function parseJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

module.exports = KoboAdvancedSyncLog;
