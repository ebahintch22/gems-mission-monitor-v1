const crypto = require("node:crypto");
const db = require("../config/database");
const BuildingFeatureV2 = require("./BuildingFeatureV2");

const VALID_STATUSES = new Set(["planned", "ongoing", "done"]);
const DEFAULT_STATUSES = Array.from(VALID_STATUSES);

class SitesPlanning {
  static validStatuses() {
    return DEFAULT_STATUSES;
  }

  static all(filters = {}) {
    const { where, params } = buildWhere(filters);
    const records = db.prepare(`
      SELECT *
      FROM sites_planning
      ${where}
      ORDER BY region COLLATE NOCASE, ministere COLLATE NOCASE, localite COLLATE NOCASE, site_name COLLATE NOCASE
    `).all(params).map(hydrate);
    return attachBuildingFeatures(records, filters);
  }

  static stats(filters = {}) {
    const records = this.all(filters);
    const total = records.length;
    const done = records.filter((record) => record.statut === "done").length;
    const ongoing = records.filter((record) => record.statut === "ongoing").length;
    const planned = records.filter((record) => record.statut === "planned").length;
    const executionRate = total ? Math.round((done / total) * 1000) / 10 : 0;
    const schedule = records.map((record) => ({
      id: record.id,
      code: record.code,
      site_name: record.site_name,
      region: record.region,
      ministere: record.ministere,
      localite: record.localite,
      statut: record.statut,
      planned_visit_date: record.planned_visit_date,
      actual_visit_date: record.actual_visit_date,
      schedule_gap_days: scheduleGapDays(record),
      schedule_gap_label: scheduleGapLabel(record)
    }));

    return {
      total,
      done,
      ongoing,
      planned,
      execution_rate: executionRate,
      schedule
    };
  }

  static importRows(rows) {
    const normalizedRows = rows.map(normalizeRow).filter(Boolean);
    const upsert = db.prepare(`
      INSERT INTO sites_planning (
        code, source_ord, localite, site_name, ministere, region, phase,
        planned_visit_date, actual_visit_date, point_geo, polygon_geo, statut_old, statut,
        source_hash, raw_json, imported_at, updated_at
      ) VALUES (
        @code, @source_ord, @localite, @site_name, @ministere, @region, @phase,
        @planned_visit_date, @actual_visit_date, @point_geo, @polygon_geo, @statut_old, @statut,
        @source_hash, @raw_json, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT(source_hash) DO UPDATE SET
        code = excluded.code,
        source_ord = excluded.source_ord,
        localite = excluded.localite,
        site_name = excluded.site_name,
        ministere = excluded.ministere,
        region = excluded.region,
        phase = excluded.phase,
        planned_visit_date = excluded.planned_visit_date,
        actual_visit_date = excluded.actual_visit_date,
        point_geo = COALESCE(excluded.point_geo, sites_planning.point_geo),
        polygon_geo = COALESCE(excluded.polygon_geo, sites_planning.polygon_geo),
        statut_old = excluded.statut_old,
        statut = excluded.statut,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `);

    return db.transaction(() => {
      let changes = 0;
      normalizedRows.forEach((row) => {
        changes += upsert.run(row).changes;
      });

      return {
        read: rows.length,
        imported: normalizedRows.length,
        changes
      };
    })();
  }

  static findById(id) {
    const row = db.prepare("SELECT * FROM sites_planning WHERE id = ?").get(Number(id));
    return row ? hydrate(row) : null;
  }

