const db = require("../config/database");

class User {
  static all() {
    return db.prepare(`
      SELECT
        u.id, u.nom, u.prenoms, u.email, u.telephone, u.role, u.statut,
        u.last_login, u.created_at,
        ro.label AS role_label,
        COUNT(ur.region_id) AS region_count,
        GROUP_CONCAT(r.nom_region, ', ') AS regions
      FROM users u
      LEFT JOIN roles ro ON ro.code_role = u.role
      LEFT JOIN user_regions ur ON ur.user_id = u.id
      LEFT JOIN regions r ON r.id = ur.region_id
      GROUP BY u.id
      ORDER BY u.nom, u.prenoms
    `).all();
  }

  static findById(id) {
    const user = db.prepare(`
      SELECT u.*, ro.label AS role_label, ro.description AS role_description
      FROM users u
      LEFT JOIN roles ro ON ro.code_role = u.role
      WHERE u.id = ?
    `).get(id);
    if (!user) {
      return null;
    }

    user.regions = db.prepare(`
      SELECT r.id, r.code_region, r.nom_region
      FROM regions r
      JOIN user_regions ur ON ur.region_id = r.id
      WHERE ur.user_id = ?
      ORDER BY r.nom_region
    `).all(id);
    return user;
  }

  static findByEmail(email, excludedId = null) {
    if (excludedId) {
      return db.prepare("SELECT id FROM users WHERE email = ? AND id <> ?").get(email, excludedId);
    }
    return db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  }

  static availableRegions() {
    return db.prepare(`
      SELECT id, code_region, nom_region
      FROM regions
      ORDER BY nom_region
    `).all();
  }

  static validRegionIds(regionIds) {
    if (!regionIds.length) {
      return [];
    }
    const placeholders = regionIds.map(() => "?").join(", ");
    return db.prepare(`SELECT id FROM regions WHERE id IN (${placeholders})`).all(...regionIds)
      .map((region) => region.id);
  }

  static create(input, regionIds) {
    const insertUser = db.prepare(`
      INSERT INTO users (nom, prenoms, email, telephone, role, statut, password_hash)
      VALUES (@nom, @prenoms, @email, @telephone, @role, @statut, @password_hash)
    `);
    const insertRegion = db.prepare(`
      INSERT INTO user_regions (user_id, region_id) VALUES (?, ?)
    `);

    const createUser = db.transaction(() => {
      const result = insertUser.run(input);
      regionIds.forEach((regionId) => insertRegion.run(result.lastInsertRowid, regionId));
      return this.findById(result.lastInsertRowid);
    });

    return createUser();
  }

  static update(id, input, regionIds) {
    const updateUser = db.prepare(`
      UPDATE users SET
        nom = @nom,
        prenoms = @prenoms,
        email = @email,
        telephone = @telephone,
        role = @role,
        statut = @statut
      WHERE id = @id
    `);
    const removeRegions = db.prepare("DELETE FROM user_regions WHERE user_id = ?");
    const insertRegion = db.prepare(`
      INSERT INTO user_regions (user_id, region_id) VALUES (?, ?)
    `);

    const updateProfile = db.transaction(() => {
      const result = updateUser.run({ id, ...input });
      if (!result.changes) {
        return null;
      }
      removeRegions.run(id);
      regionIds.forEach((regionId) => insertRegion.run(id, regionId));
      return this.findById(id);
    });

    return updateProfile();
  }
}

module.exports = User;
