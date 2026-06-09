const db = require("../config/database");

class AppMetadata {
  static get() {
    return db.prepare(`
      SELECT
        id,
        app_name,
        release_version,
        release_label,
        release_date,
        environment,
        notes,
        created_at,
        updated_at
      FROM app_metadata
      WHERE id = 1
    `).get();
  }
}

module.exports = AppMetadata;
