const Mission = require("../models/Mission");

const statuses = ["planifiee", "en_cours", "terminee", "suspendue"];

exports.index = (req, res) => {
  res.render("missions/index", {
    title: req.t("missions.title"),
    missions: Mission.all()
  });
};

exports.new = (req, res) => {
  res.render("missions/new", {
    title: req.t("missions.form.title"),
    statuses,
    values: {},
    error: null
  });
};

exports.create = (req, res) => {
  const collectors = req.body.collectors ? Number.parseInt(req.body.collectors, 10) : 0;
  const latitude = req.body.latitude ? Number(req.body.latitude) : null;
  const longitude = req.body.longitude ? Number(req.body.longitude) : null;
  const values = {
    name: req.body.name?.trim(),
    region: req.body.region?.trim(),
    status: req.body.status || "planifiee",
    start_date: req.body.start_date || null,
    end_date: req.body.end_date || null,
    collectors,
    kobo_asset_uid: req.body.kobo_asset_uid?.trim() || null,
    latitude,
    longitude
  };

  const invalidNumbers = !Number.isInteger(collectors) || collectors < 0
    || (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90))
    || (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180));

  if (!values.name || !values.region || !statuses.includes(values.status) || invalidNumbers) {
    return res.status(400).render("missions/new", {
      title: req.t("missions.form.title"),
      statuses,
      values: req.body,
      error: req.t("missions.errors.invalidCreate")
    });
  }

  Mission.create(values);
  return res.redirect("/missions");
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
