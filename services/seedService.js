const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const currentDb = require("../config/database");

const defaultSeedFileName = "data-seed.txt";
const excludedTables = new Set([
  "settings",
  "app_metadata",
  "audit_logs",
  "activation_tokens",
  "user_invitations"
]);

const sensitiveTables = [...excludedTables];

const preferredTableOrder = [
  "regions",
  "departements",
  "sous_prefectures",
  "roles",
  "permissions",
  "users",
  "missions",
  "user_regions",
  "equipes",
  "equipe_regions",
  "agents_collecte",
  "agent_mission_assignments",
  "role_permissions",
  "user_permission_overrides",
  "soumissions_collecte"
];

function exportSeed(options = {}) {
  const seedDir = ensureSeedDirectory(options.seedDir);
  const seedFileName = buildSeedFileName();
  const outputPath = path.join(seedDir, seedFileName);
  const source = openDatabase(resolveSourceDbPath(options.sourceDbPath), true);

  try {
    const includeSensitiveTables = Boolean(options.includeSensitiveTables);
    const tables = listSeedTables(source.db, { includeSensitiveTables });
    const sql = buildSeedSql(source.db, tables);
    fs.writeFileSync(outputPath, sql, "utf8");

    return {
      fileName: seedFileName,
      filePath: outputPath,
      tableCount: tables.length,
      rowCount: countExportedRows(source.db, tables),
      includeSensitiveTables,
      tables
    };
  } finally {
    if (source.close) {
      source.db.close();
    }
  }
}

function buildSeedFileName(date = new Date()) {
  const timestamp = date.toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .slice(0, 15);
  return `data-seed_${timestamp}.txt`;
}

function importSeed(fileName, options = {}) {
  const seedDir = ensureSeedDirectory(options.seedDir);
  const safeFileName = normalizeSeedFileName(fileName);
  const filePath = path.join(seedDir, safeFileName);

  if (!fs.existsSync(filePath)) {
    throw new Error("seed_file_not_found");
  }

  const sql = fs.readFileSync(filePath, "utf8");
  if (!isValidSeedSql(sql)) {
    throw new Error("invalid_seed_file");
  }

  const target = openDatabase(resolveTargetDbPath(options.targetDbPath), false);
  try {
    target.db.pragma("foreign_keys = OFF");
    target.db.exec("BEGIN");
    try {
      target.db.exec(sql);
      target.db.exec("COMMIT");
    } catch (error) {
      try {
        target.db.exec("ROLLBACK");
      } catch {
        // Ignore rollback errors to keep the original import error visible.
      }
      throw error;
    } finally {
      target.db.pragma("foreign_keys = ON");
    }

    return {
      fileName: safeFileName,
      filePath,
      statementCount: countInsertStatements(sql)
    };
  } finally {
    if (target.close) {
      target.db.close();
    }
  }
}

