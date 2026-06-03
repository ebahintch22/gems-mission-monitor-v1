const User = require("../models/User");
const Role = require("../models/Role");

const statuses = ["actif", "inactif", "suspendu"];

function normalizedRegionIds(bodyValue) {
  const values = Array.isArray(bodyValue) ? bodyValue : (bodyValue ? [bodyValue] : []);
  return [...new Set(values.map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0))];
}

function renderForm(req, res, values, error, options = {}) {
  return res.status(options.status || 200).render("users/form", {
    title: options.title || req.t("users.form.newTitle"),
    formHeading: options.formHeading || req.t("users.form.newHeading"),
    formAction: options.formAction || "/users",
    submitLabel: options.submitLabel || req.t("common.save"),
    cancelHref: options.cancelHref || "/users",
    roles: Role.all(),
    statuses,
    regions: User.availableRegions(),
    selectedRegionIds: normalizedRegionIds(values.region_ids),
    values,
    error
  });
}

exports.index = (req, res) => {
  res.render("users/index", {
    title: req.t("users.title"),
    users: User.all()
  });
};

exports.new = (req, res) => {
  renderForm(req, res, { role: "superviseur", statut: "actif" }, null);
};

exports.create = (req, res) => {
  const values = {
    nom: req.body.nom?.trim(),
    prenoms: req.body.prenoms?.trim(),
    email: req.body.email?.trim().toLowerCase(),
    telephone: req.body.telephone?.trim() || null,
    role: req.body.role || "superviseur",
    statut: req.body.statut || "actif",
    password_hash: null,
    region_ids: req.body.region_ids
  };
  const regionIds = normalizedRegionIds(req.body.region_ids);
  const validRegionIds = User.validRegionIds(regionIds);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email || "");

  if (!values.nom || !values.prenoms || !validEmail
      || !Role.exists(values.role) || !statuses.includes(values.statut)) {
    return renderForm(req, res, req.body, req.t("users.errors.invalidMain"), { status: 400 });
  }
  if (validRegionIds.length !== regionIds.length) {
    return renderForm(req, res, req.body, req.t("users.errors.invalidRegion"), { status: 400 });
  }
  if (User.findByEmail(values.email)) {
    return renderForm(req, res, req.body, req.t("users.errors.duplicateEmail"), { status: 400 });
  }

  const user = User.create({
    nom: values.nom,
    prenoms: values.prenoms,
    email: values.email,
    telephone: values.telephone,
    role: values.role,
    statut: values.statut,
    password_hash: values.password_hash
  }, validRegionIds);
  return res.redirect(`/users/${user.id}`);
};

exports.show = (req, res, next) => {
  const user = User.findById(req.params.id);
  if (!user) {
    return next();
  }

  return res.render("users/show", {
    title: `${user.prenoms} ${user.nom}`,
    user
  });
};

exports.edit = (req, res, next) => {
  const user = User.findById(req.params.id);
  if (!user) {
    return next();
  }

  return renderForm(req, res, {
    ...user,
    region_ids: user.regions.map((region) => String(region.id))
  }, null, {
    title: req.t("users.form.editTitle", { name: `${user.prenoms} ${user.nom}` }),
    formHeading: req.t("users.form.editHeading"),
    formAction: `/users/${user.id}`,
    submitLabel: req.t("common.update"),
    cancelHref: `/users/${user.id}`
  });
};

exports.update = (req, res, next) => {
  const user = User.findById(req.params.id);
  if (!user) {
    return next();
  }

  const values = {
    nom: req.body.nom?.trim(),
    prenoms: req.body.prenoms?.trim(),
    email: req.body.email?.trim().toLowerCase(),
    telephone: req.body.telephone?.trim() || null,
    role: req.body.role,
    statut: req.body.statut,
    region_ids: req.body.region_ids
  };
  const regionIds = normalizedRegionIds(req.body.region_ids);
  const validRegionIds = User.validRegionIds(regionIds);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email || "");
  const renderOptions = {
    title: req.t("users.form.editTitle", { name: `${user.prenoms} ${user.nom}` }),
    formHeading: req.t("users.form.editHeading"),
    formAction: `/users/${user.id}`,
    submitLabel: req.t("common.update"),
    cancelHref: `/users/${user.id}`,
    status: 400
  };

  if (!values.nom || !values.prenoms || !validEmail
      || !Role.exists(values.role) || !statuses.includes(values.statut)) {
    return renderForm(req, res, values, req.t("users.errors.invalidMain"), renderOptions);
  }
  if (validRegionIds.length !== regionIds.length) {
    return renderForm(req, res, values, req.t("users.errors.invalidRegion"), renderOptions);
  }
  if (User.findByEmail(values.email, user.id)) {
    return renderForm(req, res, values, req.t("users.errors.duplicateEmail"), renderOptions);
  }

  User.update(user.id, {
    nom: values.nom,
    prenoms: values.prenoms,
    email: values.email,
    telephone: values.telephone,
    role: values.role,
    statut: values.statut
  }, validRegionIds);
  return res.redirect(`/users/${user.id}`);
};
