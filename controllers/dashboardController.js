const Mission = require("../models/Mission");

exports.index = (req, res) => {
  res.render("dashboard/index", {
    title: "Tableau de bord",
    stats: Mission.stats(),
    recentMissions: Mission.recent()
  });
};
