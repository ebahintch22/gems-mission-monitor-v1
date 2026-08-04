const SoumissionCollecte = require("../models/SoumissionCollecte");
const Mission = require("../models/Mission");
const Setting = require("../models/Setting");
const siteCategoryIcons = require("../config/map/site-category-icons.json");
const { DEFAULT_FORM_ID, loadChoiceList } = require("../services/formMappingService");
const { getKoboConfigStatus, syncKoboSubmissions } = require("../services/koboSyncService");
const {
  buildKoboGeometryReviewAssetIndex,
  buildKoboGeometryReviewChoiceIndex,
  buildKoboGeometryReviewSummary,
  loadKoboReferenceMatchingReview,
  loadKoboGeometryReviewData,
  resolveKoboGeometryReviewAssetPath
} = require("../services/koboGeometryReviewService");

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
    administrativeChoiceIndex: buildAdministrativeChoiceIndex(),
    geometryImportConfig: {
      resultsTarget: Setting.rawValue("map.geometry_import_results_target") || "floating",
      markerBounceDurationMs: normalizeMarkerBounceDuration(Setting.rawValue("map.marker_bounce_duration_ms")),
      siteLabelWrapLength: normalizeSiteLabelWrapLength(Setting.rawValue("map.site_label_wrap_length")),
      siteContourStyle: normalizeMapFeatureStyle({
        strokeColor: Setting.rawValue("map.site_contour_stroke_color"),
        strokeWeight: Setting.rawValue("map.site_contour_stroke_weight"),
        dashStyle: Setting.rawValue("map.site_contour_dash_style"),
        fillOpacity: Setting.rawValue("map.site_contour_fill_opacity")
      }, {
        strokeColor: "#006b5b",
        strokeWeight: 2,
        dashStyle: "solid",
        fillOpacity: 0.12
      }),
      osmBuildingStyle: normalizeMapFeatureStyle({
        strokeColor: Setting.rawValue("map.osm_building_stroke_color"),
        strokeWeight: Setting.rawValue("map.osm_building_stroke_weight"),
        dashStyle: Setting.rawValue("map.osm_building_dash_style"),
        fillOpacity: Setting.rawValue("map.osm_building_fill_opacity")
      }, {
        strokeColor: "#7c3aed",
        strokeWeight: 2,
        dashStyle: "dashed",
        fillOpacity: 0.28
      }),
      spatialReferenceStyle: {
        siteContour: normalizeMapFeatureStyle({
          strokeColor: Setting.rawValue("map.spatial_site_contour_stroke_color"),
          fillColor: Setting.rawValue("map.spatial_site_contour_fill_color"),
          strokeWeight: Setting.rawValue("map.spatial_site_contour_stroke_weight"),
          fillOpacity: Setting.rawValue("map.spatial_site_contour_fill_opacity")
        }, {
          strokeColor: "#00ffff",
          fillColor: "#ffffff",
          strokeWeight: 3,
          dashStyle: "solid",
          fillOpacity: 0.22
        }),
        buildingExtent: normalizeMapFeatureStyle({
          strokeColor: Setting.rawValue("map.spatial_building_stroke_color"),
          fillColor: Setting.rawValue("map.spatial_building_fill_color"),
          strokeWeight: Setting.rawValue("map.spatial_building_stroke_weight"),
          fillOpacity: Setting.rawValue("map.spatial_building_fill_opacity")
        }, {
          strokeColor: "#dc2626",
          fillColor: "#facc15",
          strokeWeight: 2,
          dashStyle: "solid",
          fillOpacity: 0.34
        }),
        network: {
          pyloneColor: normalizeColor(Setting.rawValue("map.spatial_network_pylone_color"), "#dc2626"),
          chamberFillColor: normalizeColor(Setting.rawValue("map.spatial_network_chamber_fill_color"), "#facc15"),
          chamberStrokeColor: normalizeColor(Setting.rawValue("map.spatial_network_chamber_stroke_color"), "#dc2626"),
          chamberRadius: normalizeInteger(Setting.rawValue("map.spatial_network_chamber_radius"), 7, 4, 16)
        }
      }
    },
    filters: SoumissionCollecte.mapFilters()
  });
};

