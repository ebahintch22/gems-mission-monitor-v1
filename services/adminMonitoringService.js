const db = require("../config/database");

function getMonitoringSnapshot() {
  return {
    submissionsBySource: submissionsBySource(),
    latestKoboSubmissions: latestKoboSubmissions(),
    latestAuditLogs: latestAuditLogs()
  };
}

function submissionsBySource() {
  return db.prepare(`
    SELECT source, COUNT(*) AS total, MAX(synced_at) AS last_synced_at
    FROM soumissions_collecte
    GROUP BY source
    ORDER BY source
  `).all();
}

function latestKoboSubmissions() {
  return db.prepare(`
    SELECT id, source_submission_id, kobo_asset_uid, submitted_at, synced_at, statut_validation
    FROM soumissions_collecte
    WHERE source = 'kobo'
    ORDER BY synced_at DESC
    LIMIT 10
  `).all();
}

function latestAuditLogs() {
  return db.prepare(`
    SELECT id, action, entity_type, entity_id, created_at
    FROM audit_logs
    ORDER BY created_at DESC
    LIMIT 10
  `).all();
}

module.exports = {
  getMonitoringSnapshot
};
