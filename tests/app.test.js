process.env.DATABASE_PATH = ":memory:";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const request = require("supertest");
const app = require("../app");
const db = require("../config/database");
const { LOCALE_COOKIE } = require("../services/i18nService");
const { importTerritories } = require("../services/territoryImportService");
const { importRoles } = require("../services/roleImportService");
const { importAgents } = require("../services/agentImportService");
const { seedSubmissions } = require("../services/submissionSeedService");
const { listKoboAssets } = require("../services/koboSyncService");
const { hashToken } = require("../services/tokenService");
const { hashPassword } = require("../services/passwordService");

const roleCsv = [
  "Role;Label;description",
  "admin;Administrateur systeme;Parametrage general",
  "directeur_mission;Directeur de Mission;Pilotage global",
  "coordinateur;Coordinateur national;Vue globale",
  "superviseur;Superviseur regional;Suivi des agents",
  "agent;Enqueteur;Collecte de donnees",
  "controleur;Controleur qualite;Detection des anomalies",
  "specialiste_analyste_donnees;Specialiste Analyste de Donnees;Analyse et indicateurs",
  "partenaire;Partenaire;Consultation",
  "specialiste_gis;Responsable SIG;Cartographie"
].join("\n");

importRoles(db, roleCsv);

test.after(() => db.close());

async function loginTestUser({ email, role }) {
  const password = "AdminTest123";
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  const passwordHash = await hashPassword(password);

  if (existing) {
    db.prepare(`
      UPDATE users
      SET role = ?, statut = 'actif', email_verified = 1, password_hash = ?
      WHERE id = ?
    `).run(role, passwordHash, existing.id);
  } else {
    db.prepare(`
      INSERT INTO users (
        nom, prenoms, email, role, statut, email_verified, password_hash
      ) VALUES (
        ?, ?, ?, ?, 'actif', 1, ?
      )
    `).run("Test", role, email, role, passwordHash);
  }

  const loginResponse = await request(app)
    .post("/login")
    .type("form")
    .send({ email, password });

  assert.equal(loginResponse.status, 302);
  return loginResponse.headers["set-cookie"];
}

async function loginAdmin(email = "admin.tests@g2m.test") {
  return loginTestUser({ email, role: "admin" });
}

