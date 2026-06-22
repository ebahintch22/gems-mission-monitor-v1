const crypto = require("node:crypto");
const db = require("../config/database");
const Setting = require("./Setting");

const VALID_GEOMETRY_TYPES = new Set(["Polygon", "MultiPolygon"]);
const VALID_SOURCES = new Set(["osm", "topoexport", "manual", "terrain", "import"]);
const VALID_STATUSES = new Set(["imported", "prepare", "transmis_terrain", "verifie_terrain", "a_corriger", "valide", "archive"]);

class BuildingFeatureV2 {
  static resolveCurrentMissionId(explicitMissionId = null) {
    const requested = Number(explicitMissionId) || Number(Setting.rawValue("app.default_mission_id"));
    if (Number.isInteger(requested) && requested > 0) {
      const mission = db.prepare("SELECT id FROM missions WHERE id = ? AND archived = 0").get(requested);
      if (mission) {
        return mission.id;
      }
    }

    const fallback = db.prepare(`
      SELECT id
      FROM missions
      WHERE archived = 0
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `).get();
    if (!fallback) {
      throw new Error("invalid_mission");
    }
    return fallback.id;
  }

  static importOsmSiteCollections(imports = [], options = {}) {
    const missionId = this.resolveCurrentMissionId(options.missionId);
    const normalized = normalizeImports(imports, {
      missionId,
      actorUserId: options.actorUserId || null
    });

    const deleteExistingOsm = db.prepare(`
      DELETE FROM building_features_v2
      WHERE mission_id = @mission_id
        AND site_code = @site_code
        AND source = 'osm'
    `);
    const insert = db.prepare(`
      INSERT INTO building_features_v2 (
        mission_id, site_planning_id, site_code, building_code, building_name,
        source, source_feature_id, source_reference, import_batch_id,
        geometry_type, geometry_geojson,
        centroid_lon, centroid_lat,
        bbox_min_lon, bbox_min_lat, bbox_max_lon, bbox_max_lat,
        status, properties_json, geometry_hash, imported_by,
        imported_at, updated_at
      ) VALUES (
        @mission_id, @site_planning_id, @site_code, @building_code, @building_name,
        @source, @source_feature_id, @source_reference, @import_batch_id,
        @geometry_type, @geometry_geojson,
        @centroid_lon, @centroid_lat,
        @bbox_min_lon, @bbox_min_lat, @bbox_max_lon, @bbox_max_lat,
        @status, @properties_json, @geometry_hash, @imported_by,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT(mission_id, site_code, building_code) DO UPDATE SET
        site_planning_id = excluded.site_planning_id,
        building_name = excluded.building_name,
        source = excluded.source,
        source_feature_id = excluded.source_feature_id,
        source_reference = excluded.source_reference,
        import_batch_id = excluded.import_batch_id,
        geometry_type = excluded.geometry_type,
        geometry_geojson = excluded.geometry_geojson,
        centroid_lon = excluded.centroid_lon,
        centroid_lat = excluded.centroid_lat,
        bbox_min_lon = excluded.bbox_min_lon,
        bbox_min_lat = excluded.bbox_min_lat,
        bbox_max_lon = excluded.bbox_max_lon,
        bbox_max_lat = excluded.bbox_max_lat,
        status = excluded.status,
        properties_json = excluded.properties_json,
        geometry_hash = excluded.geometry_hash,
        imported_by = excluded.imported_by,
        imported_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `);

    return db.transaction(() => {
      let saved = 0;
      let deleted = 0;
      normalized.forEach((siteImport) => {
        deleted += deleteExistingOsm.run(siteImport.site).changes;
        siteImport.rows.forEach((row) => {
          saved += insert.run(row).changes;
        });
      });
      return {
        requested: imports.length,
        mission_id: missionId,
        sites: normalized.length,
        saved,
        replaced: deleted
      };
    })();
  }

  static featureCollectionForSites(siteIds = [], options = {}) {
    const ids = normalizeIds(siteIds);
    if (!ids.length) {
      return new Map();
    }
    const missionId = this.resolveCurrentMissionId(options.missionId);
    const placeholders = ids.map((_, index) => `@id${index}`).join(", ");
    const params = Object.fromEntries(ids.map((id, index) => [`id${index}`, id]));
    params.mission_id = missionId;

    const rows = db.prepare(`
      SELECT *
      FROM building_features_v2
      WHERE mission_id = @mission_id
        AND site_planning_id IN (${placeholders})
        AND status <> 'archive'
      ORDER BY site_code COLLATE NOCASE, building_code COLLATE NOCASE
    `).all(params);

    return rows.reduce((collections, row) => {
      const key = row.site_planning_id;
      if (!collections.has(key)) {
        collections.set(key, {
          type: "FeatureCollection",
          features: []
        });
      }
      collections.get(key).features.push(rowToFeature(row));
      return collections;
    }, new Map());
  }

  static countBySiteIds(siteIds = [], options = {}) {
    const collections = this.featureCollectionForSites(siteIds, options);
    return new Map(Array.from(collections.entries()).map(([id, collection]) => [id, collection.features.length]));
  }

  static planDataForSite(siteId, options = {}) {
    const id = Number(siteId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("site_planning_not_found");
    }
    const site = db.prepare(`
      SELECT *
      FROM sites_planning
      WHERE id = ?
    `).get(id);
    if (!site) {
      throw new Error("site_planning_not_found");
    }
    const missionId = this.resolveCurrentMissionId(options.missionId);
    const mission = db.prepare("SELECT id, name FROM missions WHERE id = ?").get(missionId);
    const collection = this.featureCollectionForSites([id], { missionId }).get(id) || {
      type: "FeatureCollection",
      features: []
    };
    return {
      site: {
        ...site,
        point_geo: parseJson(site.point_geo),
        polygon_geo: parseJson(site.polygon_geo),
        raw_json: undefined
      },
      mission,
      buildings: collection,
      count: collection.features.length
    };
  }
}

