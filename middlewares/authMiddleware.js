const jwt = require("jsonwebtoken");
const User = require("../models/User");

const AUTH_COOKIE = "g2m_auth";

function currentUser(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE];
  req.currentUser = null;
  res.locals.currentUser = null;

  if (!token) {
    return next();
  }

  try {
    const payload = jwt.verify(token, jwtSecret());
    const user = User.findById(payload.sub);
    if (user && user.statut === "actif") {
      req.currentUser = user;
      res.locals.currentUser = user;
    }
  } catch {
    res.clearCookie(AUTH_COOKIE);
  }

  return next();
}

function signAuthCookie(res, user) {
  const token = jwt.sign(
    { sub: user.id, role: user.role },
    jwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
  );

  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(process.env.RENDER || process.env.NODE_ENV === "production"),
    maxAge: 8 * 60 * 60 * 1000
  });
}

function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE);
}

function requireAuth(req, res, next) {
  if (!req.currentUser) {
    return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  }

  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.currentUser || !roles.includes(req.currentUser.role)) {
      return res.status(403).render("errors/403", { title: req.t("errors.403.title") });
    }

    return next();
  };
}

function jwtSecret() {
  return process.env.JWT_SECRET || "g2m-development-secret-change-me";
}

module.exports = {
  AUTH_COOKIE,
  clearAuthCookie,
  currentUser,
  requireAuth,
  requireRole,
  signAuthCookie
};
