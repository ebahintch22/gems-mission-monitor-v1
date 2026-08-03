const { valueAtPath } = require("./koboPayloadMapper");

const COTE_IVOIRE_BOUNDS = {
  minLongitude: -8.5,
  maxLongitude: -2.5,
  minLatitude: 4,
  maxLatitude: 10.5
};

const RAW_BUILDING_ATTRIBUTE_FIELDS_V2 = [
  "batiment/num_bat",
  "batiment/bat_nom",
  "batiment/bat_statut",
  "batiment/est_principal",
  "batiment/bat_precaire",
  "batiment/bat_etages",
  "batiment/bat_nb_pieces",
  "batiment/bat_vocation",
  "batiment/bat_services",
  "batiment/bat_occupants",
  "batiment/coins_bat_manuel",
  "batiment/bat_elec",
  "batiment/lan"
];

function extractKoboGeometries(submission, config, options = {}) {
  const versionField = config.version_field || "__version__";
  const formVersion = valueAtPath(submission, versionField) || null;
  const strategyId = formVersion && config.strategies[formVersion]
    ? formVersion
    : config.fallback_strategy_id || "default";
  const strategy = config.strategies[strategyId] || config.strategies.default;
  const report = createQualityReport(strategyId, formVersion);

  const raccordementGeometry = extractSingleGeometry(submission, strategy.raccordement_geometry, report);
  addOperatorProperties(raccordementGeometry, extractRaccordementProperties(submission));

  const result = {
    source_submission_id: getSourceSubmissionId(submission),
    kobo_id: submission._id ?? null,
    form_version: formVersion,
    strategy_id: strategyId,
    site_description: extractSiteDescription(submission),
    site_geometry: extractSingleGeometry(submission, strategy.site_geometry, report),
    building_geometries: extractRepeatGeometries(submission, strategy.building_geometries, report, options),
    raccordement_geometry: raccordementGeometry,
    pylone_geometries: extractRepeatGeometries(submission, strategy.pylone_geometries, report, options),
    geometry_quality_report: report
  };

  report.status = report.errors.length > 0
    ? "error"
    : report.warnings.length > 0
      ? "warning"
      : "ok";

  return result;
}

function extractSiteDescription(submission) {
  return {
    official_name: firstValueAtPath(submission, ["modB/nom_officiel", "nom_officiel"]),
    region: firstValueAtPath(submission, ["modB/region", "region", "nom_region"]),
    locality: firstValueAtPath(submission, [
      "modB/localite",
      "modB/commune",
      "modB/quartier",
      "localite",
      "commune"
    ]),
    submitted_at: firstValueAtPath(submission, [
      "_submission_time",
      "_submitted_at",
      "submitted_at",
      "end",
      "start"
    ])
  };
}

function extractKoboGeometryBatch(payload, config, options = {}) {
  const submissions = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.response?.results)
      ? payload.response.results
      : Array.isArray(payload?.results)
        ? payload.results
        : [];

  return {
    schema_name: "g2m_kobo_geometry_extraction_output",
    schema_version: options.schemaVersion || "1.2.0",
    source_count: submissions.length,
    extracted_count: submissions.length,
    results: submissions.map((submission) => extractKoboGeometries(submission, config, options))
  };
}

function extractKoboGeometryBatchV2(payload, config) {
  return extractKoboGeometryBatch(payload, config, {
    includeRawBuildingAttributesV2: true,
    schemaVersion: "2.0.0"
  });
}

function extractSingleGeometry(source, section, report) {
  if (!section) {
    return null;
  }

  for (const candidate of sortedCandidates(section.source_priority)) {
    const rawValue = valueAtPath(source, candidate.field);
    const parsed = parseCandidate(rawValue, candidate);
    recordAttempt(report, section.output_property, candidate, rawValue, parsed);

    if (parsed.ok) {
      return buildOutput(candidate, rawValue, parsed);
    }
  }

  return null;
}

