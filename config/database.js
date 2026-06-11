const path = require("path");
const Database = require("better-sqlite3");

const databasePath = process.env.DATABASE_PATH || path.join(__dirname, "..", "data", "gems.sqlite");
console.log("Chemin d'accès à la base de données", databasePath);
const db = new Database(databasePath);

db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS regions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_region TEXT NOT NULL UNIQUE,
    nom_region TEXT NOT NULL,
    geometry_geojson TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS departements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_departement TEXT NOT NULL UNIQUE,
    nom_departement TEXT NOT NULL,
    region_id INTEGER NOT NULL,
    geometry_geojson TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (region_id) REFERENCES regions(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS sous_prefectures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_sous_prefecture TEXT NOT NULL UNIQUE,
    nom_sous_prefecture TEXT NOT NULL,
    departement_id INTEGER NOT NULL,
    geometry_geojson TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (departement_id) REFERENCES departements(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT
  );

  CREATE INDEX IF NOT EXISTS idx_departements_region_id
    ON departements(region_id);

  CREATE INDEX IF NOT EXISTS idx_sous_prefectures_departement_id
    ON sous_prefectures(departement_id);

  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_role TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    prenoms TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    telephone TEXT,
    role TEXT NOT NULL DEFAULT 'superviseur',
    statut TEXT NOT NULL DEFAULT 'actif'
      CHECK (statut IN ('actif', 'inactif', 'suspendu')),
    password_hash TEXT,
    last_login TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_regions (
    user_id INTEGER NOT NULL,
    region_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, region_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
      ON UPDATE CASCADE
      ON DELETE CASCADE,
    FOREIGN KEY (region_id) REFERENCES regions(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT
  );

  CREATE INDEX IF NOT EXISTS idx_user_regions_region_id
    ON user_regions(region_id);

  CREATE TABLE IF NOT EXISTS missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    region TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planifiee'
      CHECK (status IN ('planifiee', 'en_cours', 'terminee', 'suspendue')),
    start_date TEXT,
    end_date TEXT,
    collectors INTEGER NOT NULL DEFAULT 0 CHECK (collectors >= 0),
    kobo_asset_uid TEXT,
    latitude REAL,
    longitude REAL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS equipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_equipe TEXT NOT NULL,
    superviseur_id INTEGER,
    mission_id INTEGER NOT NULL,
    statut TEXT NOT NULL DEFAULT 'planifiee'
      CHECK (statut IN ('planifiee', 'active', 'suspendue', 'cloturee')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (superviseur_id) REFERENCES users(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL,
    FOREIGN KEY (mission_id) REFERENCES missions(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS equipe_regions (
    equipe_id INTEGER NOT NULL,
    region_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (equipe_id, region_id),
    FOREIGN KEY (equipe_id) REFERENCES equipes(id)
      ON UPDATE CASCADE
      ON DELETE CASCADE,
    FOREIGN KEY (region_id) REFERENCES regions(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT
  );

  CREATE INDEX IF NOT EXISTS idx_equipes_mission_id
    ON equipes(mission_id);

  CREATE INDEX IF NOT EXISTS idx_equipes_superviseur_id
    ON equipes(superviseur_id);

  CREATE INDEX IF NOT EXISTS idx_equipe_regions_region_id
    ON equipe_regions(region_id);

  CREATE TABLE IF NOT EXISTS agents_collecte (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    prenoms TEXT NOT NULL,
    user_id INTEGER UNIQUE,
    equipe_id INTEGER,
    code_agent TEXT NOT NULL COLLATE NOCASE UNIQUE,
    kobo_code_agent TEXT COLLATE NOCASE UNIQUE,
    telephone TEXT,
    equipement TEXT,
    statut TEXT NOT NULL DEFAULT 'actif'
      CHECK (statut IN ('actif', 'inactif', 'suspendu')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL,
    FOREIGN KEY (equipe_id) REFERENCES equipes(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_agents_collecte_equipe_id
    ON agents_collecte(equipe_id);

  CREATE TABLE IF NOT EXISTS agent_mission_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    mission_id INTEGER NOT NULL,
    equipe_id INTEGER NOT NULL,
    start_date TEXT NOT NULL DEFAULT CURRENT_DATE,
    end_date TEXT,
    statut TEXT NOT NULL DEFAULT 'active'
      CHECK (statut IN ('active', 'terminee', 'suspendue', 'annulee')),
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES agents_collecte(id)
      ON UPDATE CASCADE
      ON DELETE CASCADE,
    FOREIGN KEY (mission_id) REFERENCES missions(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT,
    FOREIGN KEY (equipe_id) REFERENCES equipes(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_assignments_one_active
    ON agent_mission_assignments(agent_id)
    WHERE statut = 'active';

  CREATE INDEX IF NOT EXISTS idx_agent_assignments_mission_id
    ON agent_mission_assignments(mission_id);

  CREATE INDEX IF NOT EXISTS idx_agent_assignments_equipe_id
    ON agent_mission_assignments(equipe_id);

  CREATE TABLE IF NOT EXISTS soumissions_collecte (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL DEFAULT 'simulation'
      CHECK (source IN ('simulation', 'kobo')),
    source_submission_id TEXT NOT NULL,
    kobo_asset_uid TEXT,
    mission_id INTEGER NOT NULL,
    equipe_id INTEGER,
    agent_id INTEGER,
    assignment_id INTEGER,
    sous_prefecture_id INTEGER,
    code_agent_source TEXT,
    submitted_at TEXT NOT NULL,
    latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    precision_m REAL CHECK (precision_m IS NULL OR precision_m >= 0),
    statut_validation TEXT NOT NULL DEFAULT 'a_verifier'
      CHECK (statut_validation IN ('a_verifier', 'validee', 'rejetee')),
    anomaly_count INTEGER NOT NULL DEFAULT 0
      CHECK (anomaly_count >= 0),
    formulaire_type TEXT NOT NULL,
    raw_data_json TEXT NOT NULL,
    synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source, source_submission_id),
    FOREIGN KEY (mission_id) REFERENCES missions(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT,
    FOREIGN KEY (equipe_id) REFERENCES equipes(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL,
    FOREIGN KEY (agent_id) REFERENCES agents_collecte(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL,
    FOREIGN KEY (assignment_id) REFERENCES agent_mission_assignments(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL,
    FOREIGN KEY (sous_prefecture_id) REFERENCES sous_prefectures(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_soumissions_mission_id
    ON soumissions_collecte(mission_id);

  CREATE INDEX IF NOT EXISTS idx_soumissions_equipe_id
    ON soumissions_collecte(equipe_id);

  CREATE INDEX IF NOT EXISTS idx_soumissions_agent_id
    ON soumissions_collecte(agent_id);

  CREATE INDEX IF NOT EXISTS idx_soumissions_sous_prefecture_id
    ON soumissions_collecte(sous_prefecture_id);

  CREATE INDEX IF NOT EXISTS idx_soumissions_submitted_at
    ON soumissions_collecte(submitted_at);

  CREATE INDEX IF NOT EXISTS idx_soumissions_validation
    ON soumissions_collecte(statut_validation);
`);

const usersSchema = db.prepare(`
  SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'
`).get().sql;

if (usersSchema.includes("CHECK (role IN")) {
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TEMP TABLE user_regions_migration AS
          SELECT user_id, region_id, created_at FROM user_regions;
        DROP TABLE user_regions;
        ALTER TABLE users RENAME TO users_legacy;

        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nom TEXT NOT NULL,
          prenoms TEXT NOT NULL,
          email TEXT NOT NULL COLLATE NOCASE UNIQUE,
          telephone TEXT,
          role TEXT NOT NULL DEFAULT 'superviseur',
          statut TEXT NOT NULL DEFAULT 'actif'
            CHECK (statut IN ('actif', 'inactif', 'suspendu')),
          password_hash TEXT,
          last_login TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO users (
          id, nom, prenoms, email, telephone, role, statut,
          password_hash, last_login, created_at
        )
        SELECT
          id, nom, prenoms, email, telephone, role, statut,
          password_hash, last_login, created_at
        FROM users_legacy;
        DROP TABLE users_legacy;

        CREATE TABLE user_regions (
          user_id INTEGER NOT NULL,
          region_id INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, region_id),
          FOREIGN KEY (user_id) REFERENCES users(id)
            ON UPDATE CASCADE
            ON DELETE CASCADE,
          FOREIGN KEY (region_id) REFERENCES regions(id)
            ON UPDATE CASCADE
            ON DELETE RESTRICT
        );

        INSERT INTO user_regions (user_id, region_id, created_at)
          SELECT user_id, region_id, created_at FROM user_regions_migration;
        DROP TABLE user_regions_migration;

        CREATE INDEX IF NOT EXISTS idx_user_regions_region_id
          ON user_regions(region_id);
      `);
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

const agentColumns = db.prepare("PRAGMA table_info('agents_collecte')").all()
  .map((column) => column.name);

if (!agentColumns.includes("nom") || !agentColumns.includes("prenoms")) {
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
        ALTER TABLE agents_collecte RENAME TO agents_collecte_legacy;

        CREATE TABLE agents_collecte (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nom TEXT NOT NULL,
          prenoms TEXT NOT NULL,
          user_id INTEGER UNIQUE,
          equipe_id INTEGER,
          code_agent TEXT NOT NULL COLLATE NOCASE UNIQUE,
          kobo_code_agent TEXT COLLATE NOCASE UNIQUE,
          telephone TEXT,
          equipement TEXT,
          statut TEXT NOT NULL DEFAULT 'actif'
            CHECK (statut IN ('actif', 'inactif', 'suspendu')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
            ON UPDATE CASCADE
            ON DELETE SET NULL,
          FOREIGN KEY (equipe_id) REFERENCES equipes(id)
            ON UPDATE CASCADE
            ON DELETE SET NULL
        );

        INSERT INTO agents_collecte (
          id, nom, prenoms, user_id, equipe_id, code_agent, kobo_code_agent,
          telephone, equipement, statut, created_at
        )
        SELECT
          a.id,
          COALESCE(u.nom, 'Agent'),
          COALESCE(u.prenoms, a.code_agent),
          a.user_id,
          a.equipe_id,
          a.code_agent,
          NULL,
          a.telephone,
          a.equipement,
          a.statut,
          a.created_at
        FROM agents_collecte_legacy a
        LEFT JOIN users u ON u.id = a.user_id;

        DROP TABLE agents_collecte_legacy;

        CREATE INDEX IF NOT EXISTS idx_agents_collecte_equipe_id
          ON agents_collecte(equipe_id);
      `);
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

migrateUsersForClosedRegistration();

db.exec(`
  CREATE TABLE IF NOT EXISTS user_invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    nom TEXT NOT NULL,
    prenoms TEXT NOT NULL,
    role TEXT NOT NULL,
    zone_affectation TEXT,
    mission_id INTEGER,
    statut TEXT NOT NULL DEFAULT 'invite'
      CHECK (statut IN ('invite', 'activee', 'expiree', 'annulee')),
    invited_by INTEGER,
    invitation_token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    activated_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mission_id) REFERENCES missions(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL,
    FOREIGN KEY (invited_by) REFERENCES users(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_user_invitations_email
    ON user_invitations(email);

  CREATE INDEX IF NOT EXISTS idx_user_invitations_statut
    ON user_invitations(statut);

  CREATE TABLE IF NOT EXISTS activation_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invitation_id INTEGER NOT NULL,
    user_id INTEGER,
    token_hash TEXT NOT NULL UNIQUE,
    purpose TEXT NOT NULL DEFAULT 'activation'
      CHECK (purpose IN ('activation', 'password_reset')),
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invitation_id) REFERENCES user_invitations(id)
      ON UPDATE CASCADE
      ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
      ON UPDATE CASCADE
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_activation_tokens_invitation_id
    ON activation_tokens(invitation_id);

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER,
    target_user_id INTEGER,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    details_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (actor_user_id) REFERENCES users(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL,
    FOREIGN KEY (target_user_id) REFERENCES users(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_audit_logs_action
    ON audit_logs(action);

  CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
    ON audit_logs(created_at);

  CREATE TABLE IF NOT EXISTS user_logins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    email TEXT,
    success INTEGER NOT NULL CHECK (success IN (0, 1)),
    failure_reason TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_user_logins_created_at
    ON user_logins(created_at);

  CREATE INDEX IF NOT EXISTS idx_user_logins_user_id
    ON user_logins(user_id);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    type TEXT NOT NULL DEFAULT 'string'
      CHECK (type IN ('string', 'number', 'boolean', 'json', 'secret')),
    group_name TEXT NOT NULL DEFAULT 'general',
    label TEXT NOT NULL,
    description TEXT,
    updated_by INTEGER,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS app_metadata (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    app_name TEXT NOT NULL DEFAULT 'G2M',
    release_version TEXT NOT NULL DEFAULT 'v0.5',
    release_label TEXT NOT NULL DEFAULT 'Livraison v0.5 du 09 juin 2026 [Fiche decisionnelle]',
    release_date TEXT NOT NULL DEFAULT '2026-06-09',
    environment TEXT NOT NULL DEFAULT 'local',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_permission TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    is_system INTEGER NOT NULL DEFAULT 0
      CHECK (is_system IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS role_permissions (
    role TEXT NOT NULL,
    permission_id INTEGER NOT NULL,
    allowed INTEGER NOT NULL DEFAULT 1
      CHECK (allowed IN (0, 1)),
    locked INTEGER NOT NULL DEFAULT 0
      CHECK (locked IN (0, 1)),
    source TEXT NOT NULL DEFAULT 'admin'
      CHECK (source IN ('system', 'admin')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role, permission_id),
    FOREIGN KEY (permission_id) REFERENCES permissions(id)
      ON UPDATE CASCADE
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_permission_overrides (
    user_id INTEGER NOT NULL,
    permission_id INTEGER NOT NULL,
    allowed INTEGER NOT NULL
      CHECK (allowed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, permission_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
      ON UPDATE CASCADE
      ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id)
      ON UPDATE CASCADE
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id
    ON role_permissions(permission_id);

  CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_permission_id
    ON user_permission_overrides(permission_id);
`);

const submissionColumns = db.prepare("PRAGMA table_info('soumissions_collecte')").all()
  .map((column) => column.name);
addColumnIfMissing(submissionColumns, "soumissions_collecte", "assignment_id", "INTEGER");
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_soumissions_assignment_id
    ON soumissions_collecte(assignment_id);
`);

const missionColumns = db.prepare("PRAGMA table_info('missions')").all()
  .map((column) => column.name);
addColumnIfMissing(missionColumns, "missions", "archived", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing(missionColumns, "missions", "archived_at", "TEXT");
addColumnIfMissing(missionColumns, "missions", "archived_by", "INTEGER");
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_missions_archived
    ON missions(archived);
`);

seedCurrentAgentAssignments();
seedDefaultSettings();
seedAppMetadata();
seedDefaultPermissions();

module.exports = db;

function migrateUsersForClosedRegistration() {
  const columns = db.prepare("PRAGMA table_info('users')").all();
  const columnNames = columns.map((column) => column.name);

  addColumnIfMissing(columnNames, "users", "zone_affectation", "TEXT");
  addColumnIfMissing(columnNames, "users", "mission_id", "INTEGER");
  addColumnIfMissing(columnNames, "users", "email_verified", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(columnNames, "users", "updated_at", "TEXT");

  db.prepare(`
    UPDATE users
    SET email_verified = 1
    WHERE statut = 'actif'
      AND password_hash IS NOT NULL
      AND email_verified = 0
  `).run();

  db.prepare(`
    UPDATE users
    SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
    WHERE updated_at IS NULL
  `).run();
}

const agentCollecteColumns = db.prepare("PRAGMA table_info('agents_collecte')").all()
  .map((column) => column.name);
addColumnIfMissing(agentCollecteColumns, "agents_collecte", "kobo_code_agent", "TEXT");
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_collecte_kobo_code_agent
    ON agents_collecte(kobo_code_agent)
    WHERE kobo_code_agent IS NOT NULL AND kobo_code_agent <> '';
`);
backfillKoboAgentCodes();

function addColumnIfMissing(columnNames, tableName, columnName, definition) {
  if (!columnNames.includes(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
    columnNames.push(columnName);
  }
}

function seedCurrentAgentAssignments() {
  db.prepare(`
    INSERT OR IGNORE INTO agent_mission_assignments (
      agent_id, mission_id, equipe_id, start_date, statut
    )
    SELECT a.id, e.mission_id, e.id, COALESCE(a.created_at, CURRENT_DATE), 'active'
    FROM agents_collecte a
    JOIN equipes e ON e.id = a.equipe_id
    WHERE a.equipe_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM agent_mission_assignments ama
        WHERE ama.agent_id = a.id
          AND ama.statut = 'active'
      )
  `).run();
}

function backfillKoboAgentCodes() {
  const candidates = db.prepare(`
    SELECT id, code_agent
    FROM agents_collecte
    WHERE kobo_code_agent IS NULL
       OR kobo_code_agent = ''
  `).all();
  const exists = db.prepare(`
    SELECT id
    FROM agents_collecte
    WHERE kobo_code_agent = ?
      AND id <> ?
  `);
  const update = db.prepare(`
    UPDATE agents_collecte
    SET kobo_code_agent = ?
    WHERE id = ?
  `);

  candidates.forEach((agent) => {
    const koboCode = deriveKoboCode(agent.code_agent);
    if (!koboCode || exists.get(koboCode, agent.id)) {
      return;
    }
    update.run(koboCode, agent.id);
  });
}

function deriveKoboCode(codeAgent) {
  const match = String(codeAgent || "").match(/(\d+)$/);
  if (!match) {
    return null;
  }

  const numericValue = Number(match[1]);
  return Number.isFinite(numericValue) ? String(numericValue) : match[1];
}

function seedDefaultSettings() {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO settings (
      key, value, type, group_name, label, description
    ) VALUES (
      @key, @value, @type, @group_name, @label, @description
    )
  `);

  [
    {
      key: "app.name",
      value: "GEMS Mission Monitor",
      type: "string",
      group_name: "general",
      label: "Nom de l'application",
      description: "Libelle principal affiche dans l'application."
    },
    {
      key: "app.default_mission_id",
      value: "",
      type: "string",
      group_name: "general",
      label: "Mission d'accueil",
      description: "Mission dont le dashboard sera charge comme page d'accueil apres connexion."
    },
    {
      key: "alerts.anomaly_threshold",
      value: "3",
      type: "number",
      group_name: "alerts",
      label: "Seuil d'anomalies",
      description: "Nombre d'anomalies a partir duquel une soumission est prioritaire."
    },
    {
      key: "sync.kobo_interval_minutes",
      value: "60",
      type: "number",
      group_name: "sync",
      label: "Intervalle Kobo",
      description: "Intervalle de synchronisation KoboToolbox en minutes."
    },
    {
      key: "mail.from",
      value: process.env.MAIL_FROM || "no-reply@g2m.local",
      type: "string",
      group_name: "mail",
      label: "Expediteur email",
      description: "Adresse utilisee comme expediteur des emails applicatifs."
    },
    {
      key: "smtp.auth_method",
      value: process.env.SMTP_AUTH_METHOD || "password",
      type: "string",
      group_name: "mail",
      label: "Mode d'authentification SMTP",
      description: "Utiliser password pour SMTP classique ou oauth2 pour Gmail OAuth2."
    },
    {
      key: "smtp.host",
      value: process.env.SMTP_HOST || "",
      type: "string",
      group_name: "mail",
      label: "Serveur SMTP",
      description: "Hote SMTP utilise pour l'envoi des emails."
    },
    {
      key: "smtp.port",
      value: process.env.SMTP_PORT || "",
      type: "number",
      group_name: "mail",
      label: "Port SMTP",
      description: "Port SMTP."
    },
    {
      key: "smtp.secure",
      value: process.env.SMTP_SECURE || "false",
      type: "boolean",
      group_name: "mail",
      label: "SMTP securise",
      description: "Utiliser une connexion SMTP TLS directe."
    },
    {
      key: "smtp.user",
      value: process.env.SMTP_USER || "",
      type: "string",
      group_name: "mail",
      label: "Utilisateur SMTP",
      description: "Identifiant SMTP si le serveur exige une authentification."
    },
    {
      key: "smtp.password",
      value: process.env.SMTP_PASSWORD || "",
      type: "secret",
      group_name: "mail",
      label: "Mot de passe SMTP",
      description: "Secret SMTP masque dans l'interface."
    },
    {
      key: "gmail.oauth_client_id",
      value: process.env.GMAIL_OAUTH_CLIENT_ID || "",
      type: "secret",
      group_name: "mail",
      label: "Client ID OAuth2 Gmail",
      description: "Identifiant client OAuth2 cree dans Google Cloud Console."
    },
    {
      key: "gmail.oauth_client_secret",
      value: process.env.GMAIL_OAUTH_CLIENT_SECRET || "",
      type: "secret",
      group_name: "mail",
      label: "Client secret OAuth2 Gmail",
      description: "Secret client OAuth2 Google, masque dans l'interface."
    },
    {
      key: "gmail.oauth_refresh_token",
      value: process.env.GMAIL_OAUTH_REFRESH_TOKEN || "",
      type: "secret",
      group_name: "mail",
      label: "Refresh token OAuth2 Gmail",
      description: "Jeton long terme obtenu avec le consentement Google OAuth2."
    }
  ].forEach((setting) => insert.run(setting));
}

function seedAppMetadata() {
  db.prepare(`
    INSERT OR IGNORE INTO app_metadata (
      id, app_name, release_version, release_label, release_date, environment, notes
    ) VALUES (
      1,
      'G2M',
      'v0.5',
      'Livraison v0.5 du 09 juin 2026 [Fiche decisionnelle]',
      '2026-06-09',
      @environment,
      'Metadonnees applicatives de controle manuel.'
    )
  `).run({
    environment: process.env.NODE_ENV || "local"
  });
}

function seedDefaultPermissions() {
  const permissions = [
    ["dashboard.read", "Acces au dashboard", "Consultation du tableau de bord.", "dashboard", 0],
    ["dashboard.mission.read", "Dashboard mission", "Consultation du dashboard d'une mission.", "dashboard", 0],
    ["missions.read", "Consultation des missions", "Lecture des missions.", "missions", 0],
    ["missions.manage", "Gestion des missions", "Creation et modification des missions.", "missions", 0],
    ["teams.read", "Consultation des equipes", "Lecture des equipes.", "teams", 0],
    ["teams.manage", "Gestion des equipes", "Creation et modification des equipes.", "teams", 0],
    ["agents.read", "Consultation des agents", "Lecture des agents de collecte.", "agents", 0],
    ["agents.manage", "Gestion des agents", "Creation et modification des agents.", "agents", 0],
    ["users.read", "Consultation des utilisateurs", "Lecture du registre des utilisateurs.", "users", 0],
    ["users.manage", "Gestion des utilisateurs", "Creation et modification des utilisateurs.", "users", 1],
    ["users.invite.read", "Consultation des invitations", "Lecture des invitations utilisateurs.", "users", 0],
    ["users.invite.manage", "Gestion des invitations", "Creation et modification des invitations.", "users", 1],
    ["admin.access", "Acces administration", "Acces au hub d'administration.", "admin", 1],
    ["settings.manage", "Gestion des parametres", "Modification des parametres globaux.", "admin", 1],
    ["db.stats.read", "Rapport base de donnees", "Consultation du rapport dynamique SQLite.", "admin", 1],
    ["system.status.read", "Statut systeme", "Consultation des metadonnees applicatives.", "admin", 1],
    ["seed.manage", "Gestion des seeds", "Export et import des seeds de donnees.", "admin", 1],
    ["email.test", "Test email", "Envoi d'emails de test SMTP.", "admin", 1],
    ["monitoring.read", "Monitoring", "Consultation du monitoring applicatif.", "admin", 0],
    ["kobo.manage", "Administration Kobo", "Gestion de la connexion et des synchronisations KoboToolbox.", "kobo", 1],
    ["sig.read", "Consultation SIG", "Acces a la cartographie.", "sig", 0],
    ["sig.manage", "Gestion SIG", "Parametrage ou fonctions avancees SIG.", "sig", 0],
    ["infographics.read", "Infographies", "Consultation des infographies.", "infographics", 0],
    ["quality.read", "Consultation qualite", "Lecture des controles qualite.", "quality", 0],
    ["quality.manage", "Gestion qualite", "Actions de controle et validation.", "quality", 0],
    ["exports.manage", "Gestion des exports", "Generation et gestion des exports.", "exports", 0],
    ["permissions.manage", "Gestion des habilitations", "Administration de la matrice des droits.", "admin", 1]
  ];

  const upsertPermission = db.prepare(`
    INSERT INTO permissions (
      code_permission, label, description, category, is_system
    ) VALUES (
      @code_permission, @label, @description, @category, @is_system
    )
    ON CONFLICT(code_permission) DO UPDATE SET
      label = excluded.label,
      description = excluded.description,
      category = excluded.category,
      is_system = excluded.is_system
  `);

  const grantRolePermission = db.prepare(`
    INSERT INTO role_permissions (
      role, permission_id, allowed, locked, source
    )
    SELECT @role, id, @allowed, @locked, @source
    FROM permissions
    WHERE code_permission = @code_permission
    ON CONFLICT(role, permission_id) DO UPDATE SET
      allowed = CASE
        WHEN role_permissions.locked = 1 THEN role_permissions.allowed
        ELSE excluded.allowed
      END,
      locked = CASE
        WHEN excluded.locked = 1 THEN 1
        ELSE role_permissions.locked
      END,
      source = CASE
        WHEN excluded.locked = 1 THEN 'system'
        ELSE role_permissions.source
      END,
      updated_at = CURRENT_TIMESTAMP
  `);
  const insertDefaultRolePermission = db.prepare(`
    INSERT INTO role_permissions (
      role, permission_id, allowed, locked, source
    )
    SELECT @role, id, 1, 0, 'admin'
    FROM permissions
    WHERE code_permission = @code_permission
    ON CONFLICT(role, permission_id) DO NOTHING
  `);

  db.transaction(() => {
    permissions.forEach(([code, label, description, category, isSystem]) => {
      upsertPermission.run({
        code_permission: code,
        label,
        description,
        category,
        is_system: isSystem
      });
    });

    permissions.forEach(([code]) => {
      grantRolePermission.run({
        role: "admin",
        code_permission: code,
        allowed: 1,
        locked: 1,
        source: "system"
      });
    });

    seedDefaultRoleMatrix(insertDefaultRolePermission);
  })();
}

function seedDefaultRoleMatrix(insertDefaultRolePermission) {
  const matrix = {
    directeur_mission: [
      "dashboard.read",
      "dashboard.mission.read",
      "missions.read",
      "teams.read",
      "agents.read",
      "users.read",
      "users.invite.read",
      "monitoring.read",
      "sig.read",
      "infographics.read",
      "quality.read",
      "exports.manage"
    ],
    coordinateur: [
      "dashboard.read",
      "dashboard.mission.read",
      "missions.read",
      "missions.manage",
      "teams.read",
      "teams.manage",
      "agents.read",
      "agents.manage",
      "users.read",
      "users.invite.read",
      "monitoring.read",
      "sig.read",
      "infographics.read",
      "quality.read",
      "exports.manage"
    ],
    superviseur: [
      "dashboard.read",
      "dashboard.mission.read",
      "missions.read",
      "teams.read",
      "teams.manage",
      "agents.read",
      "agents.manage",
      "sig.read",
      "infographics.read",
      "quality.read"
    ],
    controleur: [
      "dashboard.read",
      "dashboard.mission.read",
      "missions.read",
      "teams.read",
      "agents.read",
      "sig.read",
      "infographics.read",
      "quality.read",
      "quality.manage",
      "exports.manage"
    ],
    specialiste_gis: [
      "dashboard.read",
      "dashboard.mission.read",
      "missions.read",
      "teams.read",
      "agents.read",
      "sig.read",
      "sig.manage",
      "infographics.read",
      "exports.manage"
    ],
    specialiste_analyste_donnees: [
      "dashboard.read",
      "dashboard.mission.read",
      "missions.read",
      "teams.read",
      "agents.read",
      "monitoring.read",
      "sig.read",
      "infographics.read",
      "quality.read",
      "exports.manage"
    ],
    partenaire: [
      "dashboard.read",
      "dashboard.mission.read",
      "missions.read",
      "infographics.read"
    ],
    agent: []
  };

  Object.entries(matrix).forEach(([role, permissionCodes]) => {
    permissionCodes.forEach((codePermission) => {
      insertDefaultRolePermission.run({
        role,
        code_permission: codePermission
      });
    });
  });
}
