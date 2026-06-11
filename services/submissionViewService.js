const { loadMapping } = require("./formMappingService");

function buildSubmissionDetail(record) {
  const rawData = parseRawData(record.raw_data_json);
  const mapping = loadMapping();
  const sections = mapping.sections.map((section) => ({
    ...section,
    fields: section.fields.map((field) => ({
      ...field,
      value: formatValue(readPath(rawData, field.path))
    }))
  }));
  const summary = mapping.summaryFields.map((field) => ({
    ...field,
    value: formatValue(readPath(rawData, field.path))
  }));

  return {
    record,
    rawData,
    mapping,
    sections,
    summary,
    title: readPath(rawData, "modB.nom_officiel") || record.display_submission_id || record.source_submission_id,
    subtitle: [
      readPath(rawData, "modA.id_entite"),
      record.nom_sous_prefecture,
      record.nom_region
    ].filter(Boolean).join(" - ")
  };
}

function parseRawData(rawDataJson) {
  if (!rawDataJson) {
    return {};
  }

  try {
    return JSON.parse(rawDataJson);
  } catch (error) {
    return {};
  }
}

function readPath(input, fieldPath) {
  return String(fieldPath).split(".").reduce((current, part) => {
    if (current === null || current === undefined) {
      return undefined;
    }

    return current[part];
  }, input);
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "-";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

module.exports = {
  buildSubmissionDetail,
  formatValue,
  parseRawData,
  readPath
};
