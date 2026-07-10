const assert = require("node:assert/strict");
const test = require("node:test");

const { KoboClient, normalizeBaseUrl } = require("../services/koboClient");
const {
  mapKoboSubmission,
  parseKoboGeopoint,
  valueAtPath
} = require("../services/koboPayloadMapper");

test("normalizeBaseUrl removes api v2 suffix and trailing slashes", () => {
  assert.equal(
    normalizeBaseUrl("https://kf.kobotoolbox.org/api/v2/"),
    "https://kf.kobotoolbox.org"
  );
});

test("KoboClient sends token authorization header without adding it to the URL", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      json: async () => ({ results: [] })
    };
  };

  const client = new KoboClient({
    baseUrl: "https://kf.kobotoolbox.org/api/v2",
    apiToken: "secret-token",
    fetchImpl
  });

  await client.listAssets({ limit: 10 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://kf.kobotoolbox.org/api/v2/assets/?limit=10");
  assert.equal(calls[0].options.headers.Authorization, "Token secret-token");
  assert.equal(calls[0].url.includes("secret-token"), false);
});

test("KoboClient downloads absolute media URLs with token header", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      arrayBuffer: async () => Buffer.from("image")
    };
  };
  const client = new KoboClient({
    baseUrl: "https://kf.kobotoolbox.org",
    apiToken: "secret-token",
    fetchImpl
  });

  await client.download("https://kf.kobotoolbox.org/media/photo.jpg");

  assert.equal(calls[0].url, "https://kf.kobotoolbox.org/media/photo.jpg");
  assert.equal(calls[0].options.headers.Authorization, "Token secret-token");
});

test("parseKoboGeopoint accepts Kobo geopoint strings", () => {
  assert.deepEqual(parseKoboGeopoint("5.123 -4.456 20 8"), {
    latitude: 5.123,
    longitude: -4.456,
    precision_m: 8
  });
});

test("valueAtPath supports Kobo slash separated field paths", () => {
  assert.equal(valueAtPath({ groupe: { agent: "AG-001" } }, "groupe/agent"), "AG-001");
  assert.equal(valueAtPath({ "groupe/agent": "AG-002" }, "groupe/agent"), "AG-002");
});

test("mapKoboSubmission creates a G2M row from a Kobo payload", () => {
  const row = mapKoboSubmission(
    {
      _uuid: "uuid-001",
      _submission_time: "2026-06-01T10:30:00Z",
      coordonnees_gps: "5.123 -4.456 0 6",
      meta: {
        agent: "AG-001"
      }
    },
    {
      assetUid: "asset-uid",
      missionId: 12,
      agentCodeField: "meta/agent",
      formType: "identification_site"
    }
  );

  assert.equal(row.source, "kobo");
  assert.equal(row.source_submission_id, "uuid-001");
  assert.equal(row.kobo_asset_uid, "asset-uid");
  assert.equal(row.mission_id, 12);
  assert.equal(row.code_agent_source, "AG-001");
  assert.equal(row.formulaire_type, "identification_site");
  assert.equal(row.latitude, 5.123);
  assert.equal(row.longitude, -4.456);
  assert.equal(row.precision_m, 6);
});
