const ActivationToken = require("../models/ActivationToken");
const { sendMail } = require("./mailService");
const { generateToken, hashToken } = require("./tokenService");

const ACTIVATION_TOKEN_HOURS = 72;

async function sendActivationLink(invitation, req) {
  const { token, expiresAt } = ensureActivationToken(invitation);
  const activationUrl = buildActivationUrl(token, req);
  const subject = "Activation de votre compte G2M";
  const text = [
    `Bonjour ${invitation.prenoms} ${invitation.nom},`,
    "",
    "Votre compte G2M a été préautorisé.",
    "Pour l'activer, ouvrez le lien suivant et définissez votre mot de passe :",
    activationUrl,
    "",
    `Ce lien expire le ${expiresAt}.`,
    "Si vous n'êtes pas concerné par cette invitation, ignorez ce message."
  ].join("\n");

  await sendMail({
    to: invitation.email,
    subject,
    text,
    html: text.split("\n").map((line) => `<p>${escapeHtml(line) || "&nbsp;"}</p>`).join("")
  });

  return { activationUrl, expiresAt };
}

function ensureActivationToken(invitation) {
  ActivationToken.invalidateActiveForInvitation(invitation.id);
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ACTIVATION_TOKEN_HOURS * 60 * 60 * 1000).toISOString();
  ActivationToken.create({
    invitation_id: invitation.id,
    token_hash: hashToken(token),
    expires_at: expiresAt
  });

  return { token, expiresAt };
}

function buildActivationUrl(token, req) {
  const baseUrl = process.env.APP_BASE_URL
    || `${req?.protocol || "http"}://${req?.get?.("host") || "localhost:3000"}`;
  return `${baseUrl.replace(/\/+$/, "")}/activation/${token}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

module.exports = {
  sendActivationLink
};
