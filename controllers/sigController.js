const SoumissionCollecte = require("../models/SoumissionCollecte");

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
    filters: SoumissionCollecte.mapFilters()
  });
};
