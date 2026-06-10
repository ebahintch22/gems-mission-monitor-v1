const db = require("../config/database");

class Equipe {
  static all() {
    return db.prepare(`
      SELECT
        e.id, e.nom_equipe, e.statut, e.created_at,
        m.name AS mission_name,
        CASE
          WHEN u.id IS NULL THEN NULL
          ELSE u.prenoms || ' ' || u.nom
        END AS superviseur_name,
        COUNT(er.region_id) AS region_count,
        GROUP_CONCAT(r.nom_region, ', ') AS regions
      FROM equipes e
      JOIN missions m ON m.id = e.mission_id
      LEFT JOIN users u ON u.id = e.superviseur_id
      LEFT JOIN equipe_regions er ON er.equipe_id = e.id
      LEFT JOIN regions r ON r.id = er.region_id
      GROUP BY e.id
      ORDER BY e.nom_equipe
    `).all();
  }

  static findByMission(missionId) {
    return db.prepare(`
      SELECT
        e.id, e.nom_equipe, e.statut, e.created_at,
        m.name AS mission_name,
        CASE
          WHEN u.id IS NULL THEN NULL
          ELSE u.prenoms || ' ' || u.nom
        END AS superviseur_name,
        COUNT(er.region_id) AS region_count,
        GROUP_CONCAT(r.nom_region, ', ') AS regions
      FROM equipes e
      JOIN missions m ON m.id = e.mission_id
      LEFT JOIN users u ON u.id = e.superviseur_id
      LEFT JOIN equipe_regions er ON er.equipe_id = e.id
      LEFT JOIN regions r ON r.id = er.region_id
      WHERE e.mission_id = ?
      GROUP BY e.id
      ORDER BY e.nom_equipe
    `).all(missionId);
  }

  static findById(id) {
    const equipe = db.prepare(`
      SELECT
        e.*, m.name AS mission_name, m.status AS mission_status,
        u.nom AS superviseur_nom, u.prenoms AS superviseur_prenoms,
        u.email AS superviseur_email
      FROM equipes e
      JOIN missions m ON m.id = e.mission_id
      LEFT JOIN users u ON u.id = e.superviseur_id
      WHERE e.id = ?
    `).get(id);

    if (!equipe) {
      return null;
    }

    equipe.regions = db.prepare(`
      SELECT r.id, r.code_region, r.nom_region
      FROM regions r
      JOIN equipe_regions er ON er.region_id = r.id
      WHERE er.equipe_id = ?
      ORDER BY r.nom_region
    `).all(id);
    return equipe;
  }

  static availableMissions() {
    return db.prepare(`
      SELECT id, name, status
      FROM missions
      ORDER BY created_at DESC, name
    `).all();
  }

  static activeSupervisors() {
    return db.prepare(`
      SELECT id, nom, prenoms, email
      FROM users
      WHERE role = 'superviseur' AND statut = 'actif'
      ORDER BY nom, prenoms
    `).all();
  }

  static availableRegions() {
    return db.prepare(`
      SELECT id, code_region, nom_region
      FROM regions
      ORDER BY nom_region
    `).all();
  }

  static validMissionId(missionId) {
    return Boolean(db.prepare("SELECT id FROM missions WHERE id = ?").get(missionId));
  }

  static validRegionIds(regionIds) {
    if (!regionIds.length) {
      return [];
    }
    const placeholders = regionIds.map(() => "?").join(", ");
    return db.prepare(`SELECT id FROM regions WHERE id IN (${placeholders})`).all(...regionIds)
      .map((region) => region.id);
  }

  static validSupervisorId(superviseurId) {
    if (superviseurId === null) {
      return true;
    }
    return Boolean(db.prepare(`
      SELECT id FROM users
      WHERE id = ? AND role = 'superviseur' AND statut = 'actif'
    `).get(superviseurId));
  }

  static create(input, regionIds) {
    const insertEquipe = db.prepare(`
      INSERT INTO equipes (nom_equipe, superviseur_id, mission_id, statut)
      VALUES (@nom_equipe, @superviseur_id, @mission_id, @statut)
    `);
    const insertRegion = db.prepare(`
      INSERT INTO equipe_regions (equipe_id, region_id) VALUES (?, ?)
    `);

    return db.transaction(() => {
      const result = insertEquipe.run(input);
      regionIds.forEach((regionId) => insertRegion.run(result.lastInsertRowid, regionId));
      return this.findById(result.lastInsertRowid);
    })();
  }

  static update(id, input, regionIds) {
    const updateEquipe = db.prepare(`
      UPDATE equipes SET
        nom_equipe = @nom_equipe,
        superviseur_id = @superviseur_id,
        mission_id = @mission_id,
        statut = @statut
      WHERE id = @id
    `);
    const removeRegions = db.prepare("DELETE FROM equipe_regions WHERE equipe_id = ?");
    const insertRegion = db.prepare(`
      INSERT INTO equipe_regions (equipe_id, region_id) VALUES (?, ?)
    `);

    return db.transaction(() => {
      const result = updateEquipe.run({ id, ...input });
      if (!result.changes) {
        return null;
      }
      removeRegions.run(id);
      regionIds.forEach((regionId) => insertRegion.run(id, regionId));
      return this.findById(id);
    })();
  }
}

module.exports = Equipe;
