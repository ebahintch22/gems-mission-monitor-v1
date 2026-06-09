const Mission = require("../models/Mission");
const Setting = require("../models/Setting");
const { getMissionDashboard } = require("../services/missionDashboardService");

exports.index = (req, res) => {
  const defaultMissionId = Number(Setting.rawValue("app.default_mission_id"));
  if (
    req.currentUser
    && req.permissions?.has("dashboard.mission.read")
    && Number.isInteger(defaultMissionId)
    && defaultMissionId > 0
  ) {
    const dashboard = getMissionDashboard(defaultMissionId);
    if (dashboard) {
      return res.render("missions/dashboard", {
        title: req.t("missionDashboard.title", { name: dashboard.mission.name }),
        dashboard,
        isHomeDashboard: true
      });
    }
  }

  res.render("dashboard/index", {
    title: req.t("dashboard.title"),
    stats: Mission.stats(),
    recentMissions: Mission.recent()
  });
};
