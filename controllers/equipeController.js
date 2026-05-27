const Equipe = require("../models/Equipe");

const statuses = ["planifiee", "active", "suspendue", "cloturee"];

function normalizedRegionIds(bodyValue) {
  const values = Array.isArray(bodyValue) ? bodyValue : (bodyValue ? [bodyValue] : []);
  return [...new Set(values.map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0))];
}

function normalizedId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function renderForm(res, values, error, options = {}) {
  return res.status(options.status || 200).render("equipes/form", {
    title: options.title || "Nouvelle equipe",
    formHeading: options.formHeading || "Nouvelle equipe",
    formAction: options.formAction || "/equipes",
    submitLabel: options.submitLabel || "Enregistrer",
    cancelHref: options.cancelHref || "/equipes",
    statuses,
    missions: Equipe.availableMissions(),
    supervisors: Equipe.activeSupervisors(),
    regions: Equipe.availableRegions(),
    selectedRegionIds: normalizedRegionIds(values.region_ids),
    values,
    error
  });
}

exports.index = (req, res) => {
  res.render("equipes/index", {
    title: "Equipes de collecte",
    equipes: Equipe.all()
  });
};

exports.new = (req, res) => {
  renderForm(res, { statut: "planifiee" }, null);
};

exports.create = (req, res) => {
  const missionId = normalizedId(req.body.mission_id);
  const superviseurId = normalizedId(req.body.superviseur_id);
  const hasSupervisorSelection = Boolean(req.body.superviseur_id);
  const regionIds = normalizedRegionIds(req.body.region_ids);
  const validRegionIds = Equipe.validRegionIds(regionIds);
  const values = {
    nom_equipe: req.body.nom_equipe?.trim(),
    mission_id: missionId,
    superviseur_id: superviseurId,
    statut: req.body.statut || "planifiee",
    region_ids: req.body.region_ids
  };

  if (!values.nom_equipe || !missionId || !statuses.includes(values.statut)) {
    return renderForm(res, req.body, "Verifiez le nom, la mission et le statut de l'equipe.", { status: 400 });
  }
  if (!Equipe.validMissionId(missionId)) {
    return renderForm(res, req.body, "La mission selectionnee n'existe pas.", { status: 400 });
  }
  if (!regionIds.length || validRegionIds.length !== regionIds.length) {
    return renderForm(res, req.body, "Selectionnez au moins une region valide.", { status: 400 });
  }
  if ((hasSupervisorSelection && !superviseurId) || !Equipe.validSupervisorId(superviseurId)) {
    return renderForm(res, req.body, "Le superviseur selectionne doit etre un superviseur actif.", { status: 400 });
  }

  const equipe = Equipe.create({
    nom_equipe: values.nom_equipe,
    mission_id: values.mission_id,
    superviseur_id: values.superviseur_id,
    statut: values.statut
  }, validRegionIds);
  return res.redirect(`/equipes/${equipe.id}`);
};

exports.show = (req, res, next) => {
  const equipe = Equipe.findById(req.params.id);
  if (!equipe) {
    return next();
  }

  return res.render("equipes/show", {
    title: equipe.nom_equipe,
    equipe
  });
};

exports.edit = (req, res, next) => {
  const equipe = Equipe.findById(req.params.id);
  if (!equipe) {
    return next();
  }

  return renderForm(res, {
    ...equipe,
    region_ids: equipe.regions.map((region) => String(region.id))
  }, null, {
    title: `Modifier ${equipe.nom_equipe}`,
    formHeading: "Modifier l'equipe",
    formAction: `/equipes/${equipe.id}`,
    submitLabel: "Mettre a jour",
    cancelHref: `/equipes/${equipe.id}`
  });
};

exports.update = (req, res, next) => {
  const equipe = Equipe.findById(req.params.id);
  if (!equipe) {
    return next();
  }

  const missionId = normalizedId(req.body.mission_id);
  const superviseurId = normalizedId(req.body.superviseur_id);
  const hasSupervisorSelection = Boolean(req.body.superviseur_id);
  const regionIds = normalizedRegionIds(req.body.region_ids);
  const validRegionIds = Equipe.validRegionIds(regionIds);
  const values = {
    nom_equipe: req.body.nom_equipe?.trim(),
    mission_id: missionId,
    superviseur_id: superviseurId,
    statut: req.body.statut,
    region_ids: req.body.region_ids
  };
  const renderOptions = {
    title: `Modifier ${equipe.nom_equipe}`,
    formHeading: "Modifier l'equipe",
    formAction: `/equipes/${equipe.id}`,
    submitLabel: "Mettre a jour",
    cancelHref: `/equipes/${equipe.id}`,
    status: 400
  };

  if (!values.nom_equipe || !missionId || !statuses.includes(values.statut)) {
    return renderForm(res, req.body, "Verifiez le nom, la mission et le statut de l'equipe.", renderOptions);
  }
  if (!Equipe.validMissionId(missionId)) {
    return renderForm(res, req.body, "La mission selectionnee n'existe pas.", renderOptions);
  }
  if (!regionIds.length || validRegionIds.length !== regionIds.length) {
    return renderForm(res, req.body, "Selectionnez au moins une region valide.", renderOptions);
  }
  if ((hasSupervisorSelection && !superviseurId) || !Equipe.validSupervisorId(superviseurId)) {
    return renderForm(res, req.body, "Le superviseur selectionne doit etre un superviseur actif.", renderOptions);
  }

  Equipe.update(equipe.id, {
    nom_equipe: values.nom_equipe,
    mission_id: values.mission_id,
    superviseur_id: values.superviseur_id,
    statut: values.statut
  }, validRegionIds);
  return res.redirect(`/equipes/${equipe.id}`);
};
