const template = require("../config/submission-templates/padci-site.template");
const { DEFAULT_FORM_ID, loadChoiceList, loadMapping } = require("./formMappingService");
const { buildMediaGallery } = require("./kobo-media.service");
const { parseGeometry } = require("./geometry.service");
const { buildSubmissionQualityAlerts } = require("./submission-quality.service");
const KoboMediaAttachment = require("../models/KoboMediaAttachment");
const SpatialReferenceFeature = require("../models/SpatialReferenceFeature");

const MISSING_VALUE = "Non renseigne";

function buildInteractiveSubmissionView(record, options = {}) {
  const config = options.template || template;
  const rawData = parseRawData(record.raw_data_json);
  const context = { ...record, ...rawData, raw: rawData };
  const choiceIndex = buildChoiceIndex(config.formId || DEFAULT_FORM_ID);
  const spatialReference = buildSpatialReference(rawData, record, options);
  const computed = buildComputedValues(rawData, spatialReference);
  const header = buildHeader(config, context, choiceIndex);
  const sections = (config.sections || []).map((section) => buildSection(section, context, choiceIndex, computed));
  enrichBuildingSectionFromSpatialReference(sections, spatialReference, choiceIndex);
  const wasabiMedia = buildWasabiMediaReference(rawData, record, options);
  const mediaGallery = buildMediaGallery(rawData, config.media, { wasabiMedia });
  const map = buildMapPayload(rawData, record, sections, spatialReference);
  const qualityAlerts = buildSubmissionQualityAlerts({ rawData, sections, mediaGallery, spatialReference });

  return {
    id: config.id,
    title: header.title,
    subtitle: header.subtitle,
    record,
    rawData,
    header,
    kpis: (config.kpis || []).map((field) => buildField(field, context, choiceIndex, computed)),
    sections,
    mediaGallery,
    wasabiMedia,
    map,
    spatialReference,
    qualityAlerts,
    technical: buildTechnicalData(rawData, record)
  };
}

function buildWasabiMediaReference(rawData, record, options = {}) {
  const provider = options.koboMediaAttachmentProvider || KoboMediaAttachment;
  if (!provider?.listForSubmission) {
    return [];
  }
  try {
    return provider.listForSubmission({
      kobo_asset_uid: record.kobo_asset_uid,
      source_submission_id: record.source_submission_id || readValue(rawData, "_id") || readValue(rawData, "_uuid"),
      submission_id: record.id
    });
  } catch {
    return [];
  }
}

function buildHeader(config, context, choiceIndex) {
  const header = config.header || {};
  return {
    title: displayValue(readValue(context, header.title)) || "Soumission sans nom",
    subtitle: displayValue(readValue(context, header.subtitle)) || context.display_submission_id || context.source_submission_id || "",
    status: formatFieldValue(readValue(context, header.status || "statut_validation"), { type: "status" }, choiceIndex),
    badges: (header.badges || []).map((badge) => buildField(badge, context, choiceIndex))
  };
}

function buildSection(section, context, choiceIndex, computed) {
  if (section.type === "repeat") {
    return {
      ...baseSection(section),
      type: "repeat",
      items: buildRepeatItems(section, context, choiceIndex)
    };
  }
  return {
    ...baseSection(section),
    type: section.type || "fields",
    fields: (section.fields || []).map((field) => buildField(field, context, choiceIndex, computed)),
    repeats: (section.repeats || []).map((repeat) => ({
      ...baseSection(repeat),
      type: "repeat",
      items: buildRepeatItems(repeat, context, choiceIndex)
    }))
  };
}

function baseSection(section) {
  return {
    id: section.id,
    title: section.title,
    icon: section.icon || "fa-circle-info"
  };
}

function buildRepeatItems(section, context, choiceIndex) {
  return readFirstArray(context, section.source).map((item, index) => ({
    id: `${section.id}-${index + 1}`,
    index: index + 1,
    title: repeatTitle(section, item, index),
    fields: (section.fields || []).map((field) => buildField(field, item, choiceIndex)),
    nestedRepeats: (section.nestedRepeats || []).map((nested) => ({
      ...baseSection(nested),
      type: "repeat",
      items: buildRepeatItems(nested, item, choiceIndex)
    }))
  }));
}

