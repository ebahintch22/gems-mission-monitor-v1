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

test("lit les champs de batiments Kobo prefixes dans les repetitions", () => {
  const raw = {
    ...rawFixture,
    batiment: [{
      "batiment/num_bat": "1",
      "batiment/bat_nom": "Administration",
      "batiment/bat_statut": "principal",
      "batiment/bat_occupants": "12",
      "batiment/surface_bat": "85",
      "batiment/bat_elec": "oui",
      "batiment/cablage": "rj45 fibre",
      "batiment/pc_fixes": "4",
      "batiment/pc_portables": "2"
    }]
  };
  const view = buildInteractiveSubmissionView({ id: 1, raw_data_json: JSON.stringify(raw), statut_validation: "validee" });
  const building = view.sections.find((section) => section.id === "buildings").items[0];
  const fields = Object.fromEntries(building.fields.map((field) => [field.label, field.value]));

  assert.equal(building.title, "No 1 - Administration");
  assert.equal(fields.Nom, "Administration");
  assert.equal(fields.Occupants, "12");
  assert.equal(fields["Surface au sol"], "85 m2");
  assert.equal(fields.Electricite, "Oui");
  assert.equal(fields["PC fixes"], "4");
});

test("complete les champs batiments manquants avec le referentiel spatial", () => {
  const raw = {
    ...rawFixture,
    batiment: [{
      "batiment/num_bat": "7",
      "batiment/bat_nom": "Salle A"
    }]
  };
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
            properties: { bat_num: 7, superficie: 144.25 },
            geometry: { type: "MultiPolygon", coordinates: [] }
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
  const fields = Object.fromEntries(view.sections.find((section) => section.id === "buildings").items[0].fields.map((field) => [field.label, field.value]));

  assert.equal(fields["Surface au sol"], "144 m2");
  assert.equal(fields.Geometrie, "MultiPolygon");
});

test("lit les besoins depuis le module Kobo modK et la synthese modN", () => {
  const raw = {
    ...rawFixture,
    "modK/appli_metier": "gestion_scolaire autres",
    "modK/appli_metier_autres": "Application locale",
    "modK/profil_usage": "emails elearning",
    "modK/services_pub": "inscription paiement",
    "modK/besoins_exprimes": "Connexion haut debit",
    "modK/type_co_souhait": "fibre",
    "modK/freins": "cout pas_equip",
    "modN/solutions": "fibre fh",
    "modN/commentaire": "Prioriser le site"
  };
  const view = buildInteractiveSubmissionView({ id: 1, raw_data_json: JSON.stringify(raw), statut_validation: "validee" });
  const fields = Object.fromEntries(view.sections.find((section) => section.id === "needs").fields.map((field) => [field.label, field.value]));

  assert.match(fields["Applications metier"], /Gestion scolaire/);
  assert.equal(fields["Besoins exprimes"], "Connexion haut debit");
  assert.match(fields.Freins, /Co[uû]t/);
  assert.match(fields["Solutions envisageables"], /Fibre/);
  assert.equal(fields["Commentaire final"], "Prioriser le site");
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

test("utilise Wasabi en priorite quand une correspondance media existe", () => {
  const gallery = buildMediaGallery(rawFixture, {
    categories: [{ id: "entry", title: "Entree", fields: ["modB/photo_entree"] }]
  }, {
    wasabiMedia: [{
      media_file_id: "media-wasabi-entry",
      question_xpath: "modB/photo_entree",
      attachment_filename: "entree.jpg",
      media_file_basename: "entree.jpg"
    }]
  });

  assert.equal(gallery.categories[0].items[0].source, "wasabi");
  assert.equal(gallery.categories[0].items[0].thumbnailUrl, "/media/media-wasabi-entry/thumbnail");
  assert.equal(gallery.categories[0].items[0].largeUrl, "/media/media-wasabi-entry/view");
});

test("la galerie affiche une marque de stockage KB ou WS", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const partial = fs.readFileSync(path.join(__dirname, "..", "views", "submissions", "partials", "media-gallery.ejs"), "utf8");
  const stylesheet = fs.readFileSync(path.join(__dirname, "..", "public", "css", "submission-detail.css"), "utf8");

  assert.match(partial, /sourceCode = item\.source === "wasabi" \? "WS" : "KB"/);
  assert.match(partial, /submission-media-source/);
  assert.match(stylesheet, /\.submission-media-source/);
  assert.match(stylesheet, /\.submission-media-source\.is-kobo/);
  assert.match(stylesheet, /\.submission-media-source\.is-wasabi/);
});

test("l'entete de fiche utilise des actions compactes et quatre mini-cartes alignees", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const header = fs.readFileSync(path.join(__dirname, "..", "views", "submissions", "partials", "header.ejs"), "utf8");
  const stylesheet = fs.readFileSync(path.join(__dirname, "..", "public", "css", "submission-detail.css"), "utf8");
  const script = fs.readFileSync(path.join(__dirname, "..", "public", "js", "theme-switcher.js"), "utf8");

  assert.match(header, /submission-header-badge/);
  assert.match(header, /data-theme-current="blue"/);
  assert.match(header, /Thème/);
  assert.match(header, /fa-chevron-down/);
  assert.match(stylesheet, /\.submission-actions \.button[\s\S]*min-height: 32px/);
  assert.match(stylesheet, /\.submission-theme-select[\s\S]*white-space: nowrap/);
  assert.match(stylesheet, /\.submission-theme-select[\s\S]*min-width: 104px/);
  assert.match(stylesheet, /\.submission-theme-select > span,[\s\S]*\.submission-theme-select > i[\s\S]*position: absolute/);
  assert.match(stylesheet, /\.submission-theme-select > i[\s\S]*right: 12px/);
  assert.match(stylesheet, /\.submission-theme-select select[\s\S]*opacity: 0/);
  assert.match(stylesheet, /\.submission-theme-select select[\s\S]*position: absolute/);
  assert.match(stylesheet, /\.submission-hero \.submission-badge-row[\s\S]*grid-template-columns: repeat\(4, minmax\(100px, 1fr\)\)/);
  assert.match(script, /closest\("\[data-theme-current\]"\)\?\.setAttribute\("data-theme-current", nextTheme\)/);
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
