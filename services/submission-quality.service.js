const { detectLongitudeSignIssue, parseGeometry } = require("./geometry.service");

function buildSubmissionQualityAlerts(context = {}) {
  const { rawData = {}, sections = [], mediaGallery = {}, spatialReference = {} } = context;
  const alerts = [];
  const fieldValues = collectFieldValues(sections);

  fieldValues.forEach((field) => {
    if (isSentinelValue(field.rawValue)) {
      alerts.push(alert("SENTINEL_VALUE", "warning", field.sectionId, field.key, "La valeur contient une valeur de substitution."));
    }
  });

  const buildings = repeatArray(rawData, ["batiment", "batiment/batiment"]);
  const spatialBuildings = spatialReference.building_extents?.features || [];
  const declaredBuildingCount = numberValue(readPath(rawData, "modC/nb_batiments"));
  if ((buildings.length || spatialBuildings.length) && totalBuildingArea(buildings, spatialBuildings) === 0) {
    alerts.push(alert("ZERO_BUILDING_AREA", "warning", "buildings", "batiment", "La surface batie totale est nulle alors que des batiments existent."));
  }
  if (Number.isFinite(declaredBuildingCount) && declaredBuildingCount !== buildings.length) {
    alerts.push(alert("BUILDING_COUNT_MISMATCH", "warning", "buildings", "modC/nb_batiments", "Le nombre declare de batiments differe du nombre de batiments saisis."));
  }

  const mapPoints = collectGeometryPoints(rawData);
  if (!mapPoints.length) {
    alerts.push(alert("MISSING_COORDINATES", "error", "location", "modA/gps_site", "Aucune coordonnee exploitable n'a ete trouvee."));
  }
  if (detectLongitudeSignIssue(mapPoints)) {
    alerts.push(alert("LONGITUDE_SIGN_INCONSISTENT", "warning", "location", "longitude", "Une longitude semble avoir un signe incoherent avec les autres coordonnees."));
  }

  (mediaGallery.missing || []).forEach((media) => {
    alerts.push(alert("PHOTO_ATTACHMENT_MISSING", "warning", "media", media.indexedPath, "Une photo declaree n'a pas de piece jointe correspondante."));
  });

  const internet = normalized(readPath(rawData, "modF/internet"));
  const internetLinks = collectInternetLinks(rawData);
  if (["oui", "actif", "active", "yes"].includes(internet) && !internetLinks.length) {
    alerts.push(alert("ACTIVE_INTERNET_WITHOUT_LINK", "warning", "internet", "modF/internet", "Internet est declare actif sans lien de connexion renseigne."));
  }

  const fiberNear = normalized(readPath(rawData, "modH/fibre_proche"));
  const fiberPoint = readPath(rawData, "modH/gps_raccord") || readPath(rawData, "modH/gps_raccord_coords");
  if (["oui", "yes", "true", "1"].includes(fiberNear) && !fiberPoint) {
    alerts.push(alert("FIBER_NEAR_WITHOUT_CONNECTION_POINT", "warning", "fiber", "modH/fibre_proche", "La fibre est declaree proche sans point de raccordement."));
  }

  const grounding = normalized(readPath(rawData, "modD/mise_terre"));
  if (["non", "no", "false", "0", "absent"].includes(grounding)) {
    alerts.push(alert("MISSING_GROUNDING", "warning", "energy", "modD/mise_terre", "La mise a la terre est absente."));
  }

  const powerQuality = normalized(readPath(rawData, "modD/qualite_courant"));
  if (/(instable|tres_instable|très_instable|mauvais)/.test(powerQuality)) {
    alerts.push(alert("UNSTABLE_POWER", "warning", "energy", "modD/qualite_courant", "La qualite du courant est instable ou tres instable."));
  }

  return alerts;
}

function collectFieldValues(sections = []) {
  return sections.flatMap((section) => [
    ...(section.fields || []).map((field) => ({ ...field, sectionId: section.id })),
    ...(section.items || []).flatMap((item) => collectRepeatFieldValues(item, section.id)),
    ...(section.repeats || []).flatMap((repeat) =>
      (repeat.items || []).flatMap((item) => collectRepeatFieldValues(item, section.id))
    )
  ]);
}

function collectRepeatFieldValues(item, sectionId) {
  return [
    ...(item.fields || []).map((field) => ({ ...field, sectionId })),
    ...(item.nestedRepeats || []).flatMap((repeat) =>
      (repeat.items || []).flatMap((nestedItem) => collectRepeatFieldValues(nestedItem, sectionId))
    )
  ];
}

function collectGeometryPoints(rawData) {
  const candidates = [
    ["modA/gps_site", "gps"],
    ["modA/gps_centre", "gps"],
    ["modA/gps_manuel", "gps"],
    ["modH/gps_raccord", "gps"],
    ["modH/gps_raccord_coords", "gps"]
  ];
  return candidates
    .map(([key, type]) => parseGeometry(readPath(rawData, key), type))
    .filter((result) => result.ok)
    .flatMap((result) => result.points || []);
}

function collectInternetLinks(rawData) {
  return repeatArray(rawData, ["modF/operateur_rep", "modF/operateur_rep/modF/operateur_rep"])
    .flatMap((operator) => repeatArray(operator, ["lien_rep", "modF/operateur_rep/lien_rep"]));
}

function repeatArray(input, paths) {
  for (const path of paths) {
    const value = readPath(input, path);
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function totalBuildingArea(buildings = [], spatialBuildings = []) {
  const koboArea = buildings.reduce((sum, building) => sum + buildingAreaValue(building), 0);
  const spatialArea = spatialBuildings.reduce((sum, feature) => sum + positiveNumber(feature?.properties?.superficie), 0);
  return koboArea + spatialArea;
}

function buildingAreaValue(building) {
  const candidates = [
    "superficie",
    "superficie_dim",
    "surface_bat_auto",
    "surface_bat_manuel",
    "batiment/superficie",
    "batiment/superficie_dim",
    "batiment/surface_bat_auto",
    "batiment/surface_bat_manuel"
  ];
  for (const key of candidates) {
    const value = positiveNumber(readPath(building, key));
    if (value > 0) {
      return value;
    }
  }
  return 0;
}

function isSentinelValue(value) {
  return value === 999 || String(value || "").trim() === "999";
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = numberValue(value);
  return number && number > 0 ? number : 0;
}

function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function readPath(input, fieldPath) {
  if (!fieldPath) return undefined;
  if (input && Object.prototype.hasOwnProperty.call(input, fieldPath)) {
    return input[fieldPath];
  }
  return String(fieldPath).split("/").reduce((current, part) => current?.[part], input);
}

function alert(code, severity, section, field, message) {
  return { code, severity, section, field, message };
}

module.exports = {
  buildSubmissionQualityAlerts
};