function enrichBuildingSectionFromSpatialReference(sections, spatialReference, choiceIndex) {
  const buildingSection = sections.find((section) => section.id === "buildings");
  const spatialBuildings = spatialReference.building_extents?.features || [];
  if (!buildingSection?.items?.length || !spatialBuildings.length) {
    return;
  }
  const spatialByNumber = new Map();
  spatialBuildings.forEach((feature) => {
    const props = feature.properties || {};
    const number = normalizedText(props.bat_num || props.numbatmap || props.numbatkobo);
    if (number && !spatialByNumber.has(number)) {
      spatialByNumber.set(number, feature);
    }
  });

  buildingSection.items.forEach((item) => {
    const number = normalizedText(readValueFromFields(item.fields, "Numero"));
    const spatialFeature = spatialByNumber.get(number);
    if (!spatialFeature) {
      return;
    }
    const area = spatialFeature.properties?.superficie;
    setMissingFieldValue(item.fields, "Surface au sol", area, { type: "area" }, choiceIndex);
    setMissingFieldValue(item.fields, "Geometrie", spatialFeature.geometry?.type, { type: "text" }, choiceIndex);
  });
}

function readValueFromFields(fields, label) {
  return (fields || []).find((field) => field.label === label)?.rawValue;
}

function setMissingFieldValue(fields, label, value, fieldConfig, choiceIndex) {
  const field = (fields || []).find((candidate) => candidate.label === label);
  if (!field || isMissing(value) || !isMissing(field.rawValue)) {
    return;
  }
  field.rawValue = value;
  field.value = formatFieldValue(value, fieldConfig, choiceIndex);
  field.html = formatFieldHtml(value, fieldConfig, choiceIndex);
}

function repeatTitle(section, item, index) {
  const number = displayValue(readValue(item, section.itemNumber));
  const title = displayValue(readValue(item, section.itemTitle));
  return [number && `No ${number}`, title].filter(Boolean).join(" - ") || `${section.title} ${index + 1}`;
}

function buildField(field, context, choiceIndex, computed = {}) {
  const sourceValue = readValue(context, field.key || field.path);
  const fallbackValue = field.fallbackComputed ? computed[field.fallbackComputed] : undefined;
  const shouldUseFallback = field.fallbackComputed
    && fallbackValue !== undefined
    && (field.fallbackWhenZero ? isMissing(sourceValue) || Number(sourceValue) === 0 : true);
  const rawValue = shouldUseFallback ? fallbackValue : sourceValue;
  return {
    key: field.key || field.path || "",
    label: field.label,
    type: field.type || "text",
    rawValue,
    value: formatFieldValue(rawValue, field, choiceIndex),
    html: formatFieldHtml(rawValue, field, choiceIndex)
  };
}

function formatFieldValue(value, field = {}, choiceIndex = {}) {
  if (isMissing(value)) {
    return MISSING_VALUE;
  }
  switch (field.type || "text") {
    case "integer":
      return formatNumber(value, 0);
    case "number":
    case "decimal":
      return formatNumber(value, 2);
    case "distance":
      return formatDistance(value);
    case "area":
      return formatArea(value);
    case "currency":
      return `${formatNumber(value, 0)} FCFA`;
    case "boolean":
      return formatBoolean(value);
    case "choice":
    case "status":
      return formatChoice(value, field, choiceIndex);
    case "multiChoice":
      return splitChoices(value).map((entry) => formatChoice(entry, field, choiceIndex)).join(", ") || MISSING_VALUE;
    case "date":
      return formatDate(value, false);
    case "datetime":
      return formatDate(value, true);
    case "gps":
    case "wktPoint":
    case "wktPolygon":
      return formatGeometry(value, field.type);
    case "raw":
      return JSON.stringify(value);
    default:
      return Array.isArray(value) ? value.join(", ") : String(value);
  }
}

