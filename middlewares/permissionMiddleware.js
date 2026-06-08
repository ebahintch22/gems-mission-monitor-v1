function requirePermission(permissionCode) {
  return (req, res, next) => {
    if (!req.currentUser) {
      return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    }

    if (!req.permissions?.has(permissionCode)) {
      return res.status(403).render("errors/403", { title: req.t("errors.403.title") });
    }

    return next();
  };
}

module.exports = {
  requirePermission
};
