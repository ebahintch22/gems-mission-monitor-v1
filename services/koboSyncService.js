const Mission = require("../models/Mission");
const SoumissionCollecte = require("../models/SoumissionCollecte");
const AgentMissionAssignment = require("../models/AgentMissionAssignment");
const { KoboClient, extractResults } = require("./koboClient");
const { mapKoboSubmission } = require("./koboPayloadMapper");
const { getEffectiveKoboConfig, maskSecret } = require("./koboRuntimeConfig");

function getKoboConfigStatus(env = process.env) {
  const effectiveConfig = getEffectiveKoboConfig(env);

  return {
    baseUrl: effectiveConfig.baseUrl,
    maskedToken: maskSecret(effectiveConfig.apiToken),
    baseUrlConfigured: Boolean(effectiveConfig.baseUrl),
    tokenConfigured: Boolean(effectiveConfig.apiToken),
    runtimeBaseUrlConfigured: effectiveConfig.runtimeBaseUrlConfigured,
    runtimeTokenConfigured: effectiveConfig.runtimeTokenConfigured,
    defaultAssetUid: effectiveConfig.defaultAssetUid,
    defaultMissionId: effectiveConfig.defaultMissionId,
    gpsField: effectiveConfig.gpsField,
    agentCodeField: effectiveConfig.agentCodeField,
    formType: effectiveConfig.formType,
    ready: Boolean(effectiveConfig.baseUrl && effectiveConfig.apiToken)
  };
}

function createKoboClient(client) {
  if (client) {
    return client;
  }

  const effectiveConfig = getEffectiveKoboConfig();
  return new KoboClient({
    baseUrl: effectiveConfig.baseUrl,
    apiToken: effectiveConfig.apiToken
  });
}

async function testKoboConnection({ client } = {}) {
  const koboClient = createKoboClient(client);
  const payload = await koboClient.listAssets({ limit: 1 });
  return {
    ok: true,
    assetsPreviewCount: extractResults(payload).length,
    payload
  };
}

async function listKoboAssets({ client, limit = 25, includePayload = false } = {}) {
  const koboClient = createKoboClient(client);
  const payload = await koboClient.listAssets({ limit });
  const assets = extractResults(payload).map((asset) => ({
    uid: asset.uid || asset.id || "",
    name: asset.name || asset.asset_type || "Formulaire sans nom",
    deploymentStatus: asset.deployment__active ? "actif" : "non actif",
    dateModified: asset.date_modified || ""
  }));

  if (includePayload) {
    return { assets, payload };
  }

  return assets;
}

async function syncKoboSubmissions({
  client,
  assetUid,
  missionId,
  limit = 100,
  since,
  dryRun = false,
  gpsField,
  agentCodeField,
  formType,
  includePayload = false
} = {}) {
  const koboClient = createKoboClient(client);
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

  const payload = await koboClient.listAssetData(assetUid, params);
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
      attachActiveAssignment(row);

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

  if (includePayload) {
    return { summary, payload };
  }

  return summary;
}

function attachActiveAssignment(row) {
  if (!row.code_agent_source) {
    return;
  }

  const assignment = AgentMissionAssignment.activeByCodeAndMission(
    String(row.code_agent_source).trim().toUpperCase(),
    row.mission_id
  );

  if (!assignment) {
    return;
  }

  row.assignment_id = assignment.id;
  row.agent_id = assignment.agent_id;
  row.equipe_id = assignment.equipe_id;
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
