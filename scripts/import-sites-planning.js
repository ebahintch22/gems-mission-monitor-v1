const {
  DEFAULT_PLANNING_CSV_PATH,
  importSitesPlanningFromCsv
} = require("../services/sitesPlanningImportService");

const filePath = process.argv[2] || DEFAULT_PLANNING_CSV_PATH;

try {
  const result = importSitesPlanningFromCsv(filePath);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
