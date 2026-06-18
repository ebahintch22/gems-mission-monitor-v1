const db = require("../config/database");

const VALID_GEOMETRY_TYPES = new Set(["Polygon", "MultiPolygon"]);
const VALID_SOURCES = new Set(["osm", "topoexport", "satellite", "terrain", "manual", "import"]);
const VALID_STATUSES = new Set(["prepare", "transmis_terrain", "verifie_terrain", "a_corriger", "valide", "archive"]);

class BuildingFeature {
  static all(filters = {}) {
    const conditions = [];
    const params = {};

    if (filters.mission_id) {
      conditions.push("bf.mission_id = @mission_id");
      params.mission_id = Number(filters.mission_id);
    }
    if (filters.site_code) {
      conditions.push("bf.site_code = @site_code");
      params.site_code = String(filters.site_code).trim();
    }
    if (filters.status) {
      conditions.push("bf.status = @status");
      params.status = String(filters.status).trim();
    }
    if (filters.source) {
      conditions.push("bf.source = @source");
      params.source = String(filters.source).trim();
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    return db.prepare(`
      SELECT
        bf.*,
        m.name AS mission_name
      FROM building_features bf
      JOIN missions m ON m.id = bf.mission_id
      ${where}
      ORDER BY bf.site_name, bf.site_code, bf.building_code
    `).all(params).map(hydrate);
  }

  static findById(id) {
    const row = db.prepare(`
      SELECT
        bf.*,
        m.name AS mission_name
      FROM building_features bf
      JOIN missions m ON m.id = bf.mission_id
      WHERE bf.id = ?
    `).get(id);
    return row ? hydrate(row) : null;
  }

  static importGeoJson({ missionId, geojson, actorUserId = null, defaults = {} }) {
    const mission = db.prepare("SELECT id FROM missions WHERE id = ? AND archived = 0").get(missionId);
    if (!mission) {
      throw new Error("invalid_mission");
    }

    const features = normalizeFeatureCollection(geojson);
    const rows = features.map((feature, index) => normalizeFeature(feature, {
      missionId,
      actorUserId,
      index,
      defaults
    }));

    const upsert = db.prepare(`
      INSERT INTO building_features (
        mission_id, site_code, site_name, building_code,
        source, source_reference, geometry_geojson, status,
        properties_json, prepared_by, prepared_at, updated_at
      ) VALUES (
        @mission_id, @site_code, @site_name, @building_code,
        @source, @source_reference, @geometry_geojson, @status,
        @properties_json, @prepared_by, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT(mission_id, site_code, building_code) DO UPDATE SET
        site_name = excluded.site_name,
        source = excluded.source,
        source_reference = excluded.source_reference,
        geometry_geojson = excluded.geometry_geojson,
        status = excluded.status,
        properties_json = excluded.properties_json,
        prepared_by = excluded.prepared_by,
        prepared_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `);

    return db.transaction(() => {
      let insertedOrUpdated = 0;
      rows.forEach((row) => {
        insertedOrUpdated += upsert.run(row).changes;
      });

      return {
        missionId: Number(missionId),
        read: features.length,
        imported: rows.length,
        changes: insertedOrUpdated
      };
    })();
  }
}

function normalizeFeatureCollection(geojson) {
  const parsed = typeof geojson === "string" ? JSON.parse(geojson) : geojson;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("invalid_geojson");
  }
  if (parsed.type === "Feature") {
    return [parsed];
  }
  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error("invalid_geojson_feature_collection");
  }
  return parsed.features;
}

function normalizeFeature(feature, context) {
  if (!feature || feature.type !== "Feature") {
    throw new Error(`invalid_feature:${context.index + 1}`);
  }
  if (!feature.geometry || !VALID_GEOMETRY_TYPES.has(feature.geometry.type)) {
    throw new Error(`invalid_building_geometry:${context.index + 1}`);
  }

  const properties = feature.properties && typeof feature.properties === "object"
    ? feature.properties
    : {};
  const defaults = context.defaults || {};
  const siteCode = firstValue(properties, ["site_code", "code_site", "CODE_SITE", "siteCode"], defaults.site_code || "");
  const siteName = firstValue(properties, ["site_name", "nom_site", "NOM_SITE", "NOM DU SITE", "siteName"], defaults.site_name || "");
  const buildingCode = firstValue(properties, [
    "building_code",
    "code_batiment",
    "BATIMENT",
    "batiment",
    "ref",
    "name",
    "id"
  ], `BAT-${String(context.index + 1).padStart(3, "0")}`);
  const source = normalizeSource(firstValue(properties, ["source", "SOURCE"], defaults.source || "import"));
  const status = normalizeStatus(firstValue(properties, ["status", "statut", "STATUS"], defaults.status || "prepare"));

  return {
    mission_id: Number(context.missionId),
    site_code: String(siteCode || "").trim(),
    site_name: String(siteName || "").trim(),
    building_code: String(buildingCode || "").trim(),
    source,
    source_reference: String(firstValue(properties, ["source_reference", "source_ref", "SOURCE_REF"], defaults.source_reference || "") || "").trim(),
    geometry_geojson: JSON.stringify(feature.geometry),
    status,
    properties_json: JSON.stringify(properties),
    prepared_by: context.actorUserId || null
  };
}

function firstValue(properties, keys, fallback = "") {
  for (const key of keys) {
    if (properties[key] !== undefined && properties[key] !== null && String(properties[key]).trim() !== "") {
      return properties[key];
    }
  }
  return fallback;
}

function normalizeSource(value) {
  const source = String(value || "import").trim().toLowerCase();
  return VALID_SOURCES.has(source) ? source : "import";
}

function normalizeStatus(value) {
  const status = String(value || "prepare").trim().toLowerCase();
  return VALID_STATUSES.has(status) ? status : "prepare";
}

function hydrate(row) {
  return {
    ...row,
    geometry: JSON.parse(row.geometry_geojson),
    properties: row.properties_json ? JSON.parse(row.properties_json) : {}
  };
}

module.exports = BuildingFeature;
