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

function i18nMiddleware(req, res, next) {
  const locale = resolveLocale(req);

  req.locale = locale;
  req.t = (key, variables) => translate(key, locale, variables);
  res.locals.locale = locale;
  res.locals.t = req.t;

  next();
}

function resolveLocale(req) {
  const requested = String(req.query.lang || "").toLowerCase();
  if (supportedLocales.includes(requested)) {
    return requested;
  }

  const accepted = String(req.headers["accept-language"] || "")
    .split(",")
    .map((entry) => entry.trim().slice(0, 2).toLowerCase())
    .find((entry) => supportedLocales.includes(entry));

  return accepted || DEFAULT_LOCALE;
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
  supportedLocales,
  translate
};
