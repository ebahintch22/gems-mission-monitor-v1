const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("csv-parse/sync");
const SitesPlanning = require("../models/SitesPlanning");

const DEFAULT_PLANNING_CSV_PATH = path.join(
  __dirname,
  "..",
  "KBase-docs",
  "kobo-data-sample",
  "data-reference",
  "planning_site_prioritaires.csv"
);

function importSitesPlanningFromCsv(filePath = DEFAULT_PLANNING_CSV_PATH) {
  const csvPath = path.resolve(filePath);
  const content = fs.readFileSync(csvPath, "utf8");
  const rows = parse(content, {
    columns: true,
    delimiter: ";",
    bom: true,
    skip_empty_lines: true,
    trim: true
  });
  const result = SitesPlanning.importRows(rows);
  return {
    ...result,
    filePath: csvPath
  };
}

module.exports = {
  DEFAULT_PLANNING_CSV_PATH,
  importSitesPlanningFromCsv
};
