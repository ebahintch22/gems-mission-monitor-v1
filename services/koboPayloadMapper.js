const DEFAULT_GPS_FIELDS = [
  "gps",
  "geopoint",
  "location",
  "coordonnees",
  "coordonnees_gps",
  "site_gps",
  "_geolocation"
];

function mapKoboSubmission(submission, options = {}) {
  const gpsField = options.gpsField || process.env.KOBO_GPS_FIELD;
  const agentCodeField = options.agentCodeField || process.env.KOBO_AGENT_CODE_FIELD;
  const formType = options.formType || process.env.KOBO_FORM_TYPE || "site";
  const missionId = toInteger(options.missionId);
  const assetUid = options.assetUid || process.env.KOBO_ASSET_UID || submission._xform_id_string || null;

  if (!missionId) {
    throw new Error("missionId est requis pour rattacher une soumission Kobo a une mission G2M.");
  }

  const coordinates = extractCoordinates(submission, gpsField);
  const sourceSubmissionId = submission._uuid || submission.uuid || submission._id;
  const submittedAt = submission._submission_time || submission._submitted_at || submission.end || submission.start;

  if (!sourceSubmissionId) {
    throw new Error("Soumission Kobo ignoree: identifiant source introuvable (_uuid ou _id).");
  }

  if (!submittedAt) {
    throw new Error(`Soumission Kobo ${sourceSubmissionId} ignoree: date de soumission introuvable.`);
  }

  if (!coordinates) {
    throw new Error(`Soumission Kobo ${sourceSubmissionId} ignoree: coordonnees GPS introuvables.`);
  }

  return {
    source: "kobo",
    source_submission_id: String(sourceSubmissionId),
    kobo_asset_uid: assetUid,
    mission_id: missionId,
    equipe_id: null,
    agent_id: null,
    assignment_id: null,
    sous_prefecture_id: null,
    code_agent_source: agentCodeField ? valueAtPath(submission, agentCodeField) || null : null,
    submitted_at: normalizeDateString(submittedAt),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    precision_m: coordinates.precision_m,
    statut_validation: "a_verifier",
    anomaly_count: 0,
    formulaire_type: formType,
    raw_data_json: JSON.stringify(submission)
  };
}

function extractCoordinates(submission, preferredField) {
  const candidates = preferredField
    ? [preferredField, ...DEFAULT_GPS_FIELDS.filter((field) => field !== preferredField)]
    : DEFAULT_GPS_FIELDS;

  for (const field of candidates) {
    const value = valueAtPath(submission, field);
    const parsed = parseKoboGeopoint(value);

    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function parseKoboGeopoint(value) {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    if (value.length < 2) {
      return null;
    }

    return normalizeCoordinates(value[0], value[1], value[2]);
  }

  if (typeof value === "object") {
    if (Array.isArray(value.coordinates) && value.coordinates.length >= 2) {
      return normalizeCoordinates(value.coordinates[1], value.coordinates[0], value.coordinates[2]);
    }

    return normalizeCoordinates(
      value.latitude ?? value.lat,
      value.longitude ?? value.lon ?? value.lng,
      value.accuracy ?? value.precision
    );
  }

  if (typeof value === "string") {
    const parts = value.trim().split(/\s+/);
    if (parts.length < 2) {
      return null;
    }

    return normalizeCoordinates(parts[0], parts[1], parts[3] ?? parts[2]);
  }

  return null;
}

function normalizeCoordinates(latitudeValue, longitudeValue, precisionValue) {
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  const precision = precisionValue === undefined || precisionValue === null || precisionValue === ""
    ? null
    : Number(precisionValue);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return {
    latitude,
    longitude,
    precision_m: Number.isFinite(precision) ? precision : null
  };
}

function valueAtPath(source, path) {
  if (!path) {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(source, path)) {
    return source[path];
  }

  return path.split("/").reduce((current, key) => {
    if (current && Object.prototype.hasOwnProperty.call(current, key)) {
      return current[key];
    }
    return undefined;
  }, source);
}

function normalizeDateString(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toISOString();
}

function toInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

module.exports = {
  DEFAULT_GPS_FIELDS,
  extractCoordinates,
  mapKoboSubmission,
  parseKoboGeopoint,
  valueAtPath
};
