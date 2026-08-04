const crypto = require("node:crypto");
const db = require("../config/database");

const ENTITY_TYPES = {
  site_contour: new Set(["Polygon", "MultiPolygon"]),
  building_extent: new Set(["Polygon", "MultiPolygon"]),
  network_point: new Set(["Point"])
};

class SpatialReferenceFeature {
  static importFeatureCollection(entityType, featureCollection, options = {}) {
    assertEntityType(entityType);
    const features = normalizeFeatureCollection(featureCollection);
    const rows = features.map((feature, index) => normalizeFeature(entityType, feature, {
      index,
      sourcePath: options.sourcePath || ""
    }));
    const replaceType = Boolean(options.replaceType);

    const deleteType = db.prepare("DELETE FROM spatial_reference_features WHERE entity_type = ?");
    const insert = db.prepare(`
      INSERT INTO spatial_reference_features (
        entity_type, site_code, kobo_id, source_feature_id,
        geometry_type, geometry_geojson, properties_json, geometry_hash,
        source_path, imported_at, updated_at
      ) VALUES (
        @entity_type, @site_code, @kobo_id, @source_feature_id,
        @geometry_type, @geometry_geojson, @properties_json, @geometry_hash,
        @source_path, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT(entity_type, site_code, kobo_id, geometry_hash) DO UPDATE SET
        source_feature_id = excluded.source_feature_id,
        geometry_type = excluded.geometry_type,
        geometry_geojson = excluded.geometry_geojson,
        properties_json = excluded.properties_json,
        source_path = excluded.source_path,
        imported_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `);

    return db.transaction(() => {
      const deleted = replaceType ? deleteType.run(entityType).changes : 0;
      let saved = 0;
      rows.forEach((row) => {
        saved += insert.run(row).changes;
      });
      return {
        entity_type: entityType,
        read: features.length,
        saved,
        replaced: deleted
      };
    })();
  }

  static importReferenceLayers(layers = {}, options = {}) {
    const entries = [
      ["site_contour", layers.siteContours || layers.site_contour],
      ["building_extent", layers.buildingExtents || layers.building_extent],
      ["network_point", layers.networkPoints || layers.network_point]
    ].filter(([, collection]) => collection);

    return entries.map(([entityType, collection]) => this.importFeatureCollection(entityType, collection, {
      replaceType: options.replaceType !== false,
      sourcePath: options.sourcePaths?.[entityType] || ""
    }));
  }

  static collectionsForSite(input = {}) {
    const filters = normalizeSiteFilters(input);
    if (!filters.siteCode && !filters.koboId) {
      throw new Error("site_reference_identifier_required");
    }

    const siteCode = filters.siteCode || resolveSiteCodeFromKoboId(filters.koboId);
    const koboId = filters.koboId || resolveKoboIdFromSiteCode(siteCode);
    const collections = {
      site_contours: collectionForType("site_contour", { siteCode, koboId }),
      building_extents: collectionForType("building_extent", { siteCode, koboId }),
      network_points: collectionForType("network_point", { siteCode, koboId })
    };

    return {
      identifiers: {
        site_code: siteCode || null,
        kobo_id: koboId || null
      },
      counts: {
        site_contours: collections.site_contours.features.length,
        building_extents: collections.building_extents.features.length,
        network_points: collections.network_points.features.length
      },
      ...collections
    };
  }
}

function assertEntityType(entityType) {
  if (!ENTITY_TYPES[entityType]) {
    throw new Error("unsupported_spatial_reference_entity_type");
  }
}

function normalizeFeatureCollection(input) {
  const geojson = typeof input === "string" ? JSON.parse(input) : input;
  if (!geojson || typeof geojson !== "object") {
    throw new Error("invalid_geojson");
  }
  if (geojson.type === "Feature") {
    return [geojson];
  }
  if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    throw new Error("invalid_geojson_feature_collection");
  }
  return geojson.features;
}

