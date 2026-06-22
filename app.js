require("dotenv").config();

const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const missionRoutes = require("./routes/missionRoutes");
const userRoutes = require("./routes/userRoutes");
const equipeRoutes = require("./routes/equipeRoutes");
const agentCollecteRoutes = require("./routes/agentCollecteRoutes");
const sigRoutes = require("./routes/sigRoutes");
const infographieRoutes = require("./routes/infographieRoutes");
const submissionRoutes = require("./routes/submissionRoutes");
const koboAdminRoutes = require("./routes/koboAdminRoutes");
const siteSearchRoutes = require("./routes/siteSearchRoutes");
const sitesPlanningRoutes = require("./routes/sitesPlanningRoutes");
const sitesPlanningApiRoutes = require("./routes/sitesPlanningApiRoutes");
const { currentUser } = require("./middlewares/authMiddleware");
const { i18nMiddleware } = require("./services/i18nService");
const Mission = require("./models/Mission");
const SiteSearch = require("./models/SiteSearch");
const { getKoboConfigStatus } = require("./services/koboSyncService");
require("./config/database");

const app = express();
const faviconVariant = resolveFaviconVariant();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: false, limit: "10mb" }));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(i18nMiddleware);
app.use(currentUser);
app.use((req, res, next) => {
  res.locals.faviconPath = `/assets/favicons/g2m-favicon-${faviconVariant}.ico`;
  res.locals.faviconPngPath = `/assets/favicons/g2m-favicon-${faviconVariant}.png`;
  res.locals.koboQuickSync = buildKoboQuickSyncState(req.currentUser);
  res.locals.siteSearchConfig = SiteSearch.config();
  next();
});

app.use("/", authRoutes);
app.use("/admin", adminRoutes);
app.use("/", dashboardRoutes);
app.use("/missions", missionRoutes);
app.use("/users", userRoutes);
app.use("/equipes", equipeRoutes);
app.use("/agents", agentCollecteRoutes);
app.use("/cartographie", sigRoutes);
app.use("/sites", sitesPlanningRoutes);
app.use("/infographies", infographieRoutes);
app.use("/soumissions", submissionRoutes);
app.use("/parametrages/kobo", koboAdminRoutes);
app.use("/api/sites", sitesPlanningApiRoutes);
app.use("/api", siteSearchRoutes);

app.use((req, res) => {
  res.status(404).render("errors/404", { title: req.t("errors.404.title") });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render("errors/500", { title: req.t("errors.500.title") });
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Serveur demarre sur http://localhost:${port}`);
  });
}

module.exports = app;

function resolveFaviconVariant() {
  const configuredVariant = String(process.env.G2M_FAVICON_VARIANT || "").toLowerCase();
  if (["online", "local"].includes(configuredVariant)) {
    return configuredVariant;
  }

  return process.env.RENDER || process.env.NODE_ENV === "production"
    ? "online"
    : "local";
}

function buildKoboQuickSyncState(user) {
  const visible = user && ["admin", "superviseur"].includes(user.role);
  if (!visible) {
    return { visible: false, enabled: false };
  }

  const config = getKoboConfigStatus();
  const hasConfiguredMission = Mission.allActive().some((mission) => Boolean(mission.kobo_asset_uid));
  return {
    visible: true,
    enabled: Boolean(config.ready && (config.defaultAssetUid || hasConfiguredMission)),
    href: "/cartographie?kobo=1"
  };
}
