const nodemailer = require("nodemailer");
const Setting = require("../models/Setting");

function hasSmtpConfig(env = process.env) {
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.MAIL_FROM) {
    return false;
  }

  if (resolveAuthMethod(env) === "oauth2") {
    return Boolean(
      env.SMTP_USER
      && env.GMAIL_OAUTH_CLIENT_ID
      && env.GMAIL_OAUTH_CLIENT_SECRET
      && env.GMAIL_OAUTH_REFRESH_TOKEN
    );
  }

  return Boolean(env.SMTP_USER && env.SMTP_PASSWORD);
}

async function sendMail({ to, subject, text, html }, env = process.env) {
  const mailEnv = env === process.env ? resolveMailEnv(env) : env;

  if (!hasSmtpConfig(mailEnv)) {
    console.log(`[mail:dev] to=${to} subject=${subject}\n${text}`);
    return { mode: "development", accepted: [to] };
  }

  const transporter = nodemailer.createTransport({
    host: mailEnv.SMTP_HOST,
    port: Number(mailEnv.SMTP_PORT),
    secure: String(mailEnv.SMTP_SECURE || "").toLowerCase() === "true",
    auth: buildAuth(mailEnv)
  });

  return transporter.sendMail({
    from: mailEnv.MAIL_FROM,
    to,
    subject,
    text,
    html
  });
}

function resolveMailEnv(env = process.env) {
  const settings = Setting.valuesByKey([
    "mail.from",
    "smtp.host",
    "smtp.port",
    "smtp.secure",
    "smtp.auth_method",
    "smtp.user",
    "smtp.password",
    "gmail.oauth_client_id",
    "gmail.oauth_client_secret",
    "gmail.oauth_refresh_token"
  ]);

  return {
    MAIL_FROM: settings["mail.from"] || env.MAIL_FROM,
    SMTP_HOST: settings["smtp.host"] || env.SMTP_HOST,
    SMTP_PORT: settings["smtp.port"] || env.SMTP_PORT,
    SMTP_SECURE: settings["smtp.secure"] || env.SMTP_SECURE,
    SMTP_AUTH_METHOD: settings["smtp.auth_method"] || env.SMTP_AUTH_METHOD,
    SMTP_USER: settings["smtp.user"] || env.SMTP_USER,
    SMTP_PASSWORD: settings["smtp.password"] || env.SMTP_PASSWORD,
    GMAIL_OAUTH_CLIENT_ID: settings["gmail.oauth_client_id"] || env.GMAIL_OAUTH_CLIENT_ID,
    GMAIL_OAUTH_CLIENT_SECRET: settings["gmail.oauth_client_secret"] || env.GMAIL_OAUTH_CLIENT_SECRET,
    GMAIL_OAUTH_REFRESH_TOKEN: settings["gmail.oauth_refresh_token"] || env.GMAIL_OAUTH_REFRESH_TOKEN
  };
}

function buildAuth(env) {
  if (resolveAuthMethod(env) === "oauth2") {
    return {
      type: "OAuth2",
      user: env.SMTP_USER,
      clientId: env.GMAIL_OAUTH_CLIENT_ID,
      clientSecret: env.GMAIL_OAUTH_CLIENT_SECRET,
      refreshToken: env.GMAIL_OAUTH_REFRESH_TOKEN
    };
  }

  return {
    user: env.SMTP_USER,
    pass: env.SMTP_PASSWORD
  };
}

function resolveAuthMethod(env) {
  return String(env.SMTP_AUTH_METHOD || "password").toLowerCase() === "oauth2"
    ? "oauth2"
    : "password";
}

module.exports = {
  buildAuth,
  hasSmtpConfig,
  resolveMailEnv,
  sendMail
};
