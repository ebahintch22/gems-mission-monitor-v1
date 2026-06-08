const db = require("../config/database");

const editableKeys = [
  "app.name",
  "alerts.anomaly_threshold",
  "sync.kobo_interval_minutes",
  "mail.from",
  "smtp.auth_method",
  "smtp.host",
  "smtp.port",
  "smtp.secure",
  "smtp.user",
  "smtp.password",
  "gmail.oauth_client_id",
  "gmail.oauth_client_secret",
  "gmail.oauth_refresh_token"
];

class Setting {
  static all() {
    return db.prepare(`
      SELECT key, value, type, group_name, label, description, updated_at
      FROM settings
      ORDER BY group_name, key
    `).all();
  }

  static byGroup() {
    return this.all().reduce((groups, setting) => {
      const group = setting.group_name || "general";
      groups[group] = groups[group] || [];
      groups[group].push(maskSecret(setting));
      return groups;
    }, {});
  }

  static findByKey(key) {
    const setting = db.prepare(`
      SELECT key, value, type, group_name, label, description, updated_at
      FROM settings
      WHERE key = ?
    `).get(key);
    return setting ? maskSecret(setting) : null;
  }

  static rawValue(key) {
    return db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value || "";
  }

  static valuesByKey(keys) {
    if (!keys.length) {
      return {};
    }

    const placeholders = keys.map(() => "?").join(", ");
    return db.prepare(`
      SELECT key, value
      FROM settings
      WHERE key IN (${placeholders})
    `).all(...keys).reduce((values, setting) => {
      values[setting.key] = setting.value;
      return values;
    }, {});
  }

  static bulkUpdate(inputs, actorUserId = null) {
    const update = db.prepare(`
      UPDATE settings
      SET value = @value,
          updated_by = @updated_by,
          updated_at = CURRENT_TIMESTAMP
      WHERE key = @key
    `);

    return db.transaction(() => {
      const current = this.all().reduce((settings, setting) => {
        settings[setting.key] = setting;
        return settings;
      }, {});

      return editableKeys.reduce((changes, key) => {
        const setting = current[key];
        if (!setting) {
          return changes;
        }

        const value = normalizeValue(setting, inputs[key]);
        if (setting.type === "secret" && value === "") {
          return changes;
        }

        const result = update.run({
          key,
          value,
          updated_by: actorUserId
        });
        return changes + result.changes;
      }, 0);
    })();
  }
}

function normalizeValue(setting, value) {
  if (setting.type === "boolean") {
    return value === "on" || value === "true" || value === true ? "true" : "false";
  }

  const trimmed = String(value ?? "").trim();
  if (setting.type === "number" && trimmed && !Number.isFinite(Number(trimmed))) {
    throw new Error("invalid_number");
  }

  if (setting.type === "json" && trimmed) {
    JSON.parse(trimmed);
  }

  return trimmed;
}

function maskSecret(setting) {
  if (setting.type !== "secret") {
    return setting;
  }

  return {
    ...setting,
    value: setting.value ? "********" : "",
    configured: Boolean(setting.value)
  };
}

module.exports = Setting;
