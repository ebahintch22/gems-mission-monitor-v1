const db = require("../config/database");

class Mission {
  static all() {
    return db.prepare("SELECT * FROM missions ORDER BY created_at DESC, id DESC").all();
  }

  static recent(limit = 5) {
    return db.prepare("SELECT * FROM missions ORDER BY created_at DESC, id DESC LIMIT ?").all(limit);
  }

  static findById(id) {
    return db.prepare("SELECT * FROM missions WHERE id = ?").get(id);
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

  static stats() {
    const totals = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'en_cours' THEN 1 ELSE 0 END) AS ongoing,
        SUM(CASE WHEN status = 'terminee' THEN 1 ELSE 0 END) AS completed,
        COALESCE(SUM(collectors), 0) AS collectors
      FROM missions
    `).get();

    return {
      total: totals.total || 0,
      ongoing: totals.ongoing || 0,
      completed: totals.completed || 0,
      collectors: totals.collectors || 0
    };
  }
}

module.exports = Mission;
