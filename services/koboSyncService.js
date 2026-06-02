const Mission = require("../models/Mission");
const SoumissionCollecte = require("../models/SoumissionCollecte");
const { KoboClient, extractResults } = require("./koboClient");
const { mapKoboSubmission } = require("./koboPayloadMapper");

function getKoboConfigStatus(env = process.env) {
  return {
    baseUrlConfigured: Boolean(env.KOBO_BASE_URL),
    tokenConfigured: Boolean(env.KOBO_API_TOKEN),
    defaultAssetUid: env.KOBO_ASSET_UID || "",
    defaultMissionId: env.KOBO_MISSION_ID || "",
    gpsField: env.KOBO_GPS_FIELD || "",
    agentCodeField: env.KOBO_AGENT_CODE_FIELD || "",
    formType: env.KOBO_FORM_TYPE || "site",
    ready: Boolean(env.KOBO_BASE_URL && env.KOBO_API_TOKEN)
  };
}

async function testKoboConnection({ client = new KoboClient() } = {}) {
  const payload = await client.listAssets({ limit: 1 });
  return {
    ok: true,
    assetsPreviewCount: extractResults(payload).length
  };
}

async function listKoboAssets({ client = new KoboClient(), limit = 25 } = {}) {
  const payload = await client.listAssets({ limit });
  return extractResults(payload).map((asset) => ({
    uid: asset.uid || asset.id || "",
    name: asset.name || asset.asset_type || "Formulaire sans nom",
    deploymentStatus: asset.deployment__active ? "actif" : "non actif",
    dateModified: asset.date_modified || ""
  }));
}

async function syncKoboSubmissions({
  client = new KoboClient(),
  assetUid,
  missionId,
  limit = 100,
  since,
  dryRun = false,
  gpsField,
  agentCodeField,
  formType
} = {}) {
  const normalizedMissionId = Number(missionId);

  if (!assetUid) {
    throw new Error("L'UID du formulaire Kobo est requis.");
  }

  if (!Number.isInteger(normalizedMissionId) || normalizedMissionId <= 0) {
    throw new Error("La mission G2M est requise pour synchroniser les soumissions.");
  }

  const mission = Mission.findById(normalizedMissionId);
  if (!mission) {
    throw new Error(`Mission G2M introuvable pour l'id ${normalizedMissionId}.`);
  }

  const params = {
    limit: sanitizeLimit(limit)
  };
  const query = buildKoboQuery(since);

  if (query) {
    params.query = JSON.stringify(query);
  }

  const payload = await client.listAssetData(assetUid, params);
  const submissions = extractResults(payload);
  const summary = {
    assetUid,
    missionId: mission.id,
    missionName: mission.name,
    read: submissions.length,
    valid: 0,
    inserted: 0,
    skipped: 0,
    errors: [],
    dryRun: Boolean(dryRun)
  };

  for (const submission of submissions) {
    try {
      const row = mapKoboSubmission(submission, {
        assetUid,
        missionId: mission.id,
        gpsField,
        agentCodeField,
        formType
      });

      summary.valid += 1;

      if (dryRun) {
        continue;
      }

      const result = SoumissionCollecte.insertKobo(row);
      if (result.inserted) {
        summary.inserted += 1;
      } else {
        summary.skipped += 1;
      }
    } catch (error) {
      summary.errors.push(error.message);
    }
  }

  return summary;
}

function buildKoboQuery(since) {
  if (!since) {
    return null;
  }

  const date = new Date(since);
  if (Number.isNaN(date.getTime())) {
    throw new Error("La date de reprise Kobo est invalide.");
  }

  return {
    _submission_time: {
      $gt: date.toISOString()
    }
  };
}

function sanitizeLimit(limit) {
  const value = Number(limit);
  if (!Number.isInteger(value) || value <= 0) {
    return 100;
  }

  return Math.min(value, 1000);
}

module.exports = {
  buildKoboQuery,
  getKoboConfigStatus,
  listKoboAssets,
  syncKoboSubmissions,
  testKoboConnection
};