function formatFieldHtml(value, field = {}, choiceIndex = {}) {
  if (isMissing(value)) {
    return `<span class="submission-empty">${MISSING_VALUE}</span>`;
  }
  if (field.type === "phone") {
    const phone = String(value).trim();
    return `<a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a>`;
  }
  if (field.type === "email") {
    const email = String(value).trim();
    return `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`;
  }
  if (field.type === "boolean") {
    const label = formatBoolean(value);
    const className = label === "Oui" ? "is-yes" : label === "Non" ? "is-no" : "is-neutral";
    return `<span class="submission-badge ${className}">${escapeHtml(label)}</span>`;
  }
  if (field.type === "multiChoice") {
    const badges = splitChoices(value).map((entry) => `<span class="submission-badge">${escapeHtml(formatChoice(entry, field, choiceIndex))}</span>`);
    return badges.length ? badges.join(" ") : `<span class="submission-empty">${MISSING_VALUE}</span>`;
  }
  if (field.type === "status" || field.type === "choice") {
    return `<span class="submission-badge">${escapeHtml(formatChoice(value, field, choiceIndex))}</span>`;
  }
  if (field.type === "longText") {
    return `<p>${escapeHtml(String(value))}</p>`;
  }
  return escapeHtml(formatFieldValue(value, field, choiceIndex));
}

function buildMapPayload(rawData, record, sections, spatialReference = emptySpatialReference()) {
  const features = [];
  addPointFeature(features, "Point GPS", record.latitude, record.longitude, { kind: "site" });
  addParsedFeature(features, "Centre du site", readValue(rawData, "modA/gps_centre"), "gps", { kind: "site-center" });
  addParsedFeature(features, "Point manuel", readValue(rawData, "modA/gps_manuel"), "gps", { kind: "manual" });
  addParsedFeature(features, "Emprise site", readValue(rawData, "modB/emprise_site"), "wktPolygon", { kind: "site-polygon" });
  addParsedFeature(features, "Point raccordement", readValue(rawData, "modH/gps_raccord"), "gps", { kind: "fiber" });
  addReferenceFeatures(features, spatialReference.site_contours, { kind: "site-polygon", source: "spatial-reference" });
  addReferenceFeatures(features, spatialReference.building_extents, { kind: "building", source: "spatial-reference" });
  addReferenceFeatures(features, spatialReference.network_points, { kind: "network", source: "spatial-reference" });
  const buildingSection = sections.find((section) => section.id === "buildings");
  (buildingSection?.items || []).forEach((item) => {
    const geometryField = item.fields.find((field) => field.type === "wktPolygon");
    addParsedFeature(features, item.title, geometryField?.rawValue, "wktPolygon", { kind: "building", itemId: item.id });
  });
  return { type: "FeatureCollection", features };
}

function buildSpatialReference(rawData, record, options = {}) {
  const provider = options.spatialReferenceProvider || SpatialReferenceFeature;
  const identifiers = {
    kobo_id: normalizedText(readValue(rawData, "_id") || record.source_submission_id || record.id),
    site_code: normalizedText(readValue(rawData, "site_code") || readValue(rawData, "modA/fiche_id"))
  };
  if (!provider?.collectionsForSite || (!identifiers.kobo_id && !identifiers.site_code)) {
    return emptySpatialReference();
  }
  try {
    return provider.collectionsForSite(identifiers);
  } catch {
    return emptySpatialReference();
  }
}

function addReferenceFeatures(features, collection, defaults) {
  (collection?.features || []).forEach((feature, index) => {
    if (!feature?.geometry) {
      return;
    }
    features.push({
      type: "Feature",
      properties: {
        label: referenceFeatureLabel(feature, defaults.kind, index),
        ...(feature.properties || {}),
        ...defaults
      },
      geometry: feature.geometry
    });
  });
}

