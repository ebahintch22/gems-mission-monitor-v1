const Mission = require("../models/Mission");

exports.index = (req, res) => {
  res.render("dashboard/index", {
    title: req.t("dashboard.title"),
    stats: Mission.stats(),
    recentMissions: Mission.recent()
  });
};
