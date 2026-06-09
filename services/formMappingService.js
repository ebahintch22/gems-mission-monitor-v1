const fs = require("fs");
const path = require("path");

const DEFAULT_FORM_ID = "padci_survey_terrain_vf_v12";
const mappingsDirectory = path.join(__dirname, "..", "config", "forms");

function loadMapping(formId = DEFAULT_FORM_ID) {
  const safeFormId = String(formId || DEFAULT_FORM_ID).replace(/[^a-zA-Z0-9_-]/g, "");
  const mappingPath = path.join(mappingsDirectory, `${safeFormId}.json`);

  return JSON.parse(fs.readFileSync(mappingPath, "utf8").replace(/^\uFEFF/, ""));
}

module.exports = {
  DEFAULT_FORM_ID,
  loadMapping
};
