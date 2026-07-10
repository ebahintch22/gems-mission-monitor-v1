const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  extractKoboGeometries,
  extractKoboGeometryBatch,
  parseKoboGeopointString,
  parseSemicolonCoordinateSequencePolygon,
  parseWktOrManualCoordinates
} = require("../services/koboGeometryExtractor");
const {
  buildKoboGeometryReviewSummary,
  loadKoboGeometryReviewData
} = require("../services/koboGeometryReviewService");

const strategyPath = path.join(
  __dirname,
  "..",
  "KBase-docs",
  "kobo-data-analysis",
  "extraction_scripts",
  "kobo_geometry_parser_strategy_by_version.json"
);
const samplePath = path.join(
  __dirname,
  "..",
  "KBase-docs",
  "kobo-data-sample",
  "kobo-response-2026-06-27T09-05-45_50.json"
);

const strategy = JSON.parse(fs.readFileSync(strategyPath, "utf8"));

test("parseKoboGeopointString retourne un point GeoJSON longitude latitude", () => {
  const parsed = parseKoboGeopointString("5.3502118 -4.0066352 67.1 4.983");

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.geometry, {
    type: "Point",
    coordinates: [-4.0066352, 5.3502118]
  });
  assert.deepEqual(parsed.properties, {
    altitude: 67.1,
    precision_m: 4.983
  });
});

test("parseKoboGeopointString corrige les coordonnees latitude longitude inversees", () => {
  const parsed = parseKoboGeopointString("-4.0066352 5.3502118 67.1 4.983");

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.geometry.coordinates, [-4.0066352, 5.3502118]);
  assert.equal(
    parsed.warnings.some((warning) => warning.code === "coordinate_lat_lon_inversion_corrected"),
    true
  );
});

test("parseSemicolonCoordinateSequencePolygon ferme les anneaux Kobo", () => {
  const parsed = parseSemicolonCoordinateSequencePolygon(
    "5.1 -4.1 0 1;5.1 -4.2 0 1;5.2 -4.2 0 1"
  );
  const ring = parsed.geometry.coordinates[0];

  assert.equal(parsed.ok, true);
  assert.deepEqual(ring[0], [-4.1, 5.1]);
  assert.deepEqual(ring.at(-1), ring[0]);
});

test("parseSemicolonCoordinateSequencePolygon corrige les sommets inverses", () => {
  const parsed = parseSemicolonCoordinateSequencePolygon(
    "-4.1 5.1 0 1;-4.2 5.1 0 1;-4.2 5.2 0 1"
  );
  const ring = parsed.geometry.coordinates[0];

  assert.equal(parsed.ok, true);
  assert.deepEqual(ring[0], [-4.1, 5.1]);
  assert.equal(
    parsed.warnings.some((warning) => warning.code === "coordinate_lat_lon_inversion_corrected"),
    true
  );
});

test("parseWktOrManualCoordinates lit le WKT et les longitudes ouest sans signe", () => {
  const wkt = parseWktOrManualCoordinates("POINT (-3.73577 5.20802)");
  const manual = parseWktOrManualCoordinates("05.36159 003.88238");

  assert.deepEqual(wkt.geometry.coordinates, [-3.73577, 5.20802]);
  assert.deepEqual(manual.geometry.coordinates, [-3.88238, 5.36159]);
  assert.equal(
    manual.warnings.some((warning) => warning.code === "longitude_west_sign_inferred"),
    true
  );
});

test("parseWktOrManualCoordinates corrige un point WKT inverse", () => {
  const parsed = parseWktOrManualCoordinates("POINT (5.20802 -3.73577)");

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.geometry.coordinates, [-3.73577, 5.20802]);
  assert.equal(
    parsed.warnings.some((warning) => warning.code === "coordinate_lat_lon_inversion_corrected"),
    true
  );
});

