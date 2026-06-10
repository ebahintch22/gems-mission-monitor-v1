const fs = require("fs");
const path = require("path");
const { loadChoiceList, loadMapping } = require("./formMappingService");

const templatesDirectory = path.join(__dirname, "..", "config", "report-templates");
const DEFAULT_TEMPLATE_ID = "padci_decision_sheet";

function buildSubmissionReport(record, options = {}) {
  const template = loadReportTemplate(options.templateId || DEFAULT_TEMPLATE_ID);
  const choiceIndex = buildChoiceIndex(options.formId, template);
  const rawData = parseRawData(record.raw_data_json);
  const context = { ...record, raw: rawData, ...rawData };
  const diagnostics = [];
  const report = {
    template: {
      id: template.id,
      label: template.label,
      version: template.version
    },
    header: renderHeader(template.header || {}, context, diagnostics, choiceIndex),
    summary: renderFields(template.summary || [], context, diagnostics, choiceIndex),
    sections: (template.sections || []).map((section) => ({
      label: section.label,
      fields: renderFields(section.fields || [], context, diagnostics, choiceIndex)
    })),
    map: renderMap(template.map, context, diagnostics),
    diagnostics
  };

  return report;
}

function loadReportTemplate(templateId = DEFAULT_TEMPLATE_ID) {
  const safeTemplateId = String(templateId || DEFAULT_TEMPLATE_ID).replace(/[^a-zA-Z0-9_-]/g, "");
  const templatePath = path.join(templatesDirectory, `${safeTemplateId}.json`);
  return JSON.parse(fs.readFileSync(templatePath, "utf8").replace(/^\uFEFF/, ""));
}

function renderHeader(header, context, diagnostics, choiceIndex) {
  const subtitleParts = Array.isArray(header.subtitle)
    ? header.subtitle.map((field) => resolveField(field, context, diagnostics, choiceIndex).value).filter((value) => value !== "-")
    : [];

  return {
    eyebrow: header.eyebrow || "",
    title: resolveField(header.title || {}, context, diagnostics, choiceIndex).value,
    subtitle: subtitleParts.join(" - "),
    status: resolveField(header.status || {}, context, diagnostics, choiceIndex)
  };
}

function renderFields(fields, context, diagnostics, choiceIndex) {
  return fields.map((field) => {
    const resolved = resolveField(field, context, diagnostics, choiceIndex);
    return {
      label: field.label,
      value: resolved.value,
      rawValue: resolved.rawValue
    };
  });
}

function renderMap(mapConfig, context, diagnostics) {
  if (!mapConfig) {
    return null;
  }

  const latitude = Number(resolveValue(mapConfig.latitudePath, context).value);
  const longitude = Number(resolveValue(mapConfig.longitudePath, context).value);
  const precision = Number(resolveValue(mapConfig.precisionPath, context).value);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    diagnostics.push({
      level: "warning",
      type: "missing_map_coordinates",
      path: `${mapConfig.latitudePath},${mapConfig.longitudePath}`
    });
    return null;
  }

  return {
    type: mapConfig.type || "map_point",
    latitude,
    longitude,
    precision: Number.isFinite(precision) ? precision : null
  };
}

function resolveField(field, context, diagnostics, choiceIndex = {}) {
  const primary = resolveValue(field.path, context);
  const fallback = primary.found ? primary : resolveValue(field.fallbackPath, context);
  const rawValue = fallback.found ? fallback.value : field.defaultValue;
  const fieldWithChoices = enrichFieldChoices(field, choiceIndex);

  if (!primary.found && !fallback.found && field.path && !field.optional) {
    diagnostics.push({
      level: "warning",
      type: "missing_field",
      path: field.path,
      fallbackPath: field.fallbackPath || null
    });
  }

  return {
    rawValue,
    value: formatValue(rawValue, fieldWithChoices)
  };
}

function enrichFieldChoices(field, choiceIndex) {
  if (field.choices || !field.path) {
    return field;
  }

  const choiceEntry = choiceIndex[normalizePath(field.path)];
  if (!choiceEntry) {
    return field;
  }

  return {
    ...field,
    choices: choiceEntry.choices,
    format: field.format || (choiceEntry.multiple ? "choice_list" : "choice")
  };
}

function resolveValue(fieldPath, context) {
  if (!fieldPath) {
    return { found: false, value: undefined };
  }

  const slashPath = String(fieldPath).replaceAll(".", "/");
  const dotPath = String(fieldPath).replaceAll("/", ".");
  const candidates = [fieldPath, slashPath, dotPath];

  for (const candidate of candidates) {
    const value = readPath(context, candidate);
    if (value !== undefined && value !== null && value !== "") {
      return { found: true, value };
    }
  }

  return { found: false, value: undefined };
}

