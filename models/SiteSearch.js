const db = require("../config/database");
const Setting = require("./Setting");

const DEFAULT_FIELDS = ["nom_officiel", "sous_prefecture", "ville", "region", "type_infrastructure"];
const ALLOWED_FIELDS = new Set(DEFAULT_FIELDS);
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const FIELD_READERS = {
  nom_officiel(record) {
    return rawValue(record, "modB/nom_officiel");
  },
  sous_prefecture(record) {
    return record.nom_sous_prefecture || rawValue(record, "modB/sous_prefecture");
  },
  ville(record) {
    return rawValue(record, "modB/commune") || rawValue(record, "modB/ville") || rawValue(record, "modB/quartier");
  },
  region(record) {
    return record.nom_region || rawValue(record, "modB/region");
  },
  type_infrastructure(record) {
    return rawValue(record, "modB/type_infra") || rawValue(record, "modB/sous_type");
  }
};

class SiteSearch {
  static config() {
    return {
      fields: configuredFields(),
      limit: configuredLimit()
    };
  }

  static search(query, requestedLimit) {
    const q = normalizeText(query);
    if (q.length < 2) {
      return [];
    }

    const config = this.config();
    const limit = normalizeLimit(requestedLimit, config.limit);
    const candidates = db.prepare(`
      SELECT
        s.id,
        s.source_submission_id,
        s.raw_data_json,
        sp.nom_sous_prefecture,
        r.nom_region
      FROM soumissions_collecte s
      JOIN missions m ON m.id = s.mission_id
      LEFT JOIN sous_prefectures sp ON sp.id = s.sous_prefecture_id
      LEFT JOIN departements d ON d.id = sp.departement_id
      LEFT JOIN regions r ON r.id = d.region_id
      WHERE m.archived = 0
      ORDER BY s.submitted_at DESC
    `).all();

    return candidates
      .map((record) => hydrateRecord(record))
      .filter((record) => config.fields.some((field) => normalizeText(FIELD_READERS[field]?.(record)).includes(q)))
      .sort((left, right) => left.nom_officiel.localeCompare(right.nom_officiel, "fr", { sensitivity: "base" }))
      .slice(0, limit)
      .map((record) => ({
        id: record.id,
        nom_officiel: record.nom_officiel,
        ville: record.ville,
        region: record.region,
        sous_prefecture: record.sous_prefecture,
        type_infrastructure: record.type_infrastructure,
        url: `/cartographie?submission_id=${record.id}`
      }));
  }
}

function configuredFields() {
  try {
    const parsed = JSON.parse(Setting.rawValue("search.site_fields") || "[]");
    const fields = Array.isArray(parsed)
      ? parsed.filter((field, index, list) => ALLOWED_FIELDS.has(field) && list.indexOf(field) === index)
      : [];
    return fields.length ? fields : DEFAULT_FIELDS;
  } catch (error) {
    return DEFAULT_FIELDS;
  }
}

function configuredLimit() {
  return normalizeLimit(Setting.rawValue("search.site_limit"), DEFAULT_LIMIT);
}

function normalizeLimit(value, fallback) {
  const limit = Number(value);
  return Number.isInteger(limit) && limit > 0
    ? Math.min(limit, MAX_LIMIT)
    : fallback;
}

function hydrateRecord(record) {
  const raw = parseRaw(record.raw_data_json);
  return {
    ...record,
    raw,
    nom_officiel: rawValue({ raw }, "modB/nom_officiel") || record.source_submission_id || `Soumission #${record.id}`,
    ville: rawValue({ raw }, "modB/commune") || rawValue({ raw }, "modB/ville") || rawValue({ raw }, "modB/quartier") || "",
    region: record.nom_region || rawValue({ raw }, "modB/region") || "",
    sous_prefecture: record.nom_sous_prefecture || rawValue({ raw }, "modB/sous_prefecture") || "",
    type_infrastructure: rawValue({ raw }, "modB/type_infra") || rawValue({ raw }, "modB/sous_type") || ""
  };
}

function parseRaw(value) {
  try {
    return JSON.parse(value || "{}");
  } catch (error) {
    return {};
  }
}

function rawValue(record, path) {
  const raw = record.raw || parseRaw(record.raw_data_json);
  if (Object.prototype.hasOwnProperty.call(raw, path)) {
    return stringify(raw[path]);
  }
  const value = path.split("/").reduce((currentValue, segment) => {
    if (currentValue && typeof currentValue === "object" && Object.prototype.hasOwnProperty.call(currentValue, segment)) {
      return currentValue[segment];
    }
    return "";
  }, raw);
  return stringify(value);
}

function stringify(value) {
  if (Array.isArray(value)) {
    return value.join(" ");
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function normalizeText(value) {
  return stringify(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

module.exports = SiteSearch;
