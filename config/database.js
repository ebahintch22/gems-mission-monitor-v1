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

  CREATE TABLE IF NOT EXISTS soumissions_collecte (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL DEFAULT 'simulation'
      CHECK (source IN ('simulation', 'kobo')),
    source_submission_id TEXT NOT NULL,
    kobo_asset_uid TEXT,
    mission_id INTEGER NOT NULL,
    equipe_id INTEGER,
    agent_id INTEGER,
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
          id, nom, prenoms, user_id, equipe_id, code_agent,
          telephone, equipement, statut, created_at
        )
        SELECT
          a.id,
          COALESCE(u.nom, 'Agent'),
          COALESCE(u.prenoms, a.code_agent),
          a.user_id,
          a.equipe_id,
          a.code_agent,
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
`);

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

function addColumnIfMissing(columnNames, tableName, columnName, definition) {
  if (!columnNames.includes(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
    columnNames.push(columnName);
  }
}