function grantRolePermission(role, permissionCode, options = {}) {
  db.prepare(`
    INSERT INTO role_permissions (role, permission_id, allowed, locked, source)
    SELECT ?, id, ?, ?, ?
    FROM permissions
    WHERE code_permission = ?
    ON CONFLICT(role, permission_id) DO UPDATE SET
      allowed = excluded.allowed,
      locked = excluded.locked,
      source = excluded.source,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    role,
    options.allowed ?? 1,
    options.locked ?? 0,
    options.source || "admin",
    permissionCode
  );
}

test("les favicons G2M locale et en ligne sont disponibles", () => {
  [
    "g2m-favicon-online.ico",
    "g2m-favicon-online.png",
    "g2m-favicon-online-source.png",
    "g2m-favicon-local.ico",
    "g2m-favicon-local.png",
    "g2m-favicon-local-source.png"
  ].forEach((fileName) => {
    const filePath = path.join(__dirname, "..", "public", "assets", "favicons", fileName);
    assert.equal(fs.existsSync(filePath), true);
    assert.equal(fs.statSync(filePath).size > 0, true);
  });
});

test("le referentiel territorial stocke la hierarchie et la geometrie GeoJSON", () => {
  const geometry = JSON.stringify({
    type: "Polygon",
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]]
  });

  const regionResult = db.prepare(`
    INSERT INTO regions (code_region, nom_region, geometry_geojson)
    VALUES (?, ?, ?)
  `).run("CI01", "District Autonome d'Abidjan", geometry);
  const departementResult = db.prepare(`
    INSERT INTO departements (code_departement, nom_departement, region_id, geometry_geojson)
    VALUES (?, ?, ?, ?)
  `).run("CI0101", "Abidjan", regionResult.lastInsertRowid, geometry);
  db.prepare(`
    INSERT INTO sous_prefectures (
      code_sous_prefecture, nom_sous_prefecture, departement_id, geometry_geojson
    ) VALUES (?, ?, ?, ?)
  `).run("CI010101", "Abidjan", departementResult.lastInsertRowid, geometry);

  const sousPrefecture = db.prepare(`
    SELECT sp.code_sous_prefecture, sp.geometry_geojson, d.code_departement, r.code_region
    FROM sous_prefectures sp
    JOIN departements d ON d.id = sp.departement_id
    JOIN regions r ON r.id = d.region_id
    WHERE sp.code_sous_prefecture = ?
  `).get("CI010101");

  assert.equal(sousPrefecture.code_region, "CI01");
  assert.equal(sousPrefecture.code_departement, "CI0101");
  assert.deepEqual(JSON.parse(sousPrefecture.geometry_geojson), JSON.parse(geometry));
  assert.throws(() => {
    db.prepare(`
      INSERT INTO departements (code_departement, nom_departement, region_id)
      VALUES (?, ?, ?)
    `).run("INVALID", "Sans region", 999);
  }, /FOREIGN KEY constraint failed/);
});

test("l'import territorial agrege les geometries et peut etre rejoue", () => {
  const territoryGeoJson = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          ADM1_PCODE: "TEST01",
          ADM1_FR: "Region test",
          ADM2_PCODE: "TEST0101",
          ADM2_FR: "Departement test",
          ADM3_PCODE: "TEST010101",
          ADM3_FR: "Sous-prefecture A"
        },
        geometry: {
          type: "Polygon",
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
        }
      },
      {
        type: "Feature",
        properties: {
          ADM1_PCODE: "TEST01",
          ADM1_FR: "Region test",
          ADM2_PCODE: "TEST0101",
          ADM2_FR: "Departement test",
          ADM3_PCODE: "TEST010102",
          ADM3_FR: "Sous-prefecture B"
        },
        geometry: {
          type: "Polygon",
          coordinates: [[[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]]
        }
      }
    ]
  };

  const firstImport = importTerritories(db, territoryGeoJson);
  const secondImport = importTerritories(db, territoryGeoJson);
  const region = db.prepare("SELECT geometry_geojson FROM regions WHERE code_region = ?").get("TEST01");
  const departement = db.prepare(`
    SELECT geometry_geojson FROM departements WHERE code_departement = ?
  `).get("TEST0101");
  const count = db.prepare(`
    SELECT COUNT(*) AS total FROM sous_prefectures WHERE code_sous_prefecture LIKE 'TEST%'
  `).get().total;

  assert.deepEqual(firstImport, { regions: 1, departements: 1, sousPrefectures: 2 });
  assert.deepEqual(secondImport, firstImport);
  assert.equal(count, 2);
  assert.equal(JSON.parse(region.geometry_geojson).type, "Polygon");
  assert.equal(JSON.parse(departement.geometry_geojson).type, "Polygon");
});

test("l'import des roles alimente le referentiel utilise par les utilisateurs", async () => {
  const adminCookie = await loginAdmin("admin.roles@g2m.test");
  const secondImport = importRoles(db, roleCsv);
  const roles = db.prepare("SELECT code_role, label FROM roles ORDER BY code_role").all();
  const formResponse = await request(app).get("/users/new").set("Cookie", adminCookie);

  assert.deepEqual(secondImport, { roles: 9 });
  assert.equal(roles.length, 9);
  assert.deepEqual(
    roles.find((role) => role.code_role === "controleur"),
    { code_role: "controleur", label: "Controleur qualite" }
  );
  assert.equal(formResponse.status, 200);
  assert.match(formResponse.text, /Controleur qualite/);
});

test("GET / affiche le tableau de bord", async () => {
  const response = await request(app).get("/");
  const styleResponse = await request(app).get("/css/app.css");
  const navigationScriptResponse = await request(app).get("/js/navigation.js");
  const navigation = response.text.match(/<nav id="site-nav" aria-label="Navigation principale">[\s\S]*?<\/nav>/)[0];

  assert.equal(response.status, 200);
  assert.equal(styleResponse.status, 200);
  assert.equal(navigationScriptResponse.status, 200);
  assert.match(response.text, /Tableau de bord/);
  assert.match(response.text, /Total missions/);
  assert.match(response.text, /Suivi opérationnel/);
  assert.match(response.text, /Vue synthétique des missions de collecte enregistrées/);
  assert.match(response.text, /Créer une mission/);
  assert.match(response.text, /Missions récentes/);
  assert.match(response.text, /Logo%20Rakall\.png/);
  assert.match(response.text, /GEMS Mission Monitor/);
  assert.match(response.text, /G2M/);
  assert.match(response.text, /<html lang="fr" data-display-size="medium">/);
  assert.match(response.text, /localStorage\.getItem\("g2m_display_size"\)/);
  assert.match(response.text, /href="\/assets\/favicons\/g2m-favicon-local\.ico"/);
  assert.match(response.text, /href="\/assets\/favicons\/g2m-favicon-local\.png"/);
  assert.match(response.text, /Livraison v0\.5 du 09 juin 2026 \[Fiche décisionnelle\]/);
  assert.match(response.text, /id="site-nav-toggle"/);
  assert.match(response.text, /aria-controls="site-nav"/);
  assert.match(response.text, /data-label-open="Afficher le menu de navigation"/);
  assert.match(response.text, /data-label-close="Masquer le menu de navigation"/);
  assert.match(response.text, /<nav id="site-nav" aria-label="Navigation principale">/);
  assert.match(response.text, /font-awesome\/6\.5\.2\/css\/all\.min\.css/);
  assert.match(navigation, /class="nav-button" href="\/"/);
  assert.match(navigation, /fa-solid fa-chart-line/);
  assert.match(navigation, /href="\/login"/);
  assert.match(navigation, /Connexion/);
  assert.match(navigation, /fa-solid fa-right-to-bracket/);
  assert.match(navigation, /fa-solid fa-sliders/);
  assert.match(navigation, /title="Personnalisation"/);
  assert.match(navigation, /Personnalisation/);
  assert.match(navigation, /class="nav-menu-panel nav-personalization-panel"/);
  assert.match(navigation, /href="\/\?lang=fr"[\s\S]*Français/);
  assert.match(navigation, /href="\/\?lang=en"[\s\S]*English/);
  assert.match(navigation, /href="\/\?lang=es"[\s\S]*Español/);
  assert.match(navigation, /data-display-size-value="small"[\s\S]*Petit/);
  assert.match(navigation, /data-display-size-value="medium"[\s\S]*Moyen/);
  assert.match(navigation, /data-display-size-value="large"[\s\S]*Grand/);
  assert.match(navigation, /class="nav-button nav-menu-trigger"/);
  assert.doesNotMatch(navigation, /fa-solid fa-gear/);
  assert.doesNotMatch(navigation, /Param/);
  assert.match(navigation, /fa-solid fa-chevron-down nav-menu-chevron/);
  assert.doesNotMatch(navigation, /Visualisation/);
  assert.doesNotMatch(navigation, /fa-solid fa-eye/);
  assert.doesNotMatch(navigation, /class="nav-button" href="\/cartographie"/);
  assert.doesNotMatch(navigation, /fa-solid fa-map-location-dot/);
  assert.doesNotMatch(navigation, /fa-solid fa-chart-pie/);
  assert.doesNotMatch(navigation, /Infographie/);
  assert.doesNotMatch(navigation, /href="\/infographies\/mission-globale" role="menuitem">Mission globale/);
  assert.doesNotMatch(navigation, /href="\/infographies\/par-superviseur" role="menuitem">Par superviseur/);
  assert.doesNotMatch(navigation, /href="\/infographies\/par-region" role="menuitem">Par r/);
  assert.doesNotMatch(navigation, /Cartographie[\s\S]*Infographie/);
  assert.doesNotMatch(navigation, /Configuration/);
  assert.doesNotMatch(response.text, /role="menuitem">Missions/);
  assert.doesNotMatch(response.text, /role="menuitem">.*quipes/);
  assert.doesNotMatch(response.text, /role="menuitem">Agents/);
  assert.doesNotMatch(response.text, /role="menuitem">Utilisateurs/);
  assert.doesNotMatch(response.text, /href="\/parametrages\/kobo" role="menuitem">KoboToolbox/);
  assert.doesNotMatch(navigation, /href="\/missions\/new"/);
  assert.match(response.text, /\/js\/navigation\.js/);
  assert.match(styleResponse.text, /\.nav-menu\.is-open \.nav-menu-panel/);
  assert.doesNotMatch(styleResponse.text, /\.nav-menu:hover \.nav-menu-panel/);
  assert.match(styleResponse.text, /--font-body: 15px/);
  assert.match(styleResponse.text, /html\[data-display-size="small"\]/);
  assert.match(styleResponse.text, /--font-body: 13px/);
  assert.match(styleResponse.text, /html\[data-display-size="large"\]/);
  assert.match(styleResponse.text, /--font-body: 18px/);
  assert.match(styleResponse.text, /\.nav-personalization-panel/);
  assert.match(styleResponse.text, /\.nav-menu-section-title/);
  assert.match(styleResponse.text, /\.display-size-option\.is-active/);
  assert.match(styleResponse.text, /input::placeholder,\s*textarea::placeholder/);
  assert.match(styleResponse.text, /color: #aeb8c0/);
  assert.match(styleResponse.text, /font-style: italic/);
  assert.match(styleResponse.text, /font-weight: 600/);
  assert.match(navigationScriptResponse.text, /trigger\.addEventListener\("click"/);
  assert.match(navigationScriptResponse.text, /aria-expanded/);
  assert.match(navigationScriptResponse.text, /dataset\.labelOpen/);
  assert.match(navigationScriptResponse.text, /dataset\.labelClose/);
  assert.match(navigationScriptResponse.text, /g2m_display_size/);
  assert.match(navigationScriptResponse.text, /applyDisplaySize/);
  assert.match(navigationScriptResponse.text, /localStorage\.setItem\(displaySizeStorageKey, displaySize\)/);
  assert.match(navigationScriptResponse.text, /event\.key === "Escape"/);
  assert.match(navigationScriptResponse.text, /siteHeader\.classList\.toggle\("is-nav-open"\)/);
  assert.match(navigationScriptResponse.text, /closeSiteNav/);
});

test("la navigation affiche seulement les liens autorises", async () => {
  const adminCookie = await loginAdmin("admin.navigation@g2m.test");
  const agentCookie = await loginTestUser({
    email: "agent.navigation@g2m.test",
    role: "agent"
  });
  const partnerCookie = await loginTestUser({
    email: "partenaire.navigation@g2m.test",
    role: "partenaire"
  });

  const adminResponse = await request(app).get("/").set("Cookie", adminCookie);
  const agentResponse = await request(app).get("/").set("Cookie", agentCookie);
  const partnerResponse = await request(app).get("/").set("Cookie", partnerCookie);
  const adminNavigation = adminResponse.text.match(/<nav id="site-nav" aria-label="Navigation principale">[\s\S]*?<\/nav>/)[0];
  const agentNavigation = agentResponse.text.match(/<nav id="site-nav" aria-label="Navigation principale">[\s\S]*?<\/nav>/)[0];
  const partnerNavigation = partnerResponse.text.match(/<nav id="site-nav" aria-label="Navigation principale">[\s\S]*?<\/nav>/)[0];

  assert.match(adminNavigation, /Visualisation/);
  assert.match(adminNavigation, /fa-solid fa-eye/);
  assert.match(adminNavigation, /href="\/cartographie" role="menuitem">Cartographie/);
  assert.match(adminNavigation, /class="nav-menu-panel-title">Infographie/);
  assert.match(adminNavigation, /href="\/infographies\/mission-globale"/);
  assert.match(adminNavigation, /href="\/missions" role="menuitem">Missions/);
  assert.match(adminNavigation, /href="\/equipes" role="menuitem">/);
  assert.match(adminNavigation, /href="\/agents" role="menuitem">Agents/);
  assert.match(adminNavigation, /href="\/users" role="menuitem">Utilisateurs/);
  assert.match(adminNavigation, /href="\/parametrages\/kobo" role="menuitem">KoboToolbox/);
  assert.match(adminNavigation, /href="\/admin" role="menuitem">Administration/);
  assert.match(adminNavigation, /class="nav-session-initials">AT</);
  assert.match(adminNavigation, /admin Test/);
  assert.match(adminNavigation, /admin\.navigation@g2m\.test/);
  assert.match(adminNavigation, /Administrateur systeme/);
  assert.match(adminNavigation, /action="\/logout" method="post"/);
  assert.match(adminNavigation, /Déconnexion/);

  assert.match(agentNavigation, /class="nav-button" href="\/"/);
  assert.match(agentNavigation, /Personnalisation/);
  assert.match(agentNavigation, /class="nav-session-initials">AT</);
  assert.match(agentNavigation, /agent Test/);
  assert.match(agentNavigation, /agent\.navigation@g2m\.test/);
  assert.match(agentNavigation, /Enqueteur/);
  assert.match(agentNavigation, /action="\/logout" method="post"/);
  assert.doesNotMatch(agentNavigation, /href="\/login"/);
  assert.doesNotMatch(agentNavigation, /href="\/cartographie"/);
  assert.doesNotMatch(agentNavigation, /href="\/infographies\/mission-globale"/);
  assert.doesNotMatch(agentNavigation, /href="\/missions" role="menuitem">Missions/);
  assert.doesNotMatch(agentNavigation, /href="\/admin" role="menuitem">Administration/);

  assert.match(partnerNavigation, /Visualisation/);
  assert.match(partnerNavigation, /class="nav-menu-panel-title">Infographie/);
  assert.match(partnerNavigation, /href="\/infographies\/mission-globale"/);
  assert.doesNotMatch(partnerNavigation, /href="\/cartographie" role="menuitem">Cartographie/);
});

test("GET /?lang=en utilise les ressources anglaises du dashboard", async () => {
  const response = await request(app).get("/?lang=en");

  assert.equal(response.status, 200);
  assert.match(response.text, /<html lang="en" data-display-size="medium">/);
  assert.match(response.text, /data-label-open="Show navigation menu"/);
  assert.match(response.text, /data-label-close="Hide navigation menu"/);
  assert.match(response.text, /title="Personalization"/);
  assert.match(response.text, /Language/);
  assert.match(response.text, /Display size/);
  assert.match(response.text, /class="is-active"[\s\S]*href="\/\?lang=en"[\s\S]*English/);
  assert.match(response.text, /Operational monitoring/);
  assert.match(response.text, /Synthetic view of registered collection missions/);
  assert.match(response.text, /Create a mission/);
  assert.match(response.text, /Ongoing/);
  assert.match(response.text, /Completed/);
  assert.match(response.text, /Recent missions/);
});

test("GET /?lang=es utilise les ressources espagnoles du dashboard", async () => {
  const response = await request(app).get("/?lang=es");

  assert.equal(response.status, 200);
  assert.match(response.text, /<html lang="es" data-display-size="medium">/);
  assert.match(response.text, /Entrega v0\.5 del 09 de junio de 2026/);
  assert.match(response.text, /Seguimiento operativo/);
  assert.match(response.text, /Vista sint/);
  assert.match(response.text, /Crear una misi/);
  assert.match(response.text, /Misiones recientes/);
  assert.match(response.text, /class="is-active"[\s\S]*href="\/\?lang=es"[\s\S]*Espa/);
});

test("GET /infographies expose les pages factices", async () => {
  const readerCookie = await loginTestUser({
    email: "partenaire.infographies@g2m.test",
    role: "partenaire"
  });
  const globalResponse = await request(app)
    .get("/infographies/mission-globale")
    .set("Cookie", readerCookie);
  const supervisorResponse = await request(app)
    .get("/infographies/par-superviseur")
    .set("Cookie", readerCookie);
  const regionResponse = await request(app)
    .get("/infographies/par-region?lang=en")
    .set("Cookie", readerCookie);

  assert.equal(globalResponse.status, 200);
  assert.match(globalResponse.text, /Infographie mission globale/);
  assert.match(globalResponse.text, /Infographie sur la mission globale - Page en construction/);

  assert.equal(supervisorResponse.status, 200);
  assert.match(supervisorResponse.text, /Infographie par superviseur/);
  assert.match(supervisorResponse.text, /Infographie sur les superviseurs - Page en construction/);

  assert.equal(regionResponse.status, 200);
  assert.match(regionResponse.text, /<html lang="en" data-display-size="medium">/);
  assert.match(regionResponse.text, /Infographic by region/);
  assert.match(regionResponse.text, /Infographic about regions - Page under construction/);
});

test("GET /infographies exige infographics.read", async () => {
  const userCookie = await loginTestUser({
    email: "agent.infographies-denied@g2m.test",
    role: "agent"
  });

  const anonymousResponse = await request(app).get("/infographies/mission-globale");
  const deniedResponse = await request(app)
    .get("/infographies/mission-globale")
    .set("Cookie", userCookie);

  assert.equal(anonymousResponse.status, 302);
  assert.equal(anonymousResponse.headers.location, "/login?next=%2Finfographies%2Fmission-globale");
  assert.equal(deniedResponse.status, 403);
});

test("le choix de langue est conserve dans un cookie", async () => {
  const languageResponse = await request(app).get("/?lang=en");
  const cookie = languageResponse.headers["set-cookie"]
    .find((entry) => entry.startsWith(`${LOCALE_COOKIE}=en`));
  const dashboardResponse = await request(app)
    .get("/")
    .set("Cookie", cookie);

  assert.match(cookie, /Path=\//);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(dashboardResponse.status, 200);
  assert.match(dashboardResponse.text, /<html lang="en" data-display-size="medium">/);
  assert.match(dashboardResponse.text, /Operational monitoring/);
});

test("GET /parametrages/kobo affiche l'administration KoboToolbox", async () => {
  const adminCookie = await loginAdmin("admin.kobo@g2m.test");
  const response = await request(app).get("/parametrages/kobo").set("Cookie", adminCookie);
  const styleResponse = await request(app).get("/css/app.css");
  const viewerScriptResponse = await request(app).get("/js/kobo-json-viewer.js");
  const tabsScriptResponse = await request(app).get("/js/kobo-admin-tabs.js");
  const editorBundleResponse = await request(app).get("/vendor/vanilla-jsoneditor/standalone.js");

  assert.equal(response.status, 200);
  assert.equal(styleResponse.status, 200);
  assert.equal(viewerScriptResponse.status, 200);
  assert.equal(tabsScriptResponse.status, 200);
  assert.equal(editorBundleResponse.status, 200);
  assert.match(response.text, /Administration KoboToolbox/);
  assert.match(response.text, /id="kobo-workspace"/);
  assert.match(response.text, /data-initial-section="config"/);
  assert.match(response.text, /class="kobo-sidebar"/);
  assert.match(response.text, /data-kobo-section-target="config"/);
  assert.match(response.text, /data-kobo-section-target="sync"/);
  assert.match(response.text, /data-kobo-section-target="data"/);
  assert.match(response.text, /data-kobo-section="config"/);
  assert.match(response.text, /data-kobo-section="sync"/);
  assert.match(response.text, /data-kobo-section="data"/);
  assert.match(response.text, /Voir les donnees/);
  assert.match(response.text, /Aucune reponse KoboToolbox/);
  assert.match(response.text, /Tester la connexion/);
  assert.match(response.text, /Charger les formulaires/);
  assert.match(response.text, /Synchroniser les soumissions/);
  assert.match(response.text, /name="base_url"/);
  assert.match(response.text, /name="api_token"/);
  assert.match(response.text, /name="asset_uid"/);
  assert.match(response.text, /Par exemple : https:\/\/kf\.kobotoolbox\.org/);
  assert.match(response.text, /Par exemple : aBcDeF123/);
  assert.match(response.text, /name="mission_id"/);
  assert.match(response.text, /name="dry_run"/);
  assert.match(styleResponse.text, /\.kobo-workspace\s*\{/);
  assert.match(styleResponse.text, /\.kobo-sidebar\s*\{/);
  assert.match(styleResponse.text, /\.kobo-content\s*\{/);
  assert.match(styleResponse.text, /\.kobo-section\.is-active/);
  assert.match(styleResponse.text, /\.kobo-sync-form\s*\{/);
  assert.match(styleResponse.text, /\.kobo-summary\s*\{/);
  assert.match(styleResponse.text, /\.kobo-json-panel\s*\{/);
  assert.match(styleResponse.text, /\.kobo-json-panel\.is-collapsed/);
  assert.match(styleResponse.text, /\.kobo-json-editor\s*\{/);
  assert.match(viewerScriptResponse.text, /createJSONEditor/);
  assert.match(viewerScriptResponse.text, /readOnly: true/);
  assert.match(viewerScriptResponse.text, /navigator\.clipboard\.writeText/);
  assert.match(tabsScriptResponse.text, /data-kobo-section-target/);
  assert.match(tabsScriptResponse.text, /dataset\.initialSection/);
  assert.match(tabsScriptResponse.text, /aria-selected/);
});

test("GET /parametrages/kobo exige kobo.manage", async () => {
  const anonymousResponse = await request(app).get("/parametrages/kobo");
  const coordinatorCookie = await loginTestUser({
    email: "coordinateur.kobo-denied@g2m.test",
    role: "coordinateur"
  });
  const coordinatorResponse = await request(app)
    .get("/parametrages/kobo")
    .set("Cookie", coordinatorCookie);

  assert.equal(anonymousResponse.status, 302);
  assert.match(anonymousResponse.headers.location, /^\/login\?next=%2Fparametrages%2Fkobo/);
  assert.equal(coordinatorResponse.status, 403);
});

test("listKoboAssets peut retourner le payload Kobo brut sur demande", async () => {
  const payload = {
    count: 1,
    results: [{
      uid: "asset-001",
      name: "Questionnaire pilote",
      deployment__active: true,
      date_modified: "2026-06-05T10:00:00Z"
    }]
  };
  const result = await listKoboAssets({
    includePayload: true,
    client: {
      listAssets: async () => payload
    }
  });

  assert.deepEqual(result.payload, payload);
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].uid, "asset-001");
  assert.equal(result.assets[0].deploymentStatus, "actif");
});

test("GET /login affiche la page de connexion fermee", async () => {
  const response = await request(app).get("/login");

  assert.equal(response.status, 200);
  assert.match(response.text, /Connexion/);
  assert.match(response.text, /Accès réservé aux utilisateurs préautorisés/);
  assert.match(response.text, /class="auth-shell"/);
  assert.match(response.text, /Logo%20Rakall\.png/);
  assert.match(response.text, /name="email"/);
  assert.match(response.text, /name="password"/);
  assert.doesNotMatch(response.text, /id="site-nav"/);
  assert.doesNotMatch(response.text, /nav-button/);
});

test("POST /logout ferme la session courante", async () => {
  const adminCookie = await loginAdmin("admin.logout@g2m.test");
  const response = await request(app)
    .post("/logout")
    .set("Cookie", adminCookie);

  assert.equal(response.status, 302);
  assert.equal(response.headers.location, "/login");
  assert.match(String(response.headers["set-cookie"]), /g2m_auth=;/);
});

test("creation invitation puis demande de lien d'activation depuis login", async () => {
  const adminCookie = await loginAdmin("admin.invitation-create@g2m.test");
  const email = "invite.activation@g2m.test";
  const createResponse = await request(app)
    .post("/users/invitations")
    .set("Cookie", adminCookie)
    .type("form")
    .send({
      nom: "Activation",
      prenoms: "Invite",
      email,
      role: "partenaire",
      zone_affectation: "Nord",
      expires_in_days: "7"
    });

  assert.equal(createResponse.status, 302);
  assert.equal(createResponse.headers.location, "/users/invitations?created=1");

  const invitation = db.prepare("SELECT * FROM user_invitations WHERE email = ?").get(email);
  assert.equal(invitation.statut, "invite");
  assert.equal(invitation.role, "partenaire");

  const loginResponse = await request(app)
    .post("/login")
    .type("form")
    .send({ email, password: "" });

  assert.equal(loginResponse.status, 200);
  assert.match(loginResponse.text, /Si votre adresse est autorisée/);
  const tokenCount = db.prepare(`
    SELECT COUNT(*) AS count FROM activation_tokens WHERE invitation_id = ?
  `).get(invitation.id).count;
  assert.equal(tokenCount, 1);
});

test("activation par token valide puis connexion reussie", async () => {
  const email = "activation.complete@g2m.test";
  const invitationResult = db.prepare(`
    INSERT INTO user_invitations (
      email, nom, prenoms, role, invitation_token_hash, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    email,
    "Complete",
    "Activation",
    "partenaire",
    hashToken("seed-token"),
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  );
  const activationToken = "activation-token-test";
  db.prepare(`
    INSERT INTO activation_tokens (invitation_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `).run(
    invitationResult.lastInsertRowid,
    hashToken(activationToken),
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  );

  const activationResponse = await request(app)
    .post(`/activation/${activationToken}`)
    .type("form")
    .send({
      password: "MotDePasse10",
      password_confirm: "MotDePasse10"
    });

  assert.equal(activationResponse.status, 302);
  assert.equal(activationResponse.headers.location, "/login?activated=1");

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  assert.equal(user.statut, "actif");
  assert.equal(user.email_verified, 1);
  assert.notEqual(user.password_hash, "MotDePasse10");

  const loginResponse = await request(app)
    .post("/login")
    .type("form")
    .send({ email, password: "MotDePasse10" });

  assert.equal(loginResponse.status, 302);
  assert.equal(loginResponse.headers.location, "/");
  assert.match(String(loginResponse.headers["set-cookie"]), /g2m_auth=/);
});

