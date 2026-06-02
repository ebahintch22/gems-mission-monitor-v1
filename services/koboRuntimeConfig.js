const runtimeConfig = {
  baseUrl: "",
  apiToken: ""
};

function setRuntimeKoboConfig({ baseUrl, apiToken } = {}) {
  if (typeof baseUrl === "string" && baseUrl.trim()) {
    runtimeConfig.baseUrl = baseUrl.trim();
  }

  if (typeof apiToken === "string" && apiToken.trim()) {
    runtimeConfig.apiToken = apiToken.trim();
  }
}

function getEffectiveKoboConfig(env = process.env) {
  return {
    baseUrl: runtimeConfig.baseUrl || env.KOBO_BASE_URL || "",
    apiToken: runtimeConfig.apiToken || env.KOBO_API_TOKEN || "",
    defaultAssetUid: env.KOBO_ASSET_UID || "",
    defaultMissionId: env.KOBO_MISSION_ID || "",
    gpsField: env.KOBO_GPS_FIELD || "",
    agentCodeField: env.KOBO_AGENT_CODE_FIELD || "",
    formType: env.KOBO_FORM_TYPE || "site",
    runtimeBaseUrlConfigured: Boolean(runtimeConfig.baseUrl),
    runtimeTokenConfigured: Boolean(runtimeConfig.apiToken)
  };
}

function maskSecret(value) {
  if (!value) {
    return "";
  }

  if (value.length <= 8) {
    return "********";
  }

  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

module.exports = {
  getEffectiveKoboConfig,
  maskSecret,
  setRuntimeKoboConfig
};
