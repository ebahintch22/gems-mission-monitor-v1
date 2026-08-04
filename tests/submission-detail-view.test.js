const test = require("node:test");
const assert = require("node:assert/strict");
const rawFixture = require("./fixtures/padci-submission-complete.json");
const { buildInteractiveSubmissionView, formatFieldValue, readValue } = require("../services/submission-detail-view.service");
const { buildMediaGallery } = require("../services/kobo-media.service");
const { parseKoboGps, parseWktPoint, parseWktPolygon, detectLongitudeSignIssue } = require("../services/geometry.service");
const { buildSubmissionQualityAlerts } = require("../services/submission-quality.service");

test("lit une cle avec slash et gere une valeur absente", () => {
  assert.equal(readValue(rawFixture, "modB/nom_officiel"), "Site PADCI anonymise");
  assert.equal(readValue(rawFixture, "modB.nom_officiel"), "Site PADCI anonymise");
  assert.equal(formatFieldValue(undefined), "Non renseigne");
});

test("formate une multi-selection en libelles lisibles", () => {
  assert.equal(
    formatFieldValue("administration pedagogie", { type: "multiChoice" }, {}),
    "Administration, Pedagogie"
  );
});

test("transforme les groupes repetitifs et repetitifs imbriques", () => {
  const view = buildInteractiveSubmissionView({ id: 1, raw_data_json: JSON.stringify(rawFixture), statut_validation: "validee" });
  const buildings = view.sections.find((section) => section.id === "buildings");
  const internet = view.sections.find((section) => section.id === "internet");
  assert.equal(buildings.items.length, 2);
  assert.equal(internet.fields.some((field) => field.label === "Statut internet"), true);
});

test("integre les emprises spatiales de reference dans la carte et la superficie", () => {
  const raw = { ...rawFixture, "modB/superficie": 0 };
  const spatialReferenceProvider = {
    collectionsForSite() {
      return {
        identifiers: { site_code: "g2m-test", kobo_id: "kobo-test" },
        counts: { site_contours: 0, building_extents: 1, network_points: 0 },
        site_contours: { type: "FeatureCollection", features: [] },
        building_extents: {
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            properties: { bat_num: 1, superficie: 125.5 },
            geometry: {
              type: "MultiPolygon",
              coordinates: [[[
                [-6.4098, 10.4966],
                [-6.4095, 10.4966],
                [-6.4095, 10.4963],
                [-6.4098, 10.4963],
                [-6.4098, 10.4966]
              ]]]
            }
          }]
        },
        network_points: { type: "FeatureCollection", features: [] }
      };
    }
  };
  const view = buildInteractiveSubmissionView(
    { id: 1, raw_data_json: JSON.stringify(raw), statut_validation: "validee" },
    { spatialReferenceProvider }
  );
  const areaKpi = view.kpis.find((field) => field.label === "Superficie");
  assert.equal(areaKpi.rawValue, 125.5);
  assert.equal(view.map.features.some((feature) => feature.properties.kind === "building" && feature.geometry.type === "MultiPolygon"), true);
});

test("rapproche une photo avec _attachments", () => {
  const gallery = buildMediaGallery(rawFixture, {
    categories: [{ id: "entry", title: "Entree", fields: ["modB/photo_entree"] }]
  });
  assert.equal(gallery.categories[0].items.length, 1);
  assert.equal(gallery.categories[0].items[0].largeUrl, "https://example.test/media/entree-large.jpg");
});

test("parse GPS Kobo, WKT POINT et WKT POLYGON", () => {
  assert.deepEqual(parseKoboGps("10.4960562 -6.4097407 386.4 4.48").geojson.coordinates, [-6.4097407, 10.4960562]);
  assert.deepEqual(parseWktPoint("POINT (-6.408425 10.496102)").geojson.coordinates, [-6.408425, 10.496102]);
  assert.equal(parseWktPolygon("POLYGON (-6.409877 10.496655; -6.409486 10.495051; -6.408112 10.495502)").ok, true);
});

test("detecte une longitude incoherente et une valeur sentinelle", () => {
  assert.equal(detectLongitudeSignIssue([{ lon: -6, lat: 10 }, { lon: -6.1, lat: 10.1 }, { lon: 6.2, lat: 10.2 }]), true);
  const view = buildInteractiveSubmissionView({ id: 1, raw_data_json: JSON.stringify(rawFixture), statut_validation: "validee" });
  const alerts = buildSubmissionQualityAlerts({ rawData: rawFixture, sections: view.sections, mediaGallery: view.mediaGallery });
  assert.equal(alerts.some((alert) => alert.code === "SENTINEL_VALUE"), true);
});

test("n'alerte pas ZERO_BUILDING_AREA si les surfaces batiments viennent de Kobo ou du referentiel spatial", () => {
  const rawWithKoboArea = { ...rawFixture, batiment: [{ num_bat: 1, superficie_dim: 85 }] };
  const koboAlerts = buildSubmissionQualityAlerts({ rawData: rawWithKoboArea });
  assert.equal(koboAlerts.some((alert) => alert.code === "ZERO_BUILDING_AREA"), false);

  const rawWithoutArea = { ...rawFixture, batiment: [{ num_bat: 1 }] };
  const spatialAlerts = buildSubmissionQualityAlerts({
    rawData: rawWithoutArea,
    spatialReference: {
      building_extents: {
        features: [{ properties: { superficie: 125.5 } }]
      }
    }
  });
  assert.equal(spatialAlerts.some((alert) => alert.code === "ZERO_BUILDING_AREA"), false);
});

test("le theme est restaure depuis localStorage dans le script client", () => {
  const fs = require("node:fs");
  const script = fs.readFileSync(require("node:path").join(__dirname, "..", "public", "js", "theme-switcher.js"), "utf8");
  assert.match(script, /localStorage\.getItem\(key\)/);
  assert.match(script, /data-g2m-theme/);
  assert.match(script, /blue/);
});
