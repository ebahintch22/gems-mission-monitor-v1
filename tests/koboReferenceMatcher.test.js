const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  processMatching,
  processMatchingOutputs,
  runReferenceMatching,
  runSiteReferenceMatchingV2
} = require("../services/koboReferenceMatcher");

test("runReferenceMatching classe les appariements batiments A B C et D", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "g2m-reference-matching-"));
  const batchPath = path.join(tmp, "batch-test");
  const sourceDir = path.join(batchPath, "05_reference_layers", "source");
  const outputDir = path.join(batchPath, "02_output");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const extractionPath = path.join(outputDir, "geometries-normalized.json");
  fs.writeFileSync(path.join(sourceDir, "contours_sites.geojson"), JSON.stringify(featureCollection([
    polygonFeature("site-1", { site_id: 1, site_code: "g2m-0001", site_name: "Site test" }, [
      [-4.001, 5.001],
      [-3.999, 5.001],
      [-3.999, 4.999],
      [-4.001, 4.999],
      [-4.001, 5.001]
    ])
  ])), "utf8");
  fs.writeFileSync(path.join(sourceDir, "emprises_batiments.geojson"), JSON.stringify(featureCollection([
    polygonFeature("ref-a", { id: "ref-a", site_id: 1, site_code: "g2m-0001" }, [
      [-4.0009, 5.0009],
      [-4.0004, 5.0009],
      [-4.0004, 5.0004],
      [-4.0009, 5.0004],
      [-4.0009, 5.0009]
    ]),
    polygonFeature("ref-b", { id: "ref-b", site_id: 1, site_code: "g2m-0001" }, [
      [-4.0002, 5.0009],
      [-3.9997, 5.0009],
      [-3.9997, 5.0004],
      [-4.0002, 5.0004],
      [-4.0002, 5.0009]
    ]),
    polygonFeature("ref-d", { id: "ref-d", site_id: 1, site_code: "g2m-0001" }, [
      [-4.0009, 5.0002],
      [-4.0004, 5.0002],
      [-4.0004, 4.9997],
      [-4.0009, 4.9997],
      [-4.0009, 5.0002]
    ])
  ])), "utf8");
  fs.writeFileSync(extractionPath, JSON.stringify({
    schema_name: "g2m_kobo_geometry_extraction_output",
    schema_version: "1.2.0",
    results: [{
      source_submission_id: "sub-1",
      kobo_id: 1,
      site_description: {
        official_name: "Site test",
        locality: "Test"
      },
      site_geometry: {
        source_field: "modB/emprise_site",
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-4.001, 5.001],
            [-3.999, 5.001],
            [-3.999, 4.999],
            [-4.001, 4.999],
            [-4.001, 5.001]
          ]]
        }
      },
      building_geometries: [
        building(0, "A1", [-4.00065, 5.00065]),
        building(1, "B1", [-3.99995, 5.00065]),
        building(2, "B2", [-3.9999, 5.0007]),
        building(3, "C1", [-3.9992, 5.0002]),
        building(4, "OUT", [2.3522, 48.8566])
      ],
      geometry_quality_report: {
        warnings: [],
        errors: []
      }
    }]
  }), "utf8");

  const result = runReferenceMatching({
    batch: batchPath,
    extraction: extractionPath
  });
  const siteMatching = JSON.parse(fs.readFileSync(result.outputs.siteMatchingPath, "utf8"));
  const buildingMatching = JSON.parse(fs.readFileSync(result.outputs.buildingMatchingPath, "utf8"));
  const review = JSON.parse(fs.readFileSync(result.outputs.reviewPath, "utf8"));
  const classes = buildingMatching.matches.map((match) => match.classification).sort();
  const outOfCountryPoint = review.features.find((feature) => (
    feature.geometry?.type === "Point"
      && feature.geometry.coordinates[0] === 2.3522
      && feature.geometry.coordinates[1] === 48.8566
  ));

  assert.equal(siteMatching.matches[0].status, "matched");
  assert.deepEqual(classes, ["A", "B", "B", "C", "D", "F"]);
  assert.equal(outOfCountryPoint, undefined);
  assert.equal(fs.existsSync(result.outputs.reportPath), true);
  assert.equal(fs.existsSync(result.outputs.reviewPath), true);
});

