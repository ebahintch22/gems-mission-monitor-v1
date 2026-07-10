const AgentMissionAssignment = require("../models/AgentMissionAssignment");
const KoboAdvancedSyncLog = require("../models/KoboAdvancedSyncLog");
const Mission = require("../models/Mission");
const SoumissionCollecte = require("../models/SoumissionCollecte");
const { extractResults } = require("./koboClient");
const { mapKoboSubmission } = require("./koboPayloadMapper");
const { createKoboClient } = require("./koboSyncService");

const DEFAULT_PAGE_SIZE = 20;
const MIN_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const PAGE_SIZE_STEP = 10;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRIES = 3;
const RUNNING_JOBS = new Map();

async function startAdvancedKoboSyncJob(input = {}) {
  const options = normalizeAdvancedSyncOptions(input);
  const manifest = createInitialManifest(options);
  const logId = KoboAdvancedSyncLog.create({
    manifest,
    actorUserId: input.actorUserId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent
  });

  const promise = runAdvancedKoboSync({
    ...options,
    manifest,
    logId
  }).finally(() => {
    RUNNING_JOBS.delete(manifest.job_id);
  });

  RUNNING_JOBS.set(manifest.job_id, {
    manifest,
    promise,
    logId
  });

  return {
    jobId: manifest.job_id,
    manifest
  };
}

async function runAdvancedKoboSync(options = {}) {
  const normalized = options.assetUid && options.mission
    ? options
    : normalizeAdvancedSyncOptions(options);
  const koboClient = createKoboClient(normalized.client);
  const manifest = options.manifest || createInitialManifest(normalized);
  const logId = options.logId || KoboAdvancedSyncLog.create({ manifest });
  const startedAt = manifest.started_at;
  let nextUrl = koboClient.url(`/assets/${normalized.assetUid}/data/`, buildKoboDataParams(normalized)).toString();
  let remainingRows = normalized.mode === "last_n" ? normalized.filters.last_n : null;

  try {
    while (nextUrl && (remainingRows === null || remainingRows > 0)) {
      const payload = await fetchPageWithRetry(koboClient, nextUrl, {
        retries: normalized.retries,
        timeoutMs: normalized.timeoutMs
      });
      let submissions = extractResults(payload);

      manifest.pages_read += 1;
      manifest.last_next_url = payload.next || null;

      if (remainingRows !== null && submissions.length > remainingRows) {
        submissions = submissions.slice(0, remainingRows);
      }

      for (const submission of submissions) {
        manifest.submissions_read += 1;
        try {
          const row = mapKoboSubmission(submission, {
            assetUid: normalized.assetUid,
            missionId: normalized.mission.id,
            gpsField: normalized.gpsField,
            agentCodeField: normalized.agentCodeField,
            formType: normalized.formType
          });
          attachActiveAssignment(row);

          const result = SoumissionCollecte.insertKobo(row);
          if (result.inserted) {
            manifest.submissions_imported += 1;
          }
        } catch (error) {
          manifest.errors.push(error.message);
        }
      }

      if (remainingRows !== null) {
        remainingRows -= submissions.length;
      }

      manifest.updated_at = new Date().toISOString();
      KoboAdvancedSyncLog.update(logId, manifest);
      nextUrl = payload.next || null;
      await yieldToEventLoop();
    }

    manifest.status = "completed";
  } catch (error) {
    manifest.status = "failed";
    manifest.errors.push(error.message);
  } finally {
    manifest.started_at = startedAt;
    manifest.updated_at = new Date().toISOString();
    KoboAdvancedSyncLog.update(logId, manifest);
  }

  return manifest;
}

function getAdvancedKoboSyncStatus(jobId) {
  const running = RUNNING_JOBS.get(jobId);
  if (running) {
    return {
      running: true,
      manifest: running.manifest
    };
  }

  const stored = KoboAdvancedSyncLog.findByJobId(jobId);
  return {
    running: false,
    manifest: stored?.manifest || null
  };
}

function listAdvancedKoboSyncManifests(limit = 10) {
  return KoboAdvancedSyncLog.recent(limit).map((entry) => entry.manifest);
}

function buildKoboDataParams(options) {
  const params = {
    limit: options.pageSize
  };
  const query = buildKoboFilterQuery(options.mode, options.filters);
  const sort = buildKoboSort(options.mode);

  if (query) {
    params.query = JSON.stringify(query);
  }

  if (sort) {
    params.sort = JSON.stringify(sort);
  }

  return params;
}

function buildKoboFilterQuery(mode, filters = {}) {
  if (mode === "dates") {
    const dateQuery = {};
    if (filters.date_from) {
      dateQuery.$gte = new Date(filters.date_from).toISOString();
    }
    if (filters.date_to) {
      dateQuery.$lte = new Date(filters.date_to).toISOString();
    }
    return Object.keys(dateQuery).length ? { _submission_time: dateQuery } : null;
  }

  if (mode === "index") {
    const indexQuery = {};
    if (Number.isInteger(filters.index_from)) {
      indexQuery.$gte = filters.index_from;
    }
    if (Number.isInteger(filters.index_to)) {
      indexQuery.$lte = filters.index_to;
    }
    return Object.keys(indexQuery).length ? { _index: indexQuery } : null;
  }

  return null;
}

function buildKoboSort(mode) {
  if (mode === "last_n") {
    return { _submission_time: -1 };
  }

  if (mode === "dates" || mode === "index") {
    return { _submission_time: 1 };
  }

  return null;
}

