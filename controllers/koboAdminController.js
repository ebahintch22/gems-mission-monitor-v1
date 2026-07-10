const Mission = require("../models/Mission");
const {
  getKoboConfigStatus,
  listKoboAssets,
  syncKoboSubmissions,
  testKoboConnection
} = require("../services/koboSyncService");
const {
  downloadKoboImageAssets,
  encodeSelectedImage,
  listKoboImageAssets
} = require("../services/koboAssetDownloadService");
const {
  getAdvancedKoboSyncStatus,
  listAdvancedKoboSyncManifests,
  startAdvancedKoboSyncJob
} = require("../services/koboAdvancedSyncService");
const { setRuntimeKoboConfig } = require("../services/koboRuntimeConfig");

exports.index = (req, res) => {
  renderKoboAdmin(req, res);
};

exports.updateConfig = (req, res) => {
  try {
    setRuntimeKoboConfig({
      baseUrl: req.body.base_url,
      apiToken: req.body.api_token
    });

    renderKoboAdmin(req, res, {
      notice: req.t("kobo.notice.configSaved")
    });
  } catch (error) {
    renderKoboAdmin(req, res, {
      error: sanitizeError(error)
    }, 400);
  }
};

exports.testConnection = async (req, res) => {
  try {
    const result = await testKoboConnection();
    renderKoboAdmin(req, res, {
      notice: req.t("kobo.notice.connectionOk", { count: result.assetsPreviewCount }),
      activeSection: "data",
      koboDebugPayload: buildKoboDebugPayload({
        action: req.t("kobo.debug.actions.testConnection"),
        payload: result.payload
      })
    });
  } catch (error) {
    renderKoboAdmin(req, res, {
      error: sanitizeError(error)
    }, 400);
  }
};

exports.listAssets = async (req, res) => {
  try {
    const result = await listKoboAssets({ limit: req.body.limit || 25, includePayload: true });
    renderKoboAdmin(req, res, {
      assets: result.assets,
      notice: req.t("kobo.notice.assetsLoaded", { count: result.assets.length }),
      activeSection: "data",
      koboDebugPayload: buildKoboDebugPayload({
        action: req.t("kobo.debug.actions.loadForms"),
        payload: result.payload,
        mapped: result.assets
      })
    });
  } catch (error) {
    renderKoboAdmin(req, res, {
      error: sanitizeError(error)
    }, 400);
  }
};

exports.sync = async (req, res) => {
  try {
    const result = await syncKoboSubmissions({
      assetUid: req.body.asset_uid,
      missionId: req.body.mission_id,
      limit: req.body.limit,
      since: req.body.since,
      dryRun: req.body.dry_run === "on",
      gpsField: req.body.gps_field,
      agentCodeField: req.body.agent_code_field,
      formType: req.body.form_type,
      includePayload: true
    });
    const summary = result.summary;

    renderKoboAdmin(req, res, {
      summary,
      notice: summary.dryRun
        ? req.t("kobo.notice.syncDryRunDone")
        : req.t("kobo.notice.syncDone"),
      activeSection: "data",
      koboDebugPayload: buildKoboDebugPayload({
        action: req.t("kobo.debug.actions.sync"),
        payload: result.payload,
        summary
      })
    });
  } catch (error) {
    renderKoboAdmin(req, res, {
      error: sanitizeError(error),
      activeSection: "sync",
      values: req.body
    }, 400);
  }
};

exports.listMedia = async (req, res) => {
  try {
    const mediaInventory = await listKoboImageAssets({
      assetUid: req.body.asset_uid,
      startIndex: req.body.start_index,
      endIndex: req.body.end_index
    });

    renderKoboAdmin(req, res, {
      notice: `${mediaInventory.imageCount} image(s) trouvee(s).`,
      activeSection: "media",
      mediaValues: req.body,
      mediaInventory,
      koboDebugPayload: buildKoboDebugPayload({
        action: "Inventaire des images Kobo",
        summary: {
          assetUid: mediaInventory.assetUid,
          startIndex: mediaInventory.startIndex,
          endIndex: mediaInventory.endIndex,
          submissionsRead: mediaInventory.submissionsRead,
          imageCount: mediaInventory.imageCount
        }
      })
    });
  } catch (error) {
    renderKoboAdmin(req, res, {
      error: sanitizeError(error),
      activeSection: "media",
      mediaValues: req.body
    }, 400);
  }
};

exports.downloadMedia = async (req, res) => {
  try {
    const summary = await downloadKoboImageAssets({
      assetUid: req.body.asset_uid,
      selectedImages: req.body.selected_images
    });

    renderKoboAdmin(req, res, {
      notice: `${summary.downloaded} image(s) telechargee(s), ${summary.skipped} ignoree(s).`,
      activeSection: "media",
      mediaValues: req.body,
      mediaDownloadSummary: summary,
      koboDebugPayload: buildKoboDebugPayload({
        action: "Telechargement des images Kobo",
        summary
      })
    });
  } catch (error) {
    renderKoboAdmin(req, res, {
      error: sanitizeError(error),
      activeSection: "media",
      mediaValues: req.body
    }, 400);
  }
};

