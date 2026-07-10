const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { exportKoboNetworkPoints } = require("../services/koboNetworkPointsExporter");

test("exportKoboNetworkPoints genere les points raccordement et pylones avec operateur", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "g2m-network-points-"));
  const batchPath = path.join(tmp, "batch-test");
  const outputDir = path.join(batchPath, "02_output");
  const sourceDir = path.join(batchPath, "00_source");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(sourceDir, { recursive: true });

  fs.writeFileSync(path.join(sourceDir, "kobo-source.json"), JSON.stringify({
    results: [{
      _uuid: "submission-1",
      _id: 101,
      "modE/operateurs": "Orange, Mtn"
    }]
  }), "utf8");
  fs.writeFileSync(path.join(outputDir, "kobo-geometries-normalized.json"), JSON.stringify({
    results: [{
      source_submission_id: "submission-1",
      kobo_id: 101,
      site_description: {
        official_name: "Site test",
        locality: "Cocody",
        submitted_at: "2026-07-04T09:23:40"
      },
      raccordement_geometry: pointEntry("modH/gps_raccord", [-4.1, 5.2], null, "mtn", "modH/prop_fibre"),
      pylone_geometries: [
        pointEntry("modE/pylone_rep/gps_pylone", [-4.11, 5.21], 0, "orange", "modE/pylone_rep/pylone_op"),
        pointEntry("modE/pylone_rep/gps_pylone", [-4.12, 5.22], 1, "moov", "modE/pylone_rep/pylone_op")
      ]
    }]
  }), "utf8");

  const result = exportKoboNetworkPoints({ batch: batchPath });
  const output = JSON.parse(fs.readFileSync(result.outputPath, "utf8"));

  assert.equal(result.extractedCount, 3);
  assert.deepEqual(result.countsByNature, {
    chambre_raccordement: 1,
    pylone: 2
  });
  assert.equal(output.features[0].properties.nature_point, "chambre_raccordement");
  assert.equal(output.features[0].properties.operateur, "mtn");
  assert.equal(output.features[0].properties.operator_source_field, "modH/prop_fibre");
  assert.equal(output.features[1].properties.nature_point, "pylone");
  assert.equal(output.features[1].properties.operateur, "orange");
  assert.equal(output.features[2].properties.operateur, "moov");
  assert.equal(output.features[1].properties.nom_officiel, "Site test");
  assert.deepEqual(output.features.map((feature) => feature.geometry.type), ["Point", "Point", "Point"]);
});

function pointEntry(sourceField, coordinates, repeatIndex = null, operatorName = null, operatorSourceField = null) {
  return {
    source_field: sourceField,
    parser: "parse_kobo_geopoint_string",
    repeat_path: repeatIndex === null ? null : "modE/pylone_rep",
    repeat_index: repeatIndex,
    raw_value: "5.2 -4.1 0 1",
    requires_review: false,
    properties: {
      operator_name: operatorName,
      operator_source_field: operatorSourceField
    },
    geometry: {
      type: "Point",
      coordinates
    }
  };
}