function extractRepeatGeometries(source, section, report, options = {}) {
  if (!section) {
    return [];
  }

  const rows = valueAtPath(source, section.repeat_path);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null && rows !== "") {
      report.warnings.push({
        code: "repeat_not_array",
        output_property: section.output_property,
        repeat_path: section.repeat_path
      });
    }
    return [];
  }

  return rows.map((row, index) => {
    const extracted = section.output_property === "building_geometries"
      ? extractBuildingGeometry(row, section, report, options)
      : extractSingleGeometry(row, section, report);
    if (!extracted) {
      report.warnings.push({
        code: "repeat_item_without_geometry",
        output_property: section.output_property,
        repeat_path: section.repeat_path,
        repeat_index: index
      });
      return null;
    }
    if (section.output_property === "pylone_geometries") {
      addOperatorProperties(extracted, extractPyloneProperties(row));
    }
    return {
      ...extracted,
      repeat_path: section.repeat_path,
      repeat_index: index
    };
  }).filter(Boolean);
}

function extractBuildingGeometry(row, section, report, options = {}) {
  let fallbackWithCentroid = null;
  const buildingProperties = extractBuildingProperties(row, options);

  for (const candidate of sortedCandidates(section.source_priority)) {
    const rawValue = valueAtPath(row, candidate.field);
    const parsed = parseCandidate(rawValue, candidate);
    recordAttempt(report, section.output_property, candidate, rawValue, parsed);

    if (parsed.ok) {
      const output = buildOutput(candidate, rawValue, parsed);
      output.properties = {
        ...(output.properties || {}),
        ...buildingProperties
      };
      addBuildingCentroid(output, parsed);
      return output;
    }

    const centroid = centroidFromParsedFailure(parsed);
    if (!fallbackWithCentroid && centroid) {
      fallbackWithCentroid = {
        source_field: candidate.field,
        parser: candidate.parser,
        role: candidate.role || null,
        raw_value: rawValue,
        requires_review: true,
        quality: {
          warnings: [
            ...(parsed.warnings || []),
            {
              code: "building_geometry_invalid_centroid_from_points",
              reason: parsed.reason || "invalid_geometry"
            }
          ]
        },
        properties: {
          ...buildingProperties,
          centroid_point: centroid
        }
      };
    }
  }

  return fallbackWithCentroid;
}

function extractBuildingProperties(row, options = {}) {
  const properties = {
    building_number: valueOrNull(valueAtPath(row, "batiment/num_bat")),
    building_name: valueOrNull(valueAtPath(row, "batiment/bat_nom")),
    building_status: valueOrNull(valueAtPath(row, "batiment/bat_statut")),
    building_vocation: valueOrNull(valueAtPath(row, "batiment/bat_vocation")),
    building_services: valueOrNull(valueAtPath(row, "batiment/bat_services")),
    building_lan: valueOrNull(valueAtPath(row, "batiment/lan")),
    building_cabling_feasibility: valueOrNull(valueAtPath(row, "batiment/faisab_cablage")),
    building_cable_trunking: valueOrNull(valueAtPath(row, "batiment/goulottes")),
    building_planned_wifi_count: valueOrNull(valueAtPath(row, "batiment/nb_wifi_prevu")),
    building_rack: valueOrNull(valueAtPath(row, "batiment/baie")),
    building_active_equipment: valueOrNull(valueAtPath(row, "batiment/equip_actifs")),
    building_equipment_detail: valueOrNull(valueAtPath(row, "batiment/equip_detail"))
  };

  if (options.includeRawBuildingAttributesV2) {
    RAW_BUILDING_ATTRIBUTE_FIELDS_V2.forEach((field) => {
      properties[field] = valueOrNull(valueAtPath(row, field));
    });
  }

  return properties;
}

function extractPyloneProperties(row) {
  return {
    operator_name: valueOrNull(firstValueAtPath(row, [
      "modE/pylone_rep/pylone_op",
      "pylone_op"
    ])),
    operator_source_field: "modE/pylone_rep/pylone_op"
  };
}

function extractRaccordementProperties(submission) {
  return {
    operator_name: valueOrNull(firstValueAtPath(submission, [
      "modH/prop_fibre",
      "prop_fibre"
    ])),
    operator_source_field: "modH/prop_fibre"
  };
}

