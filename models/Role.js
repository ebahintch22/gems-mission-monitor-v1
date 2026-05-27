const db = require("../config/database");

class Role {
  static all() {
    return db.prepare(`
      SELECT id, code_role, label, description
      FROM roles
      ORDER BY label
    `).all();
  }

  static exists(codeRole) {
    return Boolean(db.prepare("SELECT id FROM roles WHERE code_role = ?").get(codeRole));
  }
}

module.exports = Role;
