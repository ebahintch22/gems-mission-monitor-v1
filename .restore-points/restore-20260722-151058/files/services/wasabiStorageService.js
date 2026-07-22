const crypto = require("node:crypto");
const path = require("node:path");

const DEFAULT_SIGNED_URL_TTL_SECONDS = 900;
const STORAGE_PROVIDER = "wasabi";

function getWasabiConfig(env = process.env) {
  const region = String(env.WASABI_REGION || "").trim();
  const endpoint = normalizeEndpoint(env.WASABI_ENDPOINT || (region ? `https://s3.${region}.wasabisys.com` : ""));
  return {
    accessKeyId: String(env.WASABI_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: String(env.WASABI_SECRET_ACCESS_KEY || "").trim(),
    region,
    bucket: String(env.WASABI_BUCKET || "").trim(),
    endpoint,
    provider: STORAGE_PROVIDER
  };
}

function getWasabiStatus(env = process.env) {
  const config = getWasabiConfig(env);
  return {
    provider: STORAGE_PROVIDER,
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint,
    ready: Boolean(config.accessKeyId && config.secretAccessKey && config.region && config.bucket && config.endpoint)
  };
}

function createMediaObjectKey({
  mediaId,
  originalFilename,
  variant = "original",
  environment = process.env.NODE_ENV || "local",
  now = new Date()
} = {}) {
  const id = String(mediaId || crypto.randomUUID()).trim();
  const safeVariant = sanitizePathSegment(variant || "original");
  const safeEnvironment = sanitizePathSegment(environment || "local");
  const safeFilename = sanitizeFileName(originalFilename || "file.bin");
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `media/${safeEnvironment}/${year}/${month}/${id}/${safeVariant}/${safeFilename}`;
}

function createPresignedUrl({
  method = "GET",
  objectKey,
  expiresIn = DEFAULT_SIGNED_URL_TTL_SECONDS,
  responseContentDisposition,
  now = new Date(),
  env = process.env
} = {}) {
  const config = assertReadyConfig(getWasabiConfig(env));
  const endpoint = new URL(config.endpoint);
  const requestDate = amzDate(now);
  const dateStamp = requestDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const host = endpoint.host;
  const canonicalUri = `/${uriEncodePath(`${config.bucket}/${objectKey}`)}`;
  const query = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": requestDate,
    "X-Amz-Expires": String(normalizeExpiresIn(expiresIn)),
    "X-Amz-SignedHeaders": "host"
  };
  if (responseContentDisposition) {
    query["response-content-disposition"] = responseContentDisposition;
  }

  const canonicalQueryString = canonicalQuery(query);
  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQueryString,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD"
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    requestDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const signature = hmacHex(signingKey(config.secretAccessKey, dateStamp, config.region), stringToSign);

  return `${endpoint.origin}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

async function uploadBuffer({
  objectKey,
  body,
  contentType = "application/octet-stream",
  env = process.env,
  fetchImpl = fetch
} = {}) {
  const config = assertReadyConfig(getWasabiConfig(env));
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body || "");
  const endpoint = new URL(config.endpoint);
  const requestDate = amzDate(new Date());
  const dateStamp = requestDate.slice(0, 8);
  const host = endpoint.host;
  const canonicalUri = `/${uriEncodePath(`${config.bucket}/${objectKey}`)}`;
  const payloadHash = sha256Hex(buffer);
  const headers = {
    "content-length": String(buffer.length),
    "content-type": contentType,
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": requestDate
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort()
    .map((key) => `${key}:${headers[key]}`)
    .join("\n");
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "",
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash
  ].join("\n");
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    requestDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const signature = hmacHex(signingKey(config.secretAccessKey, dateStamp, config.region), stringToSign);
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`
  ].join(", ");

  const response = await fetchImpl(`${endpoint.origin}${canonicalUri}`, {
    method: "PUT",
    headers: {
      Authorization: authorization,
      "Content-Length": headers["content-length"],
      "Content-Type": headers["content-type"],
      "Host": headers.host,
      "X-Amz-Content-Sha256": headers["x-amz-content-sha256"],
      "X-Amz-Date": headers["x-amz-date"]
    },
    body: buffer
  });

  if (!response.ok) {
    const message = typeof response.text === "function" ? await response.text() : response.statusText;
    const error = new Error(`Upload Wasabi impossible (${response.status}): ${message}`);
    error.statusCode = response.status;
    throw error;
  }

  return {
    bucket: config.bucket,
    object_key: objectKey,
    size_bytes: buffer.length,
    checksum_sha256: payloadHash
  };
}

function detectMediaType(mimeType, filename = "") {
  const mime = String(mimeType || "").toLowerCase();
  const extension = path.extname(filename || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf" || extension === ".pdf") return "pdf";
  if ([".zip", ".rar", ".7z", ".tar", ".gz"].includes(extension)) return "archive";
  if (
    mime.startsWith("text/")
    || mime.includes("document")
    || mime.includes("spreadsheet")
    || mime.includes("presentation")
    || [".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".txt"].includes(extension)
  ) {
    return "document";
  }
  return "other";
}

function checksumSha256(value) {
  return sha256Hex(Buffer.isBuffer(value) ? value : Buffer.from(value || ""));
}

function assertReadyConfig(config) {
  const missing = [
    ["WASABI_ACCESS_KEY_ID", config.accessKeyId],
    ["WASABI_SECRET_ACCESS_KEY", config.secretAccessKey],
    ["WASABI_REGION", config.region],
    ["WASABI_BUCKET", config.bucket],
    ["WASABI_ENDPOINT", config.endpoint]
  ].filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    const error = new Error(`Configuration Wasabi incomplete: ${missing.join(", ")}`);
    error.statusCode = 503;
    throw error;
  }
  return config;
}

function normalizeEndpoint(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeExpiresIn(value) {
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds <= 0) {
    return DEFAULT_SIGNED_URL_TTL_SECONDS;
  }
  return Math.min(seconds, 60 * 60 * 24 * 7);
}

function sanitizePathSegment(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "default";
}

function sanitizeFileName(value) {
  const basename = path.basename(String(value || "file.bin"));
  return basename
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 180) || "file.bin";
}

function uriEncodePath(value) {
  return String(value).split("/").map(encodeURIComponent).join("/");
}

function canonicalQuery(query) {
  return Object.keys(query).sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`)
    .join("&");
}

function amzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key, value) {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function hmacHex(key, value) {
  return crypto.createHmac("sha256", key).update(value).digest("hex");
}

function signingKey(secretAccessKey, dateStamp, region) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

module.exports = {
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  checksumSha256,
  createMediaObjectKey,
  createPresignedUrl,
  detectMediaType,
  getWasabiConfig,
  getWasabiStatus,
  sanitizeFileName,
  uploadBuffer
};