  static updateLocation(id, payload = {}) {
    const record = this.findById(id);
    if (!record) {
      throw new Error("site_planning_not_found");
    }

    const pointGeo = payload.point_geo === undefined ? undefined : normalizeGeoJson(payload.point_geo, "Point");
    const polygonGeo = payload.polygon_geo === undefined ? undefined : normalizeGeoJson(payload.polygon_geo, "Polygon");

    db.prepare(`
      UPDATE sites_planning
      SET
        point_geo = CASE WHEN @hasPoint = 1 THEN @pointGeo ELSE point_geo END,
        polygon_geo = CASE WHEN @hasPolygon = 1 THEN @polygonGeo ELSE polygon_geo END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({
      id: record.id,
      hasPoint: pointGeo === undefined ? 0 : 1,
      pointGeo: pointGeo === null ? null : JSON.stringify(pointGeo),
      hasPolygon: polygonGeo === undefined ? 0 : 1,
      polygonGeo: polygonGeo === null ? null : JSON.stringify(polygonGeo)
    });

    return this.findById(record.id);
  }

  static withContours(ids = []) {
    const siteIds = normalizeIds(ids);
    if (!siteIds.length) {
      return [];
    }
    const placeholders = siteIds.map((_, index) => `@id${index}`).join(", ");
    const params = Object.fromEntries(siteIds.map((id, index) => [`id${index}`, id]));
    return db.prepare(`
      SELECT *
      FROM sites_planning
      WHERE id IN (${placeholders})
        AND polygon_geo IS NOT NULL
        AND polygon_geo <> ''
      ORDER BY site_name COLLATE NOCASE, code COLLATE NOCASE
    `).all(params).map(hydrate);
  }

  static updateOsmBuildingExtents(imports = []) {
    const normalizedImports = imports
      .map((entry) => ({
        id: Number(entry.site_id || entry.id),
        geojson: normalizeGeoJson(entry.geojson || entry.emprise_bat_osm, "FeatureCollection")
      }))
      .filter((entry) => Number.isInteger(entry.id) && entry.id > 0);

    const update = db.prepare(`
      UPDATE sites_planning
      SET emprise_bat_osm = @geojson,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `);

    return db.transaction(() => {
      let saved = 0;
      normalizedImports.forEach((entry) => {
        saved += update.run({
          id: entry.id,
          geojson: JSON.stringify(entry.geojson)
        }).changes;
      });
      return { requested: imports.length, saved };
    })();
  }
}

function normalizeIds(ids = []) {
  return (Array.isArray(ids) ? ids : [ids])
    .map((id) => Number(id))
    .filter((id, index, list) => Number.isInteger(id) && id > 0 && list.indexOf(id) === index);
}

function buildWhere(filters = {}) {
  const conditions = [];
  const params = {};
  const statuses = normalizeStatuses(filters.status || filters.statuses);
  const hasStatusFilter = filters.status !== undefined || filters.statuses !== undefined;

  if (statuses.length && statuses.length < VALID_STATUSES.size) {
    conditions.push(`statut IN (${statuses.map((_, index) => `@status${index}`).join(", ")})`);
    statuses.forEach((status, index) => {
      params[`status${index}`] = status;
    });
  } else if (hasStatusFilter && !statuses.length) {
    conditions.push("1 = 0");
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

function normalizeStatuses(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || "").split(",");
  return values
    .map((status) => String(status || "").trim().toLowerCase())
    .filter((status, index, list) => VALID_STATUSES.has(status) && list.indexOf(status) === index);
}

function normalizeRow(row) {
  const code = readColumn(row, ["CODE", "Code", "code", "SITE_CODE", "site_code"]);
  const sourceOrd = readColumn(row, ["ord", "ORD", "Ord"]);
  const localite = readColumn(row, ["LOCALITE", "localite"]);
  const siteName = readColumn(row, ["NOM ETABLISSEMENT", "NOM_ETABLISSEMENT", "SITE", "site_name", "nom_site"]);
  const ministere = readColumn(row, ["MINISTERE", "ministere"]);
  const region = readColumn(row, ["REGION", "region"]);
  const phase = readColumn(row, ["PHASE", "phase", "Phase"]);
  const plannedVisitDate = normalizeDate(readColumn(row, ["SURVEY_DATE_PREV", "DATE_PREVISIONNELLE", "planned_visit_date"]));
  const actualVisitDate = normalizeDate(readColumn(row, ["SURVEY_DATE_REAL", "SURVEY_DATE_REELLE", "DATE_REELLE", "actual_visit_date"]));
  const pointGeo = normalizeOptionalGeoJson(readColumn(row, ["POINT_GEO", "point_geo", "pointGeo"]));
  const polygonGeo = normalizeOptionalGeoJson(readColumn(row, ["POLYGON_GEO", "polygon_geo", "polygonGeo"]));
  const statut = normalizeStatus(readColumn(row, ["STATUT", "statut"]));
  const statutOld = readColumn(row, ["STATUT_OLD", "statut_old"]);

  if (!siteName && !localite && !region) {
    return null;
  }

  const naturalKey = code
    ? ["code", code].map((value) => String(value || "").trim().toLowerCase()).join("|")
    : [
      sourceOrd,
      region,
      ministere,
      localite,
      siteName,
      plannedVisitDate
    ].map((value) => String(value || "").trim().toLowerCase()).join("|");

  return {
    code,
    source_ord: sourceOrd,
    localite,
    site_name: siteName,
    ministere,
    region,
    phase,
    planned_visit_date: plannedVisitDate,
    actual_visit_date: actualVisitDate,
    point_geo: pointGeo ? JSON.stringify(pointGeo) : null,
    polygon_geo: polygonGeo ? JSON.stringify(polygonGeo) : null,
    statut_old: statutOld,
    statut,
    source_hash: crypto.createHash("sha256").update(naturalKey).digest("hex"),
    raw_json: JSON.stringify(row)
  };
}

function normalizeOptionalGeoJson(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  try {
    return normalizeGeoJson(JSON.parse(text));
  } catch (error) {
    return null;
  }
}

function normalizeGeoJson(value, expectedType = null) {
  if (value === null || value === "") {
    return null;
  }
  const geojson = typeof value === "string" ? JSON.parse(value) : value;
  if (!geojson || typeof geojson !== "object" || typeof geojson.type !== "string") {
    throw new Error("invalid_site_geojson");
  }
  if (expectedType && geojson.type !== expectedType) {
    throw new Error(`invalid_site_${expectedType.toLowerCase()}_geojson`);
  }
  if (geojson.type === "Point") {
    if (!Array.isArray(geojson.coordinates) || geojson.coordinates.length < 2) {
      throw new Error("invalid_site_point_coordinates");
    }
    return {
      type: "Point",
      coordinates: [
        Number(geojson.coordinates[0]),
        Number(geojson.coordinates[1])
      ]
    };
  }
  if (geojson.type === "Polygon") {
    if (!Array.isArray(geojson.coordinates?.[0]) || geojson.coordinates[0].length < 4) {
      throw new Error("invalid_site_polygon_coordinates");
    }
    return geojson;
  }
  if (geojson.type === "FeatureCollection") {
    if (!Array.isArray(geojson.features)) {
      throw new Error("invalid_site_feature_collection");
    }
    return geojson;
  }
  throw new Error("unsupported_site_geojson_type");
}

function readColumn(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== "") {
      return String(row[name]).trim();
    }
  }
  return "";
}

function normalizeStatus(value) {
  const status = String(value || "planned").trim().toLowerCase();
  return VALID_STATUSES.has(status) ? status : "planned";
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  const frenchDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (frenchDate) {
    const [, day, month, year] = frenchDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const isoDate = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return null;
}

function scheduleGapDays(record) {
  if (!record.planned_visit_date || !record.actual_visit_date) {
    return null;
  }
  const planned = Date.parse(`${record.planned_visit_date}T00:00:00Z`);
  const actual = Date.parse(`${record.actual_visit_date}T00:00:00Z`);
  if (!Number.isFinite(planned) || !Number.isFinite(actual)) {
    return null;
  }
  return Math.round((actual - planned) / 86400000);
}

function scheduleGapLabel(record) {
  const gap = scheduleGapDays(record);
  if (gap === null) {
    return "non renseigné";
  }
  if (gap === 0) {
    return "conforme";
  }
  return gap > 0 ? `+${gap} j` : `${gap} j`;
}

function attachBuildingFeatures(records, filters = {}) {
  if (!records.length) {
    return records;
  }
  try {
    const collections = BuildingFeatureV2.featureCollectionForSites(
      records.map((record) => record.id),
      { missionId: filters.mission_id || filters.missionId || null }
    );
    return records.map((record) => ({
      ...record,
      emprise_bat_osm: collections.get(record.id) || record.emprise_bat_osm,
      osm_building_count: collections.get(record.id)?.features.length || 0
    }));
  } catch (error) {
    return records.map((record) => ({
      ...record,
      osm_building_count: 0
    }));
  }
}

function hydrate(row) {
  return {
    ...row,
    point_geo: parseJsonOrNull(row.point_geo),
    polygon_geo: parseJsonOrNull(row.polygon_geo),
    emprise_bat_osm: parseJsonOrNull(row.emprise_bat_osm),
    schedule_gap_days: scheduleGapDays(row),
    schedule_gap_label: scheduleGapLabel(row),
    raw: parseJson(row.raw_json)
  };
}

function parseJsonOrNull(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch (error) {
    return null;
  }
}

function parseJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch (error) {
    return {};
  }
}

module.exports = SitesPlanning;