function listSeedFiles(options = {}) {
  const seedDir = ensureSeedDirectory(options.seedDir);
  return fs.readdirSync(seedDir)
    .filter((fileName) => /\.(txt|sql)$/i.test(fileName))
    .map((fileName) => {
      const filePath = path.join(seedDir, fileName);
      const stat = fs.statSync(filePath);
      return {
        fileName,
        size: stat.size,
        updatedAt: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function getSeedDirectory(options = {}) {
  return path.resolve(options.seedDir || process.env.G2M_SEED_DIR || path.join(__dirname, "..", "data", "seeds"));
}

function ensureSeedDirectory(seedDir) {
  const resolved = getSeedDirectory({ seedDir });
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function resolveSourceDbPath(sourceDbPath) {
  if (process.env.DATABASE_PATH === ":memory:") {
    return ":memory:";
  }

  return sourceDbPath
    || process.env.SOURCE_DB_PATH
    || process.env.DATABASE_PATH
    || process.env.DB_PATH
    || path.join(__dirname, "..", "data", "gems.sqlite");
}

function resolveTargetDbPath(targetDbPath) {
  if (process.env.DATABASE_PATH === ":memory:") {
    return ":memory:";
  }

  return targetDbPath
    || process.env.TARGET_DB_PATH
    || process.env.DATABASE_PATH
    || process.env.DB_PATH
    || path.join(__dirname, "..", "data", "gems.sqlite");
}

function openDatabase(databasePath, readonly) {
  if (!databasePath || databasePath === ":memory:") {
    return { db: currentDb, close: false };
  }

  const currentPath = process.env.DATABASE_PATH || "";
  if (currentPath && path.resolve(databasePath) === path.resolve(currentPath)) {
    return { db: currentDb, close: false };
  }

  return {
    db: new Database(databasePath, { readonly }),
    close: true
  };
}

function listSeedTables(db, options = {}) {
  const existingTables = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map((table) => table.name)
    .filter((tableName) => options.includeSensitiveTables || !excludedTables.has(tableName));

  const existing = new Set(existingTables);
  const ordered = preferredTableOrder.filter((tableName) => existing.has(tableName));
  const remaining = existingTables.filter((tableName) => !preferredTableOrder.includes(tableName));
  return [...ordered, ...remaining];
}

function buildSeedSql(db, tables) {
  const lines = [
    "-- G2M data seed",
    `-- Generated at ${new Date().toISOString()}`,
    "-- Format: SQLite SQL upsert statements",
    ""
  ];

  tables.forEach((tableName) => {
    const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all();
    const primaryKeys = columns
      .filter((column) => column.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((column) => column.name);
    const rows = selectRows(db, tableName, primaryKeys);

    lines.push(`-- Table: ${tableName} (${rows.length} rows)`);
    rows.forEach((row) => {
      lines.push(buildUpsert(tableName, columns, primaryKeys, row));
    });
    lines.push("");
  });

  return `${lines.join("\n")}\n`;
}

function selectRows(db, tableName, primaryKeys) {
  const orderBy = primaryKeys.length
    ? primaryKeys.map(quoteIdentifier).join(", ")
    : "rowid";
  return db.prepare(`
    SELECT *
    FROM ${quoteIdentifier(tableName)}
    ORDER BY ${orderBy}
  `).all();
}

function buildUpsert(tableName, columns, primaryKeys, row) {
  const columnNames = columns.map((column) => column.name);
  const insertColumns = columnNames.map(quoteIdentifier).join(", ");
  const values = columnNames.map((columnName) => sqlLiteral(row[columnName])).join(", ");

  if (!primaryKeys.length) {
    return `INSERT OR IGNORE INTO ${quoteIdentifier(tableName)} (${insertColumns}) VALUES (${values});`;
  }

  const conflictTarget = primaryKeys.map(quoteIdentifier).join(", ");
  const updateColumns = columnNames.filter((columnName) => !primaryKeys.includes(columnName));
  const updateSet = updateColumns.length
    ? updateColumns.map((columnName) => `${quoteIdentifier(columnName)} = excluded.${quoteIdentifier(columnName)}`).join(", ")
    : primaryKeys.map((columnName) => `${quoteIdentifier(columnName)} = excluded.${quoteIdentifier(columnName)}`).join(", ");

  return `INSERT INTO ${quoteIdentifier(tableName)} (${insertColumns}) VALUES (${values}) ON CONFLICT(${conflictTarget}) DO UPDATE SET ${updateSet};`;
}

function countExportedRows(db, tables) {
  return tables.reduce((total, tableName) => {
    return total + db.prepare(`SELECT COUNT(*) AS total FROM ${quoteIdentifier(tableName)}`).get().total;
  }, 0);
}

function normalizeSeedFileName(fileName) {
  const normalized = path.basename(String(fileName || "").trim());
  if (!normalized || normalized !== fileName || !/\.(txt|sql)$/i.test(normalized)) {
    throw new Error("invalid_seed_file_name");
  }
  return normalized;
}

function isValidSeedSql(sql) {
  const content = String(sql || "");
  if (!content.includes("-- G2M data seed")) {
    return false;
  }

  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("--"))
    .every((line) => /^INSERT\b/i.test(line));
}

function countInsertStatements(sql) {
  return (String(sql).match(/\bINSERT\b/gi) || []).length;
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (Buffer.isBuffer(value)) {
    return `X'${value.toString("hex")}'`;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

module.exports = {
  exportSeed,
  importSeed,
  listSeedFiles,
  getSeedDirectory,
  sensitiveTables,
  defaultSeedFileName,
  buildSeedFileName
};
