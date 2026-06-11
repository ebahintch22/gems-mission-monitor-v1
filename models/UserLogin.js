const db = require("../config/database");

class UserLogin {
  static create({ userId = null, email = null, success, failureReason = null, ipAddress = null, userAgent = null }) {
    return db.prepare(`
      INSERT INTO user_logins (
        user_id, email, success, failure_reason, ip_address, user_agent
      ) VALUES (
        @user_id, @email, @success, @failure_reason, @ip_address, @user_agent
      )
    `).run({
      user_id: userId,
      email,
      success: success ? 1 : 0,
      failure_reason: failureReason,
      ip_address: ipAddress,
      user_agent: userAgent
    });
  }

  static recent(limit = 100) {
    return db.prepare(`
      SELECT
        ul.*,
        u.prenoms || ' ' || u.nom AS user_name,
        u.role AS user_role
      FROM user_logins ul
      LEFT JOIN users u ON u.id = ul.user_id
      ORDER BY ul.created_at DESC, ul.id DESC
      LIMIT ?
    `).all(limit);
  }
}

module.exports = UserLogin;
