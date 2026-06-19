const BuildingFeature = require("../models/BuildingFeature");
const { fetchOsmBuildings } = require("../services/osmBuildingImportService");

exports.index = (req, res) => {
  const features = BuildingFeature.all({
    mission_id: req.query.mission_id,
    site_code: req.query.site_code,
    status: req.query.status,
    source: req.query.source
  });

  res.json({
    type: "FeatureCollection",
    features: features.map(toGeoJsonFeature)
  });
};

exports.importGeoJson = (req, res) => {
  try {
    const missionId = Number(req.body.mission_id);
    const result = BuildingFeature.importGeoJson({
      missionId,
      geojson: req.body.geojson || req.body,
      actorUserId: req.currentUser?.id || null,
      defaults: {
        site_code: req.body.site_code,
        site_name: req.body.site_name,
        source: req.body.source,
        source_reference: req.body.source_reference,
        status: req.body.status
      }
    });

    res.status(201).json({ ok: true, result });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
};

exports.importFromOsm = async (req, res) => {
  try {
    const missionId = Number(req.body.mission_id);
    const { areaKm2, geojson } = await fetchOsmBuildings(req.body.selection);
    const result = BuildingFeature.importGeoJson({
      missionId,
      geojson,
      actorUserId: req.currentUser?.id || null,
      defaults: {
        site_code: req.body.site_code,
        site_name: req.body.site_name,
        source: "osm",
        source_reference: "Overpass API",
        status: "prepare"
      }
    });

    res.status(201).json({
      ok: true,
      areaKm2,
      result
    });
  } catch (error) {
    const statusCode = error.message === "osm_selection_area_too_large" ? 413 : 400;
    res.status(statusCode).json({
      ok: false,
      error: error.message,
      details: error.details || ""
    });
  }
};

exports.updateStatus = (req, res) => {
  try {
    const record = BuildingFeature.updateStatus(
      Number(req.params.id),
      req.body.status,
      req.currentUser?.id || null
    );

    res.json({ ok: true, feature: toGeoJsonFeature(record) });
  } catch (error) {
    const statusCode = error.message === "building_not_found" ? 404 : 400;
    res.status(statusCode).json({ ok: false, error: error.message });
  }
};

function toGeoJsonFeature(record) {
  return {
    type: "Feature",
    id: record.id,
    properties: {
      id: record.id,
      mission_id: record.mission_id,
      mission_name: record.mission_name,
      site_code: record.site_code,
      site_name: record.site_name,
      building_code: record.building_code,
      source: record.source,
      source_reference: record.source_reference,
      status: record.status,
      prepared_at: record.prepared_at,
      validated_at: record.validated_at,
      original_properties: record.properties
    },
    geometry: record.geometry
  };
}