function referenceFeatureLabel(feature, kind, index) {
  const props = feature.properties || {};
  if (kind === "building") {
    return `Batiment ${props.bat_num || props.numbatmap || props.geolink || index + 1}`;
  }
  if (kind === "network") {
    return props.nature_point || props.nom_officiel || `Noeud reseau ${index + 1}`;
  }
  return props.site_name || props.nom_officiel || `Contour site ${index + 1}`;
}

function addParsedFeature(features, label, value, type, properties) {
  const parsed = parseGeometry(value, type);
  if (!parsed.ok) {
    return;
  }
  features.push({
    type: "Feature",
    properties: { label, ...properties },
    geometry: parsed.geojson
  });
}

function addPointFeature(features, label, latitude, longitude, properties) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return;
  }
  features.push({
    type: "Feature",
    properties: { label, ...properties },
    geometry: { type: "Point", coordinates: [lon, lat] }
  });
}

function buildComputedValues(rawData, spatialReference = emptySpatialReference()) {
  return {
    buildingCount: readFirstArray(rawData, ["batiment", "batiment/batiment"]).length,
    siteArea: computeSiteArea(rawData, spatialReference)
  };
}

function computeSiteArea(rawData, spatialReference) {
  const koboArea = positiveNumber(readValue(rawData, "modB/superficie"));
  if (koboArea) {
    return koboArea;
  }
  const contourArea = firstPositivePropertyArea(spatialReference.site_contours?.features);
  if (contourArea) {
    return contourArea;
  }
  const buildingArea = sumPositivePropertyAreas(spatialReference.building_extents?.features);
  if (buildingArea) {
    return buildingArea;
  }
  return firstComputedGeometryArea(spatialReference.site_contours?.features);
}

function firstPositivePropertyArea(features = []) {
  for (const feature of features) {
    const area = positiveNumber(feature?.properties?.superficie);
    if (area) {
      return area;
    }
  }
  return undefined;
}

function sumPositivePropertyAreas(features = []) {
  const total = features.reduce((sum, feature) => sum + (positiveNumber(feature?.properties?.superficie) || 0), 0);
  return total > 0 ? total : undefined;
}

function firstComputedGeometryArea(features = []) {
  for (const feature of features) {
    const area = geometryAreaSquareMeters(feature?.geometry);
    if (area > 0) {
      return area;
    }
  }
  return undefined;
}

function geometryAreaSquareMeters(geometry) {
  if (!geometry) {
    return 0;
  }
  if (geometry.type === "Polygon") {
    return polygonAreaSquareMeters(geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates || []).reduce((sum, polygon) => sum + polygonAreaSquareMeters(polygon), 0);
  }
  return 0;
}