function addOperatorProperties(output, properties) {
  if (!output || !properties.operator_name) {
    return;
  }
  output.properties = {
    ...(output.properties || {}),
    ...properties
  };
}

function parseCandidate(rawValue, candidate) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return { ok: false, reason: "empty_value" };
  }

  const parser = PARSERS[candidate.parser];
  if (!parser) {
    return { ok: false, reason: "unknown_parser" };
  }

  const parsed = parser(rawValue);
  if (!parsed.ok) {
    return parsed;
  }

  if (parsed.geometry) {
    const quality = validateGeometry(parsed.geometry);
    if (!quality.ok) {
      return {
        ok: false,
        reason: "invalid_geometry",
        warnings: parsed.warnings || [],
        errors: quality.errors,
        diagnostic_points: parsed.diagnostic_points || pointsFromGeometry(parsed.geometry)
      };
    }
    return {
      ...parsed,
      warnings: [...(parsed.warnings || []), ...quality.warnings]
    };
  }

  return parsed;
}

function parseKoboGeopointString(value) {
  const parts = String(value).trim().split(/\s+/).map(Number);
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
    return { ok: false, reason: "invalid_geopoint" };
  }

  const latitude = parts[0];
  const longitude = parts[1];
  const altitude = Number.isFinite(parts[2]) ? parts[2] : null;
  const precision = Number.isFinite(parts[3]) ? parts[3] : null;
  const warnings = [];
  const coordinates = normalizeGeoJsonPointCoordinates(longitude, latitude, warnings);

  return {
    ok: true,
    geometry: {
      type: "Point",
      coordinates
    },
    properties: {
      altitude,
      precision_m: precision
    },
    warnings
  };
}

function parseSemicolonCoordinateSequencePolygon(value) {
  const warnings = [];
  const coordinates = String(value)
    .split(";")
    .map((part) => parseLatLonPoint(part.trim(), warnings))
    .filter(Boolean);

  return buildPolygonResult(coordinates, warnings);
}

function parseWktPoint(value) {
  const match = String(value).trim().match(/^POINT\s*\(\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*\)$/i);
  if (!match) {
    return { ok: false, reason: "invalid_wkt_point" };
  }
  const warnings = [];
  const coordinates = normalizeGeoJsonPointCoordinates(Number(match[1]), Number(match[2]), warnings);
  return {
    ok: true,
    geometry: {
      type: "Point",
      coordinates
    },
    properties: {},
    warnings
  };
}

function parseWktPolygon(value) {
  const match = String(value).trim().match(/^POLYGON\s*\(\s*\((.+)\)\s*\)$/i);
  if (!match) {
    return { ok: false, reason: "invalid_wkt_polygon" };
  }

  const warnings = [];
  const coordinates = match[1]
    .split(",")
    .map((pair) => {
      const parts = pair.trim().split(/\s+/).map(Number);
      if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
        return null;
      }
      return normalizeGeoJsonPointCoordinates(parts[0], parts[1], warnings);
    })
    .filter(Boolean);

  return buildPolygonResult(coordinates, warnings);
}

function parseWktOrManualCoordinates(value) {
  const wktPoint = parseWktPoint(value);
  if (wktPoint.ok) {
    return wktPoint;
  }

  const wktPolygon = parseWktPolygon(value);
  if (wktPolygon.ok) {
    return wktPolygon;
  }

  const manual = parseManualCoordinates(value);
  if (!manual.ok) {
    return manual;
  }

  if (manual.coordinates.length === 1) {
    return {
      ok: true,
      geometry: {
        type: "Point",
        coordinates: manual.coordinates[0]
      },
      properties: {},
      warnings: manual.warnings
    };
  }

  return buildPolygonResult(manual.coordinates, manual.warnings);
}

function parseManualTextPolygon(value) {
  const wktPolygon = parseWktPolygon(value);
  if (wktPolygon.ok) {
    return wktPolygon;
  }

  const manual = parseManualCoordinates(value);
  if (!manual.ok) {
    return manual;
  }

  return buildPolygonResult(manual.coordinates, manual.warnings);
}

