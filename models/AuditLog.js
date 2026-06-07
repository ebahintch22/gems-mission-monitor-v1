const db = require("../config/database");

class AuditLog {
  static create(input) {
    return db.prepare(`
      INSERT INTO audit_logs (
        actor_user_id, target_user_id, action, entity_type, entity_id,
        ip_address, user_agent, details_json
      ) VALUES (
        @actor_user_id, @target_user_id, @action, @entity_type, @entity_id,
        @ip_address, @user_agent, @details_json
      )
    `).run({
      actor_user_id: input.actor_user_id || null,
      target_user_id: input.target_user_id || null,
      entity_type: input.entity_type || null,
      entity_id: input.entity_id ? String(input.entity_id) : null,
      ip_address: input.ip_address || null,
      user_agent: input.user_agent || null,
      details_json: input.details ? JSON.stringify(input.details) : null,
      action: input.action
    });
  }
}

module.exports = AuditLog;