function normalizeImports(imports, context) {
  return (Array.isArray(imports) ? imports : [])
    .map((entry) => normalizeImport(entry, context))
    .filter(Boolean);
}

function normalizeImport(entry, context) {
  const siteId = Number(entry?.site_id || entry?.id);
  if (!Number.isInteger(siteId) || siteId <= 0) {
    return null;
  }
  const site = db.prepare(`
    SELECT id, code, site_name
    FROM sites_planning
    WHERE id = ?
      AND code IS NOT NULL
      AND code <> ''
  `).get(siteId);
  if (!site) {
    throw new Error("site_planning_not_found");
  }

  const features = normalizeFeatureCollection(entry.geojson || entry.emprise_bat_osm);
  const importBatchId = entry.import_batch_id || crypto.randomUUID();
  const rows = features.map((feature, index) => normalizeFeature(feature, {
    ...context,
    site,
    importBatchId,
    index
  }));

  return {
    site: {
      mission_id: context.missionId,
      site_code: site.code
    },
    rows
  };
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

  const properties = feature.properties && typeof feature.properties === "object" ? feature.properties : {};
  const geometryGeoJson = JSON.stringify(feature.geometry);
  const geometryHash = crypto.createHash("sha256").update(geometryGeoJson).digest("hex");
  const source = normalizeSource(firstValue(properties, ["source", "SOURCE"], "osm"));
  const sourceReference = String(firstValue(properties, ["source_reference", "source_ref", "SOURCE_REF"], "") || "").trim();
  const sourceFeatureId = source === "osm"
    ? String(firstValue(properties, ["source_feature_id"], sourceReference || osmFeatureId(properties)) || "").trim()
    : String(firstValue(properties, ["source_feature_id", "id"], "") || "").trim();
  const buildingCode = String(firstValue(properties, [
    "building_code",
    "code_batiment",
    "BATIMENT",
    "batiment",
    "ref",
    "name",
    "id"
  ], sourceFeatureId || `BAT-${String(context.index + 1).padStart(3, "0")}`)).trim();
  const buildingName = String(firstValue(properties, ["building_name", "name", "nom"], "") || "").trim() || null;
  const bbox = geometryBBox(feature.geometry);
  const centroid = bbox
    ? [(bbox.minLon + bbox.maxLon) / 2, (bbox.minLat + bbox.maxLat) / 2]
    : [null, null];

  return {
    mission_id: context.missionId,
    site_planning_id: context.site.id,
    site_code: context.site.code,
    building_code: buildingCode,
    building_name: buildingName,
    source,
    source_feature_id: sourceFeatureId || null,
    source_reference: sourceReference || null,
    import_batch_id: context.importBatchId,
    geometry_type: feature.geometry.type,
    geometry_geojson: geometryGeoJson,
    centroid_lon: centroid[0],
    centroid_lat: centroid[1],
    bbox_min_lon: bbox?.minLon ?? null,
    bbox_min_lat: bbox?.minLat ?? null,
    bbox_max_lon: bbox?.maxLon ?? null,
    bbox_max_lat: bbox?.maxLat ?? null,
    status: normalizeStatus(firstValue(properties, ["status", "statut", "STATUS"], "imported")),
    properties_json: JSON.stringify({
      ...properties,
      site_code: context.site.code,
      site_name: context.site.site_name
    }),
    geometry_hash: geometryHash,
    imported_by: context.actorUserId || null
  };
}

function rowToFeature(row) {
  return {
    type: "Feature",
    properties: {
      ...(parseJson(row.properties_json) || {}),
      id: row.id,
      mission_id: row.mission_id,
      site_code: row.site_code,
      building_code: row.building_code,
      building_name: row.building_name,
      source: row.source,
      source_feature_id: row.source_feature_id,
      source_reference: row.source_reference,
      status: row.status
    },
    geometry: JSON.parse(row.geometry_geojson)
  };
}

function geometryBBox(geometry) {
  const coordinates = flattenCoordinates(geometry.coordinates);
  if (!coordinates.length) {
    return null;
  }
  return coordinates.reduce((bbox, coordinate) => {
    const lon = Number(coordinate[0]);
    const lat = Number(coordinate[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return bbox;
    }
    return {
      minLon: Math.min(bbox.minLon, lon),
      minLat: Math.min(bbox.minLat, lat),
      maxLon: Math.max(bbox.maxLon, lon),
      maxLat: Math.max(bbox.maxLat, lat)
    };
  }, {
    minLon: Number.POSITIVE_INFINITY,
    minLat: Number.POSITIVE_INFINITY,
    maxLon: Number.NEGATIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY
  });
}

function flattenCoordinates(coordinates) {
  if (!Array.isArray(coordinates)) {
    return [];
  }
  if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    return [coordinates];
  }
  return coordinates.flatMap(flattenCoordinates);
}

function osmFeatureId(properties) {
  if (properties.osm_type && properties.osm_id) {
    return `${properties.osm_type}/${properties.osm_id}`;
  }
  return "";
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
  const status = String(value || "imported").trim().toLowerCase();
  return VALID_STATUSES.has(status) ? status : "imported";
}

function normalizeIds(ids = []) {
  return (Array.isArray(ids) ? ids : [ids])
    .map((id) => Number(id))
    .filter((id, index, list) => Number.isInteger(id) && id > 0 && list.indexOf(id) === index);
}

function parseJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch (error) {
    return {};
  }
}

module.exports = BuildingFeatureV2;
