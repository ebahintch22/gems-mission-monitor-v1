const fs = require("node:fs");
const union = require("@turf/union").default;

const requiredProperties = [
  "ADM1_PCODE",
  "ADM1_FR",
  "ADM2_PCODE",
  "ADM2_FR",
  "ADM3_PCODE",
  "ADM3_FR"
];

function geometryText(feature) {
  return JSON.stringify(feature.geometry);
}

function aggregateGeometry(features) {
  if (features.length === 1) {
    return geometryText(features[0]);
  }

  const aggregated = union({
    type: "FeatureCollection",
    features: features.map((feature) => ({
      type: "Feature",
      properties: {},
      geometry: feature.geometry
    }))
  });

  if (!aggregated || !aggregated.geometry) {
    throw new Error("L'union geometrique n'a produit aucun resultat.");
  }

  return JSON.stringify(aggregated.geometry);
}

function validateGeoJson(geojson) {
  if (!geojson || geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    throw new Error("Le fichier source doit etre une FeatureCollection GeoJSON.");
  }

  geojson.features.forEach((feature, index) => {
    if (!feature.geometry) {
      throw new Error(`Geometrie absente pour la feature ${index}.`);
    }

    requiredProperties.forEach((property) => {
      if (!feature.properties || !feature.properties[property]) {
        throw new Error(`Attribut ${property} absent pour la feature ${index}.`);
      }
    });
  });
}

function collectTerritories(geojson) {
  const regions = new Map();
  const departements = new Map();
  const sousPrefectures = new Map();

  geojson.features.forEach((feature) => {
    const properties = feature.properties;
    const codeRegion = properties.ADM1_PCODE;
    const codeDepartement = properties.ADM2_PCODE;
    const codeSousPrefecture = properties.ADM3_PCODE;

    if (!regions.has(codeRegion)) {
      regions.set(codeRegion, {
        code: codeRegion,
        nom: properties.ADM1_FR,
        features: []
      });
    }
    if (!departements.has(codeDepartement)) {
      departements.set(codeDepartement, {
        code: codeDepartement,
        nom: properties.ADM2_FR,
        codeRegion,
        features: []
      });
    }

    const departement = departements.get(codeDepartement);
    if (departement.codeRegion !== codeRegion) {
      throw new Error(`Le departement ${codeDepartement} reference plusieurs regions.`);
    }
    if (sousPrefectures.has(codeSousPrefecture)) {
      throw new Error(`Code sous-prefecture duplique : ${codeSousPrefecture}.`);
    }

    regions.get(codeRegion).features.push(feature);
    departement.features.push(feature);
    sousPrefectures.set(codeSousPrefecture, {
      code: codeSousPrefecture,
      nom: properties.ADM3_FR,
      codeDepartement,
      feature
    });
  });

  return { regions, departements, sousPrefectures };
}

function importTerritories(db, geojson) {
  validateGeoJson(geojson);
  const territories = collectTerritories(geojson);

  const upsertRegion = db.prepare(`
    INSERT INTO regions (code_region, nom_region, geometry_geojson)
    VALUES (@code, @nom, @geometry)
    ON CONFLICT(code_region) DO UPDATE SET
      nom_region = excluded.nom_region,
      geometry_geojson = excluded.geometry_geojson
  `);
  const upsertDepartement = db.prepare(`
    INSERT INTO departements (code_departement, nom_departement, region_id, geometry_geojson)
    VALUES (@code, @nom, @regionId, @geometry)
    ON CONFLICT(code_departement) DO UPDATE SET
      nom_departement = excluded.nom_departement,
      region_id = excluded.region_id,
      geometry_geojson = excluded.geometry_geojson
  `);
  const upsertSousPrefecture = db.prepare(`
    INSERT INTO sous_prefectures (
      code_sous_prefecture, nom_sous_prefecture, departement_id, geometry_geojson
    ) VALUES (@code, @nom, @departementId, @geometry)
    ON CONFLICT(code_sous_prefecture) DO UPDATE SET
      nom_sous_prefecture = excluded.nom_sous_prefecture,
      departement_id = excluded.departement_id,
      geometry_geojson = excluded.geometry_geojson
  `);
  const findRegion = db.prepare("SELECT id FROM regions WHERE code_region = ?");
  const findDepartement = db.prepare("SELECT id FROM departements WHERE code_departement = ?");

  const executeImport = db.transaction(() => {
    territories.regions.forEach((region) => {
      upsertRegion.run({
        code: region.code,
        nom: region.nom,
        geometry: aggregateGeometry(region.features)
      });
    });

    territories.departements.forEach((departement) => {
      const regionId = findRegion.get(departement.codeRegion).id;
      upsertDepartement.run({
        code: departement.code,
        nom: departement.nom,
        regionId,
        geometry: aggregateGeometry(departement.features)
      });
    });

    territories.sousPrefectures.forEach((sousPrefecture) => {
      const departementId = findDepartement.get(sousPrefecture.codeDepartement).id;
      upsertSousPrefecture.run({
        code: sousPrefecture.code,
        nom: sousPrefecture.nom,
        departementId,
        geometry: geometryText(sousPrefecture.feature)
      });
    });
  });

  executeImport();

  return {
    regions: territories.regions.size,
    departements: territories.departements.size,
    sousPrefectures: territories.sousPrefectures.size
  };
}

function importTerritoriesFromFile(db, geojsonPath) {
  const geojson = JSON.parse(fs.readFileSync(geojsonPath, "utf8"));
  return importTerritories(db, geojson);
}

module.exports = {
  importTerritories,
  importTerritoriesFromFile
};