exports.downloadMediaItem = async (req, res) => {
  try {
    const summary = await downloadKoboImageAssets({
      assetUid: req.body.asset_uid,
      selectedImages: req.body.selected_images
    });
    return res.json({
      ok: summary.errors.length === 0,
      summary
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: sanitizeError(error)
    });
  }
};

exports.startAdvancedSync = async (req, res) => {
  try {
    const result = await startAdvancedKoboSyncJob({
      ...req.body,
      actorUserId: req.currentUser?.id,
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    return res.status(202).json({
      ok: true,
      job_id: result.jobId,
      manifest: result.manifest
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: sanitizeError(error)
    });
  }
};

exports.advancedSyncStatus = (req, res) => {
  const result = getAdvancedKoboSyncStatus(req.params.jobId);
  if (!result.manifest) {
    return res.status(404).json({
      ok: false,
      error: "Manifeste de synchronisation introuvable."
    });
  }

  return res.json({
    ok: true,
    running: result.running,
    manifest: result.manifest
  });
};

exports.advancedSyncManifest = (req, res) => {
  const result = getAdvancedKoboSyncStatus(req.params.jobId);
  if (!result.manifest) {
    return res.status(404).json({
      ok: false,
      error: "Manifeste de synchronisation introuvable."
    });
  }

  return res.type("application/json").send(JSON.stringify(result.manifest, null, 2));
};

function renderKoboAdmin(req, res, options = {}, statusCode = 200) {
  const config = getKoboConfigStatus();
  const values = {
    asset_uid: options.values?.asset_uid || config.defaultAssetUid,
    mission_id: options.values?.mission_id || config.defaultMissionId,
    limit: options.values?.limit || "100",
    since: options.values?.since || "",
    gps_field: options.values?.gps_field || config.gpsField,
    agent_code_field: options.values?.agent_code_field || config.agentCodeField,
    form_type: options.values?.form_type || config.formType,
    dry_run: options.values?.dry_run === "on"
  };
  const mediaValues = {
    asset_uid: options.mediaValues?.asset_uid || config.defaultAssetUid,
    start_index: options.mediaValues?.start_index || "1",
    end_index: options.mediaValues?.end_index || "25"
  };
  const advancedSyncValues = {
    asset_uid: options.advancedSyncValues?.asset_uid || config.defaultAssetUid,
    mission_id: options.advancedSyncValues?.mission_id || config.defaultMissionId,
    page_size: options.advancedSyncValues?.page_size || "20",
    mode: options.advancedSyncValues?.mode || "all",
    last_n: options.advancedSyncValues?.last_n || "500",
    date_from: options.advancedSyncValues?.date_from || "",
    date_to: options.advancedSyncValues?.date_to || "",
    index_from: options.advancedSyncValues?.index_from || "",
    index_to: options.advancedSyncValues?.index_to || "",
    gps_field: options.advancedSyncValues?.gps_field || config.gpsField,
    agent_code_field: options.advancedSyncValues?.agent_code_field || config.agentCodeField,
    form_type: options.advancedSyncValues?.form_type || config.formType
  };

  res.status(statusCode).render("kobo/index", {
    title: req.t("kobo.admin.title"),
    config,
    missions: Mission.all(),
    assets: options.assets || [],
    summary: options.summary || null,
    mediaValues,
    mediaInventory: options.mediaInventory || null,
    mediaDownloadSummary: options.mediaDownloadSummary || null,
    advancedSyncValues,
    advancedSyncManifests: listAdvancedKoboSyncManifests(8),
    encodeSelectedImage,
    koboDebugPayloadJson: serializeDebugPayload(options.koboDebugPayload),
    activeSection: options.activeSection || "config",
    notice: options.notice || null,
    error: options.error || null,
    values
  });
}

function sanitizeError(error) {
  return error.message.replace(/Token\s+[A-Za-z0-9._-]+/g, "Token ***");
}

function buildKoboDebugPayload({ action, payload, mapped, summary }) {
  return sanitizeDebugPayload({
    action,
    generatedAt: new Date().toISOString(),
    response: payload,
    mapped,
    summary
  });
}

function serializeDebugPayload(payload) {
  if (!payload) {
    return "";
  }

  return JSON.stringify(payload).replace(/</g, "\\u003c");
}

function sanitizeDebugPayload(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDebugPayload(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.entries(value).reduce((safeValue, [key, entryValue]) => {
    safeValue[key] = isSensitiveKey(key) ? "***" : sanitizeDebugPayload(entryValue);
    return safeValue;
  }, {});
}

function isSensitiveKey(key) {
  return /token|authorization|password|secret|api[_-]?key/i.test(key);
}