test("extractKoboGeometries parcourt le repeat batiment sans lire coins_bat a la racine", () => {
  const submission = {
    _id: 1,
    __version__: "vCdxj9y4NiufyZHpxVJ33f",
    _submission_time: "2026-06-05T17:46:58",
    "modB/nom_officiel": "Site test",
    "modB/region": "CI01",
    "modB/commune": "Cocody",
    "modB/emprise_site": "5.1 -4.1 0 1;5.1 -4.2 0 1;5.2 -4.2 0 1;5.1 -4.1 0 1",
    "batiment/coins_bat": "5.9 -4.9 0 1;5.9 -4.8 0 1;5.8 -4.8 0 1;5.9 -4.9 0 1",
    batiment: [
      {
        "batiment/num_bat": "B-01",
        "batiment/bat_nom": "Bloc administratif",
        "batiment/bat_statut": "fonctionnel",
        "batiment/bat_vocation": "Administration",
        "batiment/bat_services": "Direction, Secretariat",
        "batiment/lan": "oui",
        "batiment/faisab_cablage": "faisable",
        "batiment/goulottes": "presentes",
        "batiment/nb_wifi_prevu": 4,
        "batiment/baie": "existante",
        "batiment/equip_actifs": "switch",
        "batiment/equip_detail": "Switch 24 ports",
        "batiment/coins_bat": "5.3 -4.3 0 1;5.3 -4.4 0 1;5.4 -4.4 0 1;5.3 -4.3 0 1"
      }
    ]
  };

  const extracted = extractKoboGeometries(submission, strategy);

  assert.deepEqual(extracted.site_description, {
    official_name: "Site test",
    region: "CI01",
    locality: "Cocody",
    submitted_at: "2026-06-05T17:46:58"
  });
  assert.equal(extracted.building_geometries.length, 1);
  assert.equal(extracted.building_geometries[0].repeat_path, "batiment");
  assert.equal(extracted.building_geometries[0].properties.building_number, "B-01");
  assert.equal(extracted.building_geometries[0].properties.building_name, "Bloc administratif");
  assert.equal(extracted.building_geometries[0].properties.building_status, "fonctionnel");
  assert.equal(extracted.building_geometries[0].properties.building_vocation, "Administration");
  assert.equal(extracted.building_geometries[0].properties.building_services, "Direction, Secretariat");
  assert.equal(extracted.building_geometries[0].properties.building_lan, "oui");
  assert.equal(extracted.building_geometries[0].properties.building_cabling_feasibility, "faisable");
  assert.equal(extracted.building_geometries[0].properties.building_cable_trunking, "presentes");
  assert.equal(extracted.building_geometries[0].properties.building_planned_wifi_count, 4);
  assert.equal(extracted.building_geometries[0].properties.building_rack, "existante");
  assert.equal(extracted.building_geometries[0].properties.building_active_equipment, "switch");
  assert.equal(extracted.building_geometries[0].properties.building_equipment_detail, "Switch 24 ports");
  assert.deepEqual(
    extracted.building_geometries[0].geometry.coordinates[0][0],
    [-4.3, 5.3]
  );
  assert.equal(extracted.building_geometries[0].properties.centroid_point.type, "Point");
  assert.equal(
    Math.abs(extracted.building_geometries[0].properties.centroid_point.coordinates[0] - -4.3666666667) < 0.000001,
    true
  );
  assert.equal(
    Math.abs(extracted.building_geometries[0].properties.centroid_point.coordinates[1] - 5.3333333333) < 0.000001,
    true
  );
});

test("extractKoboGeometries applique la priorite manuelle de la version recente", () => {
  const submission = {
    _id: 2,
    __version__: "vD3CxGyFeWTzSdQ3ARwkrS",
    batiment: [
      {
        "batiment/coins_bat": "5.3 -4.3 0 1;5.3 -4.4 0 1;5.4 -4.4 0 1;5.3 -4.3 0 1",
        "batiment/coins_bat_manuel": "5.5 -4.5 0 1;5.5 -4.6 0 1;5.6 -4.6 0 1;5.5 -4.5 0 1"
      }
    ]
  };

  const extracted = extractKoboGeometries(submission, strategy);

  assert.equal(extracted.building_geometries[0].source_field, "batiment/coins_bat_manuel");
  assert.equal(extracted.building_geometries[0].requires_review, true);
  assert.deepEqual(
    extracted.building_geometries[0].geometry.coordinates[0][0],
    [-4.5, 5.5]
  );
  assert.equal(extracted.building_geometries[0].properties.centroid_point.type, "Point");
});

test("extractKoboGeometries utilise un point manuel comme centroid_point de batiment", () => {
  const submission = {
    _id: 3,
    __version__: "vD3CxGyFeWTzSdQ3ARwkrS",
    batiment: [
      {
        "batiment/coins_bat_manuel": "POINT (-3.73577 5.20802)"
      }
    ]
  };

  const extracted = extractKoboGeometries(submission, strategy);

  assert.equal(extracted.building_geometries[0].geometry.type, "Point");
  assert.deepEqual(extracted.building_geometries[0].properties.centroid_point, {
    type: "Point",
    coordinates: [-3.73577, 5.20802]
  });
});

