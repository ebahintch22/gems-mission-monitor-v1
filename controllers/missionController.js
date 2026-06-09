const Mission = require("../models/Mission");
const { getMissionDashboard } = require("../services/missionDashboardService");

const statuses = ["planifiee", "en_cours", "terminee", "suspendue"];

exports.index = (req, res) => {
  res.render("missions/index", {
    title: req.t("missions.title"),
    missions: Mission.all()
  });
};

exports.new = (req, res) => {
  renderForm(req, res, {
    title: req.t("missions.form.title"),
    heading: req.t("missions.form.title"),
    action: "/missions",
    submitLabel: req.t("common.save"),
    values: {}
  });
};

exports.create = (req, res) => {
  const { values, invalid } = parseMissionInput(req.body);

  if (invalid) {
    return renderForm(req, res, {
      title: req.t("missions.form.title"),
      heading: req.t("missions.form.title"),
      action: "/missions",
      submitLabel: req.t("common.save"),
      values: req.body,
      error: req.t("missions.errors.invalidCreate")
    }, 400);
  }

  Mission.create(values);
  return res.redirect("/missions");
};

exports.edit = (req, res, next) => {
  const mission = Mission.findById(req.params.id);
  if (!mission) {
    return next();
  }

  return renderForm(req, res, {
    title: req.t("missions.form.editTitle", { name: mission.name }),
    heading: req.t("missions.form.editHeading"),
    action: `/missions/${mission.id}`,
    submitLabel: req.t("common.update"),
    values: mission,
    mission
  });
};

exports.update = (req, res, next) => {
  const mission = Mission.findById(req.params.id);
  if (!mission) {
    return next();
  }

  const { values, invalid } = parseMissionInput(req.body);

  if (invalid) {
    return renderForm(req, res, {
      title: req.t("missions.form.editTitle", { name: mission.name }),
      heading: req.t("missions.form.editHeading"),
      action: `/missions/${mission.id}`,
      submitLabel: req.t("common.update"),
      values: { ...req.body, id: mission.id },
      mission,
      error: req.t("missions.errors.invalidCreate")
    }, 400);
  }

  Mission.update(mission.id, values);
  return res.redirect(`/missions/${mission.id}`);
};

exports.show = (req, res, next) => {
  const mission = Mission.findById(req.params.id);
  if (!mission) {
    return next();
  }
  return res.render("missions/show", {
    title: mission.name,
    mission
  });
};

exports.dashboard = (req, res, next) => {
  const dashboard = getMissionDashboard(req.params.id);
  if (!dashboard) {
    return next();
  }

  return res.render("missions/dashboard", {
    title: req.t("missionDashboard.title", { name: dashboard.mission.name }),
    dashboard,
    isHomeDashboard: false
  });
};

function renderForm(req, res, options, statusCode = 200) {
  return res.status(statusCode).render("missions/new", {
    statuses,
    error: null,
    mission: null,
    ...options
  });
}

function parseMissionInput(body) {
  const collectors = body.collectors ? Number.parseInt(body.collectors, 10) : 0;
  const latitude = body.latitude ? Number(body.latitude) : null;
  const longitude = body.longitude ? Number(body.longitude) : null;
  const values = {
    name: body.name?.trim(),
    region: body.region?.trim(),
    status: body.status || "planifiee",
    start_date: body.start_date || null,
    end_date: body.end_date || null,
    collectors,
    kobo_asset_uid: body.kobo_asset_uid?.trim() || null,
    latitude,
    longitude
  };

  const invalidNumbers = !Number.isInteger(collectors) || collectors < 0
    || (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90))
    || (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180));

  return {
    values,
    invalid: !values.name || !values.region || !statuses.includes(values.status) || invalidNumbers
  };
}