function normalizeFeature(entityType, feature, context) {
  if (!feature || feature.type !== "Feature" || !feature.geometry) {
    throw new Error(`invalid_spatial_feature:${context.index + 1}`);
  }
  if (!ENTITY_TYPES[entityType].has(feature.geometry.type)) {
    throw new Error(`invalid_${entityType}_geometry:${feature.geometry.type}`);
  }

  const properties = feature.properties && typeof feature.properties === "object" ? feature.properties : {};
  const siteCode = normalizedText(firstValue(properties, ["site_code", "SITE_CODE", "code", "CODE"]));
  const koboId = normalizedText(firstValue(properties, ["kobo_id", "Kobo_id", "KOBO_ID", "_id", "id_kobo"]));
  if ((entityType === "site_contour" || entityType === "building_extent") && !siteCode) {
    throw new Error(`${entityType}_site_code_required:${context.index + 1}`);
  }
  if (entityType === "network_point" && !koboId) {
    throw new Error(`network_point_kobo_id_required:${context.index + 1}`);
  }

  const geometryGeojson = JSON.stringify(feature.geometry);
  return {
    entity_type: entityType,
    site_code: siteCode || null,
    kobo_id: koboId || null,
    source_feature_id: normalizedText(firstValue(properties, [
      "source_feature_id",
      "feature_id",
      "id",
      "ID",
      "fid",
      "FID"
    ])) || null,
    geometry_type: feature.geometry.type,
    geometry_geojson: geometryGeojson,
    properties_json: JSON.stringify(properties),
    geometry_hash: crypto.createHash("sha256").update(geometryGeojson).digest("hex"),
    source_path: context.sourcePath || null
  };
}

function collectionForType(entityType, filters = {}) {
  const clauses = ["entity_type = @entity_type"];
  const params = { entity_type: entityType };
  if (filters.koboId) {
    clauses.push("kobo_id = @kobo_id");
    params.kobo_id = filters.koboId;
  } else if (filters.siteCode) {
    clauses.push("site_code = @site_code");
    params.site_code = filters.siteCode;
  }

  const rows = db.prepare(`
    SELECT *
    FROM spatial_reference_features
    WHERE ${clauses.join(" AND ")}
    ORDER BY id ASC
  `).all(params);

  return {
    type: "FeatureCollection",
    features: rows.map(rowToFeature)
  };
}

function rowToFeature(row) {
  return {
    type: "Feature",
    properties: {
      ...(parseJson(row.properties_json) || {}),
      reference_feature_id: row.id,
      entity_type: row.entity_type,
      site_code: row.site_code,
      kobo_id: row.kobo_id,
      source_feature_id: row.source_feature_id
    },
    geometry: JSON.parse(row.geometry_geojson)
  };
}

function normalizeSiteFilters(input = {}) {
  return {
    siteCode: normalizedText(input.site_code || input.siteCode || input.code),
    koboId: normalizedText(input.kobo_id || input.koboId || input.submission_id || input.submissionId)
  };
}

