const db = require("../config/database");

class Mission {
  static all() {
    return this.allActive();
  }

  static allActive() {
    return db.prepare(`
      SELECT *
      FROM missions
      WHERE archived = 0
      ORDER BY created_at DESC, id DESC
    `).all();
  }

  static archived() {
    return db.prepare(`
      SELECT
        m.*,
        u.prenoms || ' ' || u.nom AS archived_by_name
      FROM missions m
      LEFT JOIN users u ON u.id = m.archived_by
      WHERE m.archived = 1
      ORDER BY m.archived_at DESC, m.id DESC
    `).all();
  }

  static recent(limit = 5) {
    return db.prepare(`
      SELECT *
      FROM missions
      WHERE archived = 0
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(limit);
  }

  static findById(id) {
    return db.prepare("SELECT * FROM missions WHERE id = ?").get(id);
  }

  static findActiveById(id) {
    return db.prepare("SELECT * FROM missions WHERE id = ? AND archived = 0").get(id);
  }

  static create(input) {
    const result = db.prepare(`
      INSERT INTO missions (
        name, region, status, start_date, end_date, collectors,
        kobo_asset_uid, latitude, longitude
      ) VALUES (
        @name, @region, @status, @start_date, @end_date, @collectors,
        @kobo_asset_uid, @latitude, @longitude
      )
    `).run(input);
    return this.findById(result.lastInsertRowid);
  }

  static update(id, input) {
    db.prepare(`
      UPDATE missions
      SET
        name = @name,
        region = @region,
        status = @status,
        start_date = @start_date,
        end_date = @end_date,
        collectors = @collectors,
        kobo_asset_uid = @kobo_asset_uid,
        latitude = @latitude,
        longitude = @longitude
      WHERE id = @id
    `).run({ id, ...input });

    return this.findById(id);
  }

  static stats() {
    const totals = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'en_cours' THEN 1 ELSE 0 END) AS ongoing,
        SUM(CASE WHEN status = 'terminee' THEN 1 ELSE 0 END) AS completed,
        COALESCE(SUM(collectors), 0) AS collectors
      FROM missions
      WHERE archived = 0
    `).get();

    return {
      total: totals.total || 0,
      ongoing: totals.ongoing || 0,
      completed: totals.completed || 0,
      collectors: totals.collectors || 0
    };
  }

  static archive(id, userId) {
    db.prepare(`
      UPDATE missions
      SET archived = 1,
          archived_at = CURRENT_TIMESTAMP,
          archived_by = ?
      WHERE id = ?
    `).run(userId, id);

    return this.findById(id);
  }

  static unarchive(id) {
    db.prepare(`
      UPDATE missions
      SET archived = 0,
          archived_at = NULL,
          archived_by = NULL
      WHERE id = ?
    `).run(id);

    return this.findById(id);
  }
}

module.exports = Mission;
