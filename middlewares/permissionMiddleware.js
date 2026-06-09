const AuditLog = require("../models/AuditLog");

function requirePermission(permissionCode) {
  return (req, res, next) => {
    if (!req.currentUser) {
      return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    }

    if (!req.permissions?.has(permissionCode)) {
      logAccessDenied(req, { required_permission: permissionCode });
      return res.status(403).render("errors/403", { title: req.t("errors.403.title") });
    }

    return next();
  };
}

function logAccessDenied(req, details = {}) {
  try {
    AuditLog.create({
      actor_user_id: req.currentUser?.id,
      action: "auth.access_denied",
      entity_type: "route",
      entity_id: req.originalUrl,
      ip_address: req.ip,
      user_agent: req.get("user-agent"),
      details: {
        method: req.method,
        path: req.originalUrl,
        role: req.currentUser?.role,
        ...details
      }
    });
  } catch (error) {
    console.error("Audit access denied log failed", error);
  }
}

module.exports = {
  requirePermission,
  logAccessDenied
};
