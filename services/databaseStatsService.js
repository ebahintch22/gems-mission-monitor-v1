const db = require("../config/database");

const categories = [
  {
    name: "territories",
    tables: ["regions", "departements", "sous_prefectures"]
  },
  {
    name: "organization",
    tables: ["missions", "equipes", "equipe_regions", "agents_collecte"]
  },
  {
    name: "users",
    tables: ["users", "roles", "user_regions", "user_invitations", "activation_tokens", "audit_logs"]
  },
  {
    name: "collection",
    tables: ["soumissions_collecte"]
  },
  {
    name: "settings",
    tables: ["settings"]
  }
];

function getDatabaseStats() {
  const tableNames = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map((table) => table.name);

  const tables = tableNames.map((name) => {
    const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(name)})`).all();
    const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(name)})`).all();

    return {
      name,
      category: resolveCategory(name),
      recordCount: countRows(name),
      columnCount: columns.length,
      columns,
      foreignKeys
    };
  });

  return {
    totalTables: tables.length,
    tables,
    groupedTables: groupTables(tables),
    metrics: getCollectionMetrics()
  };
}

function getTablePreview(tableName, options = {}) {
  if (!tableName || !tableExists(tableName)) {
    return null;
  }

  const limit = normalizeLimit(options.limit);
  const page = normalizePage(options.page);
  const offset = (page - 1) * limit;
  const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all();
  const rows = db.prepare(`
    SELECT *
    FROM ${quoteIdentifier(tableName)}
    LIMIT ? OFFSET ?
  `).all(limit, offset);
  const totalRows = countRows(tableName) || 0;

  return {
    tableName,
    columns,
    rows: rows.map((row) => maskAndTrimRow(row)),
    page,
    limit,
    offset,
    totalRows,
    totalPages: Math.max(1, Math.ceil(totalRows / limit)),
    hasPrevious: page > 1,
    hasNext: page * limit < totalRows
  };
}

function resolveCategory(tableName) {
  return categories.find((category) => category.tables.includes(tableName))?.name || "other";
}

function groupTables(tables) {
  return tables.reduce((groups, table) => {
    groups[table.category] = groups[table.category] || [];
    groups[table.category].push(table);
    return groups;
  }, {});
}

function countRows(tableName) {
  try {
    return db.prepare(`SELECT COUNT(*) AS total FROM ${quoteIdentifier(tableName)}`).get().total;
  } catch {
    return null;
  }
}

function tableExists(tableName) {
  return Boolean(db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name = ?
  `).get(tableName));
}

function normalizePage(value) {
  const page = Number.parseInt(value, 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function normalizeLimit(value) {
  const limit = Number.parseInt(value, 10);
  if (!Number.isInteger(limit) || limit <= 0) {
    return 25;
  }

  return Math.min(limit, 100);
}

function maskAndTrimRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (isSensitiveColumn(key)) {
      return [key, value ? "********" : ""];
    }

    return [key, formatCellValue(value)];
  }));
}

function isSensitiveColumn(columnName) {
  return /(password|token|secret|authorization|api[_-]?key|hash)/i.test(columnName);
}

function formatCellValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

function getCollectionMetrics() {
  const hasSubmissions = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'soumissions_collecte'
  `).get();

  if (!hasSubmissions) {
    return null;
  }

  return db.prepare(`
    SELECT
      COUNT(*) AS submissionCount,
      MAX(submitted_at) AS lastSubmittedAt,
      MAX(synced_at) AS lastSyncedAt
    FROM soumissions_collecte
  `).get();
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

module.exports = {
  getDatabaseStats,
  getTablePreview
};
