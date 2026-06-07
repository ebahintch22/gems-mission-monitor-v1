const db = require("../config/database");

class ActivationToken {
  static create(input) {
    const result = db.prepare(`
      INSERT INTO activation_tokens (
        invitation_id, user_id, token_hash, purpose, expires_at
      ) VALUES (
        @invitation_id, @user_id, @token_hash, @purpose, @expires_at
      )
    `).run({
      ...input,
      user_id: input.user_id || null,
      purpose: input.purpose || "activation"
    });

    return this.findById(result.lastInsertRowid);
  }

  static findById(id) {
    return db.prepare("SELECT * FROM activation_tokens WHERE id = ?").get(id);
  }

  static findValidByHash(tokenHash) {
    return db.prepare(`
      SELECT *
      FROM activation_tokens
      WHERE token_hash = ?
        AND purpose = 'activation'
        AND used_at IS NULL
        AND datetime(expires_at) > datetime('now')
    `).get(tokenHash);
  }

  static invalidateActiveForInvitation(invitationId) {
    return db.prepare(`
      UPDATE activation_tokens
      SET used_at = CURRENT_TIMESTAMP
      WHERE invitation_id = ?
        AND purpose = 'activation'
        AND used_at IS NULL
    `).run(invitationId);
  }

  static markUsed(id, userId) {
    return db.prepare(`
      UPDATE activation_tokens
      SET used_at = CURRENT_TIMESTAMP, user_id = ?
      WHERE id = ? AND used_at IS NULL
    `).run(userId, id);
  }
}

module.exports = ActivationToken;
