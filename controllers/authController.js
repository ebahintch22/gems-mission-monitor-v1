const AuditLog = require("../models/AuditLog");
const User = require("../models/User");
const UserInvitation = require("../models/UserInvitation");
const UserLogin = require("../models/UserLogin");
const { sendActivationLink } = require("../services/activationMailService");
const { verifyPassword } = require("../services/passwordService");
const { clearAuthCookie, signAuthCookie } = require("../middlewares/authMiddleware");

exports.loginForm = (req, res) => {
  res.render("auth/login", {
    title: req.t("auth.login.title"),
    error: null,
    notice: req.query.activated ? req.t("activation.success") : null,
    values: { email: "" }
  });
};

exports.login = async (req, res) => {
  const email = req.body.email?.trim().toLowerCase();
  const password = req.body.password || "";
  const values = { email };
  const genericNotice = req.t("auth.login.genericNotice");
  const invalidError = req.t("auth.login.error");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "")) {
    recordLoginAttempt(req, { email, success: false, failureReason: "invalid_email" });
    return renderLogin(req, res, values, invalidError, null, 400);
  }

  const user = User.findAuthByEmail(email);
  if (!user) {
    await sendInvitationIfPending(email, req);
    AuditLog.create(logContext(req, "auth.login_unknown_or_invited", null, { email }));
    recordLoginAttempt(req, { email, success: false, failureReason: "unknown_user_or_invited" });
    return renderLogin(req, res, values, null, genericNotice);
  }

  if (user.statut === "invite" || !user.email_verified) {
    await sendInvitationIfPending(email, req);
    AuditLog.create(logContext(req, "activation.email_requested", user.id, { email }));
    recordLoginAttempt(req, { userId: user.id, email, success: false, failureReason: "not_activated" });
    return renderLogin(req, res, values, null, genericNotice);
  }

  if (user.statut !== "actif") {
    AuditLog.create(logContext(req, "auth.login_blocked_status", user.id, { statut: user.statut }));
    recordLoginAttempt(req, { userId: user.id, email, success: false, failureReason: "blocked_status" });
    return renderLogin(req, res, values, invalidError, null, 403);
  }

  const validPassword = await verifyPassword(password, user.password_hash);
  if (!validPassword) {
    AuditLog.create(logContext(req, "auth.login_failed", user.id));
    recordLoginAttempt(req, { userId: user.id, email, success: false, failureReason: "invalid_password" });
    return renderLogin(req, res, values, invalidError, null, 401);
  }

  User.updateLastLogin(user.id);
  signAuthCookie(res, user);
  AuditLog.create(logContext(req, "auth.login_success", user.id));
  recordLoginAttempt(req, { userId: user.id, email, success: true });
  return res.redirect(req.body.next || "/");
};

exports.logout = (req, res) => {
  clearAuthCookie(res);
  res.redirect("/login");
};

async function sendInvitationIfPending(email, req) {
  const invitation = UserInvitation.findValidPendingByEmail(email);
  if (invitation) {
    await sendActivationLink(invitation, req);
    AuditLog.create(logContext(req, "activation.email_sent", null, { invitation_id: invitation.id }));
  }
}

function renderLogin(req, res, values, error, notice, status = 200) {
  return res.status(status).render("auth/login", {
    title: req.t("auth.login.title"),
    values,
    error,
    notice
  });
}

function logContext(req, action, targetUserId = null, details = null) {
  return {
    action,
    target_user_id: targetUserId,
    ip_address: req.ip,
    user_agent: req.get("user-agent"),
    details
  };
}

function recordLoginAttempt(req, { userId = null, email = null, success, failureReason = null }) {
  UserLogin.create({
    userId,
    email,
    success,
    failureReason,
    ipAddress: req.ip,
    userAgent: req.get("user-agent")
  });
}
