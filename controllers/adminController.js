const AuditLog = require("../models/AuditLog");
const AppMetadata = require("../models/AppMetadata");
const Mission = require("../models/Mission");
const Permission = require("../models/Permission");
const Setting = require("../models/Setting");
const UserLogin = require("../models/UserLogin");
const { getMonitoringSnapshot } = require("../services/adminMonitoringService");
const { getDatabaseStats, getTablePreview } = require("../services/databaseStatsService");
const { hasSmtpConfig, resolveMailEnv, sendMail } = require("../services/mailService");
const seedService = require("../services/seedService");

exports.index = (req, res) => {
  res.render("admin/index", {
    title: req.t("admin.title"),
    monitoring: getMonitoringSnapshot()
  });
};

exports.settings = (req, res) => {
  renderSettings(req, res);
};

exports.updateSettings = (req, res) => {
  try {
    const changes = Setting.bulkUpdate(parseSettingsInput(req.body), req.currentUser.id);
    AuditLog.create(logContext(req, "admin.settings_updated", {
      changes
    }));
    renderSettings(req, res, {
      notice: req.t("admin.settings.notice.saved", { count: changes })
    });
  } catch (error) {
    renderSettings(req, res, {
      error: error.message === "invalid_number"
        ? req.t("admin.settings.errors.invalidNumber")
        : error.message === "invalid_mission"
          ? req.t("admin.settings.errors.invalidMission")
        : error.message === "invalid_search_fields"
          ? req.t("admin.settings.errors.invalidSearchFields")
        : error.message === "invalid_search_limit"
          ? req.t("admin.settings.errors.invalidSearchLimit")
        : error.message === "invalid_geometry_import_results_target"
          ? "Mode d'affichage des resultats d'import invalide."
        : sanitizeError(error)
    }, 400);
  }
};

exports.databaseStats = (req, res) => {
  const stats = getDatabaseStats();
  const tablePreview = getTablePreview(req.query.table, {
    page: req.query.page,
    limit: req.query.limit
  });

  res.render("admin/db-stats", {
    title: req.t("admin.dbStats.title"),
    stats,
    tablePreview,
    selectedTable: req.query.table || "",
    categoryLabels: categoryLabels(req)
  });
};

exports.systemStatus = (req, res) => {
  res.render("admin/system-status", {
    title: req.t("admin.systemStatus.title"),
    metadata: AppMetadata.get()
  });
};

exports.seeds = (req, res) => {
  renderSeeds(req, res);
};

exports.exportSeed = (req, res) => {
  try {
    const includeSensitiveTables = req.body?.include_sensitive_tables === "on";
    const result = seedService.exportSeed({ includeSensitiveTables });
    AuditLog.create(logContext(req, "admin.seed_exported", {
      file_name: result.fileName,
      table_count: result.tableCount,
      row_count: result.rowCount,
      include_sensitive_tables: result.includeSensitiveTables
    }));

    return renderSeeds(req, res, {
      notice: req.t("admin.seeds.notice.exported", {
        file: result.fileName,
        tables: result.tableCount,
        rows: result.rowCount
      }),
      exportResult: result
    });
  } catch (error) {
    return renderSeeds(req, res, {
      error: seedErrorMessage(req, error)
    }, 400);
  }
};

exports.importSeed = (req, res) => {
  try {
    const result = seedService.importSeed(req.body.seed_file);
    AuditLog.create(logContext(req, "admin.seed_imported", {
      file_name: result.fileName,
      statement_count: result.statementCount
    }));

    return renderSeeds(req, res, {
      notice: req.t("admin.seeds.notice.imported", {
        file: result.fileName,
        statements: result.statementCount
      }),
      importResult: result
    });
  } catch (error) {
    AuditLog.create(logContext(req, "admin.seed_import_failed", {
      file_name: req.body.seed_file || null,
      error: sanitizeError(error)
    }));

    return renderSeeds(req, res, {
      error: seedErrorMessage(req, error)
    }, 400);
  }
};

exports.emailTest = (req, res) => {
  renderEmailTest(req, res);
};

exports.sendEmailTest = async (req, res) => {
  const to = req.body.to?.trim();
  const subject = req.body.subject?.trim() || req.t("admin.email.defaultSubject");
  const message = req.body.message?.trim() || req.t("admin.email.defaultMessage");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to || "")) {
    return renderEmailTest(req, res, {
      error: req.t("admin.email.errors.invalidRecipient"),
      values: { to, subject, message }
    }, 400);
  }

  try {
    const result = await sendMail({
      to,
      subject,
      text: message,
      html: `<p>${escapeHtml(message).replaceAll("\n", "<br>")}</p>`
    });
    AuditLog.create(logContext(req, "admin.email_test_sent", {
      to,
      mode: result.mode || "smtp"
    }));

    return renderEmailTest(req, res, {
      notice: req.t("admin.email.notice.sent", { mode: result.mode || "smtp" }),
      result,
      values: { to: "", subject: "", message: "" }
    });
  } catch (error) {
    return renderEmailTest(req, res, {
      error: sanitizeError(error),
      values: { to, subject, message }
    }, 400);
  }
};

exports.monitoring = (req, res) => {
  res.render("admin/monitoring", {
    title: req.t("admin.monitoring.title"),
    monitoring: getMonitoringSnapshot()
  });
};

exports.loginHistory = (req, res) => {
  res.render("admin/login-history", {
    title: req.t("admin.loginHistory.title"),
    loginAttempts: UserLogin.recent(200)
  });
};

exports.permissions = (req, res) => {
  renderPermissions(req, res);
};