function buildAdministrativeChoiceIndex() {
  return ["adm1_ci", "adm2_ci", "adm3_ci", "ministere", "secteur", "sous_type", "milieu"].reduce((index, choiceListName) => {
    const choices = loadChoiceList(DEFAULT_FORM_ID, choiceListName);
    if (!index.__choices) {
      index.__choices = {};
    }
    index.__choices[choiceListName] = Array.isArray(choices)
      ? choices.map((choice) => ({
        name: String(choice.name || ""),
        label: choice.label || choice.name,
        filters: choice.filters || {}
      })).filter((choice) => choice.name)
      : [];
    index[choiceListName] = Array.isArray(choices)
      ? choices.reduce((choiceMap, choice) => {
        const name = String(choice.name || "");
        if (name) {
          choiceMap[name] = choice.label || choice.name;
        }
        return choiceMap;
      }, {})
      : {};
    return index;
  }, {});
}

exports.filterOptions = (req, res) => {
  const missionId = Number.parseInt(req.query.mission_id, 10);
  if (!Number.isInteger(missionId) || missionId <= 0) {
    return res.json({ equipes: [], agents: [] });
  }

  return res.json(SoumissionCollecte.mapFilterOptionsForMission(missionId));
};

exports.koboGeometriesReview = (req, res) => {
  let reviewData;
  try {
    reviewData = loadKoboGeometryReviewData({
      batch: req.query.batch,
      output: req.query.output
    });
  } catch (error) {
    return res.status(error.statusCode || 400).render("errors/500", {
      title: "Chargement des extractions Kobo impossible",
      error
    });
  }
  const summary = buildKoboGeometryReviewSummary(reviewData.payload);

  res.render("sig/kobo-geometries-review", {
    title: "Revue des extractions geometriques Kobo",
    payload: reviewData.payload,
    summary,
    reviewSource: reviewData.source,
    reviewFilePath: reviewData.filePath,
    reviewCatalog: reviewData.catalog,
    localAssets: buildKoboGeometryReviewAssetIndex(),
    choiceIndex: buildKoboGeometryReviewChoiceIndex(),
    selectedBatch: reviewData.selectedBatch,
    selectedOutput: reviewData.selectedOutput
  });
};

exports.koboGeometryReviewAsset = (req, res) => {
  try {
    const filePath = resolveKoboGeometryReviewAssetPath(req.params);
    return res.sendFile(filePath);
  } catch (error) {
    return res.status(error.statusCode || 400).send(error.message);
  }
};

exports.koboReferenceMatchingReview = (req, res) => {
  try {
    const review = loadKoboReferenceMatchingReview({
      batch: req.query.batch,
      matching: req.query.batch ? "matching_review.geojson" : undefined
    });
    return res.json({
      ok: true,
      batch: review.batch,
      output: review.output,
      filePath: review.filePath,
      payload: review.payload
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      ok: false,
      error: error.message
    });
  }
};

exports.koboReferenceNormalizedBuildings = (req, res) => {
  try {
    const review = loadKoboReferenceMatchingReview({
      batch: req.query.batch,
      matching: req.query.batch ? "emprises_batiment_normalized.geojson" : undefined,
      defaultOutputName: "emprises_batiment_normalized.geojson"
    });
    return res.json({
      ok: true,
      batch: review.batch,
      output: review.output,
      filePath: review.filePath,
      payload: review.payload
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      ok: false,
      error: error.message
    });
  }
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

function normalizeMarkerBounceDuration(value) {
  const duration = Number(value);
  return Number.isInteger(duration) && duration >= 100 && duration <= 5000 ? duration : 600;
}

function normalizeSiteLabelWrapLength(value) {
  const length = Number(value);
  return Number.isInteger(length) && length >= 10 && length <= 80 ? length : 30;
}

function normalizeMapFeatureStyle(input, defaults) {
  const strokeWeight = Number(input.strokeWeight);
  const fillOpacity = Number(input.fillOpacity);
  return {
    strokeColor: /^#[0-9a-f]{6}$/i.test(input.strokeColor || "") ? input.strokeColor : defaults.strokeColor,
    fillColor: /^#[0-9a-f]{6}$/i.test(input.fillColor || "") ? input.fillColor : defaults.fillColor || defaults.strokeColor,
    strokeWeight: Number.isInteger(strokeWeight) && strokeWeight >= 1 && strokeWeight <= 12
      ? strokeWeight
      : defaults.strokeWeight,
    dashStyle: ["solid", "dashed", "dotted", "dashdot"].includes(input.dashStyle)
      ? input.dashStyle
      : defaults.dashStyle,
    fillOpacity: Number.isFinite(fillOpacity) && fillOpacity >= 0 && fillOpacity <= 1
      ? fillOpacity
      : defaults.fillOpacity
  };
}

function normalizeColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
}

function normalizeInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
