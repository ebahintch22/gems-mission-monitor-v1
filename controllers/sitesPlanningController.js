const SitesPlanning = require("../models/SitesPlanning");
const BuildingFeatureV2 = require("../models/BuildingFeatureV2");
const { DEFAULT_PLANNING_CSV_PATH, importSitesPlanningFromCsv } = require("../services/sitesPlanningImportService");
const { fetchOsmBuildings } = require("../services/osmBuildingImportService");

exports.page = (req, res) => {
  res.render("sites-planning/index", {
    title: req.t("sitesPlanning.title"),
    defaultCsvPath: DEFAULT_PLANNING_CSV_PATH
  });
};

exports.index = (req, res) => {
  const sites = SitesPlanning.all({
    statuses: req.query.status || req.query.statuses
  });

  res.json({
    sites,
    count: sites.length,
    statuses: SitesPlanning.validStatuses()
  });
};

exports.stats = (req, res) => {
  res.json(SitesPlanning.stats({
    statuses: req.query.status || req.query.statuses
  }));
};

exports.importCsv = (req, res) => {
  try {
    const result = importSitesPlanningFromCsv(req.body?.file_path || DEFAULT_PLANNING_CSV_PATH);
    res.status(201).json({ ok: true, result });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
};

exports.updateLocation = (req, res) => {
  try {
    const site = SitesPlanning.updateLocation(req.params.id, {
      point_geo: req.body.point_geo,
      polygon_geo: req.body.polygon_geo
    });
    res.json({ ok: true, site });
  } catch (error) {
    const statusCode = error.message === "site_planning_not_found" ? 404 : 400;
    res.status(statusCode).json({ ok: false, error: error.message });
  }
};

exports.previewOsmBuildingExtents = async (req, res) => {
  const source = String(req.body?.source || "osm").trim().toLowerCase();
  if (source !== "osm") {
    return res.status(400).json({ ok: false, error: "unsupported_building_source" });
  }

  const sites = SitesPlanning.withContours(req.body?.site_ids || req.body?.siteIds || []);
  if (!sites.length) {
    return res.status(400).json({ ok: false, error: "no_sites_with_contours_selected" });
  }

  const results = [];
  for (const site of sites) {
    try {
      const { areaKm2, geojson } = await fetchOsmBuildings(site.polygon_geo);
      results.push({
        site_id: site.id,
        code: site.code,
        site_name: site.site_name,
        status: "success",
        area_km2: areaKm2,
        imported: geojson.features.length,
        geojson
      });
    } catch (error) {
      results.push({
        site_id: site.id,
        code: site.code,
        site_name: site.site_name,
        status: "error",
        imported: 0,
        error: error.message,
        details: error.details || ""
      });
    }
  }

  res.json({
    ok: true,
    source,
    summary: {
      total_sites: results.length,
      success_sites: results.filter((result) => result.status === "success").length,
      failed_sites: results.filter((result) => result.status === "error").length,
      total_buildings: results.reduce((sum, result) => sum + Number(result.imported || 0), 0)
    },
    results
  });
};

exports.saveOsmBuildingExtents = (req, res) => {
  try {
    const result = BuildingFeatureV2.importOsmSiteCollections(req.body?.imports || [], {
      actorUserId: req.currentUser?.id || null,
      missionId: req.body?.mission_id || req.body?.missionId || null
    });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
};

exports.buildingsPlan = (req, res) => {
  try {
    const result = BuildingFeatureV2.planDataForSite(req.params.id, {
      missionId: req.query.mission_id || req.query.missionId || null
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    const statusCode = error.message === "site_planning_not_found" ? 404 : 400;
    res.status(statusCode).json({ ok: false, error: error.message });
  }
};
