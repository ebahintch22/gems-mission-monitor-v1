const User = require("../models/User");
const Role = require("../models/Role");

const statuses = ["actif", "inactif", "suspendu"];

function normalizedRegionIds(bodyValue) {
  const values = Array.isArray(bodyValue) ? bodyValue : (bodyValue ? [bodyValue] : []);
  return [...new Set(values.map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0))];
}

function renderForm(res, values, error, options = {}) {
  return res.status(options.status || 200).render("users/form", {
    title: options.title || "Nouvel utilisateur",
    formHeading: options.formHeading || "Nouvel utilisateur",
    formAction: options.formAction || "/users",
    submitLabel: options.submitLabel || "Enregistrer",
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
    title: "Utilisateurs",
    users: User.all()
  });
};

exports.new = (req, res) => {
  renderForm(res, { role: "superviseur", statut: "actif" }, null);
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
    return renderForm(res, req.body, "Verifiez les informations obligatoires de l'utilisateur.", { status: 400 });
  }
  if (validRegionIds.length !== regionIds.length) {
    return renderForm(res, req.body, "Une region selectionnee n'existe pas.", { status: 400 });
  }
  if (User.findByEmail(values.email)) {
    return renderForm(res, req.body, "Un utilisateur possede deja cette adresse email.", { status: 400 });
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

  return renderForm(res, {
    ...user,
    region_ids: user.regions.map((region) => String(region.id))
  }, null, {
    title: `Modifier ${user.prenoms} ${user.nom}`,
    formHeading: "Modifier l'utilisateur",
    formAction: `/users/${user.id}`,
    submitLabel: "Mettre a jour",
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
    title: `Modifier ${user.prenoms} ${user.nom}`,
    formHeading: "Modifier l'utilisateur",
    formAction: `/users/${user.id}`,
    submitLabel: "Mettre a jour",
    cancelHref: `/users/${user.id}`,
    status: 400
  };

  if (!values.nom || !values.prenoms || !validEmail
      || !Role.exists(values.role) || !statuses.includes(values.statut)) {
    return renderForm(res, values, "Verifiez les informations obligatoires de l'utilisateur.", renderOptions);
  }
  if (validRegionIds.length !== regionIds.length) {
    return renderForm(res, values, "Une region selectionnee n'existe pas.", renderOptions);
  }
  if (User.findByEmail(values.email, user.id)) {
    return renderForm(res, values, "Un utilisateur possede deja cette adresse email.", renderOptions);
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
