const db = require("../config/database");

class AgentMissionAssignment {
  static activeForAgent(agentId) {
    return db.prepare(`
      SELECT
        ama.*,
        e.nom_equipe,
        m.name AS mission_name
      FROM agent_mission_assignments ama
      JOIN equipes e ON e.id = ama.equipe_id
      JOIN missions m ON m.id = ama.mission_id
      WHERE ama.agent_id = ?
        AND ama.statut = 'active'
    `).get(agentId);
  }

  static findActiveByAgentAndMission(agentId, missionId) {
    return db.prepare(`
      SELECT *
      FROM agent_mission_assignments
      WHERE agent_id = ?
        AND mission_id = ?
        AND statut = 'active'
    `).get(agentId, missionId);
  }

  static activeByCodeAndMission(codeAgent, missionId) {
    return db.prepare(`
      SELECT
        ama.*,
        a.code_agent,
        a.nom,
        a.prenoms
      FROM agent_mission_assignments ama
      JOIN agents_collecte a ON a.id = ama.agent_id
      WHERE (
          a.kobo_code_agent = ?
          OR a.code_agent = ?
        )
        AND ama.mission_id = ?
        AND ama.statut = 'active'
      ORDER BY CASE WHEN a.kobo_code_agent = ? THEN 0 ELSE 1 END
      LIMIT 1
    `).get(codeAgent, codeAgent, missionId, codeAgent);
  }

  static replaceActive(agentId, equipeId, options = {}) {
    if (!equipeId) {
      return this.closeActive(agentId, options);
    }

    const equipe = db.prepare("SELECT id, mission_id FROM equipes WHERE id = ?").get(equipeId);
    if (!equipe) {
      throw new Error("invalid_assignment_team");
    }

    const active = this.activeForAgent(agentId);
    if (active && active.equipe_id === equipe.id && active.mission_id === equipe.mission_id) {
      return active;
    }

    return db.transaction(() => {
      this.closeActive(agentId, options);
      const result = db.prepare(`
        INSERT INTO agent_mission_assignments (
          agent_id, mission_id, equipe_id, start_date, statut, created_by
        ) VALUES (
          @agent_id, @mission_id, @equipe_id, @start_date, 'active', @created_by
        )
      `).run({
        agent_id: agentId,
        mission_id: equipe.mission_id,
        equipe_id: equipe.id,
        start_date: options.startDate || today(),
        created_by: options.actorUserId || null
      });

      return this.findById(result.lastInsertRowid);
    })();
  }

  static closeActive(agentId, options = {}) {
    db.prepare(`
      UPDATE agent_mission_assignments
      SET statut = 'terminee',
          end_date = COALESCE(@end_date, CURRENT_DATE),
          updated_at = CURRENT_TIMESTAMP
      WHERE agent_id = @agent_id
        AND statut = 'active'
    `).run({
      agent_id: agentId,
      end_date: options.endDate || null
    });

    return null;
  }

  static findById(id) {
    return db.prepare(`
      SELECT *
      FROM agent_mission_assignments
      WHERE id = ?
    `).get(id);
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = AgentMissionAssignment;