test("processMatching enrichit les emprises avec les statuts direct conflit proximity et none", () => {
  const koboPoints = featureCollection([
    pointFeature("p1", { source_submission_id: "sub-1", label: "direct" }, [-4.00065, 5.00065]),
    pointFeature("p2", { source_submission_id: "sub-1", label: "conflit-a" }, [-3.99995, 5.00065]),
    pointFeature("p3", { source_submission_id: "sub-1", label: "conflit-b" }, [-3.9999, 5.0007]),
    pointFeature("p4", { source_submission_id: "sub-1", label: "near" }, [-4.00064, 4.99955])
  ]);
  const sites = featureCollection([
    polygonFeature("site-1", { site_code: "g2m-0001" }, [
      [-4.002, 5.002],
      [-3.998, 5.002],
      [-3.998, 4.998],
      [-4.002, 4.998],
      [-4.002, 5.002]
    ])
  ]);
  const buildings = featureCollection([
    polygonFeature("b-direct", { id: "b-direct" }, [
      [-4.0009, 5.0009],
      [-4.0004, 5.0009],
      [-4.0004, 5.0004],
      [-4.0009, 5.0004],
      [-4.0009, 5.0009]
    ]),
    polygonFeature("b-conflit", { id: "b-conflit" }, [
      [-4.0002, 5.0009],
      [-3.9997, 5.0009],
      [-3.9997, 5.0004],
      [-4.0002, 5.0004],
      [-4.0002, 5.0009]
    ]),
    polygonFeature("b-proximity", { id: "b-proximity" }, [
      [-4.00095, 4.99995],
      [-4.00075, 4.99995],
      [-4.00075, 4.99975],
      [-4.00095, 4.99975],
      [-4.00095, 4.99995]
    ]),
    polygonFeature("b-none", { id: "b-none" }, [
      [-3.9987, 4.9994],
      [-3.9985, 4.9994],
      [-3.9985, 4.9992],
      [-3.9987, 4.9992],
      [-3.9987, 4.9994]
    ])
  ]);

  const normalized = processMatching(koboPoints, sites, buildings, {
    toleranceMeters: 80,
    logger: { warn() {} }
  });
  const statuses = normalized.features.map((feature) => feature.properties.link_status);

  assert.deepEqual(statuses, ["direct", "conflit", "proximity", "none"]);
  assert.equal(normalized.features[0].properties.score_fiabilite, 3);
  assert.equal(normalized.features[1].properties.nb_centroide, 2);
  assert.equal(normalized.features[2].properties.distance_to_centroid > 0, true);
  assert.equal(normalized.features[3].properties.kobo_attributes, null);
  assert.deepEqual(normalized.features[0].geometry.coordinates[0][0], [-4.0009, 5.0009]);
});

test("processMatchingOutputs conserve la couche centroid_batiment avec attributs a plat", () => {
  const koboPoints = featureCollection([
    pointFeature("p1", {
      source_submission_id: "sub-1",
      "batiment/num_bat": "B-01",
      nested: { value: "ok" }
    }, [-4.00065, 5.00065])
  ]);
  const sites = featureCollection([
    polygonFeature("site-1", { site_code: "g2m-0001" }, [
      [-4.002, 5.002],
      [-3.998, 5.002],
      [-3.998, 4.998],
      [-4.002, 4.998],
      [-4.002, 5.002]
    ])
  ]);
  const buildings = featureCollection([
    polygonFeature("b-direct", { id: "b-direct" }, [
      [-4.0009, 5.0009],
      [-4.0004, 5.0009],
      [-4.0004, 5.0004],
      [-4.0009, 5.0004],
      [-4.0009, 5.0009]
    ])
  ]);

  const outputs = processMatchingOutputs(koboPoints, sites, buildings, {
    logger: { warn() {} }
  });
  const centroid = outputs.centroidBatiment.features[0];

  assert.equal(outputs.centroidBatiment.name, "centroid_batiment");
  assert.equal(centroid.properties.batiment_num_bat, "B-01");
  assert.equal(centroid.properties.nested_value, "ok");
  assert.equal(centroid.properties.link_status, "direct");
  assert.equal(centroid.properties.score_fiabilite, 3);
  assert.deepEqual(centroid.geometry.coordinates, [-4.00065, 5.00065]);
});

test("match-kobo-reference-layers --kobo-points genere un centroid_batiment par batiment Kobo", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "g2m-reference-matching-cli-"));
  const batchPath = path.join(tmp, "batch-test");
  const sourceDir = path.join(batchPath, "05_reference_layers", "sources");
  const outputDir = path.join(batchPath, "02_output");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "contours_sites.geojson"), JSON.stringify(featureCollection([
    polygonFeature("site-1", { site_code: "g2m-0001" }, [
      [-4.002, 5.002],
      [-3.998, 5.002],
      [-3.998, 4.998],
      [-4.002, 4.998],
      [-4.002, 5.002]
    ])
  ])), "utf8");
  fs.writeFileSync(path.join(sourceDir, "emprises_batiments.geojson"), JSON.stringify(featureCollection([
    polygonFeature("ref-a", { id: "ref-a" }, [
      [-4.0009, 5.0009],
      [-4.0004, 5.0009],
      [-4.0004, 5.0004],
      [-4.0009, 5.0004],
      [-4.0009, 5.0009]
    ]),
    polygonFeature("ref-b", { id: "ref-b" }, [
      [-4.0002, 5.0009],
      [-3.9997, 5.0009],
      [-3.9997, 5.0004],
      [-4.0002, 5.0004],
      [-4.0002, 5.0009]
    ])
  ])), "utf8");
  fs.writeFileSync(path.join(outputDir, "kobo-geometries-normalized.json"), JSON.stringify({
    results: [{
      source_submission_id: "site-1",
      site_description: { official_name: "Site 1" },
      building_geometries: [
        building(0, "A1", [-4.00065, 5.00065]),
        building(1, "B1", [-3.99995, 5.00065]),
        building(2, "C1", [-3.9995, 5.0002])
      ],
      geometry_quality_report: { status: "ok" }
    }]
  }), "utf8");

  const stdout = execFileSync(process.execPath, [
    path.join(__dirname, "..", "scripts", "match-kobo-reference-layers.mjs"),
    "--batch",
    batchPath,
    "--kobo-points"
  ], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8"
  });
  const cliResult = JSON.parse(stdout);
  const centroids = JSON.parse(fs.readFileSync(path.join(batchPath, "06_matching", "centroid_batiment.geojson"), "utf8"));

  assert.equal(cliResult.centroid_feature_count, 3);
  assert.equal(cliResult.koboPointsSource, "building_centroids_from_extraction");
  assert.equal(centroids.features.length, 3);
  assert.deepEqual(centroids.features.map((feature) => feature.properties.building_number), ["A1", "B1", "C1"]);
});

