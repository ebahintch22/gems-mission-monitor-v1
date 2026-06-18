const BuildingFeature = require("../models/BuildingFeature");

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