test("extractKoboGeometries renseigne le barycentre si les points batiment ne forment pas un polygone valide", () => {
  const submission = {
    _id: 4,
    __version__: "vCdxj9y4NiufyZHpxVJ33f",
    batiment: [
      {
        "batiment/coins_bat": "5.1 -4.1 0 1;5.3 -4.5 0 1"
      }
    ]
  };

  const extracted = extractKoboGeometries(submission, strategy);

  assert.equal(extracted.building_geometries.length, 1);
  assert.equal(extracted.building_geometries[0].geometry, undefined);
  assert.equal(extracted.building_geometries[0].requires_review, true);
  assert.deepEqual(extracted.building_geometries[0].properties.centroid_point, {
    type: "Point",
    coordinates: [-4.3, 5.199999999999999]
  });
});

test("extractKoboGeometries associe les operateurs aux raccordements et pylones", () => {
  const submission = {
    _id: 5,
    _uuid: "submission-5",
    __version__: "default",
    "modH/gps_raccord": "5.2 -4.1 0 1",
    "modH/prop_fibre": "mtn",
    "modE/pylone_rep": [
      {
        "modE/pylone_rep/gps_pylone": "5.21 -4.11 0 1",
        "modE/pylone_rep/pylone_op": "orange"
      }
    ]
  };

  const extracted = extractKoboGeometries(submission, strategy);

  assert.equal(extracted.raccordement_geometry.properties.operator_name, "mtn");
  assert.equal(extracted.raccordement_geometry.properties.operator_source_field, "modH/prop_fibre");
  assert.equal(extracted.pylone_geometries[0].properties.operator_name, "orange");
  assert.equal(extracted.pylone_geometries[0].properties.operator_source_field, "modE/pylone_rep/pylone_op");
});

test("extractKoboGeometryBatch lit l'enveloppe response.results de l'echantillon", () => {
  const sample = JSON.parse(fs.readFileSync(samplePath, "utf8"));
  const extracted = extractKoboGeometryBatch(sample, strategy);

  assert.equal(extracted.schema_version, "1.2.0");
  assert.equal(extracted.source_count, 50);
  assert.equal(extracted.results.length, 50);
  assert.equal(extracted.results[0].site_geometry.geometry.type, "Polygon");
  assert.equal(extracted.results[0].building_geometries.length > 0, true);
  assert.equal(extracted.results[0].raccordement_geometry.geometry.type, "Point");
  assert.equal(extracted.results[0].pylone_geometries.length > 0, true);
});

test("buildKoboGeometryReviewSummary expose le nom officiel et la localite", () => {
  const summary = buildKoboGeometryReviewSummary({
    results: [{
      kobo_id: 123,
      source_submission_id: "submission-123",
      site_description: {
        official_name: "Centre de sante test",
        locality: "Cocody"
      },
      geometry_quality_report: {
        status: "ok",
        warnings: [],
        errors: []
      },
      building_geometries: []
    }]
  });

  assert.equal(summary.records[0].official_name, "Centre de sante test");
  assert.equal(summary.records[0].locality, "Cocody");
});

test("loadKoboGeometryReviewData prefere la sortie normalisee canonique aux variantes", () => {
  const reviewData = loadKoboGeometryReviewData({
    batch: "2026-07-02_sample-72"
  });

  assert.match(reviewData.selectedOutput, /geometries-normalized\.json$/);
  assert.doesNotMatch(reviewData.selectedOutput, /-h1\.json$/);
  assert.equal(
    buildKoboGeometryReviewSummary(reviewData.payload).records.some((record) => record.official_name),
    true
  );
});

test("extract-kobo-geometries.mjs accepte --batch et deduit source et sortie", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "g2m-extract-kobo-batch-"));
  const batchPath = path.join(tmp, "batch-test");
  const sourceDir = path.join(batchPath, "00_source");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "kobo-source.json"), JSON.stringify({
    results: [{
      _id: 1,
      _uuid: "submission-1",
      "__version__": "default",
      "modA/gps_centre": "5.3 -4.1 12 3"
    }]
  }), "utf8");

  const stdout = execFileSync(process.execPath, [
    path.join(__dirname, "..", "scripts", "extract-kobo-geometries.mjs"),
    "--batch",
    batchPath
  ], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8"
  });
  const cliResult = JSON.parse(stdout);
  const outputPath = path.join(batchPath, "02_output", "kobo-source-geometries-normalized.json");
  const output = JSON.parse(fs.readFileSync(outputPath, "utf8"));

  assert.equal(cliResult.ok, true);
  assert.equal(cliResult.source_count, 1);
  assert.equal(cliResult.extracted_count, 1);
  assert.equal(cliResult.output.endsWith("02_output\\kobo-source-geometries-normalized.json")
    || cliResult.output.endsWith("02_output/kobo-source-geometries-normalized.json"), true);
  assert.equal(output.results[0].site_geometry.source_field, "modA/gps_centre");
  assert.deepEqual(output.results[0].site_geometry.geometry, {
    type: "Point",
    coordinates: [-4.1, 5.3]
  });
});
