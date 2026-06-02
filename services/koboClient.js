class KoboClient {
  constructor({ baseUrl, apiToken, fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl || process.env.KOBO_BASE_URL);
    this.apiToken = apiToken || process.env.KOBO_API_TOKEN;
    this.fetchImpl = fetchImpl;

    if (!this.baseUrl) {
      throw new Error("KOBO_BASE_URL est requis pour contacter KoboToolbox.");
    }

    if (!this.apiToken) {
      throw new Error("KOBO_API_TOKEN est requis pour contacter KoboToolbox.");
    }

    if (typeof this.fetchImpl !== "function") {
      throw new Error("fetch n'est pas disponible dans cet environnement Node.js.");
    }
  }

  url(pathname, params = {}) {
    const cleanPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
    const url = new URL(`${this.baseUrl}/api/v2${cleanPath}`);

    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .forEach(([key, value]) => url.searchParams.set(key, value));

    return url;
  }

  async request(pathname, { params, ...options } = {}) {
    const response = await this.fetchImpl(this.url(pathname, params), {
      ...options,
      headers: {
        Accept: "application/json",
        Authorization: `Token ${this.apiToken}`,
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      const message = await safeResponseText(response);
      throw new Error(`Erreur KoboToolbox ${response.status}: ${message || response.statusText}`);
    }

    return response.json();
  }

  listAssets(params = {}) {
    return this.request("/assets/", { params });
  }

  getAsset(assetUid) {
    assertAssetUid(assetUid);
    return this.request(`/assets/${assetUid}/`);
  }

  listAssetData(assetUid, params = {}) {
    assertAssetUid(assetUid);
    return this.request(`/assets/${assetUid}/data/`, { params });
  }

  async paginate(pathname, params = {}) {
    const rows = [];
    let nextUrl = this.url(pathname, params).toString();

    while (nextUrl) {
      const response = await this.fetchImpl(nextUrl, {
        headers: {
          Accept: "application/json",
          Authorization: `Token ${this.apiToken}`
        }
      });

      if (!response.ok) {
        const message = await safeResponseText(response);
        throw new Error(`Erreur KoboToolbox ${response.status}: ${message || response.statusText}`);
      }

      const payload = await response.json();
      rows.push(...extractResults(payload));
      nextUrl = payload.next || null;
    }

    return rows;
  }
}

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) {
    return "";
  }

  return baseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/v2$/i, "");
}

function assertAssetUid(assetUid) {
  if (!assetUid) {
    throw new Error("L'identifiant du formulaire Kobo (asset uid) est requis.");
  }
}

function extractResults(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.results)) {
    return payload.results;
  }

  return [];
}

async function safeResponseText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

module.exports = {
  KoboClient,
  normalizeBaseUrl,
  extractResults
};