function polygonAreaSquareMeters(rings = []) {
  const outerRing = rings[0] || [];
  if (outerRing.length < 4) {
    return 0;
  }
  const averageLat = outerRing.reduce((sum, point) => sum + Number(point?.[1] || 0), 0) / outerRing.length;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = 111320 * Math.cos(averageLat * Math.PI / 180);
  let twiceArea = 0;
  for (let index = 0; index < outerRing.length - 1; index += 1) {
    const current = outerRing[index];
    const next = outerRing[index + 1];
    const x1 = Number(current?.[0]) * metersPerDegreeLon;
    const y1 = Number(current?.[1]) * metersPerDegreeLat;
    const x2 = Number(next?.[0]) * metersPerDegreeLon;
    const y2 = Number(next?.[1]) * metersPerDegreeLat;
    if (![x1, y1, x2, y2].every(Number.isFinite)) {
      return 0;
    }
    twiceArea += x1 * y2 - x2 * y1;
  }
  return Math.abs(twiceArea) / 2;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function buildTechnicalData(rawData, record) {
  return {
    koboId: readValue(rawData, "_id") || record.source_submission_id,
    uuid: readValue(rawData, "_uuid"),
    version: readValue(rawData, "__version__"),
    submittedAt: readValue(rawData, "_submission_time") || record.submitted_at,
    submittedBy: readValue(rawData, "_submitted_by"),
    status: readValue(rawData, "_status"),
    validation: record.statut_validation
  };
}

function readFirstArray(context, paths) {
  for (const path of Array.isArray(paths) ? paths : [paths]) {
    const value = readValue(context, path);
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function readValue(context, fieldPath) {
  if (!fieldPath) return undefined;
  if (context && Object.prototype.hasOwnProperty.call(context, fieldPath)) {
    return context[fieldPath];
  }
  const slash = String(fieldPath).replaceAll(".", "/");
  const dot = String(fieldPath).replaceAll("/", ".");
  for (const candidate of [slash, dot, fieldPath]) {
    if (context && Object.prototype.hasOwnProperty.call(context, candidate)) {
      return context[candidate];
    }
  }
  if (context && !String(fieldPath).includes("/") && typeof context === "object") {
    const suffixKey = Object.keys(context).find((key) => key.endsWith(`/${fieldPath}`));
    if (suffixKey) {
      return context[suffixKey];
    }
  }
  return String(fieldPath).split(/[/.]/).reduce((current, part) => current?.[part], context);
}

function buildChoiceIndex(formId) {
  const mapping = loadMapping(formId);
  const fields = Array.isArray(mapping.fields) ? mapping.fields : (mapping.sections || []).flatMap((section) => section.fields || []);
  return fields.reduce((index, field) => {
    if (field.path && field.choiceList) {
      const choices = loadChoiceList(formId, field.choiceList, mapping);
      index[normalizePath(field.path)] = choices.reduce((map, choice) => {
        map[String(choice.name)] = choice.label || choice.name;
        return map;
      }, {});
    }
    return index;
  }, {});
}

function formatChoice(value, field, choiceIndex) {
  const key = String(value || "").trim();
  const choices = field.choices || choiceIndex[normalizePath(field.key || field.path)] || {};
  return choices[key] || humanize(key);
}

function splitChoices(value) {
  return Array.isArray(value) ? value : String(value || "").split(/[\s,]+/).filter(Boolean);
}

function formatBoolean(value) {
  const normalized = String(value).trim().toLowerCase();
  if (["oui", "yes", "true", "1"].includes(normalized)) return "Oui";
  if (["non", "no", "false", "0"].includes(normalized)) return "Non";
  return humanize(value);
}

function formatGeometry(value, type) {
  const parsed = parseGeometry(value, type);
  if (!parsed.ok) return MISSING_VALUE;
  if (parsed.type === "point") {
    const point = parsed.point;
    return `${formatNumber(point.lat, 6)}, ${formatNumber(point.lon, 6)}`;
  }
  return `${parsed.points.length - 1} points`;
}

function formatDate(value, includeTime) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return includeTime ? date.toLocaleString("fr-FR") : date.toLocaleDateString("fr-FR");
}

function formatNumber(value, decimals) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: decimals }).format(number);
}

function formatDistance(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number >= 1000 ? `${formatNumber(number / 1000, 2)} km` : `${formatNumber(number, 0)} m`;
}

function formatArea(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number >= 10000 ? `${formatNumber(number / 10000, 2)} ha` : `${formatNumber(number, 0)} m2`;
}

function parseRawData(rawDataJson) {
  try {
    return rawDataJson ? JSON.parse(rawDataJson) : {};
  } catch {
    return {};
  }
}

function displayValue(value) {
  return isMissing(value) ? "" : String(value);
}

function isMissing(value) {
  return value === undefined || value === null || value === "";
}

function emptySpatialReference() {
  return {
    identifiers: { site_code: null, kobo_id: null },
    counts: { site_contours: 0, building_extents: 0, network_points: 0 },
    site_contours: { type: "FeatureCollection", features: [] },
    building_extents: { type: "FeatureCollection", features: [] },
    network_points: { type: "FeatureCollection", features: [] }
  };
}

function normalizedText(value) {
  return String(value || "").trim();
}

function normalizePath(value) {
  return String(value || "").replaceAll("/", ".");
}

function humanize(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = {
  MISSING_VALUE,
  buildInteractiveSubmissionView,
  formatFieldValue,
  parseRawData,
  readValue
};
