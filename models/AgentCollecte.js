const db = require("../config/database");
const AgentMissionAssignment = require("./AgentMissionAssignment");

class AgentCollecte {
  static all() {
    return db.prepare(`
      SELECT
        a.id, a.nom, a.prenoms, a.code_agent, a.kobo_code_agent,
        a.telephone, a.equipement, a.statut, a.created_at,
        CASE
          WHEN u.id IS NULL THEN NULL
          ELSE u.prenoms || ' ' || u.nom
        END AS user_name,
        e.nom_equipe
      FROM agents_collecte a
      LEFT JOIN users u ON u.id = a.user_id
      LEFT JOIN equipes e ON e.id = a.equipe_id
      LEFT JOIN missions m ON m.id = e.mission_id
      WHERE e.id IS NULL OR m.archived = 0
      ORDER BY a.code_agent
    `).all();
  }

  static findById(id) {
    return db.prepare(`
      SELECT
        a.*,
        u.nom AS user_nom, u.prenoms AS user_prenoms,
        u.email AS user_email, u.role AS user_role,
        e.nom_equipe, e.statut AS equipe_statut, e.mission_id,
        m.name AS mission_name
      FROM agents_collecte a
      LEFT JOIN users u ON u.id = a.user_id
      LEFT JOIN equipes e ON e.id = a.equipe_id
      LEFT JOIN missions m ON m.id = e.mission_id
      WHERE a.id = ?
    `).get(id);
  }

  static findByCode(codeAgent, excludedId = null) {
    if (excludedId) {
      return db.prepare(`
        SELECT id FROM agents_collecte WHERE code_agent = ? AND id <> ?
      `).get(codeAgent, excludedId);
    }
    return db.prepare("SELECT id FROM agents_collecte WHERE code_agent = ?").get(codeAgent);
  }

  static findByKoboCode(koboCodeAgent, excludedId = null) {
    if (!koboCodeAgent) {
      return null;
    }

    if (excludedId) {
      return db.prepare(`
        SELECT id FROM agents_collecte WHERE kobo_code_agent = ? AND id <> ?
      `).get(koboCodeAgent, excludedId);
    }
    return db.prepare("SELECT id FROM agents_collecte WHERE kobo_code_agent = ?").get(koboCodeAgent);
  }

  static findByUserId(userId, excludedId = null) {
    if (excludedId) {
      return db.prepare(`
        SELECT id FROM agents_collecte WHERE user_id = ? AND id <> ?
      `).get(userId, excludedId);
    }
    return db.prepare("SELECT id FROM agents_collecte WHERE user_id = ?").get(userId);
  }

  static availableAgentUsers() {
    return db.prepare(`
      SELECT id, nom, prenoms, email
      FROM users
      WHERE role = 'agent'
      ORDER BY nom, prenoms
    `).all();
  }

  static availableEquipes() {
    return db.prepare(`
      SELECT id, nom_equipe, statut
      FROM equipes
      WHERE EXISTS (
        SELECT 1 FROM missions
        WHERE missions.id = equipes.mission_id
          AND missions.archived = 0
      )
      ORDER BY nom_equipe
    `).all();
  }

  static validAgentUserId(userId) {
    if (userId === null) {
      return true;
    }
    return Boolean(db.prepare("SELECT id FROM users WHERE id = ? AND role = 'agent'").get(userId));
  }

  static validEquipeId(equipeId) {
    if (equipeId === null) {
      return true;
    }
    return Boolean(db.prepare(`
      SELECT e.id
      FROM equipes e
      JOIN missions m ON m.id = e.mission_id
      WHERE e.id = ?
        AND m.archived = 0
    `).get(equipeId));
  }

  static create(input) {
    return db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO agents_collecte (
          nom, prenoms, user_id, equipe_id, code_agent, kobo_code_agent, telephone, equipement, statut
        ) VALUES (
          @nom, @prenoms, @user_id, @equipe_id, @code_agent, @kobo_code_agent, @telephone, @equipement, @statut
        )
      `).run(input);

      if (input.equipe_id) {
        AgentMissionAssignment.replaceActive(result.lastInsertRowid, input.equipe_id);
      }

      return this.findById(result.lastInsertRowid);
    })();
  }

  static update(id, input) {
    return db.transaction(() => {
      const result = db.prepare(`
        UPDATE agents_collecte SET
          nom = @nom,
          prenoms = @prenoms,
          user_id = @user_id,
          equipe_id = @equipe_id,
          code_agent = @code_agent,
          kobo_code_agent = @kobo_code_agent,
          telephone = @telephone,
          equipement = @equipement,
          statut = @statut
        WHERE id = @id
      `).run({ id, ...input });

      if (!result.changes) {
        return null;
      }

      AgentMissionAssignment.replaceActive(id, input.equipe_id);
      return this.findById(id);
    })();
  }
}

module.exports = AgentCollecte;
