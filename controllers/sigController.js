const SoumissionCollecte = require("../models/SoumissionCollecte");
const Mission = require("../models/Mission");
const Setting = require("../models/Setting");
const siteCategoryIcons = require("../config/map/site-category-icons.json");
const { getKoboConfigStatus, syncKoboSubmissions } = require("../services/koboSyncService");

exports.index = (req, res) => {
  const points = SoumissionCollecte.mapPoints();
  const regions = SoumissionCollecte.regionBoundaries().map((region) => ({
    type: "Feature",
    properties: {
      id: region.id,
      code_region: region.code_region,
      nom_region: region.nom_region
    },
    geometry: JSON.parse(region.geometry_geojson)
  }));

  res.render("sig/index", {
    title: req.t("sig.title"),
    points,
    regions,
    siteCategoryIcons,
    geometryImportConfig: {
      resultsTarget: Setting.rawValue("map.geometry_import_results_target") || "floating"
    },
    filters: SoumissionCollecte.mapFilters()
  });
};

exports.filterOptions = (req, res) => {
  const missionId = Number.parseInt(req.query.mission_id, 10);
  if (!Number.isInteger(missionId) || missionId <= 0) {
    return res.json({ equipes: [], agents: [] });
  }

  return res.json(SoumissionCollecte.mapFilterOptionsForMission(missionId));
};

exports.koboLightStatus = (req, res) => {
  const config = getKoboConfigStatus();
  const missions = Mission.allActive().map((mission) => ({
    id: mission.id,
    name: mission.name,
    kobo_asset_uid: mission.kobo_asset_uid || ""
  }));

  res.json({
    ready: Boolean(config.ready && (config.defaultAssetUid || missions.some((mission) => mission.kobo_asset_uid))),
    config: {
      baseUrlConfigured: config.baseUrlConfigured,
      tokenConfigured: config.tokenConfigured,
      defaultAssetUid: config.defaultAssetUid,
      defaultMissionId: config.defaultMissionId,
      gpsField: config.gpsField,
      agentCodeField: config.agentCodeField,
      formType: config.formType
    },
    missions
  });
};

exports.koboLightSync = async (req, res) => {
  try {
    const result = await syncKoboSubmissions({
      assetUid: req.body.asset_uid,
      missionId: req.body.mission_id,
      limit: req.body.limit,
      since: req.body.since,
      dryRun: Boolean(req.body.dry_run),
      gpsField: req.body.gps_field,
      agentCodeField: req.body.agent_code_field,
      formType: req.body.form_type
    });

    res.json({ ok: true, summary: result });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message.replace(/Token\s+[A-Za-z0-9._-]+/g, "Token ***") });
  }
};
