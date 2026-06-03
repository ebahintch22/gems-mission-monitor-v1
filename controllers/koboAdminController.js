const Mission = require("../models/Mission");
const {
  getKoboConfigStatus,
  listKoboAssets,
  syncKoboSubmissions,
  testKoboConnection
} = require("../services/koboSyncService");
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
      notice: req.t("kobo.notice.connectionOk", { count: result.assetsPreviewCount })
    });
  } catch (error) {
    renderKoboAdmin(req, res, {
      error: sanitizeError(error)
    }, 400);
  }
};

exports.listAssets = async (req, res) => {
  try {
    const assets = await listKoboAssets({ limit: req.body.limit || 25 });
    renderKoboAdmin(req, res, {
      assets,
      notice: req.t("kobo.notice.assetsLoaded", { count: assets.length })
    });
  } catch (error) {
    renderKoboAdmin(req, res, {
      error: sanitizeError(error)
    }, 400);
  }
};

exports.sync = async (req, res) => {
  try {
    const summary = await syncKoboSubmissions({
      assetUid: req.body.asset_uid,
      missionId: req.body.mission_id,
      limit: req.body.limit,
      since: req.body.since,
      dryRun: req.body.dry_run === "on",
      gpsField: req.body.gps_field,
      agentCodeField: req.body.agent_code_field,
      formType: req.body.form_type
    });

    renderKoboAdmin(req, res, {
      summary,
      notice: summary.dryRun
        ? req.t("kobo.notice.syncDryRunDone")
        : req.t("kobo.notice.syncDone")
    });
  } catch (error) {
    renderKoboAdmin(req, res, {
      error: sanitizeError(error),
      values: req.body
    }, 400);
  }
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

  res.status(statusCode).render("kobo/index", {
    title: req.t("kobo.admin.title"),
    config,
    missions: Mission.all(),
    assets: options.assets || [],
    summary: options.summary || null,
    notice: options.notice || null,
    error: options.error || null,
    values
  });
}

function sanitizeError(error) {
  return error.message.replace(/Token\s+[A-Za-z0-9._-]+/g, "Token ***");
}
