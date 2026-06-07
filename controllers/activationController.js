const ActivationToken = require("../models/ActivationToken");
const AuditLog = require("../models/AuditLog");
const User = require("../models/User");
const UserInvitation = require("../models/UserInvitation");
const { hashPassword, validatePassword } = require("../services/passwordService");
const { hashToken } = require("../services/tokenService");

exports.show = (req, res) => {
  const context = getActivationContext(req.params.token);
  if (!context) {
    return renderActivation(req, res, null, req.t("activation.invalidToken"), 400);
  }

  return renderActivation(req, res, context.invitation, null);
};

exports.activate = async (req, res) => {
  const context = getActivationContext(req.params.token);
  if (!context) {
    return renderActivation(req, res, null, req.t("activation.invalidToken"), 400);
  }

  const password = req.body.password || "";
  const confirmPassword = req.body.password_confirm || "";
  if (password !== confirmPassword || !validatePassword(password)) {
    return renderActivation(req, res, context.invitation, req.t("activation.invalidPassword"), 400);
  }

  const existingUser = User.findAuthByEmail(context.invitation.email);
  if (existingUser?.statut === "actif" && existingUser.email_verified) {
    return renderActivation(req, res, context.invitation, req.t("activation.alreadyActive"), 400);
  }

  const passwordHash = await hashPassword(password);
  const user = User.activateFromInvitation(context.invitation, passwordHash);
  ActivationToken.markUsed(context.token.id, user.id);
  UserInvitation.markActivated(context.invitation.id);
  AuditLog.create({
    target_user_id: user.id,
    action: "activation.success",
    entity_type: "user_invitation",
    entity_id: context.invitation.id
  });

  return res.redirect("/login?activated=1");
};

function getActivationContext(rawToken) {
  const token = ActivationToken.findValidByHash(hashToken(rawToken));
  if (!token) {
    return null;
  }

  const invitation = UserInvitation.findById(token.invitation_id);
  if (!invitation || invitation.statut !== "invite" || invitation.activated_at) {
    return null;
  }

  return { token, invitation };
}

function renderActivation(req, res, invitation, error, status = 200) {
  return res.status(status).render("auth/activate", {
    title: req.t("activation.title"),
    invitation,
    error
  });
}