function parseManualBuildingPolygon(value) {
  const wktPoint = parseWktPoint(value);
  if (wktPoint.ok) {
    return {
      ...wktPoint,
      requires_review: true
    };
  }

  if (!looksLikeManualPolygonText(value)) {
    const semicolon = parseSemicolonCoordinateSequencePolygon(value);
    if (semicolon.ok) {
      return semicolon;
    }
  }

  const manualPolygon = parseManualTextPolygon(value);
  if (manualPolygon.ok) {
    return manualPolygon;
  }

  const manual = parseManualCoordinates(value);
  if (manual.ok && manual.coordinates.length === 1) {
    return {
      ok: true,
      geometry: {
        type: "Point",
        coordinates: manual.coordinates[0]
      },
      properties: {},
      warnings: manual.warnings,
      requires_review: true
    };
  }

  return manualPolygon;
}

function parseDecimalNumber(value) {
  const parsed = Number(String(value).replace(",", ".").trim());
  if (!Number.isFinite(parsed)) {
    return { ok: false, reason: "invalid_number" };
  }
  return {
    ok: true,
    value: parsed,
    properties: {}
  };
}

function parseManualCoordinates(value) {
  const warnings = [];
  const matches = String(value).match(/[+-]?\d+(?:\.\d+)?/g) || [];
  const numbers = matches.map(Number).filter(Number.isFinite);
  const coordinates = [];

  for (let index = 0; index + 1 < numbers.length; index += 2) {
    const pair = normalizeCoordinatePair(numbers[index], numbers[index + 1], warnings);
    if (pair) {
      coordinates.push(pair);
    }
  }

  if (coordinates.length === 0) {
    return { ok: false, reason: "no_coordinates_found" };
  }

  return { ok: true, coordinates, warnings };
}

function parseLatLonPoint(value, warnings = []) {
  const parts = String(value).trim().split(/\s+/).map(Number);
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
    return null;
  }
  return normalizeGeoJsonPointCoordinates(parts[1], parts[0], warnings);
}

function looksLikeManualPolygonText(value) {
  return /^\s*POLYGON\s*\(/i.test(String(value || ""));
}

function normalizeCoordinatePair(first, second, warnings) {
  if (isLatitude(first) && isLongitude(second)) {
    return normalizeGeoJsonPointCoordinates(second, first, warnings);
  }

  if (isLongitude(first) && isLatitude(second)) {
    return normalizeGeoJsonPointCoordinates(first, second, warnings);
  }

  if (isLatitude(first) && isUnsignedWestLongitude(second)) {
    warnings.push({ code: "longitude_west_sign_inferred", original_longitude: second });
    return normalizeGeoJsonPointCoordinates(-Math.abs(second), first, warnings);
  }

  return null;
}

function normalizeGeoJsonPointCoordinates(longitude, latitude, warnings = []) {
  const lon = Number(longitude);
  const lat = Number(latitude);

  // FIX: Coordinate inversion detection
  if (isStrictLatitude(lon) && isStrictLongitude(lat)) {
    const corrected = [lat, lon];
    warnings.push({
      code: "coordinate_lat_lon_inversion_corrected",
      old_longitude: lon,
      old_latitude: lat,
      corrected_longitude: corrected[0],
      corrected_latitude: corrected[1]
    });
    return corrected;
  }

  return [lon, lat];
}

function buildPolygonResult(coordinates, warnings) {
  const ring = closeRing(coordinates);
  const distinctVertices = countDistinctVertices(ring);

  if (distinctVertices < 3) {
    return {
      ok: false,
      reason: "polygon_requires_three_distinct_vertices",
      warnings,
      diagnostic_points: coordinates
    };
  }

  return {
    ok: true,
    geometry: {
      type: "Polygon",
      coordinates: [ring]
    },
    properties: {},
    diagnostic_points: coordinates,
    warnings
  };
}

function buildOutput(candidate, rawValue, parsed) {
  const output = {
    source_field: candidate.field,
    parser: candidate.parser,
    role: candidate.role || null,
    raw_value: rawValue,
    requires_review: Boolean(candidate.requires_review || parsed.requires_review),
    quality: {
      warnings: parsed.warnings || []
    }
  };

  if (parsed.geometry) {
    output.geometry = parsed.geometry;
  }

  if (Object.prototype.hasOwnProperty.call(parsed, "value")) {
    output.value = parsed.value;
    output.value_type = candidate.value_type || typeof parsed.value;
  }

  if (parsed.properties && Object.keys(parsed.properties).length > 0) {
    output.properties = parsed.properties;
  }

  return output;
}

function addBuildingCentroid(output, parsed) {
  const centroid = centroidFromGeometry(parsed.geometry) || centroidFromPoints(parsed.diagnostic_points || []);
  if (!centroid) {
    return;
  }

  output.properties = output.properties || {};
  output.properties.centroid_point = centroid;
}

function centroidFromParsedFailure(parsed) {
  return centroidFromPoints(parsed.diagnostic_points || []);
}

function centroidFromGeometry(geometry) {
  if (!geometry) {
    return null;
  }

  if (geometry.type === "Point") {
    return {
      type: "Point",
      coordinates: [...geometry.coordinates]
    };
  }

  if (geometry.type === "Polygon") {
    const ring = geometry.coordinates?.[0] || [];
    const centroidCoordinates = polygonCentroid(ring) || centroidCoordinatesFromPoints(ring);
    return centroidCoordinates
      ? { type: "Point", coordinates: centroidCoordinates }
      : null;
  }

  return null;
}

function polygonCentroid(ring) {
  if (!Array.isArray(ring) || ring.length < 4) {
    return null;
  }

  let areaFactor = 0;
  let centroidX = 0;
  let centroidY = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    const cross = current[0] * next[1] - next[0] * current[1];
    areaFactor += cross;
    centroidX += (current[0] + next[0]) * cross;
    centroidY += (current[1] + next[1]) * cross;
  }

  if (areaFactor === 0) {
    return null;
  }

  return [
    centroidX / (3 * areaFactor),
    centroidY / (3 * areaFactor)
  ];
}