test("match-kobo-reference-layers-v2 apparie seulement les sites et exporte les centroides V2", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "g2m-reference-matching-v2-"));
  const batchPath = path.join(tmp, "batch-test");
  const sourceDir = path.join(batchPath, "05_reference_layers", "sources");
  const outputDir = path.join(batchPath, "02_output");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "contours_sites.geojson"), JSON.stringify(featureCollection([
    polygonFeature("site-1", { site_code: "G2M-001", site_name: "Site reference" }, [
      [-4.002, 5.002],
      [-3.998, 5.002],
      [-3.998, 4.998],
      [-4.002, 4.998],
      [-4.002, 5.002]
    ])
  ])), "utf8");
  fs.writeFileSync(path.join(outputDir, "kobo-geometries-normalized-v2.json"), JSON.stringify({
    schema_name: "g2m_kobo_geometry_extraction_output",
    schema_version: "2.0.0",
    results: [{
      source_submission_id: "uuid-1",
      kobo_id: 777,
      "modA/fiche_id": "PADCI-001",
      site_description: { official_name: "Site Kobo" },
      site_geometry: {
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-4.002, 5.002],
            [-3.998, 5.002],
            [-3.998, 4.998],
            [-4.002, 4.998],
            [-4.002, 5.002]
          ]]
        }
      },
      building_geometries: [
        {
          source_field: "batiment/coins_bat_manuel",
          repeat_index: 0,
          properties: {
            building_number: "1",
            "batiment/num_bat": "1",
            "batiment/bat_nom": "Administration",
            "batiment/lan": "non",
            centroid_point: {
              type: "Point",
              coordinates: [-4.00065, 5.00065]
            }
          }
        }
      ],
      geometry_quality_report: { status: "ok" }
    }]
  }), "utf8");

  const result = runSiteReferenceMatchingV2({ batch: batchPath });
  const centroids = JSON.parse(fs.readFileSync(result.outputs.centroidOutputPath, "utf8"));
  const csv = fs.readFileSync(result.outputs.csvOutputPath, "utf8");
  const stdout = execFileSync(process.execPath, [
    path.join(__dirname, "..", "scripts", "match-kobo-reference-layers-v2.mjs"),
    "--batch",
    batchPath
  ], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8"
  });
  const cliResult = JSON.parse(stdout);

  assert.equal(result.summary.matched, 1);
  assert.equal(centroids.features.length, 1);
  assert.equal(centroids.features[0].properties["batiment/num_bat"], "1");
  assert.equal(centroids.features[0].properties["batiment/bat_nom"], "Administration");
  assert.equal(centroids.features[0].properties["batiment/lan"], "non");
  assert.match(csv, /reference_site_code,reference_site_name,kobo__id,kobo_modA_fiche_id,kobo_modB_nom_officiel/);
  assert.match(csv, /G2M-001,Site reference,777,PADCI-001,Site Kobo/);
  assert.equal(cliResult.summary.centroid_features, 1);
  assert.equal(fs.existsSync(path.join(sourceDir, "emprises_batiments.geojson")), false);
});

function featureCollection(features) {
  return {
    type: "FeatureCollection",
    features
  };
}

function polygonFeature(id, properties, ring) {
  return {
    type: "Feature",
    properties: {
      id,
      ...properties
    },
    geometry: {
      type: "Polygon",
      coordinates: [ring]
    }
  };
}

function pointFeature(id, properties, coordinates) {
  return {
    type: "Feature",
    id,
    properties: {
      id,
      ...properties
    },
    geometry: {
      type: "Point",
      coordinates
    }
  };
}

function building(index, number, coordinates) {
  return {
    source_field: "batiment/coins_bat",
    parser: "test",
    repeat_index: index,
    properties: {
      building_number: number,
      building_name: `Batiment ${number}`,
      centroid_point: {
        type: "Point",
        coordinates
      }
    }
  };
}
