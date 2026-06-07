const nodemailer = require("nodemailer");

function hasSmtpConfig(env = process.env) {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.MAIL_FROM);
}

async function sendMail({ to, subject, text, html }, env = process.env) {
  if (!hasSmtpConfig(env)) {
    console.log(`[mail:dev] to=${to} subject=${subject}\n${text}`);
    return { mode: "development", accepted: [to] };
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT),
    secure: String(env.SMTP_SECURE || "").toLowerCase() === "true",
    auth: env.SMTP_USER && env.SMTP_PASSWORD
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined
  });

  return transporter.sendMail({
    from: env.MAIL_FROM,
    to,
    subject,
    text,
    html
  });
}

module.exports = {
  sendMail
};