function centroidFromPoints(points) {
  const coordinates = centroidCoordinatesFromPoints(points);
  return coordinates
    ? {
        type: "Point",
        coordinates
      }
    : null;
}

function centroidCoordinatesFromPoints(points) {
  const coordinates = (points || []).filter((point) => (
    Array.isArray(point)
    && Number.isFinite(point[0])
    && Number.isFinite(point[1])
  ));

  if (coordinates.length === 0) {
    return null;
  }

  const uniqueCoordinates = [...new Map(coordinates.map((point) => [`${point[0]},${point[1]}`, point])).values()];
  const total = uniqueCoordinates.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
  return [
    total[0] / uniqueCoordinates.length,
    total[1] / uniqueCoordinates.length
  ];
}

function pointsFromGeometry(geometry) {
  if (!geometry) {
    return [];
  }

  if (geometry.type === "Point") {
    return [geometry.coordinates];
  }

  if (geometry.type === "Polygon") {
    return geometry.coordinates?.[0] || [];
  }

  return [];
}

function recordAttempt(report, outputProperty, candidate, rawValue, parsed) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return;
  }

  const entry = {
    output_property: outputProperty,
    source_field: candidate.field,
    parser: candidate.parser,
    ok: parsed.ok
  };

  if (!parsed.ok) {
    entry.reason = parsed.reason;
    if (parsed.errors) {
      entry.errors = parsed.errors;
    }
    report.warnings.push(entry);
  } else {
    report.selected_sources.push(entry);
  }
}

function validateGeometry(geometry) {
  if (geometry.type === "Point") {
    return validatePoint(geometry.coordinates);
  }

  if (geometry.type === "Polygon") {
    const errors = [];
    const warnings = [];
    const ring = geometry.coordinates?.[0] || [];
    ring.forEach((point) => {
      const pointQuality = validatePoint(point);
      errors.push(...pointQuality.errors);
      warnings.push(...pointQuality.warnings);
    });

    if (countDistinctVertices(ring) < 3) {
      errors.push("polygon_requires_three_distinct_vertices");
    }

    if (Math.abs(signedRingArea(ring)) === 0) {
      errors.push("zero_area_polygon");
    }

    return {
      ok: errors.length === 0,
      errors: [...new Set(errors)],
      warnings: [...new Set(warnings)]
    };
  }

  return { ok: false, errors: ["unsupported_geometry_type"], warnings: [] };
}

