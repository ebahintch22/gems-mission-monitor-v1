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

const roleCsv = [
  "Role;Label;description",
  "admin;Administrateur systeme;Parametrage general",
  "coordinateur;Coordinateur national;Vue globale",
  "superviseur;Superviseur regional;Suivi des agents",
  "agent;Enqueteur;Collecte de donnees",
  "controleur;Controleur qualite;Detection des anomalies",
  "partenaire;Partenaire;Consultation",
  "specialiste_gis;Responsable SIG;Cartographie"
].join("\n");

importRoles(db, roleCsv);

test.after(() => db.close());

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
  const secondImport = importRoles(db, roleCsv);
  const roles = db.prepare("SELECT code_role, label FROM roles ORDER BY code_role").all();
  const formResponse = await request(app).get("/users/new");

  assert.deepEqual(secondImport, { roles: 7 });
  assert.equal(roles.length, 7);
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
  assert.match(response.text, /Livraison v0\.3 du 04 juin 2026 \[KoboConnect \+ Gestion Utilisateurs\]/);
  assert.match(response.text, /id="site-nav-toggle"/);
  assert.match(response.text, /aria-controls="site-nav"/);
  assert.match(response.text, /data-label-open="Afficher le menu de navigation"/);
  assert.match(response.text, /data-label-close="Masquer le menu de navigation"/);
  assert.match(response.text, /<nav id="site-nav" aria-label="Navigation principale">/);
  assert.match(response.text, /font-awesome\/6\.5\.2\/css\/all\.min\.css/);
  assert.match(navigation, /class="nav-button" href="\/"/);
  assert.match(navigation, /fa-solid fa-chart-line/);
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
  assert.match(navigation, /fa-solid fa-gear/);
  assert.match(navigation, /Paramétrages/);
  assert.match(navigation, /fa-solid fa-chevron-down nav-menu-chevron/);
  assert.match(navigation, /class="nav-button" href="\/cartographie"/);
  assert.match(navigation, /fa-solid fa-map-location-dot/);
  assert.match(navigation, /fa-solid fa-chart-pie/);
  assert.match(navigation, /Infographie/);
  assert.match(navigation, /href="\/infographies\/mission-globale" role="menuitem">Mission globale/);
  assert.match(navigation, /href="\/infographies\/par-superviseur" role="menuitem">Par superviseur/);
  assert.match(navigation, /href="\/infographies\/par-region" role="menuitem">Par r/);
  assert.match(navigation, /Dashboard[\s\S]*Cartographie[\s\S]*Infographie[\s\S]*Paramétrages/);
  assert.doesNotMatch(navigation, /Configuration/);
  assert.match(response.text, /role="menuitem">Missions/);
  assert.match(response.text, /role="menuitem">Équipes/);
  assert.match(response.text, /role="menuitem">Agents/);
  assert.match(response.text, /role="menuitem">Utilisateurs/);
  assert.match(response.text, /href="\/parametrages\/kobo" role="menuitem">KoboToolbox/);
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
  assert.match(response.text, /Entrega v0\.3 del 04 de junio de 2026/);
  assert.match(response.text, /Seguimiento operativo/);
  assert.match(response.text, /Vista sint/);
  assert.match(response.text, /Crear una misi/);
  assert.match(response.text, /Misiones recientes/);
  assert.match(response.text, /class="is-active"[\s\S]*href="\/\?lang=es"[\s\S]*Espa/);
});