function readPath(input, fieldPath) {
  if (input && Object.prototype.hasOwnProperty.call(input, fieldPath)) {
    return input[fieldPath];
  }

  const pathParts = String(fieldPath).includes("/")
    ? String(fieldPath).split("/")
    : String(fieldPath).split(".");

  return pathParts.reduce((current, part) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    return current[part];
  }, input);
}

function formatValue(value, field = {}) {
  if (value === null || value === undefined || value === "") {
    return field.defaultValue || "-";
  }

  switch (field.format || "text") {
    case "date":
      return formatDate(value);
    case "number":
      return formatNumber(value, field);
    case "yes_no":
      return formatYesNo(value);
    case "choice":
      return formatChoice(value, field);
    case "choice_list":
      return formatChoiceList(value, field);
    default:
      return Array.isArray(value) ? value.join(", ") : String(value);
  }
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleDateString("fr-FR");
}

function formatNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return String(value);
  }
  const formatter = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: Number.isInteger(field.decimals) ? field.decimals : 0,
    minimumFractionDigits: Number.isInteger(field.decimals) ? field.decimals : 0
  });
  return `${formatter.format(number)}${field.unit ? ` ${field.unit}` : ""}`;
}

function formatYesNo(value) {
  const normalized = String(value).trim().toLowerCase();
  if (["oui", "yes", "true", "1"].includes(normalized)) {
    return "Oui";
  }
  if (["non", "no", "false", "0"].includes(normalized)) {
    return "Non";
  }
  return humanizeChoice(String(value));
}

function formatChoice(value, field) {
  const normalized = String(value);
  return field.choices?.[normalized]
    || field.choices?.[normalizeChoiceValue(normalized)]
    || humanizeChoice(normalized);
}

function formatChoiceList(value, field) {
  const values = Array.isArray(value)
    ? value
    : String(value).split(/[\s,]+/).filter(Boolean);

  if (!values.length) {
    return "-";
  }

  return values.map((entry) => formatChoice(entry, field)).join(", ");
}

function humanizeChoice(value) {
  return String(value)
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function parseRawData(rawDataJson) {
  if (!rawDataJson) {
    return {};
  }

  try {
    return JSON.parse(rawDataJson);
  } catch {
    return {};
  }
}

function buildChoiceIndex(formId, template = null) {
  const mapping = loadMapping(formId);
  const neededPaths = collectChoicePaths(template);
  const fields = buildFieldIndex(mapping);
  const index = {};

  neededPaths.forEach((fieldPath) => {
    const field = fields[normalizePath(fieldPath)];
    if (!field?.path || !field.choiceList) {
      return;
    }

    const choices = loadChoiceList(formId, field.choiceList, mapping);
    if (!Array.isArray(choices)) {
      return;
    }

    index[normalizePath(field.path)] = {
      multiple: String(field.type || "").startsWith("select_multiple"),
      choices: choices.reduce((choiceMap, choice) => {
        const name = String(choice.name);
        const label = choice.label || choice.name;
        choiceMap[name] = label;
        choiceMap[normalizeChoiceValue(name)] = label;
        return choiceMap;
      }, {})
    };
  });

  return index;
}

function buildFieldIndex(mapping) {
  const index = {};
  const fields = Array.isArray(mapping.fields)
    ? mapping.fields
    : (mapping.sections || []).flatMap((section) => section.fields || []);

  fields.forEach((field) => {
    if (field.path) {
      index[normalizePath(field.path)] = field;
    }
  });

  return index;
}

function collectChoicePaths(template) {
  if (!template) {
    return new Set();
  }

  const paths = new Set();
  collectFieldPath(template.header?.title, paths);
  collectFieldPath(template.header?.status, paths);
  (template.header?.subtitle || []).forEach((field) => collectFieldPath(field, paths));
  (template.summary || []).forEach((field) => collectFieldPath(field, paths));
  (template.sections || []).forEach((section) => {
    (section.fields || []).forEach((field) => collectFieldPath(field, paths));
  });

  return paths;
}

function collectFieldPath(field, paths) {
  if (!field || field.choices) {
    return;
  }

  [field.path, field.fallbackPath].forEach((fieldPath) => {
    if (fieldPath) {
      paths.add(normalizePath(fieldPath));
    }
  });
}

function normalizePath(fieldPath) {
  return String(fieldPath || "").replaceAll("/", ".");
}

function normalizeChoiceValue(value) {
  return String(value || "").trim().toLowerCase();
}

module.exports = {
  DEFAULT_TEMPLATE_ID,
  buildSubmissionReport,
  formatValue,
  loadReportTemplate,
  parseRawData,
  readPath,
  resolveValue,
  buildChoiceIndex
};
