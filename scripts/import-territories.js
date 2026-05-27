require("dotenv").config();

const path = require("node:path");
const db = require("../config/database");
const { importTerritoriesFromFile } = require("../services/territoryImportService");

const defaultGeoJsonPath = path.join(
  "C:\\",
  "OPEN-NODE-APPS",
  "sig-padci-monitor",
  "data",
  "sspref-light-r3-filtered.geojson"
);
const geojsonPath = process.argv[2] || process.env.TERRITORY_GEOJSON_PATH || defaultGeoJsonPath;

try {
  const summary = importTerritoriesFromFile(db, geojsonPath);
  console.log(`Source : ${geojsonPath}`);
  console.log(`Regions importees : ${summary.regions}`);
  console.log(`Departements importes : ${summary.departements}`);
  console.log(`Sous-prefectures importees : ${summary.sousPrefectures}`);
} catch (error) {
  console.error(`Echec de l'import territorial : ${error.message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