test("GET /admin protege le panneau d'administration", async () => {
  const anonymousResponse = await request(app).get("/admin");
  assert.equal(anonymousResponse.status, 302);
  assert.match(anonymousResponse.headers.location, /^\/login\?next=/);

  const supervisorCookie = await loginTestUser({
    email: "superviseur.admin-access@g2m.test",
    role: "superviseur"
  });
  const supervisorResponse = await request(app)
    .get("/admin")
    .set("Cookie", supervisorCookie);

  assert.equal(supervisorResponse.status, 403);
  assert.match(supervisorResponse.text, /Acc.s non autoris/);
});

test("GET /admin affiche le hub admin pour un administrateur", async () => {
  const adminCookie = await loginTestUser({
    email: "admin.panel@g2m.test",
    role: "admin"
  });
  const response = await request(app)
    .get("/admin")
    .set("Cookie", adminCookie);

  assert.equal(response.status, 200);
  assert.match(response.text, /Panneau d&#39;administration/);
  assert.match(response.text, /Parametres globaux/);
  assert.match(response.text, /Rapport base de donnees/);
  assert.match(response.text, /href="\/admin\/settings"/);
  assert.match(response.text, /href="\/users\/invitations"/);
  assert.match(response.text, /href="\/admin\/email-test"/);
  assert.match(response.text, /href="\/admin" role="menuitem">Administration/);
});

test("les permissions systeme sont initialisees et verrouillees pour admin", () => {
  const permissionRows = db.prepare(`
    SELECT code_permission, is_system
    FROM permissions
    WHERE code_permission IN (
      'admin.access',
      'settings.manage',
      'users.manage',
      'users.invite.manage',
      'permissions.manage',
      'db.stats.read',
      'kobo.manage',
      'email.test',
      'exports.manage'
    )
    ORDER BY code_permission
  `).all();
  const adminLockedCount = db.prepare(`
    SELECT COUNT(*) AS total
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    WHERE rp.role = 'admin'
      AND rp.allowed = 1
      AND rp.locked = 1
      AND p.code_permission IN (
        'admin.access',
        'settings.manage',
        'users.manage',
        'users.invite.manage',
        'permissions.manage',
        'db.stats.read',
        'kobo.manage',
        'email.test'
      )
  `).get().total;

  assert.equal(permissionRows.length, 9);
  assert.equal(permissionRows.find((row) => row.code_permission === "kobo.manage").is_system, 1);
  assert.equal(permissionRows.find((row) => row.code_permission === "email.test").is_system, 1);
  assert.equal(permissionRows.find((row) => row.code_permission === "exports.manage").is_system, 0);
  assert.equal(adminLockedCount, 8);
});

test("la matrice fonctionnelle par defaut est initialisee sans verrouillage systeme", () => {
  const rows = db.prepare(`
    SELECT rp.role, p.code_permission, rp.allowed, rp.locked, rp.source
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    WHERE rp.role IN (
      'directeur_mission',
      'coordinateur',
      'superviseur',
      'controleur',
      'specialiste_gis',
      'specialiste_analyste_donnees',
      'partenaire',
      'agent'
    )
    ORDER BY rp.role, p.code_permission
  `).all();
  const byRole = rows.reduce((index, row) => {
    index[row.role] = index[row.role] || new Set();
    index[row.role].add(row.code_permission);
    assert.equal(row.locked, 0);
    assert.equal(row.source, "admin");
    return index;
  }, {});

  assert.equal(byRole.coordinateur.has("missions.manage"), true);
  assert.equal(byRole.coordinateur.has("agents.manage"), true);
  assert.equal(byRole.directeur_mission.has("exports.manage"), true);
  assert.equal(byRole.superviseur.has("teams.manage"), true);
  assert.equal(byRole.controleur.has("quality.manage"), true);
  assert.equal(byRole.specialiste_gis.has("sig.manage"), true);
  assert.equal(byRole.specialiste_analyste_donnees.has("monitoring.read"), true);
  assert.equal(byRole.partenaire.has("infographics.read"), true);
  assert.equal(Boolean(byRole.agent), false);
  assert.equal(rows.some((row) => row.code_permission === "kobo.manage"), false);
  assert.equal(rows.some((row) => row.code_permission === "email.test"), false);
});

test("GET /admin/settings exige settings.manage meme avec admin.access", async () => {
  grantRolePermission("coordinateur", "admin.access");
  const coordinatorCookie = await loginTestUser({
    email: "coordinateur.permission@g2m.test",
    role: "coordinateur"
  });

  const hubResponse = await request(app)
    .get("/admin")
    .set("Cookie", coordinatorCookie);
  const settingsResponse = await request(app)
    .get("/admin/settings")
    .set("Cookie", coordinatorCookie);

  assert.equal(hubResponse.status, 200);
  assert.match(hubResponse.text, /Panneau d&#39;administration/);
  assert.equal(settingsResponse.status, 403);
});

test("GET /admin/permissions affiche la matrice pour permissions.manage", async () => {
  const adminCookie = await loginTestUser({
    email: "admin.permissions@g2m.test",
    role: "admin"
  });
  const response = await request(app)
    .get("/admin/permissions")
    .set("Cookie", adminCookie);

  assert.equal(response.status, 200);
  assert.match(response.text, /Matrice des habilitations/);
  assert.match(response.text, /directeur_mission/);
  assert.match(response.text, /exports\.manage/);
  assert.match(response.text, /email\.test/);
  assert.match(response.text, /disabled/);
});

test("GET /admin/permissions refuse un role sans permissions.manage", async () => {
  grantRolePermission("coordinateur", "admin.access");
  const coordinatorCookie = await loginTestUser({
    email: "coordinateur.no-permissions@g2m.test",
    role: "coordinateur"
  });
  const response = await request(app)
    .get("/admin/permissions")
    .set("Cookie", coordinatorCookie);
  const auditLog = db.prepare(`
    SELECT actor_user_id, action, entity_type, entity_id, details_json
    FROM audit_logs
    WHERE action = 'auth.access_denied'
    ORDER BY id DESC
  `).get();
  const details = JSON.parse(auditLog.details_json);

  assert.equal(response.status, 403);
  assert.equal(auditLog.action, "auth.access_denied");
  assert.equal(auditLog.entity_type, "route");
  assert.equal(auditLog.entity_id, "/admin/permissions");
  assert.equal(details.method, "GET");
  assert.equal(details.path, "/admin/permissions");
  assert.equal(details.role, "coordinateur");
  assert.equal(details.required_permission, "permissions.manage");
});

test("POST /admin/permissions modifie uniquement les permissions parametrables", async () => {
  const adminCookie = await loginTestUser({
    email: "admin.permissions-update@g2m.test",
    role: "admin"
  });

  const response = await request(app)
    .post("/admin/permissions")
    .set("Cookie", adminCookie)
    .type("form")
    .send({
      "matrix[partenaire][dashboard.read]": "on",
      "matrix[partenaire][infographics.read]": "on",
      "matrix[partenaire][exports.manage]": "on",
      "matrix[partenaire][email.test]": "on"
    });

  const partnerPermissions = db.prepare(`
    SELECT p.code_permission
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    WHERE rp.role = 'partenaire'
      AND rp.allowed = 1
    ORDER BY p.code_permission
  `).all().map((row) => row.code_permission);
  const auditLog = db.prepare(`
    SELECT action
    FROM audit_logs
    WHERE action = 'permissions.role_matrix_updated'
    ORDER BY id DESC
  `).get();

  assert.equal(response.status, 200);
  assert.match(response.text, /changement\(s\) enregistre/);
  assert.equal(partnerPermissions.includes("exports.manage"), true);
  assert.equal(partnerPermissions.includes("email.test"), false);
  assert.equal(auditLog.action, "permissions.role_matrix_updated");
});

test("GET /users redirige un utilisateur non connecte", async () => {
  const response = await request(app).get("/users");

  assert.equal(response.status, 302);
  assert.match(response.headers.location, /^\/login\?next=%2Fusers/);
});

test("les routes utilisateurs distinguent lecture et gestion", async () => {
  const coordinatorCookie = await loginTestUser({
    email: "coordinateur.users-read@g2m.test",
    role: "coordinateur"
  });

  const indexResponse = await request(app)
    .get("/users")
    .set("Cookie", coordinatorCookie);
  const newResponse = await request(app)
    .get("/users/new")
    .set("Cookie", coordinatorCookie);
  const invitationsResponse = await request(app)
    .get("/users/invitations")
    .set("Cookie", coordinatorCookie);
  const newInvitationResponse = await request(app)
    .get("/users/invitations/new")
    .set("Cookie", coordinatorCookie);

  assert.equal(indexResponse.status, 200);
  assert.match(indexResponse.text, /Registre des utilisateurs/);
  assert.equal(newResponse.status, 403);
  assert.equal(invitationsResponse.status, 200);
  assert.match(invitationsResponse.text, /Invitations utilisateurs/);
  assert.equal(newInvitationResponse.status, 403);
});

test("POST /admin/settings persiste les parametres et masque les secrets", async () => {
  const adminCookie = await loginTestUser({
    email: "admin.settings@g2m.test",
    role: "admin"
  });

  const updateResponse = await request(app)
    .post("/admin/settings")
    .set("Cookie", adminCookie)
    .type("form")
    .send({
      settings: {
        "app.name": "G2M Test",
        "app.default_mission_id": "",
        "alerts.anomaly_threshold": "5",
        "sync.kobo_interval_minutes": "30",
        "mail.from": "tests@g2m.local",
        "smtp.auth_method": "password",
        "smtp.host": "",
        "smtp.port": "",
        "smtp.secure": "false",
        "smtp.user": "",
        "smtp.password": "secret-smtp-test"
      }
    });

  assert.equal(updateResponse.status, 200);
  assert.match(updateResponse.text, /parametre\(s\) mis a jour/);

  const persistedName = db.prepare("SELECT value FROM settings WHERE key = ?").get("app.name");
  const persistedSecret = db.prepare("SELECT value FROM settings WHERE key = ?").get("smtp.password");
  assert.equal(persistedName.value, "G2M Test");
  assert.equal(persistedSecret.value, "secret-smtp-test");

  const formResponse = await request(app)
    .get("/admin/settings")
    .set("Cookie", adminCookie);
  assert.equal(formResponse.status, 200);
  assert.match(formResponse.text, /Mission d&#39;accueil/);
  assert.match(formResponse.text, /Aucune mission d&#39;accueil/);
  assert.match(formResponse.text, /Secret deja renseigne/);
  assert.doesNotMatch(formResponse.text, /secret-smtp-test/);
});

test("GET /admin/db-stats genere le rapport dynamique SQLite", async () => {
  const adminCookie = await loginTestUser({
    email: "admin.dbstats@g2m.test",
    role: "admin"
  });
  const response = await request(app)
    .get("/admin/db-stats")
    .set("Cookie", adminCookie);

  assert.equal(response.status, 200);
  assert.match(response.text, /Rapport base de donnees/);
  assert.match(response.text, /Tables applicatives/);
  assert.match(response.text, /users/);
  assert.match(response.text, /settings/);
  assert.match(response.text, /soumissions_collecte/);
  assert.match(response.text, /Donnees d&#39;une table/);
  assert.match(response.text, /Voir les donnees/);
});

test("GET /admin/db-stats permet de visualiser les donnees d'une table avec masquage", async () => {
  const adminCookie = await loginTestUser({
    email: "admin.dbstats-preview@g2m.test",
    role: "admin"
  });
  const previewResponse = await request(app)
    .get("/admin/db-stats?table=users&limit=10")
    .set("Cookie", adminCookie);
  const invalidResponse = await request(app)
    .get("/admin/db-stats?table=users%3Bdrop%20table%20users")
    .set("Cookie", adminCookie);

  assert.equal(previewResponse.status, 200);
  assert.match(previewResponse.text, /Donnees d&#39;une table/);
  assert.match(previewResponse.text, /admin\.dbstats-preview@g2m\.test/);
  assert.match(previewResponse.text, /password_hash/);
  assert.match(previewResponse.text, /\*{8}/);
  assert.doesNotMatch(previewResponse.text, /\$2[aby]\$/);
  assert.equal(invalidResponse.status, 200);
  assert.match(invalidResponse.text, /La table demandee n&#39;existe pas/);
});

test("POST /admin/email-test utilise le mode developpement si SMTP absent", async () => {
  const adminCookie = await loginTestUser({
    email: "admin.email@g2m.test",
    role: "admin"
  });

  db.prepare("UPDATE settings SET value = '' WHERE key IN ('smtp.host', 'smtp.port')").run();
  const response = await request(app)
    .post("/admin/email-test")
    .set("Cookie", adminCookie)
    .type("form")
    .send({
      to: "destinataire@g2m.test",
      subject: "Test",
      message: "Message test"
    });

  assert.equal(response.status, 200);
  assert.match(response.text, /mode development/);
  assert.doesNotMatch(response.text, /secret-smtp-test/);
});

test("GET /admin/email-test reconnait une configuration Gmail OAuth2 complete", async () => {
  const adminCookie = await loginTestUser({
    email: "admin.gmail-oauth@g2m.test",
    role: "admin"
  });

  db.prepare("UPDATE settings SET value = ? WHERE key = ?").run("oauth2", "smtp.auth_method");
  db.prepare("UPDATE settings SET value = ? WHERE key = ?").run("operagis2022@gmail.com", "mail.from");
  db.prepare("UPDATE settings SET value = ? WHERE key = ?").run("smtp.gmail.com", "smtp.host");
  db.prepare("UPDATE settings SET value = ? WHERE key = ?").run("465", "smtp.port");
  db.prepare("UPDATE settings SET value = ? WHERE key = ?").run("true", "smtp.secure");
  db.prepare("UPDATE settings SET value = ? WHERE key = ?").run("operagis2022@gmail.com", "smtp.user");
  db.prepare("UPDATE settings SET value = ? WHERE key = ?").run("client-id", "gmail.oauth_client_id");
  db.prepare("UPDATE settings SET value = ? WHERE key = ?").run("client-secret", "gmail.oauth_client_secret");
  db.prepare("UPDATE settings SET value = ? WHERE key = ?").run("refresh-token", "gmail.oauth_refresh_token");

  const response = await request(app)
    .get("/admin/email-test")
    .set("Cookie", adminCookie);

  assert.equal(response.status, 200);
  assert.match(response.text, /SMTP_AUTH_METHOD/);
  assert.match(response.text, /oauth2/);
  assert.match(response.text, /prêt/);
  assert.match(response.text, /GMAIL_REFRESH_TOKEN/);
  assert.doesNotMatch(response.text, /client-secret/);
  assert.doesNotMatch(response.text, /refresh-token/);
});

test("GET /parametrages/kobo?lang=en utilise les ressources anglaises", async () => {
  const adminCookie = await loginAdmin("admin.kobo-i18n@g2m.test");
  const response = await request(app).get("/parametrages/kobo?lang=en").set("Cookie", adminCookie);

  assert.equal(response.status, 200);
  assert.match(response.text, /<html lang="en" data-display-size="medium">/);
  assert.match(response.text, /KoboToolbox Administration/);
  assert.match(response.text, /Settings/);
  assert.match(response.text, /Test connection/);
  assert.match(response.text, /Load forms/);
  assert.match(response.text, /Synchronize submissions/);
  assert.match(response.text, /Simulate without writing to database/);
});

test("GET /missions?lang=en utilise les ressources anglaises Missions", async () => {
  const coordinatorCookie = await loginTestUser({
    email: "coordinateur.missions-i18n@g2m.test",
    role: "coordinateur"
  });
  const response = await request(app).get("/missions?lang=en").set("Cookie", coordinatorCookie);
  const scriptResponse = await request(app).get("/js/missions.js");

  assert.equal(response.status, 200);
  assert.equal(scriptResponse.status, 200);
  assert.match(response.text, /<html lang="en" data-display-size="medium">/);
  assert.match(response.text, /Field collection/);
  assert.match(response.text, /Mission register and location/);
  assert.match(response.text, /New mission/);
  assert.match(response.text, /Mission list/);
  assert.match(response.text, /Mission map/);
  assert.match(response.text, /id="missions-i18n-data"/);
  assert.match(scriptResponse.text, /missions-i18n-data/);
  assert.match(scriptResponse.text, /t\("tableEmpty"\)/);
});

test("GET /agents/new?lang=en utilise les ressources anglaises Agents", async () => {
  const coordinatorCookie = await loginTestUser({
    email: "coordinateur.agents-i18n@g2m.test",
    role: "coordinateur"
  });
  const response = await request(app).get("/agents/new?lang=en").set("Cookie", coordinatorCookie);

  assert.equal(response.status, 200);
  assert.match(response.text, /<html lang="en" data-display-size="medium">/);
  assert.match(response.text, /New collection agent/);
  assert.match(response.text, /Identify the enumerator/);
  assert.match(response.text, /Last name \*/);
  assert.match(response.text, /First names \*/);
  assert.match(response.text, /Agent code \*/);
  assert.match(response.text, /For example: AG-001/);
  assert.match(response.text, /For example: Tablet, smartphone/);
  assert.match(response.text, /No application account/);
  assert.match(response.text, /Assign later/);
});

test("GET /users/new?lang=en utilise les ressources anglaises Utilisateurs", async () => {
  const adminCookie = await loginAdmin("admin.users-i18n@g2m.test");
  const response = await request(app).get("/users/new?lang=en").set("Cookie", adminCookie);

  assert.equal(response.status, 200);
  assert.match(response.text, /<html lang="en" data-display-size="medium">/);
  assert.match(response.text, /New user/);
  assert.match(response.text, /A supervisor can then be linked to a team/);
  assert.match(response.text, /Last name \*/);
  assert.match(response.text, /First names \*/);
  assert.match(response.text, /Role \*/);
  assert.match(response.text, /Assigned regions/);
  assert.match(response.text, /Password access will be enabled/);
});

test("GET /equipes/new?lang=en utilise les ressources anglaises Equipes", async () => {
  const coordinatorCookie = await loginTestUser({
    email: "coordinateur.teams-i18n@g2m.test",
    role: "coordinateur"
  });
  const response = await request(app).get("/equipes/new?lang=en").set("Cookie", coordinatorCookie);

  assert.equal(response.status, 200);
  assert.match(response.text, /<html lang="en" data-display-size="medium">/);
  assert.match(response.text, /New team/);
  assert.match(response.text, /Link the team to a mission and its intervention area/);
  assert.match(response.text, /Team name \*/);
  assert.match(response.text, /Select a mission/);
  assert.match(response.text, /Supervisor/);
  assert.match(response.text, /Assigned regions \*/);
});

test("GET /route-inconnue localise la page 404", async () => {
  const frenchResponse = await request(app).get("/route-inconnue");
  const englishResponse = await request(app).get("/route-inconnue?lang=en");

  assert.equal(frenchResponse.status, 404);
  assert.match(frenchResponse.text, /Page introuvable/);
  assert.match(frenchResponse.text, /La ressource demandée n&#39;existe pas/);
  assert.match(frenchResponse.text, /Retour au dashboard/);

  assert.equal(englishResponse.status, 404);
  assert.match(englishResponse.text, /<html lang="en" data-display-size="medium">/);
  assert.match(englishResponse.text, /Page not found/);
  assert.match(englishResponse.text, /The requested resource does not exist/);
  assert.match(englishResponse.text, /Back to dashboard/);
});

test("POST /parametrages/kobo/config conserve le jeton masque dans l'interface", async () => {
  const adminCookie = await loginAdmin("admin.kobo-config@g2m.test");
  const response = await request(app)
    .post("/parametrages/kobo/config")
    .set("Cookie", adminCookie)
    .type("form")
    .send({
      base_url: "https://kf.kobotoolbox.org",
      api_token: "token-test-secret"
    });

  assert.equal(response.status, 200);
  assert.match(response.text, /Paramètres KoboToolbox enregistrés/);
  assert.match(response.text, /https:\/\/kf\.kobotoolbox\.org/);
  assert.match(response.text, /toke\*\*\*\*cret/);
  assert.doesNotMatch(response.text, /token-test-secret/);
});

test("creation et affichage d'une mission", async () => {
  const coordinatorCookie = await loginTestUser({
    email: "coordinateur.missions-crud@g2m.test",
    role: "coordinateur"
  });

  const createResponse = await request(app)
    .post("/missions")
    .set("Cookie", coordinatorCookie)
    .type("form")
    .send({
      name: "Mission pilote",
      region: "Bouake",
      status: "en_cours",
      collectors: "12",
      latitude: "7.69",
      longitude: "-5.03",
      kobo_asset_uid: "kobo-test"
    });

  assert.equal(createResponse.status, 302);
  assert.equal(createResponse.headers.location, "/missions");

  const listResponse = await request(app).get("/missions").set("Cookie", coordinatorCookie);
  assert.equal(listResponse.status, 200);
  assert.match(listResponse.text, /Mission pilote/);

  const detailResponse = await request(app).get("/missions/1").set("Cookie", coordinatorCookie);
  assert.equal(detailResponse.status, 200);
  assert.match(detailResponse.text, /kobo-test/);

  const dashboardResponse = await request(app).get("/");
  assert.match(dashboardResponse.text, /Mission pilote/);
  assert.match(dashboardResponse.text, />12</);
  assert.doesNotMatch(dashboardResponse.text, /site-footer/);
  assert.doesNotMatch(dashboardResponse.text, /MVP de suivi des missions de collecte GEMS/);
});

test("POST /admin/settings persiste la mission d'accueil globale", async () => {
  const adminCookie = await loginTestUser({
    email: "admin.default-mission@g2m.test",
    role: "admin"
  });
  const mission = db.prepare("SELECT id FROM missions WHERE name = ?").get("Mission pilote");

  const updateResponse = await request(app)
    .post("/admin/settings")
    .set("Cookie", adminCookie)
    .type("form")
    .send({
      settings: {
        "app.default_mission_id": String(mission.id)
      }
    });

  assert.equal(updateResponse.status, 200);
  assert.match(updateResponse.text, /Mission pilote/);

  const persistedMission = db.prepare("SELECT value FROM settings WHERE key = ?").get("app.default_mission_id");
  assert.equal(persistedMission.value, String(mission.id));

  const invalidResponse = await request(app)
    .post("/admin/settings")
    .set("Cookie", adminCookie)
    .type("form")
    .send({
      settings: {
        "app.default_mission_id": "999999"
      }
    });

  assert.equal(invalidResponse.status, 400);
  assert.match(invalidResponse.text, /mission d&#39;accueil selectionnee est invalide/);
});

test("modification des attributs editables d'une mission", async () => {
  const coordinatorCookie = await loginTestUser({
    email: "coordinateur.missions-update@g2m.test",
    role: "coordinateur"
  });
  const mission = db.prepare("SELECT id FROM missions WHERE name = ?").get("Mission pilote");

  const editResponse = await request(app)
    .get(`/missions/${mission.id}/edit`)
    .set("Cookie", coordinatorCookie);
  const updateResponse = await request(app)
    .post(`/missions/${mission.id}`)
    .set("Cookie", coordinatorCookie)
    .type("form")
    .send({
      name: "Mission pilote",
      region: "Gbeke",
      status: "terminee",
      collectors: "18",
      start_date: "2026-06-01",
      end_date: "2026-06-08",
      latitude: "7.71",
      longitude: "-5.01",
      kobo_asset_uid: "kobo-test-updated"
    });

  assert.equal(editResponse.status, 200);
  assert.match(editResponse.text, /Modifier la mission/);
  assert.match(editResponse.text, /Mission pilote/);
  assert.equal(updateResponse.status, 302);
  assert.equal(updateResponse.headers.location, `/missions/${mission.id}`);

  const detailResponse = await request(app)
    .get(`/missions/${mission.id}`)
    .set("Cookie", coordinatorCookie);
  const updated = db.prepare("SELECT * FROM missions WHERE id = ?").get(mission.id);

  assert.equal(updated.name, "Mission pilote");
  assert.equal(updated.region, "Gbeke");
  assert.equal(updated.status, "terminee");
  assert.equal(updated.collectors, 18);
  assert.equal(updated.kobo_asset_uid, "kobo-test-updated");
  assert.match(detailResponse.text, /Mission pilote/);
  assert.match(detailResponse.text, /kobo-test-updated/);
  assert.match(detailResponse.text, /Modifier/);
});

test("POST /missions refuse des coordonnees invalides", async () => {
  const coordinatorCookie = await loginTestUser({
    email: "coordinateur.missions-invalid@g2m.test",
    role: "coordinateur"
  });

  const response = await request(app)
    .post("/missions")
    .set("Cookie", coordinatorCookie)
    .type("form")
    .send({ name: "Erreur", region: "Nord", latitude: "100" });

  assert.equal(response.status, 400);
  assert.match(response.text, /Vérifiez/);
});

test("POST /missions/:id refuse une modification invalide", async () => {
  const coordinatorCookie = await loginTestUser({
    email: "coordinateur.missions-invalid-update@g2m.test",
    role: "coordinateur"
  });
  const mission = db.prepare("SELECT id FROM missions WHERE name = ?").get("Mission pilote");

  const response = await request(app)
    .post(`/missions/${mission.id}`)
    .set("Cookie", coordinatorCookie)
    .type("form")
    .send({
      name: "Mission invalide",
      region: "Nord",
      status: "terminee",
      collectors: "-1"
    });

  assert.equal(response.status, 400);
  assert.match(response.text, /Modifier la mission/);
  assert.match(response.text, /V.rifiez/);
});

test("controle d'acces du bloc missions", async () => {
  const readerCookie = await loginTestUser({
    email: "gis.missions-read@g2m.test",
    role: "specialiste_gis"
  });

  const anonymousResponse = await request(app).get("/missions");
  const listResponse = await request(app).get("/missions").set("Cookie", readerCookie);
  const newResponse = await request(app).get("/missions/new").set("Cookie", readerCookie);
  const editResponse = await request(app).get("/missions/1/edit").set("Cookie", readerCookie);
  const updateResponse = await request(app)
    .post("/missions/1")
    .set("Cookie", readerCookie)
    .type("form")
    .send({ name: "Refusee", region: "Nord", status: "planifiee" });

  assert.equal(anonymousResponse.status, 302);
  assert.equal(anonymousResponse.headers.location, "/login?next=%2Fmissions");
  assert.equal(listResponse.status, 200);
  assert.equal(newResponse.status, 403);
  assert.equal(editResponse.status, 403);
  assert.equal(updateResponse.status, 403);
});

test("creation d'un superviseur avec plusieurs regions", async () => {
  const adminCookie = await loginAdmin("admin.users-crud@g2m.test");
  const regions = db.prepare(`
    SELECT id FROM regions WHERE code_region IN ('CI01', 'TEST01') ORDER BY code_region
  `).all();

  const createResponse = await request(app)
    .post("/users")
    .set("Cookie", adminCookie)
    .type("form")
    .send({
      nom: "Kone",
      prenoms: "Awa",
      email: "awa.kone@example.org",
      telephone: "+2250102030405",
      role: "superviseur",
      statut: "actif",
      region_ids: regions.map((region) => String(region.id))
    });

  assert.equal(createResponse.status, 302);
  assert.match(createResponse.headers.location, /^\/users\/\d+$/);

  const detailResponse = await request(app).get(createResponse.headers.location).set("Cookie", adminCookie);
  assert.equal(detailResponse.status, 200);
  assert.match(detailResponse.text, /awa\.kone@example\.org/);
  assert.match(detailResponse.text, /Superviseur regional/);
  assert.match(detailResponse.text, /District Autonome d&#39;Abidjan/);
  assert.match(detailResponse.text, /Region test/);

  const user = db.prepare("SELECT id, password_hash FROM users WHERE email = ?")
    .get("awa.kone@example.org");
  const assignmentCount = db.prepare("SELECT COUNT(*) AS total FROM user_regions WHERE user_id = ?")
    .get(user.id).total;
  assert.equal(user.password_hash, null);
  assert.equal(assignmentCount, 2);
});

test("POST /users refuse un email duplique et une region inexistante", async () => {
  const adminCookie = await loginAdmin("admin.users-validation@g2m.test");
  const duplicateResponse = await request(app)
    .post("/users")
    .set("Cookie", adminCookie)
    .type("form")
    .send({
      nom: "Autre",
      prenoms: "Superviseur",
      email: "AWA.KONE@example.org",
      role: "superviseur",
      statut: "actif"
    });
  const invalidRegionResponse = await request(app)
    .post("/users")
    .set("Cookie", adminCookie)
    .type("form")
    .send({
      nom: "Traore",
      prenoms: "Moussa",
      email: "moussa@example.org",
      role: "superviseur",
      statut: "actif",
      region_ids: "999999"
    });
  const invalidRoleResponse = await request(app)
    .post("/users")
    .set("Cookie", adminCookie)
    .type("form")
    .send({
      nom: "Traore",
      prenoms: "Role inconnu",
      email: "role.inconnu@example.org",
      role: "visiteur",
      statut: "actif"
    });

  assert.equal(duplicateResponse.status, 400);
  assert.match(duplicateResponse.text, /possède déjà cette adresse email/);
  assert.equal(invalidRegionResponse.status, 400);
  assert.match(invalidRegionResponse.text, /région sélectionnée n&#39;existe pas/);
  assert.equal(invalidRoleResponse.status, 400);
});

test("modification d'un utilisateur et remplacement de ses regions", async () => {
  const adminCookie = await loginAdmin("admin.users-update@g2m.test");
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get("awa.kone@example.org");
  const region = db.prepare("SELECT id FROM regions WHERE code_region = ?").get("TEST01");
  const editResponse = await request(app).get(`/users/${user.id}/edit`).set("Cookie", adminCookie);

  assert.equal(editResponse.status, 200);
  assert.match(editResponse.text, /Modifier l&#39;utilisateur/);
  assert.match(editResponse.text, /awa\.kone@example\.org/);

  const updateResponse = await request(app)
    .post(`/users/${user.id}`)
    .set("Cookie", adminCookie)
    .type("form")
    .send({
      nom: "Kone",
      prenoms: "Awa Marie",
      email: "awa.marie@example.org",
      telephone: "+2250506070809",
      role: "controleur",
      statut: "suspendu",
      region_ids: String(region.id)
    });

  assert.equal(updateResponse.status, 302);
  assert.equal(updateResponse.headers.location, `/users/${user.id}`);

  const detailResponse = await request(app).get(`/users/${user.id}`).set("Cookie", adminCookie);
  assert.match(detailResponse.text, /Awa Marie/);
  assert.match(detailResponse.text, /Controleur qualite/);
  assert.match(detailResponse.text, /suspendu/);
  assert.doesNotMatch(detailResponse.text, /District Autonome d&#39;Abidjan/);

  const assignments = db.prepare("SELECT COUNT(*) AS total FROM user_regions WHERE user_id = ?")
    .get(user.id).total;
  assert.equal(assignments, 1);
});

test("modification d'un utilisateur refuse l'email d'un autre compte", async () => {
  const adminCookie = await loginAdmin("admin.users-duplicate-update@g2m.test");
  const region = db.prepare("SELECT id FROM regions WHERE code_region = ?").get("TEST01");
  const createResponse = await request(app)
    .post("/users")
    .set("Cookie", adminCookie)
    .type("form")
    .send({
      nom: "Yao",
      prenoms: "Jean",
      email: "jean.yao@example.org",
      role: "superviseur",
      statut: "actif",
      region_ids: String(region.id)
    });
  const secondUserId = Number(createResponse.headers.location.split("/").pop());

  const updateResponse = await request(app)
    .post(`/users/${secondUserId}`)
    .set("Cookie", adminCookie)
    .type("form")
    .send({
      nom: "Yao",
      prenoms: "Jean",
      email: "awa.marie@example.org",
      role: "superviseur",
      statut: "actif",
      region_ids: String(region.id)
    });

  assert.equal(updateResponse.status, 400);
  assert.match(updateResponse.text, /possède déjà cette adresse email/);
});

test("creation d'une equipe rattachee a une mission, un superviseur et des regions", async () => {
  const adminCookie = await loginAdmin("admin.team-user-create@g2m.test");
  const coordinatorCookie = await loginTestUser({
    email: "coordinateur.teams-crud@g2m.test",
    role: "coordinateur"
  });
  const regionIds = db.prepare(`
    SELECT id FROM regions WHERE code_region IN ('CI01', 'TEST01') ORDER BY code_region
  `).all().map((region) => String(region.id));
  const supervisorResponse = await request(app)
    .post("/users")
    .set("Cookie", adminCookie)
    .type("form")
    .send({
      nom: "Coulibaly",
      prenoms: "Fatou",
      email: "fatou.superviseur@example.org",
      role: "superviseur",
      statut: "actif",
      region_ids: regionIds
    });
  const supervisorId = Number(supervisorResponse.headers.location.split("/").pop());
  const missionId = db.prepare("SELECT id FROM missions WHERE name = ?").get("Mission pilote").id;

  const formResponse = await request(app).get("/equipes/new").set("Cookie", coordinatorCookie);
  assert.equal(formResponse.status, 200);
  assert.match(formResponse.text, /Mission pilote/);
  assert.match(formResponse.text, /Fatou Coulibaly/);

  const createResponse = await request(app)
    .post("/equipes")
    .set("Cookie", coordinatorCookie)
    .type("form")
    .send({
      nom_equipe: "Equipe Centre 1",
      mission_id: String(missionId),
      superviseur_id: String(supervisorId),
      statut: "active",
      region_ids: regionIds
    });

  assert.equal(createResponse.status, 302);
  assert.match(createResponse.headers.location, /^\/equipes\/\d+$/);

  const detailResponse = await request(app).get(createResponse.headers.location).set("Cookie", coordinatorCookie);
  assert.equal(detailResponse.status, 200);
  assert.match(detailResponse.text, /Equipe Centre 1/);
  assert.match(detailResponse.text, /Mission pilote/);
  assert.match(detailResponse.text, /Fatou Coulibaly/);
  assert.match(detailResponse.text, /Region test/);

  const equipeId = Number(createResponse.headers.location.split("/").pop());
  const regionCount = db.prepare("SELECT COUNT(*) AS total FROM equipe_regions WHERE equipe_id = ?")
    .get(equipeId).total;
  assert.equal(regionCount, 2);
});

test("POST /equipes exige une region et refuse un non-superviseur", async () => {
  const coordinatorCookie = await loginTestUser({
    email: "coordinateur.teams-invalid@g2m.test",
    role: "coordinateur"
  });
  const missionId = db.prepare("SELECT id FROM missions WHERE name = ?").get("Mission pilote").id;
  const controllerId = db.prepare("SELECT id FROM users WHERE email = ?").get("awa.marie@example.org").id;
  const regionId = db.prepare("SELECT id FROM regions WHERE code_region = ?").get("TEST01").id;

  const noRegionResponse = await request(app)
    .post("/equipes")
    .set("Cookie", coordinatorCookie)
    .type("form")
    .send({
      nom_equipe: "Equipe sans zone",
      mission_id: String(missionId),
      statut: "planifiee"
    });
  const invalidSupervisorResponse = await request(app)
    .post("/equipes")
    .set("Cookie", coordinatorCookie)
    .type("form")
    .send({
      nom_equipe: "Equipe invalide",
      mission_id: String(missionId),
      superviseur_id: String(controllerId),
      statut: "planifiee",
      region_ids: String(regionId)
    });

  assert.equal(noRegionResponse.status, 400);
  assert.match(noRegionResponse.text, /au moins une région valide/);
  assert.equal(invalidSupervisorResponse.status, 400);
  assert.match(invalidSupervisorResponse.text, /superviseur actif/);
});

test("modification d'une equipe remplace son affectation et peut retirer le superviseur", async () => {
  const coordinatorCookie = await loginTestUser({
    email: "coordinateur.teams-update@g2m.test",
    role: "coordinateur"
  });
  const equipe = db.prepare("SELECT id FROM equipes WHERE nom_equipe = ?").get("Equipe Centre 1");
  const missionId = db.prepare("SELECT id FROM missions WHERE name = ?").get("Mission pilote").id;
  const regionId = db.prepare("SELECT id FROM regions WHERE code_region = ?").get("TEST01").id;

  const editResponse = await request(app).get(`/equipes/${equipe.id}/edit`).set("Cookie", coordinatorCookie);
  assert.equal(editResponse.status, 200);
  assert.match(editResponse.text, /Modifier l&#39;équipe/);
  assert.match(editResponse.text, /Equipe Centre 1/);

  const updateResponse = await request(app)
    .post(`/equipes/${equipe.id}`)
    .set("Cookie", coordinatorCookie)
    .type("form")
    .send({
      nom_equipe: "Equipe Centre Revisee",
      mission_id: String(missionId),
      superviseur_id: "",
      statut: "suspendue",
      region_ids: String(regionId)
    });

  assert.equal(updateResponse.status, 302);
  assert.equal(updateResponse.headers.location, `/equipes/${equipe.id}`);

  const detailResponse = await request(app).get(`/equipes/${equipe.id}`).set("Cookie", coordinatorCookie);
  assert.match(detailResponse.text, /Equipe Centre Revisee/);
  assert.match(detailResponse.text, /suspendue/);
  assert.match(detailResponse.text, /Non affecté/);
  assert.doesNotMatch(detailResponse.text, /District Autonome d&#39;Abidjan/);

  const persisted = db.prepare("SELECT superviseur_id FROM equipes WHERE id = ?").get(equipe.id);
  const regionCount = db.prepare("SELECT COUNT(*) AS total FROM equipe_regions WHERE equipe_id = ?")
    .get(equipe.id).total;
  assert.equal(persisted.superviseur_id, null);
  assert.equal(regionCount, 1);
});

test("modification d'une equipe refuse un utilisateur non superviseur", async () => {
  const coordinatorCookie = await loginTestUser({
    email: "coordinateur.teams-invalid-update@g2m.test",
    role: "coordinateur"
  });
  const equipe = db.prepare("SELECT id FROM equipes WHERE nom_equipe = ?").get("Equipe Centre Revisee");
  const missionId = db.prepare("SELECT id FROM missions WHERE name = ?").get("Mission pilote").id;
  const controllerId = db.prepare("SELECT id FROM users WHERE email = ?").get("awa.marie@example.org").id;
  const regionId = db.prepare("SELECT id FROM regions WHERE code_region = ?").get("TEST01").id;

  const response = await request(app)
    .post(`/equipes/${equipe.id}`)
    .set("Cookie", coordinatorCookie)
    .type("form")
    .send({
      nom_equipe: "Equipe Centre Revisee",
      mission_id: String(missionId),
      superviseur_id: String(controllerId),
      statut: "active",
      region_ids: String(regionId)
    });

  assert.equal(response.status, 400);
  assert.match(response.text, /superviseur actif/);
});

test("controle d'acces du bloc equipes", async () => {
  const readerCookie = await loginTestUser({
    email: "gis.teams-read@g2m.test",
    role: "specialiste_gis"
  });

  const anonymousResponse = await request(app).get("/equipes");
  const listResponse = await request(app).get("/equipes").set("Cookie", readerCookie);
  const newResponse = await request(app).get("/equipes/new").set("Cookie", readerCookie);

  assert.equal(anonymousResponse.status, 302);
  assert.equal(anonymousResponse.headers.location, "/login?next=%2Fequipes");
  assert.equal(listResponse.status, 200);
  assert.equal(newResponse.status, 403);
});

test("creation d'un agent de collecte associe a un utilisateur et une equipe", async () => {
  const adminCookie = await loginAdmin("admin.agent-user-create@g2m.test");
  const coordinatorCookie = await loginTestUser({
    email: "coordinateur.agents-crud@g2m.test",
    role: "coordinateur"
  });
  const regionId = db.prepare("SELECT id FROM regions WHERE code_region = ?").get("TEST01").id;
  const userResponse = await request(app)
    .post("/users")
    .set("Cookie", adminCookie)
    .type("form")
    .send({
      nom: "Nguessan",
      prenoms: "Alain",
      email: "alain.agent@example.org",
      role: "agent",
      statut: "actif",
      region_ids: String(regionId)
    });
  const userId = Number(userResponse.headers.location.split("/").pop());
  const equipeId = db.prepare("SELECT id FROM equipes WHERE nom_equipe = ?").get("Equipe Centre Revisee").id;

  const formResponse = await request(app).get("/agents/new").set("Cookie", coordinatorCookie);
  assert.equal(formResponse.status, 200);
  assert.match(formResponse.text, /Alain Nguessan/);
  assert.match(formResponse.text, /Equipe Centre Revisee/);

  const createResponse = await request(app)
    .post("/agents")
    .set("Cookie", coordinatorCookie)
    .type("form")
    .send({
      nom: "Nguessan",
      prenoms: "Alain",
      code_agent: "ag-001",
      telephone: "+2250708091011",
      equipement: "Tablette A01",
      statut: "actif",
      user_id: String(userId),
      equipe_id: String(equipeId)
    });

  assert.equal(createResponse.status, 302);
  assert.match(createResponse.headers.location, /^\/agents\/\d+$/);

  const detailResponse = await request(app).get(createResponse.headers.location).set("Cookie", coordinatorCookie);
  assert.equal(detailResponse.status, 200);
  assert.match(detailResponse.text, /Alain Nguessan/);
  assert.match(detailResponse.text, /AG-001/);
  assert.match(detailResponse.text, /Alain Nguessan/);
  assert.match(detailResponse.text, /Equipe Centre Revisee/);
  assert.match(detailResponse.text, /Mission pilote/);
});

test("POST /agents refuse un code duplique et un utilisateur non agent", async () => {
  const coordinatorCookie = await loginTestUser({
    email: "coordinateur.agents-invalid@g2m.test",
    role: "coordinateur"
  });
  const equipeId = db.prepare("SELECT id FROM equipes WHERE nom_equipe = ?").get("Equipe Centre Revisee").id;
  const nonAgentId = db.prepare("SELECT id FROM users WHERE email = ?").get("fatou.superviseur@example.org").id;
  const duplicateResponse = await request(app)
    .post("/agents")
    .set("Cookie", coordinatorCookie)
    .type("form")
    .send({
      nom: "Duplicata",
      prenoms: "Agent",
      code_agent: "AG-001",
      statut: "actif",
      equipe_id: String(equipeId)
    });
  const invalidUserResponse = await request(app)
    .post("/agents")
    .set("Cookie", coordinatorCookie)
    .type("form")
    .send({
      nom: "Agent",
      prenoms: "Invalide",
      code_agent: "AG-002",
      statut: "actif",
      user_id: String(nonAgentId),
      equipe_id: String(equipeId)
    });

  assert.equal(duplicateResponse.status, 400);
  assert.match(duplicateResponse.text, /code agent est déjà utilisé/);
  assert.equal(invalidUserResponse.status, 400);
  assert.match(invalidUserResponse.text, /rôle agent/);
});

test("modification d'un agent permet de retirer son compte et son equipe", async () => {
  const coordinatorCookie = await loginTestUser({
    email: "coordinateur.agents-update@g2m.test",
    role: "coordinateur"
  });
  const agent = db.prepare("SELECT id FROM agents_collecte WHERE code_agent = ?").get("AG-001");
  const editResponse = await request(app).get(`/agents/${agent.id}/edit`).set("Cookie", coordinatorCookie);

  assert.equal(editResponse.status, 200);
  assert.match(editResponse.text, /Modifier l&#39;agent de collecte/);

  const updateResponse = await request(app)
    .post(`/agents/${agent.id}`)
    .set("Cookie", coordinatorCookie)
    .type("form")
    .send({
      nom: "Nguessan",
      prenoms: "Alain Serge",
      code_agent: "AG-001-M",
      telephone: "+2250000000000",
      equipement: "Smartphone B02",
      statut: "inactif",
      user_id: "",
      equipe_id: ""
    });

  assert.equal(updateResponse.status, 302);
  const detailResponse = await request(app).get(`/agents/${agent.id}`).set("Cookie", coordinatorCookie);
  assert.match(detailResponse.text, /Alain Serge Nguessan/);
  assert.match(detailResponse.text, /AG-001-M/);
  assert.match(detailResponse.text, /Smartphone B02/);
  assert.match(detailResponse.text, /Sans compte applicatif/);
  assert.match(detailResponse.text, /Non affecté/);

  const persisted = db.prepare(`
    SELECT nom, prenoms, user_id, equipe_id, statut FROM agents_collecte WHERE id = ?
  `).get(agent.id);
  assert.deepEqual(persisted, {
    nom: "Nguessan",
    prenoms: "Alain Serge",
    user_id: null,
    equipe_id: null,
    statut: "inactif"
  });
});

test("POST /agents exige le nom et les prenoms meme sans compte utilisateur", async () => {
  const coordinatorCookie = await loginTestUser({
    email: "coordinateur.agents-create-basic@g2m.test",
    role: "coordinateur"
  });

  const invalidResponse = await request(app)
    .post("/agents")
    .set("Cookie", coordinatorCookie)
    .type("form")
    .send({
      code_agent: "AG-003",
      statut: "actif"
    });
  const createResponse = await request(app)
    .post("/agents")
    .set("Cookie", coordinatorCookie)
    .type("form")
    .send({
      nom: "Bamba",
      prenoms: "Aminata",
      code_agent: "AG-004",
      statut: "actif"
    });

  assert.equal(invalidResponse.status, 400);
  assert.match(invalidResponse.text, /nom, les prénoms/);
  assert.equal(createResponse.status, 302);

  const detailResponse = await request(app).get(createResponse.headers.location).set("Cookie", coordinatorCookie);
  assert.match(detailResponse.text, /Aminata Bamba/);
  assert.match(detailResponse.text, /Sans compte applicatif/);
});

test("controle d'acces du bloc agents", async () => {
  const readerCookie = await loginTestUser({
    email: "gis.agents-read@g2m.test",
    role: "specialiste_gis"
  });

  const anonymousResponse = await request(app).get("/agents");
  const listResponse = await request(app).get("/agents").set("Cookie", readerCookie);
  const newResponse = await request(app).get("/agents/new").set("Cookie", readerCookie);

  assert.equal(anonymousResponse.status, 302);
  assert.equal(anonymousResponse.headers.location, "/login?next=%2Fagents");
  assert.equal(listResponse.status, 200);
  assert.equal(newResponse.status, 403);
});

test("l'import CSV des agents rapproche equipe et compte agent puis peut etre rejoue", () => {
  const csv = [
    "Code-agent;Nom ;Prenoms; Equipe; telephone",
    "AG-I01; Nguessan ; Alain ; Equipe Centre Revisee ; 01 02 03",
    "AG-I02; Soro ; Mariam ; Equipe inconnue ; 04 05 06"
  ].join("\n");

  const firstImport = importAgents(db, csv);
  const secondImport = importAgents(db, csv);
  const matched = db.prepare(`
    SELECT a.user_id, a.equipe_id, u.email, e.nom_equipe
    FROM agents_collecte a
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN equipes e ON e.id = a.equipe_id
    WHERE a.code_agent = ?
  `).get("AG-I01");
  const unmatched = db.prepare(`
    SELECT user_id, equipe_id FROM agents_collecte WHERE code_agent = ?
  `).get("AG-I02");
  const count = db.prepare(`
    SELECT COUNT(*) AS total FROM agents_collecte WHERE code_agent LIKE 'AG-I%'
  `).get().total;

  assert.equal(firstImport.inserted, 2);
  assert.equal(firstImport.equipeMatched, 1);
  assert.equal(firstImport.userMatched, 1);
  assert.equal(firstImport.equipeUnmatched.length, 1);
  assert.equal(secondImport.updated, 2);
  assert.equal(count, 2);
  assert.equal(matched.email, "alain.agent@example.org");
  assert.equal(matched.nom_equipe, "Equipe Centre Revisee");
  assert.deepEqual(unmatched, { user_id: null, equipe_id: null });
});

test("le seed des soumissions produit des points et un raw_data_json conforme au XLSForm", () => {
  const firstSeed = seedSubmissions(db, {
    seed: 42,
    perAgent: 3,
    inactiveCount: 0,
    endDate: "2026-05-27T12:00:00.000Z"
  });
  const secondSeed = seedSubmissions(db, {
    seed: 42,
    perAgent: 3,
    inactiveCount: 0,
    endDate: "2026-05-27T12:00:00.000Z"
  });
  const records = db.prepare(`
    SELECT s.*, a.code_agent, sp.id AS territory_id
    FROM soumissions_collecte s
    JOIN agents_collecte a ON a.id = s.agent_id
    JOIN sous_prefectures sp ON sp.id = s.sous_prefecture_id
    WHERE a.code_agent = 'AG-I01'
    ORDER BY s.source_submission_id
  `).all();
  const raw = JSON.parse(records[0].raw_data_json);

  assert.equal(firstSeed.generated, 3);
  assert.equal(secondSeed.generated, 3);
  assert.equal(records.length, 3);
  assert.equal(records[0].source, "simulation");
  assert.equal(records[0].formulaire_type, "padci_survey_terrain_vf");
  assert.equal(raw._form_id, "padci_survey_terrain_vf");
  assert.equal(raw._version, "2026052601");
  assert.equal(raw.modA.enqueteur, "AG-I01");
  assert.equal(raw.modA.equipe, String(records[0].equipe_id));
  assert.equal(raw.modB.sous_prefecture.length > 0, true);
  assert.match(raw.modA.gps_site, /^-?\d+\.\d{6} -?\d+\.\d{6} 0 \d+$/);
});

test("GET /cartographie expose l'espace SIG et ses points cartographiques", async () => {
  const gisCookie = await loginTestUser({
    email: "gis.cartographie@g2m.test",
    role: "specialiste_gis"
  });
  const response = await request(app).get("/cartographie").set("Cookie", gisCookie);
  const scriptResponse = await request(app).get("/js/cartographie.js");
  const styleResponse = await request(app).get("/css/app.css");

  assert.equal(response.status, 200);
  assert.equal(scriptResponse.status, 200);
  assert.equal(styleResponse.status, 200);
  assert.match(response.text, /Cartographie SIG/);
  assert.doesNotMatch(response.text, /page-heading sig-heading/);
  assert.doesNotMatch(response.text, /site-footer/);
  assert.doesNotMatch(response.text, /MVP de suivi des missions de collecte GEMS/);
  assert.match(response.text, /id="sig-tools"/);
  assert.match(response.text, /id="sig-tools-toggle"/);
  assert.match(response.text, /aria-controls="sig-tools"/);
  assert.match(response.text, /id="sig-tools-close"/);
  assert.match(response.text, /id="sig-resizer"/);
  assert.match(response.text, /id="sig-map"/);
  assert.match(response.text, /class="sig-map-toolbar"/);
  assert.match(response.text, /id="sig-cluster-toggle"/);
  assert.match(response.text, /aria-pressed="true"/);
  assert.match(response.text, /class="sig-map-legend is-collapsed"/);
  assert.match(response.text, /id="sig-map-legend-toggle"/);
  assert.match(response.text, /aria-expanded="false"/);
  assert.match(response.text, /id="sig-i18n-data"/);
  assert.match(response.text, /Couche Humanitaire/);
  assert.match(response.text, /Couche Routière/);
  assert.match(response.text, /Déplier la légende/);
  assert.match(response.text, /Réinitialiser/);
  assert.match(response.text, /id="site-identification"/);
  assert.match(response.text, /id="site-identification-body"/);
  assert.match(response.text, /SIM-AG-I01-001/);
  assert.match(response.text, /raw_data_json/);
  assert.match(response.text, /Voir le d.tail d.cisionnel/);
  assert.match(response.text, /leaflet\.markercluster@1\.5\.3/);
  assert.match(response.text, /\/js\/cartographie\.js/);
  assert.match(scriptResponse.text, /sig-i18n-data/);
  assert.match(scriptResponse.text, /t\("layerHumanitarian"\)/);
  assert.match(scriptResponse.text, /t\("layerRoad"\)/);
  assert.match(scriptResponse.text, /t\("layerPositron"\)/);
  assert.match(scriptResponse.text, /t\("layerEsriSatellite"\)/);
  assert.match(scriptResponse.text, /L\.markerClusterGroup/);
  assert.match(scriptResponse.text, /disableClusteringAtZoom: 14/);
  assert.match(scriptResponse.text, /function setClustering\(enabled\)/);
  assert.match(scriptResponse.text, /setClustering\(!clusteringEnabled\)/);
  assert.match(scriptResponse.text, /function showSiteIdentification\(point\)/);
  assert.match(scriptResponse.text, /function addDetailAction\(submissionId\)/);
  assert.match(scriptResponse.text, /\/soumissions\/\$\{submissionId\}\/detail/);
  assert.match(scriptResponse.text, /rowClick: function \(event, row\)/);
  assert.match(scriptResponse.text, /siteIdentificationClose\.addEventListener\("click", hideSiteIdentification\)/);
  assert.match(scriptResponse.text, /mapControlContainer\.classList\.add\("map-control-container", "is-collapsed"\)/);
  assert.match(scriptResponse.text, /mapControlToggle\.className = "map-control-toggle"/);
  assert.match(scriptResponse.text, /mapControlToggle\.setAttribute\("aria-expanded", "false"\)/);
  assert.match(scriptResponse.text, /mapControlContainer\.classList\.toggle\("is-collapsed"\)/);
  assert.match(scriptResponse.text, /aria-expanded/);
  assert.match(scriptResponse.text, /mapLegend\.classList\.toggle\("is-collapsed"\)/);
  assert.match(scriptResponse.text, /t\("legendExpand"\)/);
  assert.match(scriptResponse.text, /function setToolsOpen\(open\)/);
  assert.match(scriptResponse.text, /workspace\.classList\.toggle\("is-tools-open", open\)/);
  assert.match(scriptResponse.text, /toolsToggle\.addEventListener\("click"/);
  assert.match(scriptResponse.text, /toolsClose\.addEventListener\("click"/);
  assert.match(styleResponse.text, /\.container-wide\s*\{/);
  assert.match(styleResponse.text, /height: calc\(100vh - var\(--site-header-height\)\)/);
  assert.match(styleResponse.text, /\.container-wide > \*/);
  assert.match(styleResponse.text, /overflow-y: hidden/);
  assert.match(styleResponse.text, /\.sig-workspace\s*\{[\s\S]*height: 100%/);
  assert.match(styleResponse.text, /\.map-control-container \.leaflet-control-layers-list\s*\{[\s\S]*transition:[\s\S]*0\.3s ease/);
  assert.match(styleResponse.text, /\.map-control-container\.is-collapsed \.leaflet-control-layers-list/);
  assert.match(styleResponse.text, /\.sig-map-legend-items\s*\{[\s\S]*transition:[\s\S]*0\.3s ease/);
  assert.match(styleResponse.text, /\.sig-map-legend\.is-collapsed \.sig-map-legend-items/);
  assert.match(styleResponse.text, /\.site-nav-toggle\s*\{[\s\S]*display: none/);
  assert.match(styleResponse.text, /\.site-header\.is-nav-open nav\s*\{[\s\S]*display: grid/);
  assert.match(styleResponse.text, /\.brand-logo\s*\{[\s\S]*height: var\(--brand-logo-mobile-height\)/);
  assert.match(styleResponse.text, /\.brand-product\s*\{[\s\S]*display: none/);
  assert.match(styleResponse.text, /\.brand-product-mobile\s*\{[\s\S]*display: block/);
  assert.match(styleResponse.text, /\.brand-release\s*\{[\s\S]*font-size: var\(--font-small\)/);
  assert.match(styleResponse.text, /\.container-wide\s*\{[\s\S]*height: calc\(100vh - var\(--site-header-mobile-height\)\)/);
  assert.match(styleResponse.text, /--mobile-map-control-bottom: max\(76px, env\(safe-area-inset-bottom\)\)/);
  assert.match(styleResponse.text, /\.sig-tools-toggle\s*\{[\s\S]*display: flex/);
  assert.match(styleResponse.text, /\.sig-tools-toggle\s*\{[\s\S]*bottom: var\(--mobile-map-control-bottom\)/);
  assert.match(styleResponse.text, /\.sig-tools\s*\{[\s\S]*transform: translateX\(-104%\)/);
  assert.match(styleResponse.text, /\.sig-tools\s*\{[\s\S]*transition: transform 0\.3s ease/);
  assert.match(styleResponse.text, /\.sig-workspace\.is-tools-open \.sig-tools\s*\{[\s\S]*transform: translateX\(0\)/);
  assert.match(styleResponse.text, /\.site-identification-actions/);
  assert.match(styleResponse.text, /\.sig-map-pane\s*\{[\s\S]*flex: 1 1 auto/);
  assert.match(styleResponse.text, /#sig-map \.leaflet-top\.leaflet-right\s*\{[\s\S]*bottom: var\(--mobile-map-control-bottom\)/);
  assert.match(styleResponse.text, /#sig-map \.leaflet-top\.leaflet-right\s*\{[\s\S]*top: auto/);
  assert.doesNotMatch(styleResponse.text, /\.site-footer/);
  assert.match(scriptResponse.text, /createPane\("territoryPane"\)/);
  assert.match(scriptResponse.text, /createPane\("collectionPointsPane"\)/);
  assert.match(scriptResponse.text, /"collectionPointsPane"\)\.style\.zIndex = 450/);
  assert.match(scriptResponse.text, /function fitToVisiblePoints\(visiblePoints\)/);
  assert.match(scriptResponse.text, /map\.fitBounds\(bounds/);
  assert.match(scriptResponse.text, /renderPoints\(true\)/);
  assert.doesNotMatch(scriptResponse.text, /http:\/\/\{s\}\.tile\.openstreetmap\.org/);
});

test("GET /soumissions/:id/detail affiche la fiche decisionnelle et exige infographics.read", async () => {
  const readerCookie = await loginTestUser({
    email: "partenaire.submission-detail@g2m.test",
    role: "partenaire"
  });
  const deniedCookie = await loginTestUser({
    email: "agent.submission-detail-denied@g2m.test",
    role: "agent"
  });
  const submission = db.prepare(`
    SELECT id FROM soumissions_collecte WHERE source_submission_id = ?
  `).get("SIM-AG-I01-001");

  const anonymousResponse = await request(app).get(`/soumissions/${submission.id}/detail`);
  const deniedResponse = await request(app)
    .get(`/soumissions/${submission.id}/detail`)
    .set("Cookie", deniedCookie);
  const response = await request(app)
    .get(`/soumissions/${submission.id}/detail`)
    .set("Cookie", readerCookie);

  assert.equal(anonymousResponse.status, 302);
  assert.equal(anonymousResponse.headers.location, `/login?next=%2Fsoumissions%2F${submission.id}%2Fdetail`);
  assert.equal(deniedResponse.status, 403);
  assert.equal(response.status, 200);
  assert.match(response.text, /Visualisation decisionnelle/);
  assert.match(response.text, /Questionnaire PADCI - Enquete terrain v12/);
  assert.match(response.text, /2026060404v12/);
  assert.match(response.text, /Synthese decisionnelle/);
  assert.match(response.text, /Identification de la fiche/);
  assert.match(response.text, /Module D[\s\S]*nergie/);
  assert.match(response.text, /Module F[\s\S]*Internet/);
  assert.match(response.text, /id="submission-detail-map"/);
  assert.match(response.text, /leaflet@1\.9\.4/);
});

test("GET /cartographie exige sig.read", async () => {
  const userCookie = await loginTestUser({
    email: "agent.cartographie-denied@g2m.test",
    role: "agent"
  });

  const anonymousResponse = await request(app).get("/cartographie");
  const deniedResponse = await request(app).get("/cartographie").set("Cookie", userCookie);

  assert.equal(anonymousResponse.status, 302);
  assert.equal(anonymousResponse.headers.location, "/login?next=%2Fcartographie");
  assert.equal(deniedResponse.status, 403);
});

test("GET /cartographie?lang=en utilise les ressources anglaises SIG", async () => {
  const gisCookie = await loginTestUser({
    email: "gis.cartographie-i18n@g2m.test",
    role: "specialiste_gis"
  });
  const response = await request(app).get("/cartographie?lang=en").set("Cookie", gisCookie);

  assert.equal(response.status, 200);
  assert.match(response.text, /<html lang="en" data-display-size="medium">/);
  assert.match(response.text, /GIS Mapping/);
  assert.match(response.text, /Filters/);
  assert.match(response.text, /All missions/);
  assert.match(response.text, /Summary/);
  assert.match(response.text, /Displayed submissions/);
  assert.match(response.text, /Identification sheet/);
  assert.match(response.text, /Humanitarian layer/);
  assert.match(response.text, /Road layer/);
  assert.match(response.text, /Expand legend/);
  assert.match(response.text, /Collection submissions map/);
});
