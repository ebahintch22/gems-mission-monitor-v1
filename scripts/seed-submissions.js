require("dotenv").config();

const db = require("../config/database");
const { seedSubmissions } = require("../services/submissionSeedService");

try {
  const report = seedSubmissions(db);
  console.log("Source : simulation XLSForm padci_survey_terrain_vf");
  console.log(`Agents couverts : ${report.agents}`);
  console.log(`Soumissions generees ou mises a jour : ${report.generated}`);
  console.log(`Validees : ${report.validees}`);
  console.log(`A verifier : ${report.aVerifier}`);
  console.log(`Rejetees : ${report.rejetees}`);
  console.log(`Agents a faible activite simulee : ${report.agentsLowActivity.join(", ")}`);
} catch (error) {
  console.error(`Echec de la generation des soumissions : ${error.message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
