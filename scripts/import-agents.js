require("dotenv").config();

const path = require("node:path");
const db = require("../config/database");
const { importAgentsFromFile } = require("../services/agentImportService");

const defaultCsvPath = path.join(
  "C:\\",
  "OPEN-NODE-APPS",
  "sig-padci-monitor",
  "data",
  "agent_collecte.csv"
);
const csvPath = process.argv[2] || process.env.AGENT_COLLECTE_PATH || defaultCsvPath;

try {
  const report = importAgentsFromFile(db, csvPath);
  console.log(`Source : ${csvPath}`);
  console.log(`Agents traites : ${report.total}`);
  console.log(`Agents inseres : ${report.inserted}`);
  console.log(`Agents mis a jour : ${report.updated}`);
  console.log(`Equipes rapprochees : ${report.equipeMatched}/${report.total}`);
  console.log(`Utilisateurs rapproches : ${report.userMatched}/${report.total}`);
  if (report.equipeUnmatched.length) {
    console.log(`Equipes non rapprochees : ${JSON.stringify(report.equipeUnmatched)}`);
  }
  if (report.userUnmatched.length) {
    console.log(`Agents sans compte applicatif rapproche : ${report.userUnmatched.join(", ")}`);
  }
} catch (error) {
  console.error(`Echec de l'import des agents : ${error.message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