function validatePoint(point) {
  const longitude = point?.[0];
  const latitude = point?.[1];
  const errors = [];

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    errors.push("coordinate_not_numeric");
  } else if (!isInCoteIvoireBounds(longitude, latitude)) {
    errors.push("coordinate_outside_cote_ivoire_bounds");
  }

  return { ok: errors.length === 0, errors, warnings: [] };
}

function closeRing(coordinates) {
  if (coordinates.length === 0) {
    return coordinates;
  }

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    return coordinates;
  }

  return [...coordinates, [...first]];
}

function countDistinctVertices(ring) {
  return new Set(ring.map((point) => `${point[0]},${point[1]}`)).size;
}

function signedRingArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
}

function sortedCandidates(candidates = []) {
  return [...candidates].sort((left, right) => (left.priority || 999) - (right.priority || 999));
}

function createQualityReport(strategyId, formVersion) {
  return {
    status: "ok",
    strategy_id: strategyId,
    form_version: formVersion,
    selected_sources: [],
    warnings: [],
    errors: []
  };
}

function getSourceSubmissionId(submission) {
  return submission._uuid || submission.uuid || submission._id || null;
}

function firstValueAtPath(source, paths) {
  for (const fieldPath of paths) {
    const value = valueAtPath(source, fieldPath);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

function valueOrNull(value) {
  return value === undefined || value === "" ? null : value;
}

function isLatitude(value) {
  return Number.isFinite(value) && value >= COTE_IVOIRE_BOUNDS.minLatitude && value <= COTE_IVOIRE_BOUNDS.maxLatitude;
}

function isLongitude(value) {
  return Number.isFinite(value) && value >= COTE_IVOIRE_BOUNDS.minLongitude && value <= COTE_IVOIRE_BOUNDS.maxLongitude;
}

function isUnsignedWestLongitude(value) {
  return Number.isFinite(value)
    && value >= Math.abs(COTE_IVOIRE_BOUNDS.maxLongitude)
    && value <= Math.abs(COTE_IVOIRE_BOUNDS.minLongitude);
}

function isStrictLatitude(value) {
  return Number.isFinite(value)
    && value > COTE_IVOIRE_BOUNDS.minLatitude
    && value < COTE_IVOIRE_BOUNDS.maxLatitude;
}

function isStrictLongitude(value) {
  return Number.isFinite(value)
    && value > COTE_IVOIRE_BOUNDS.minLongitude
    && value < COTE_IVOIRE_BOUNDS.maxLongitude;
}

function isInCoteIvoireBounds(longitude, latitude) {
  return longitude >= COTE_IVOIRE_BOUNDS.minLongitude
    && longitude <= COTE_IVOIRE_BOUNDS.maxLongitude
    && latitude >= COTE_IVOIRE_BOUNDS.minLatitude
    && latitude <= COTE_IVOIRE_BOUNDS.maxLatitude;
}

const PARSERS = {
  parse_kobo_geopoint_string: parseKoboGeopointString,
  parse_semicolon_coordinate_sequence_polygon: parseSemicolonCoordinateSequencePolygon,
  parse_wkt_point: parseWktPoint,
  parse_wkt_or_manual_coordinates: parseWktOrManualCoordinates,
  parse_manual_text_polygon: parseManualTextPolygon,
  parse_manual_building_polygon: parseManualBuildingPolygon,
  parse_decimal_number: parseDecimalNumber
};

module.exports = {
  COTE_IVOIRE_BOUNDS,
  extractKoboGeometries,
  extractKoboGeometryBatch,
  extractKoboGeometryBatchV2,
  parseDecimalNumber,
  parseKoboGeopointString,
  parseManualTextPolygon,
  parseSemicolonCoordinateSequencePolygon,
  parseWktOrManualCoordinates,
  parseWktPoint
};