function resolveSiteCodeFromKoboId(koboId) {
  if (!koboId) {
    return "";
  }
  const spatialRow = db.prepare(`
    SELECT site_code
    FROM spatial_reference_features
    WHERE kobo_id = @kobo_id
      AND site_code IS NOT NULL
      AND site_code <> ''
    ORDER BY
      CASE entity_type
        WHEN 'site_contour' THEN 1
        WHEN 'building_extent' THEN 2
        ELSE 3
      END,
      id ASC
    LIMIT 1
  `).get({ kobo_id: koboId });
  if (spatialRow?.site_code) {
    return normalizedText(spatialRow.site_code);
  }

  const row = db.prepare(`
    SELECT raw_data_json
    FROM soumissions_collecte
    WHERE source_submission_id = @kobo_id
       OR CAST(id AS TEXT) = @kobo_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get({ kobo_id: koboId });
  const raw = parseJson(row?.raw_data_json);
  return normalizedText(firstValue(raw, ["site_code", "SITE_CODE", "modA/fiche_id", "modA.fiche_id"]))
    || resolveSiteCodeFromNetworkPointProperties(koboId);
}

function resolveKoboIdFromSiteCode(siteCode) {
  if (!siteCode) {
    return "";
  }
  const spatialRow = db.prepare(`
    SELECT kobo_id
    FROM spatial_reference_features
    WHERE site_code = @site_code
      AND kobo_id IS NOT NULL
      AND kobo_id <> ''
    ORDER BY id ASC
    LIMIT 1
  `).get({ site_code: siteCode });
  if (spatialRow?.kobo_id) {
    return normalizedText(spatialRow.kobo_id);
  }

  const row = db.prepare(`
    SELECT source_submission_id
    FROM soumissions_collecte
    WHERE raw_data_json LIKE @needle
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get({ needle: `%${siteCode}%` });
  return normalizedText(row?.source_submission_id);
}

function resolveSiteCodeFromNetworkPointProperties(koboId) {
  const networkRows = db.prepare(`
    SELECT properties_json
    FROM spatial_reference_features
    WHERE entity_type = 'network_point'
      AND kobo_id = @kobo_id
  `).all({ kobo_id: koboId });
  const networkHints = networkRows
    .map((row) => parseJson(row.properties_json))
    .map((props) => ({
      siteName: normalizedSearchText(firstValue(props, ["site_name", "nom_officiel", "modB/nom_officiel", "modB.nom_officiel"])),
      locality: normalizedSearchText(firstValue(props, ["localite", "locality", "modB/commune", "modB.commune"]))
    }))
    .filter((hint) => hint.siteName);
  if (!networkHints.length) {
    return "";
  }

  const siteRows = db.prepare(`
    SELECT site_code, properties_json
    FROM spatial_reference_features
    WHERE entity_type = 'site_contour'
      AND site_code IS NOT NULL
      AND site_code <> ''
  `).all();

  let best = { siteCode: "", score: 0 };
  for (const hint of networkHints) {
    for (const row of siteRows) {
      const props = parseJson(row.properties_json);
      const candidateName = normalizedSearchText(firstValue(props, ["site_name", "nom_officiel", "name"]));
      const candidateLocality = normalizedSearchText(firstValue(props, ["localite", "locality"]));
      const score = siteNameMatchScore(hint, { siteName: candidateName, locality: candidateLocality });
      if (score > best.score) {
        best = { siteCode: row.site_code, score };
      }
    }
  }

  return best.score >= 0.62 ? normalizedText(best.siteCode) : "";
}

function siteNameMatchScore(source, candidate) {
  if (!source.siteName || !candidate.siteName) {
    return 0;
  }
  const localityMatches = source.locality && candidate.locality && source.locality === candidate.locality;
  const sourceTokens = meaningfulTokens(source.siteName);
  const candidateTokens = meaningfulTokens(candidate.siteName);
  if (!sourceTokens.size || !candidateTokens.size) {
    return 0;
  }
  const intersection = [...sourceTokens].filter((token) => candidateTokens.has(token)).length;
  const union = new Set([...sourceTokens, ...candidateTokens]).size;
  const tokenScore = union ? intersection / union : 0;
  const containmentBoost = source.siteName.includes(candidate.siteName) || candidate.siteName.includes(source.siteName) ? 0.15 : 0;
  const localityBoost = localityMatches ? 0.12 : 0;
  const localityPenalty = source.locality && candidate.locality && !localityMatches ? 0.2 : 0;
  return tokenScore + containmentBoost + localityBoost - localityPenalty;
}

function meaningfulTokens(value) {
  const ignored = new Set(["de", "du", "des", "d", "la", "le", "les", "et", "public", "publique"]);
  return new Set(String(value || "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !ignored.has(token)));
}

function normalizedSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstValue(properties, keys) {
  for (const key of keys) {
    const slashValue = properties?.[key];
    if (slashValue !== undefined && slashValue !== null && String(slashValue).trim() !== "") {
      return slashValue;
    }
    if (key.includes(".")) {
      const nested = key.split(".").reduce((cursor, part) => cursor?.[part], properties);
      if (nested !== undefined && nested !== null && String(nested).trim() !== "") {
        return nested;
      }
    }
  }
  return "";
}

function normalizedText(value) {
  return String(value || "").trim();
}

function parseJson(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch (error) {
    return {};
  }
}

module.exports = SpatialReferenceFeature;