exports.updatePermissions = (req, res) => {
  const result = Permission.updateRoleMatrix(parseMatrixInput(req.body), req.currentUser.id);
  AuditLog.create(logContext(req, "permissions.role_matrix_updated", {
    changes: result.changes,
    roles: result.roles,
    permissions: result.permissions
  }));

  return renderPermissions(req, res, {
    notice: req.t("admin.permissions.notice.saved", { count: result.changes })
  });
};

function renderSettings(req, res, options = {}, statusCode = 200) {
  res.status(statusCode).render("admin/settings", {
    title: req.t("admin.settings.title"),
    groupedSettings: Setting.byGroup(),
    groupLabels: settingGroupLabels(req),
    missions: Mission.all(),
    notice: options.notice || null,
    error: options.error || null
  });
}

function renderEmailTest(req, res, options = {}, statusCode = 200) {
  const mailEnv = resolveMailEnv();
  res.status(statusCode).render("admin/email-test", {
    title: req.t("admin.email.title"),
    smtpReady: hasSmtpConfig(mailEnv),
    mailEnv: maskMailEnv(mailEnv),
    notice: options.notice || null,
    error: options.error || null,
    result: options.result || null,
    values: options.values || { to: "", subject: "", message: "" }
  });
}

function renderSeeds(req, res, options = {}, statusCode = 200) {
  res.status(statusCode).render("admin/seeds", {
    title: req.t("admin.seeds.title"),
    seedFiles: seedService.listSeedFiles(),
    seedDirectory: seedService.getSeedDirectory(),
    sensitiveTables: seedService.sensitiveTables,
    notice: options.notice || null,
    error: options.error || null,
    exportResult: options.exportResult || null,
    importResult: options.importResult || null
  });
}

function renderPermissions(req, res, options = {}, statusCode = 200) {
  res.status(statusCode).render("admin/permissions", {
    title: req.t("admin.permissions.title"),
    matrix: Permission.matrix(),
    notice: options.notice || null,
    error: options.error || null
  });
}

function settingGroupLabels(req) {
  return {
    general: req.t("admin.settings.groups.general"),
    map: "Cartographie",
    alerts: req.t("admin.settings.groups.alerts"),
    search: req.t("admin.settings.groups.search"),
    sync: req.t("admin.settings.groups.sync"),
    mail: req.t("admin.settings.groups.mail")
  };
}

function categoryLabels(req) {
  return {
    territories: req.t("admin.dbStats.categories.territories"),
    organization: req.t("admin.dbStats.categories.organization"),
    users: req.t("admin.dbStats.categories.users"),
    collection: req.t("admin.dbStats.categories.collection"),
    settings: req.t("admin.dbStats.categories.settings"),
    other: req.t("admin.dbStats.categories.other")
  };
}

function maskMailEnv(mailEnv) {
  return {
    MAIL_FROM: mailEnv.MAIL_FROM || "",
    SMTP_AUTH_METHOD: mailEnv.SMTP_AUTH_METHOD || "password",
    SMTP_HOST: mailEnv.SMTP_HOST || "",
    SMTP_PORT: mailEnv.SMTP_PORT || "",
    SMTP_SECURE: mailEnv.SMTP_SECURE || "",
    SMTP_USER: mailEnv.SMTP_USER || "",
    SMTP_PASSWORD: mailEnv.SMTP_PASSWORD ? "********" : "",
    GMAIL_OAUTH_CLIENT_ID: mailEnv.GMAIL_OAUTH_CLIENT_ID ? "********" : "",
    GMAIL_OAUTH_CLIENT_SECRET: mailEnv.GMAIL_OAUTH_CLIENT_SECRET ? "********" : "",
    GMAIL_OAUTH_REFRESH_TOKEN: mailEnv.GMAIL_OAUTH_REFRESH_TOKEN ? "********" : ""
  };
}

function parseSettingsInput(body) {
  if (body.settings && typeof body.settings === "object") {
    return body.settings;
  }

  return Object.entries(body || {}).reduce((settings, [key, value]) => {
    const arrayMatch = key.match(/^settings\[(.+)]\[\]$/);
    if (arrayMatch) {
      settings[arrayMatch[1]] = Array.isArray(value) ? value : [value];
      return settings;
    }
    const match = key.match(/^settings\[(.+)]$/);
    if (match) {
      settings[match[1]] = value;
    }
    return settings;
  }, {});
}

function parseMatrixInput(body) {
  const matrix = Object.entries(body || {}).reduce((permissionsByRole, [key, value]) => {
    const match = key.match(/^matrix\[([^\]]+)]\[([^\]]+)]$/);
    if (match) {
      const [, role, permission] = match;
      permissionsByRole[role] = permissionsByRole[role] || {};
      permissionsByRole[role][permission] = value === "on" || value === "1" || value === "true";
    }
    return permissionsByRole;
  }, {});
  const roleMarkers = Array.isArray(body.matrix_roles)
    ? body.matrix_roles
    : (body.matrix_roles ? [body.matrix_roles] : Object.keys(matrix));

  return {
    roles: roleMarkers,
    matrix
  };
}

function sanitizeError(error) {
  return String(error.message || error)
    .replace(/(token|authorization|password|secret|api[_-]?key)([^,\n]*)/gi, "$1=***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***");
}

function seedErrorMessage(req, error) {
  const key = String(error.message || "");
  const messages = {
    seed_file_not_found: req.t("admin.seeds.errors.notFound"),
    invalid_seed_file: req.t("admin.seeds.errors.invalidFile"),
    invalid_seed_file_name: req.t("admin.seeds.errors.invalidFileName")
  };

  return messages[key] || sanitizeError(error);
}

function logContext(req, action, details = null) {
  return {
    action,
    actor_user_id: req.currentUser?.id,
    ip_address: req.ip,
    user_agent: req.get("user-agent"),
    details
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
