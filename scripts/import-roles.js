require("dotenv").config();

const path = require("node:path");
const db = require("../config/database");
const { importRolesFromFile } = require("../services/roleImportService");

const defaultCsvPath = path.join(
  "C:\\",
  "OPEN-NODE-APPS",
  "sig-padci-monitor",
  "data",
  "role_definitions.csv"
);
const csvPath = process.argv[2] || process.env.ROLE_DEFINITIONS_PATH || defaultCsvPath;

try {
  const summary = importRolesFromFile(db, csvPath);
  console.log(`Source : ${csvPath}`);
  console.log(`Roles importes : ${summary.roles}`);
} catch (error) {
  console.error(`Echec de l'import des roles : ${error.message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
