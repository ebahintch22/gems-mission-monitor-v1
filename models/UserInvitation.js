const db = require("../config/database");

class UserInvitation {
  static all() {
    return db.prepare(`
      SELECT
        ui.*,
        ro.label AS role_label,
        CASE WHEN m.archived = 1 THEN NULL ELSE m.name END AS mission_name,
        invited.prenoms || ' ' || invited.nom AS invited_by_name
      FROM user_invitations ui
      LEFT JOIN roles ro ON ro.code_role = ui.role
      LEFT JOIN missions m ON m.id = ui.mission_id
      LEFT JOIN users invited ON invited.id = ui.invited_by
      ORDER BY ui.created_at DESC
    `).all();
  }

  static findById(id) {
    return db.prepare("SELECT * FROM user_invitations WHERE id = ?").get(id);
  }

  static findByEmail(email, excludedId = null) {
    if (excludedId) {
      return db.prepare(`
        SELECT * FROM user_invitations WHERE email = ? AND id <> ?
      `).get(email, excludedId);
    }

    return db.prepare("SELECT * FROM user_invitations WHERE email = ?").get(email);
  }

  static findValidPendingByEmail(email) {
    return db.prepare(`
      SELECT *
      FROM user_invitations
      WHERE email = ?
        AND statut = 'invite'
        AND activated_at IS NULL
        AND datetime(expires_at) > datetime('now')
    `).get(email);
  }

  static create(input) {
    const result = db.prepare(`
      INSERT INTO user_invitations (
        email, nom, prenoms, role, zone_affectation, mission_id,
        invited_by, invitation_token_hash, expires_at
      ) VALUES (
        @email, @nom, @prenoms, @role, @zone_affectation, @mission_id,
        @invited_by, @invitation_token_hash, @expires_at
      )
    `).run(normalize(input));

    return this.findById(result.lastInsertRowid);
  }

  static update(id, input) {
    const result = db.prepare(`
      UPDATE user_invitations
      SET
        email = @email,
        nom = @nom,
        prenoms = @prenoms,
        role = @role,
        zone_affectation = @zone_affectation,
        mission_id = @mission_id,
        expires_at = @expires_at,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
        AND statut = 'invite'
        AND activated_at IS NULL
    `).run({ id, ...normalize(input) });

    return result.changes ? this.findById(id) : null;
  }

  static markActivated(id) {
    return db.prepare(`
      UPDATE user_invitations
      SET statut = 'activee', activated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
  }
}

function normalize(input) {
  return {
    email: input.email?.trim().toLowerCase(),
    nom: input.nom?.trim(),
    prenoms: input.prenoms?.trim(),
    role: input.role,
    zone_affectation: input.zone_affectation?.trim() || null,
    mission_id: input.mission_id ? Number(input.mission_id) : null,
    invited_by: input.invited_by || null,
    invitation_token_hash: input.invitation_token_hash,
    expires_at: input.expires_at
  };
}

module.exports = UserInvitation;
