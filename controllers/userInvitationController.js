const AuditLog = require("../models/AuditLog");
const Mission = require("../models/Mission");
const Role = require("../models/Role");
const User = require("../models/User");
const UserInvitation = require("../models/UserInvitation");
const { generateToken, hashToken } = require("../services/tokenService");

const DEFAULT_EXPIRATION_DAYS = 7;

exports.index = (req, res) => {
  res.render("users/invitations/index", {
    title: req.t("users.invitations.title"),
    invitations: UserInvitation.all(),
    notice: req.query.created ? req.t("users.invitations.notice.created") : null
  });
};

exports.new = (req, res) => {
  renderForm(req, res, defaultValues(), null);
};

exports.create = (req, res) => {
  const values = normalizeBody(req.body);
  const error = validateInvitation(req, values);
  if (error) {
    return renderForm(req, res, values, error, 400);
  }

  if (User.findByEmail(values.email) || UserInvitation.findByEmail(values.email)) {
    return renderForm(req, res, values, req.t("users.invitations.errors.duplicateEmail"), 400);
  }

  const invitationSeedToken = generateToken();
  const invitation = UserInvitation.create({
    ...values,
    invited_by: req.currentUser?.id || null,
    invitation_token_hash: hashToken(invitationSeedToken),
    expires_at: expirationDate(values.expires_in_days)
  });

  AuditLog.create({
    actor_user_id: req.currentUser?.id,
    action: "user.invitation_created",
    entity_type: "user_invitation",
    entity_id: invitation.id,
    ip_address: req.ip,
    user_agent: req.get("user-agent"),
    details: { email: invitation.email, role: invitation.role }
  });

  return res.redirect("/users/invitations?created=1");
};

exports.edit = (req, res, next) => {
  const invitation = UserInvitation.findById(req.params.id);
  if (!invitation) {
    return next();
  }

  renderForm(req, res, {
    ...invitation,
    expires_in_days: DEFAULT_EXPIRATION_DAYS
  }, null, 200, {
    title: req.t("users.invitations.editTitle"),
    formAction: `/users/invitations/${invitation.id}`,
    submitLabel: req.t("common.update")
  });
};

exports.update = (req, res, next) => {
  const invitation = UserInvitation.findById(req.params.id);
  if (!invitation) {
    return next();
  }

  if (invitation.statut !== "invite" || invitation.activated_at) {
    return renderForm(req, res, invitation, req.t("users.invitations.errors.notEditable"), 400);
  }

  const values = normalizeBody(req.body);
  const error = validateInvitation(req, values);
  if (error) {
    return renderForm(req, res, values, error, 400);
  }

  if (User.findByEmail(values.email) || UserInvitation.findByEmail(values.email, invitation.id)) {
    return renderForm(req, res, values, req.t("users.invitations.errors.duplicateEmail"), 400);
  }

  UserInvitation.update(invitation.id, {
    ...values,
    invitation_token_hash: invitation.invitation_token_hash,
    expires_at: expirationDate(values.expires_in_days)
  });

  AuditLog.create({
    actor_user_id: req.currentUser?.id,
    action: "user.invitation_updated",
    entity_type: "user_invitation",
    entity_id: invitation.id,
    ip_address: req.ip,
    user_agent: req.get("user-agent")
  });

  return res.redirect("/users/invitations");
};

function renderForm(req, res, values, error, status = 200, options = {}) {
  return res.status(status).render("users/invitations/form", {
    title: options.title || req.t("users.invitations.new"),
    formAction: options.formAction || "/users/invitations",
    submitLabel: options.submitLabel || req.t("common.save"),
    roles: Role.all(),
    missions: Mission.all(),
    values,
    error
  });
}

function defaultValues() {
  return {
    nom: "",
    prenoms: "",
    email: "",
    role: "partenaire",
    zone_affectation: "",
    mission_id: "",
    expires_in_days: DEFAULT_EXPIRATION_DAYS
  };
}

function normalizeBody(body) {
  return {
    nom: body.nom?.trim(),
    prenoms: body.prenoms?.trim(),
    email: body.email?.trim().toLowerCase(),
    role: body.role || "partenaire",
    zone_affectation: body.zone_affectation?.trim() || "",
    mission_id: body.mission_id || "",
    expires_in_days: body.expires_in_days || DEFAULT_EXPIRATION_DAYS
  };
}

function validateInvitation(req, values) {
  if (!values.nom || !values.prenoms || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email || "")) {
    return req.t("users.invitations.errors.invalidMain");
  }

  if (!Role.exists(values.role)) {
    return req.t("users.invitations.errors.invalidRole");
  }

  const expirationDays = Number(values.expires_in_days);
  if (!Number.isInteger(expirationDays) || expirationDays < 1 || expirationDays > 30) {
    return req.t("users.invitations.errors.invalidExpiration");
  }

  return null;
}

function expirationDate(days) {
  return new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000).toISOString();
}
