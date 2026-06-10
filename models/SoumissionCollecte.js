const db = require("../config/database");

class SoumissionCollecte {
  static insertKobo(input) {
    const result = db.prepare(`
      INSERT OR IGNORE INTO soumissions_collecte (
        source, source_submission_id, kobo_asset_uid, mission_id, equipe_id,
        agent_id, assignment_id, sous_prefecture_id, code_agent_source, submitted_at,
        latitude, longitude, precision_m, statut_validation, anomaly_count,
        formulaire_type, raw_data_json
      ) VALUES (
        @source, @source_submission_id, @kobo_asset_uid, @mission_id, @equipe_id,
        @agent_id, @assignment_id, @sous_prefecture_id, @code_agent_source, @submitted_at,
        @latitude, @longitude, @precision_m, @statut_validation, @anomaly_count,
        @formulaire_type, @raw_data_json
      )
    `).run(input);

    return {
      inserted: result.changes === 1,
      id: result.lastInsertRowid
    };
  }

  static countBySource(source = "simulation") {
    return db.prepare(`
      SELECT COUNT(*) AS total
      FROM soumissions_collecte
      WHERE source = ?
    `).get(source).total;
  }

  static mapPoints() {
    return db.prepare(`
      SELECT
        s.id, s.source_submission_id, s.mission_id, s.equipe_id, s.agent_id,
        s.assignment_id,
        s.submitted_at,
        s.latitude, s.longitude, s.precision_m,
        s.statut_validation, s.anomaly_count, s.raw_data_json,
        a.code_agent, a.nom AS agent_nom, a.prenoms AS agent_prenoms,
        e.nom_equipe, m.name AS mission_name,
        sp.nom_sous_prefecture, d.nom_departement, r.nom_region
      FROM soumissions_collecte s
      JOIN missions m ON m.id = s.mission_id
      LEFT JOIN agents_collecte a ON a.id = s.agent_id
      LEFT JOIN equipes e ON e.id = s.equipe_id
      LEFT JOIN sous_prefectures sp ON sp.id = s.sous_prefecture_id
      LEFT JOIN departements d ON d.id = sp.departement_id
      LEFT JOIN regions r ON r.id = d.region_id
      ORDER BY s.submitted_at DESC
    `).all();
  }

  static findById(id) {
    return db.prepare(`
      SELECT
        s.id, s.source, s.source_submission_id, s.kobo_asset_uid,
        s.mission_id, s.equipe_id, s.agent_id, s.assignment_id, s.sous_prefecture_id,
        s.code_agent_source, s.submitted_at,
        s.latitude, s.longitude, s.precision_m,
        s.statut_validation, s.anomaly_count,
        s.formulaire_type, s.raw_data_json, s.synced_at, s.created_at,
        a.code_agent, a.nom AS agent_nom, a.prenoms AS agent_prenoms,
        e.nom_equipe, m.name AS mission_name,
        sp.nom_sous_prefecture, d.nom_departement, r.nom_region
      FROM soumissions_collecte s
      JOIN missions m ON m.id = s.mission_id
      LEFT JOIN agents_collecte a ON a.id = s.agent_id
      LEFT JOIN equipes e ON e.id = s.equipe_id
      LEFT JOIN sous_prefectures sp ON sp.id = s.sous_prefecture_id
      LEFT JOIN departements d ON d.id = sp.departement_id
      LEFT JOIN regions r ON r.id = d.region_id
      WHERE s.id = ?
    `).get(id);
  }

  static mapFilters() {
    return {
      missions: db.prepare(`
        SELECT DISTINCT m.id, m.name
        FROM missions m
        JOIN soumissions_collecte s ON s.mission_id = m.id
        ORDER BY m.name
      `).all(),
      equipes: db.prepare(`
        SELECT DISTINCT e.id, e.nom_equipe
        FROM equipes e
        JOIN soumissions_collecte s ON s.equipe_id = e.id
        ORDER BY e.nom_equipe
      `).all(),
      agents: db.prepare(`
        SELECT DISTINCT a.id, a.code_agent, a.nom, a.prenoms
        FROM agents_collecte a
        JOIN soumissions_collecte s ON s.agent_id = a.id
        ORDER BY a.code_agent
      `).all()
    };
  }

  static mapFilterOptionsForMission(missionId) {
    return {
      equipes: db.prepare(`
        SELECT id, nom_equipe
        FROM equipes
        WHERE mission_id = ?
        ORDER BY nom_equipe
      `).all(missionId),
      agents: db.prepare(`
        SELECT DISTINCT
          a.id,
          a.code_agent,
          a.nom,
          a.prenoms
        FROM agents_collecte a
        WHERE a.id IN (
          SELECT agent_id
          FROM agent_mission_assignments
          WHERE mission_id = ?
            AND statut = 'active'
          UNION
          SELECT agent_id
          FROM soumissions_collecte
          WHERE mission_id = ?
            AND agent_id IS NOT NULL
        )
        ORDER BY a.code_agent
      `).all(missionId, missionId)
    };
  }

  static regionBoundaries() {
    return db.prepare(`
      SELECT id, code_region, nom_region, geometry_geojson
      FROM regions
      WHERE geometry_geojson IS NOT NULL
      ORDER BY nom_region
    `).all();
  }
}

module.exports = SoumissionCollecte;
