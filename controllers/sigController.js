const SoumissionCollecte = require("../models/SoumissionCollecte");
const siteCategoryIcons = require("../config/map/site-category-icons.json");

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
