const fs = require("fs");
const path = require("path");

const DEFAULT_LOCALE = "fr";
const LOCALES_DIR = path.join(__dirname, "..", "locales");

function loadTranslations() {
  return fs.readdirSync(LOCALES_DIR)
    .filter((file) => file.endsWith(".json"))
    .reduce((catalog, file) => {
      const locale = path.basename(file, ".json");
      const content = fs.readFileSync(path.join(LOCALES_DIR, file), "utf8");
      catalog[locale] = JSON.parse(content);
      return catalog;
    }, {});
}

const translations = loadTranslations();
const supportedLocales = Object.keys(translations);
const LOCALE_COOKIE = "g2m_locale";

function i18nMiddleware(req, res, next) {
  const requestedLocale = resolveRequestedLocale(req);
  const locale = requestedLocale || resolveLocale(req);

  if (requestedLocale) {
    res.setHeader(
      "Set-Cookie",
      `${LOCALE_COOKIE}=${requestedLocale}; Path=/; Max-Age=31536000; SameSite=Lax`
    );
  }

  req.locale = locale;
  req.t = (key, variables) => translate(key, locale, variables);
  res.locals.locale = locale;
  res.locals.supportedLocales = supportedLocales;
  res.locals.localeUrls = buildLocaleUrls(req);
  res.locals.t = req.t;

  next();
}

function resolveLocale(req) {
  const cookieLocale = parseCookies(req.headers.cookie || "")[LOCALE_COOKIE];
  if (supportedLocales.includes(cookieLocale)) {
    return cookieLocale;
  }

  const accepted = String(req.headers["accept-language"] || "")
    .split(",")
    .map((entry) => entry.trim().slice(0, 2).toLowerCase())
    .find((entry) => supportedLocales.includes(entry));

  return accepted || DEFAULT_LOCALE;
}

function resolveRequestedLocale(req) {
  const requested = String(req.query.lang || "").toLowerCase();
  return supportedLocales.includes(requested) ? requested : null;
}

function parseCookies(cookieHeader) {
  return cookieHeader.split(";").reduce((cookies, part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) {
      return cookies;
    }
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function buildLocaleUrls(req) {
  return supportedLocales.reduce((urls, locale) => {
    const url = new URL(req.originalUrl || req.url || "/", "http://g2m.local");
    url.searchParams.set("lang", locale);
    urls[locale] = `${url.pathname}${url.search}`;
    return urls;
  }, {});
}

function translate(key, locale = DEFAULT_LOCALE, variables = {}) {
  const value = translations[locale]?.[key]
    ?? translations[DEFAULT_LOCALE]?.[key]
    ?? key;

  return interpolate(value, variables);
}

function interpolate(value, variables = {}) {
  return Object.entries(variables).reduce(
    (text, [key, variableValue]) => text.replaceAll(`{{${key}}}`, String(variableValue)),
    value
  );
}

module.exports = {
  DEFAULT_LOCALE,
  i18nMiddleware,
  LOCALE_COOKIE,
  supportedLocales,
  translate
};
