const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  exportKoboSiteCenterPoints,
  selectSiteCenterPoint
} = require("../services/koboSiteCenterPointsExporter");

test("exportKoboSiteCenterPoints genere la couche GeoJSON des points centre en respectant la priorite", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "g2m-site-center-points-"));
  const batchPath = path.join(tmp, "batch-test");
  const sourceDir = path.join(batchPath, "00_source");
  fs.mkdirSync(sourceDir, { recursive: true });

  const sourcePath = path.join(sourceDir, "kobo-source.json");
  const strategyPath = path.join(tmp, "strategy.json");
  fs.writeFileSync(sourcePath, JSON.stringify({
    results: [
      submission({
        id: "sub-1",
        gpsCentre: "5.3 -4.1 12 3",
        gpsManuel: "POINT(-4.2 5.4)",
        officialName: "Site centre prioritaire"
      }),
      submission({
        id: "sub-2",
        gpsManuel: "POINT(-3.9 6.1)",
        officialName: "Site manuel"
      }),
      submission({
        id: "sub-3",
        gpsCentre: "",
        gpsManuel: "",
        gpsSite: "6.2 -3.8 15 4",
        officialName: "Site gps_site"
      }),
      submission({
        id: "sub-4",
        gpsCentre: "",
        gpsManuel: "",
        gpsSite: "",
        officialName: "Site sans point"
      })
    ]
  }), "utf8");
  fs.writeFileSync(strategyPath, JSON.stringify(strategy()), "utf8");

  const result = exportKoboSiteCenterPoints({
    batch: batchPath,
    strategy: strategyPath
  });
  const output = JSON.parse(fs.readFileSync(result.outputPath, "utf8"));

  assert.equal(path.basename(path.dirname(result.outputPath)), "03_review");
  assert.equal(path.basename(result.outputPath), "site_center_points.geojson");
  assert.equal(output.type, "FeatureCollection");
  assert.equal(output.features.length, 3);
  assert.equal(output.features[0].properties.source_field, "modA/gps_centre");
  assert.equal(output.features[0].properties.geometry_priority_rank, 1);
  assert.equal(output.features[0].properties.longitude, -4.1);
  assert.equal(output.features[0].properties.latitude, 5.3);
  assert.equal(output.features[0].properties["modB/nom_officiel"], "Site centre prioritaire");
  assert.equal(output.features[0].properties["modB/commune"], "Commune test");
  assert.equal(output.features[0].properties["modB/ministere"], "Ministere test");
  assert.equal(output.features[0].properties["modB/type_infra"], "ecole");
  assert.equal(output.features[0].properties["modB/sous_type"], "primaire");
  assert.equal(output.features[0].properties["modC/nb_batiments"], 3);
  assert.equal(output.features[1].properties.source_field, "modA/gps_manuel");
  assert.equal(output.features[1].properties.geometry_priority_rank, 2);
  assert.equal(output.features[1].properties.requires_review, true);
  assert.equal(output.features[2].properties.source_field, "modA/gps_site");
  assert.equal(output.features[2].properties.geometry_priority_rank, 3);
  assert.equal(output.features[2].properties.longitude, -3.8);
  assert.equal(output.features[2].properties.latitude, 6.2);
});

test("exportKoboSiteCenterPoints exige un batch explicite", () => {
  assert.throws(
    () => exportKoboSiteCenterPoints({}),
    /--batch est requis/
  );
});

test("selectSiteCenterPoint ignore les points hors emprise attendue", () => {
  const selected = selectSiteCenterPoint(submission({
    id: "sub-outside",
    gpsCentre: "48.8566 2.3522",
    gpsManuel: ""
  }), strategy());

  assert.equal(selected, null);
});

function submission({ id, gpsCentre = "", gpsManuel = "", gpsSite = "", officialName = "Site test" }) {
  return {
    _uuid: id,
    _id: id,
    "__version__": "default",
    "modA/gps_centre": gpsCentre,
    "modA/gps_manuel": gpsManuel,
    "modA/gps_site": gpsSite,
    "modB/nom_officiel": officialName,
    "modB/commune": "Commune test",
    "modB/ministere": "Ministere test",
    "modB/type_infra": "ecole",
    "modB/sous_type": "primaire",
    "modC/nb_batiments": 3
  };
}

function strategy() {
  return {
    version_field: "__version__",
    fallback_strategy_id: "default",
    strategies: {
      default: {
        site_geometry: {
          output_property: "site_geometry",
          source_priority: [
            {
              field: "modA/gps_centre",
              parser: "parse_kobo_geopoint_string",
              geometry_type: "Point",
              priority: 3
            },
            {
              field: "modA/gps_manuel",
              parser: "parse_wkt_or_manual_coordinates",
              geometry_type: "PointOrPolygon",
              priority: 5,
              requires_review: true
            },
            {
              field: "modA/gps_site",
              parser: "parse_kobo_geopoint_string",
              geometry_type: "Point",
              priority: 6
            }
          ]
        }
      }
    }
  };
}
