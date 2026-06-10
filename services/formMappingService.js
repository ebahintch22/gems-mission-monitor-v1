const fs = require("fs");
const path = require("path");

const DEFAULT_FORM_ID = "padci_survey_terrain_vf_v12";
const mappingsDirectory = path.join(__dirname, "..", "config", "forms");
const mappingCache = new Map();
const choiceListCache = new Map();

function loadMapping(formId = DEFAULT_FORM_ID) {
  const safeFormId = sanitizeId(formId || DEFAULT_FORM_ID);
  if (mappingCache.has(safeFormId)) {
    return mappingCache.get(safeFormId);
  }

  const mappingPath = path.join(mappingsDirectory, `${safeFormId}.json`);
  const mapping = JSON.parse(fs.readFileSync(mappingPath, "utf8").replace(/^\uFEFF/, ""));

  mappingCache.set(safeFormId, mapping);
  return mapping;
}

function loadChoiceList(formId = DEFAULT_FORM_ID, choiceListName, mapping = null) {
  const safeFormId = sanitizeId(formId || DEFAULT_FORM_ID);
  const safeChoiceListName = sanitizeId(choiceListName);
  const cacheKey = `${safeFormId}:${safeChoiceListName}`;

  if (!safeChoiceListName) {
    return [];
  }

  if (choiceListCache.has(cacheKey)) {
    return choiceListCache.get(cacheKey);
  }

  const splitChoicePath = path.join(mappingsDirectory, safeFormId, "choices", `${safeChoiceListName}.json`);
  if (fs.existsSync(splitChoicePath)) {
    const choices = JSON.parse(fs.readFileSync(splitChoicePath, "utf8").replace(/^\uFEFF/, ""));
    choiceListCache.set(cacheKey, choices);
    return choices;
  }

  const loadedMapping = mapping || loadMapping(safeFormId);
  const legacyChoices = loadedMapping.choiceLists?.[choiceListName] || loadedMapping.choiceLists?.[safeChoiceListName] || [];
  choiceListCache.set(cacheKey, legacyChoices);
  return legacyChoices;
}

function sanitizeId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

module.exports = {
  DEFAULT_FORM_ID,
  loadMapping,
  loadChoiceList
};