test("GET /infographies expose les pages factices", async () => {
  const globalResponse = await request(app).get("/infographies/mission-globale");
  const supervisorResponse = await request(app).get("/infographies/par-superviseur");
  const regionResponse = await request(app).get("/infographies/par-region?lang=en");

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
  const response = await request(app).get("/parametrages/kobo");
  const styleResponse = await request(app).get("/css/app.css");

  assert.equal(response.status, 200);
  assert.equal(styleResponse.status, 200);
  assert.match(response.text, /Administration KoboToolbox/);
  assert.match(response.text, /Tester la connexion/);
  assert.match(response.text, /Charger les formulaires/);
  assert.match(response.text, /Synchroniser les soumissions/);
  assert.match(response.text, /name="base_url"/);
  assert.match(response.text, /name="api_token"/);
  assert.match(response.text, /name="asset_uid"/);
  assert.match(response.text, /name="mission_id"/);
  assert.match(response.text, /name="dry_run"/);
  assert.match(styleResponse.text, /\.kobo-layout\s*\{/);
  assert.match(styleResponse.text, /\.kobo-sync-form\s*\{/);
  assert.match(styleResponse.text, /\.kobo-summary\s*\{/);
});

test("GET /parametrages/kobo?lang=en utilise les ressources anglaises", async () => {
  const response = await request(app).get("/parametrages/kobo?lang=en");

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
  const response = await request(app).get("/missions?lang=en");
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
  const response = await request(app).get("/agents/new?lang=en");

  assert.equal(response.status, 200);
  assert.match(response.text, /<html lang="en" data-display-size="medium">/);
  assert.match(response.text, /New collection agent/);
  assert.match(response.text, /Identify the enumerator/);
  assert.match(response.text, /Last name \*/);
  assert.match(response.text, /First names \*/);
  assert.match(response.text, /Agent code \*/);
  assert.match(response.text, /No application account/);
  assert.match(response.text, /Assign later/);
});

test("GET /users/new?lang=en utilise les ressources anglaises Utilisateurs", async () => {
  const response = await request(app).get("/users/new?lang=en");

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
  const response = await request(app).get("/equipes/new?lang=en");

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
  const response = await request(app)
    .post("/parametrages/kobo/config")
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
  const createResponse = await request(app)
    .post("/missions")
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

  const listResponse = await request(app).get("/missions");
  assert.equal(listResponse.status, 200);
  assert.match(listResponse.text, /Mission pilote/);

  const detailResponse = await request(app).get("/missions/1");
  assert.equal(detailResponse.status, 200);
  assert.match(detailResponse.text, /kobo-test/);

  const dashboardResponse = await request(app).get("/");
  assert.match(dashboardResponse.text, /Mission pilote/);
  assert.match(dashboardResponse.text, />12</);
  assert.doesNotMatch(dashboardResponse.text, /site-footer/);
  assert.doesNotMatch(dashboardResponse.text, /MVP de suivi des missions de collecte GEMS/);
});

test("POST /missions refuse des coordonnees invalides", async () => {
  const response = await request(app)
    .post("/missions")
    .type("form")
    .send({ name: "Erreur", region: "Nord", latitude: "100" });

  assert.equal(response.status, 400);
  assert.match(response.text, /Vérifiez/);
});

test("creation d'un superviseur avec plusieurs regions", async () => {
  const regions = db.prepare(`
    SELECT id FROM regions WHERE code_region IN ('CI01', 'TEST01') ORDER BY code_region
  `).all();

  const createResponse = await request(app)
    .post("/users")
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

  const detailResponse = await request(app).get(createResponse.headers.location);
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
  const duplicateResponse = await request(app)
    .post("/users")
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
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get("awa.kone@example.org");
  const region = db.prepare("SELECT id FROM regions WHERE code_region = ?").get("TEST01");
  const editResponse = await request(app).get(`/users/${user.id}/edit`);

  assert.equal(editResponse.status, 200);
  assert.match(editResponse.text, /Modifier l&#39;utilisateur/);
  assert.match(editResponse.text, /awa\.kone@example\.org/);

  const updateResponse = await request(app)
    .post(`/users/${user.id}`)
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

  const detailResponse = await request(app).get(`/users/${user.id}`);
  assert.match(detailResponse.text, /Awa Marie/);
  assert.match(detailResponse.text, /Controleur qualite/);
  assert.match(detailResponse.text, /suspendu/);
  assert.doesNotMatch(detailResponse.text, /District Autonome d&#39;Abidjan/);

  const assignments = db.prepare("SELECT COUNT(*) AS total FROM user_regions WHERE user_id = ?")
    .get(user.id).total;
  assert.equal(assignments, 1);
});

test("modification d'un utilisateur refuse l'email d'un autre compte", async () => {
  const region = db.prepare("SELECT id FROM regions WHERE code_region = ?").get("TEST01");
  const createResponse = await request(app)
    .post("/users")
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
  const regionIds = db.prepare(`
    SELECT id FROM regions WHERE code_region IN ('CI01', 'TEST01') ORDER BY code_region
  `).all().map((region) => String(region.id));
  const supervisorResponse = await request(app)
    .post("/users")
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

  const formResponse = await request(app).get("/equipes/new");
  assert.equal(formResponse.status, 200);
  assert.match(formResponse.text, /Mission pilote/);
  assert.match(formResponse.text, /Fatou Coulibaly/);

  const createResponse = await request(app)
    .post("/equipes")
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

  const detailResponse = await request(app).get(createResponse.headers.location);
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
  const missionId = db.prepare("SELECT id FROM missions WHERE name = ?").get("Mission pilote").id;
  const controllerId = db.prepare("SELECT id FROM users WHERE email = ?").get("awa.marie@example.org").id;
  const regionId = db.prepare("SELECT id FROM regions WHERE code_region = ?").get("TEST01").id;

  const noRegionResponse = await request(app)
    .post("/equipes")
    .type("form")
    .send({
      nom_equipe: "Equipe sans zone",
      mission_id: String(missionId),
      statut: "planifiee"
    });
  const invalidSupervisorResponse = await request(app)
    .post("/equipes")
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
  const equipe = db.prepare("SELECT id FROM equipes WHERE nom_equipe = ?").get("Equipe Centre 1");
  const missionId = db.prepare("SELECT id FROM missions WHERE name = ?").get("Mission pilote").id;
  const regionId = db.prepare("SELECT id FROM regions WHERE code_region = ?").get("TEST01").id;

  const editResponse = await request(app).get(`/equipes/${equipe.id}/edit`);
  assert.equal(editResponse.status, 200);
  assert.match(editResponse.text, /Modifier l&#39;équipe/);
  assert.match(editResponse.text, /Equipe Centre 1/);

  const updateResponse = await request(app)
    .post(`/equipes/${equipe.id}`)
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

  const detailResponse = await request(app).get(`/equipes/${equipe.id}`);
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
  const equipe = db.prepare("SELECT id FROM equipes WHERE nom_equipe = ?").get("Equipe Centre Revisee");
  const missionId = db.prepare("SELECT id FROM missions WHERE name = ?").get("Mission pilote").id;
  const controllerId = db.prepare("SELECT id FROM users WHERE email = ?").get("awa.marie@example.org").id;
  const regionId = db.prepare("SELECT id FROM regions WHERE code_region = ?").get("TEST01").id;

  const response = await request(app)
    .post(`/equipes/${equipe.id}`)
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

test("creation d'un agent de collecte associe a un utilisateur et une equipe", async () => {
  const regionId = db.prepare("SELECT id FROM regions WHERE code_region = ?").get("TEST01").id;
  const userResponse = await request(app)
    .post("/users")
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

  const formResponse = await request(app).get("/agents/new");
  assert.equal(formResponse.status, 200);
  assert.match(formResponse.text, /Alain Nguessan/);
  assert.match(formResponse.text, /Equipe Centre Revisee/);

  const createResponse = await request(app)
    .post("/agents")
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

  const detailResponse = await request(app).get(createResponse.headers.location);
  assert.equal(detailResponse.status, 200);
  assert.match(detailResponse.text, /Alain Nguessan/);
  assert.match(detailResponse.text, /AG-001/);
  assert.match(detailResponse.text, /Alain Nguessan/);
  assert.match(detailResponse.text, /Equipe Centre Revisee/);
  assert.match(detailResponse.text, /Mission pilote/);
});

test("POST /agents refuse un code duplique et un utilisateur non agent", async () => {
  const equipeId = db.prepare("SELECT id FROM equipes WHERE nom_equipe = ?").get("Equipe Centre Revisee").id;
  const nonAgentId = db.prepare("SELECT id FROM users WHERE email = ?").get("fatou.superviseur@example.org").id;
  const duplicateResponse = await request(app)
    .post("/agents")
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
  const agent = db.prepare("SELECT id FROM agents_collecte WHERE code_agent = ?").get("AG-001");
  const editResponse = await request(app).get(`/agents/${agent.id}/edit`);

  assert.equal(editResponse.status, 200);
  assert.match(editResponse.text, /Modifier l&#39;agent de collecte/);

  const updateResponse = await request(app)
    .post(`/agents/${agent.id}`)
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
  const detailResponse = await request(app).get(`/agents/${agent.id}`);
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
  const invalidResponse = await request(app)
    .post("/agents")
    .type("form")
    .send({
      code_agent: "AG-003",
      statut: "actif"
    });
  const createResponse = await request(app)
    .post("/agents")
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

  const detailResponse = await request(app).get(createResponse.headers.location);
  assert.match(detailResponse.text, /Aminata Bamba/);
  assert.match(detailResponse.text, /Sans compte applicatif/);
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
  const response = await request(app).get("/cartographie");
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

test("GET /cartographie?lang=en utilise les ressources anglaises SIG", async () => {
  const response = await request(app).get("/cartographie?lang=en");

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
