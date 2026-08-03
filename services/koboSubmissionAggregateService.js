const fs = require("node:fs/promises");
const path = require("node:path");
const { extractResults } = require("./koboClient");
const { createKoboClient } = require("./koboSyncService");

const DEFAULT_PAGE_SIZE = 100;
const MIN_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 1000;
const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), "data", "kobo-aggregates");

async function aggregateKoboSubmissionsToFile(options = {}) {
  const normalized = normalizeAggregateOptions(options);
  const koboClient = createKoboClient(normalized.client);
  const startedAt = new Date().toISOString();
  const pages = [];
  const submissions = [];
  let nextUrl = koboClient.url(`/assets/${normalized.assetUid}/data/`, {
    limit: normalized.pageSize
  }).toString();
  let pageNumber = 0;

  while (nextUrl) {
    pageNumber += 1;
    const payload = await fetchKoboPage(koboClient, nextUrl);
    const results = extractResults(payload);

    submissions.push(...results);
    pages.push({
      page: pageNumber,
      submissions: results.length,
      next: payload.next || null
    });

    if (normalized.maxPages && pageNumber >= normalized.maxPages) {
      break;
    }

    nextUrl = payload.next || null;
    await yieldToEventLoop();
  }

  const completedAt = new Date().toISOString();
  const fileName = normalized.fileName || defaultAggregateFileName(normalized.assetUid, startedAt);
  const outputPath = path.join(normalized.outputDir, fileName);
  const aggregate = {
    count: submissions.length,
    next: null,
    previous: null,
    results: submissions,
    metadata: {
      source: "kobotoolbox-api-v2",
      asset_uid: normalized.assetUid,
      page_size: normalized.pageSize,
      max_pages: normalized.maxPages,
      pages_read: pageNumber,
      submissions_read: submissions.length,
      generated_at: completedAt,
      started_at: startedAt,
      pages
    }
  };

  await fs.mkdir(normalized.outputDir, { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");

  return {
    assetUid: normalized.assetUid,
    fileName,
    outputPath,
    pageSize: normalized.pageSize,
    pagesRead: pageNumber,
    submissionsRead: submissions.length,
    generatedAt: completedAt
  };
}

function normalizeAggregateOptions(input = {}) {
  const assetUid = String(input.assetUid || input.asset_uid || "").trim();
  if (!assetUid) {
    throw new Error("L'UID du formulaire Kobo est requis.");
  }

  return {
    assetUid,
    pageSize: sanitizePageSize(input.pageSize || input.page_size),
    maxPages: sanitizeOptionalPositiveInteger(input.maxPages || input.max_pages),
    outputDir: input.outputDir || input.output_dir || DEFAULT_OUTPUT_DIR,
    fileName: sanitizeOutputFileName(input.fileName || input.file_name),
    client: input.client
  };
}

function sanitizePageSize(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(Math.max(parsed, MIN_PAGE_SIZE), MAX_PAGE_SIZE);
}

function sanitizeOptionalPositiveInteger(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function sanitizeOutputFileName(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const normalized = raw
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!normalized) {
    return "";
  }

  return normalized.toLowerCase().endsWith(".json") ? normalized : `${normalized}.json`;
}

function defaultAggregateFileName(assetUid, isoDate) {
  const timestamp = isoDate.slice(0, 19).replaceAll(":", "-");
  const safeAssetUid = sanitizeOutputFileName(assetUid).replace(/\.json$/i, "");
  return `kobo-submissions-${safeAssetUid}-${timestamp}.json`;
}

async function fetchKoboPage(koboClient, url) {
  const response = await koboClient.fetchImpl(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Token ${koboClient.apiToken}`
    }
  });

  if (!response.ok) {
    const message = await safeResponseText(response);
    throw new Error(`Erreur KoboToolbox ${response.status}: ${message || response.statusText}`);
  }

  return response.json();
}

async function safeResponseText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

module.exports = {
  aggregateKoboSubmissionsToFile,
  normalizeAggregateOptions
};