function normalizeAdvancedSyncOptions(input = {}) {
  const assetUid = String(input.assetUid || input.asset_uid || "").trim();
  const mission = resolveMission(input.missionId || input.mission_id);
  const mode = normalizeMode(input.mode || input.import_mode);
  const filters = normalizeFilters(input.filters || input);

  if (!assetUid) {
    throw new Error("L'UID du formulaire Kobo est requis.");
  }

  validateModeFilters(mode, filters);

  return {
    assetUid,
    mission,
    missionLabel: input.missionLabel || input.mission_label || mission.name,
    mode,
    filters: activeFiltersForMode(mode, filters),
    pageSize: sanitizePageSize(input.pageSize || input.page_size),
    gpsField: input.gpsField || input.gps_field,
    agentCodeField: input.agentCodeField || input.agent_code_field,
    formType: input.formType || input.form_type,
    timeoutMs: sanitizePositiveInteger(input.timeoutMs || input.timeout_ms, DEFAULT_TIMEOUT_MS),
    retries: sanitizePositiveInteger(input.retries, DEFAULT_RETRIES),
    client: input.client
  };
}

function resolveMission(missionId) {
  const normalizedMissionId = Number(missionId);
  if (!Number.isInteger(normalizedMissionId) || normalizedMissionId <= 0) {
    throw new Error("La mission G2M est requise pour synchroniser les soumissions.");
  }

  const mission = Mission.findActiveById(normalizedMissionId);
  if (!mission) {
    throw new Error(`Mission G2M active introuvable pour l'id ${normalizedMissionId}.`);
  }

  return mission;
}

function normalizeMode(value) {
  const normalized = String(value || "all").trim().toLowerCase();
  const aliases = {
    all: "all",
    tout: "all",
    last_n: "last_n",
    "n dernières": "last_n",
    dates: "dates",
    index: "index"
  };

  if (!aliases[normalized]) {
    throw new Error("Mode d'import avancé invalide.");
  }

  return aliases[normalized];
}

function normalizeFilters(input = {}) {
  return {
    last_n: parseNullableInteger(input.last_n),
    date_from: normalizeOptionalDate(input.date_from),
    date_to: normalizeOptionalDate(input.date_to),
    index_from: parseNullableInteger(input.index_from),
    index_to: parseNullableInteger(input.index_to)
  };
}

function activeFiltersForMode(mode, filters) {
  if (mode === "last_n") {
    return { last_n: filters.last_n };
  }

  if (mode === "dates") {
    return {
      date_from: filters.date_from,
      date_to: filters.date_to
    };
  }

  if (mode === "index") {
    return {
      index_from: filters.index_from,
      index_to: filters.index_to
    };
  }

  return {};
}

function validateModeFilters(mode, filters) {
  if (mode === "last_n" && (!Number.isInteger(filters.last_n) || filters.last_n <= 0)) {
    throw new Error("Le mode N dernières exige une valeur last_n positive.");
  }

  if (mode === "dates" && !filters.date_from && !filters.date_to) {
    throw new Error("Le mode Dates exige au moins une date de début ou de fin.");
  }

  if (mode === "dates" && filters.date_from && filters.date_to && filters.date_from > filters.date_to) {
    throw new Error("La date de début doit être antérieure ou égale à la date de fin.");
  }

  if (mode === "index" && !Number.isInteger(filters.index_from) && !Number.isInteger(filters.index_to)) {
    throw new Error("Le mode Index exige au moins un index de début ou de fin.");
  }

  if (
    mode === "index"
    && Number.isInteger(filters.index_from)
    && Number.isInteger(filters.index_to)
    && filters.index_from > filters.index_to
  ) {
    throw new Error("L'index de début doit être inférieur ou égal à l'index de fin.");
  }
}

function sanitizePageSize(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return DEFAULT_PAGE_SIZE;
  }

  const clamped = Math.min(Math.max(parsed, MIN_PAGE_SIZE), MAX_PAGE_SIZE);
  return Math.round(clamped / PAGE_SIZE_STEP) * PAGE_SIZE_STEP;
}

function sanitizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNullableInteger(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeOptionalDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Date invalide: ${value}`);
  }

  return date.toISOString();
}

function createInitialManifest(options) {
  const now = new Date().toISOString();
  return {
    job_id: `${now.slice(0, 19).replaceAll(":", "-")}_${options.assetUid}`,
    asset_uid: options.assetUid,
    mission_id: options.mission.id,
    mission_label: options.missionLabel || options.mission.name,
    status: "running",
    filters: {
      mode: options.mode,
      page_size: options.pageSize,
      ...options.filters
    },
    pages_read: 0,
    submissions_read: 0,
    submissions_imported: 0,
    last_next_url: null,
    started_at: now,
    updated_at: now,
    errors: []
  };
}

async function fetchPageWithRetry(koboClient, url, { retries, timeoutMs }) {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fetchPage(koboClient, url, timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt >= retries) {
        break;
      }
      await sleep(250 * attempt * attempt);
    }
  }

  throw lastError;
}

async function fetchPage(koboClient, url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await koboClient.fetchImpl(url, {
      signal: controller.signal,
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
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Timeout KoboToolbox après ${timeoutMs} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function safeResponseText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
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

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  buildKoboDataParams,
  buildKoboFilterQuery,
  getAdvancedKoboSyncStatus,
  listAdvancedKoboSyncManifests,
  normalizeAdvancedSyncOptions,
  runAdvancedKoboSync,
  startAdvancedKoboSyncJob
};
