const Mission = require("../models/Mission");
const Setting = require("../models/Setting");
const { getMissionDashboard } = require("../services/missionDashboardService");

exports.index = (req, res) => {
  if (req.currentUser && req.permissions?.has("sig.read")) {
    return res.redirect("/cartographie");
  }

  const defaultMissionId = Number(Setting.rawValue("app.default_mission_id"));
  if (
    req.currentUser
    && req.permissions?.has("dashboard.mission.read")
    && Number.isInteger(defaultMissionId)
    && defaultMissionId > 0
  ) {
    const defaultMission = Mission.findById(defaultMissionId);
    const dashboard = defaultMission?.archived === 1 && req.currentUser.role !== "admin"
      ? null
      : getMissionDashboard(defaultMissionId);
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
