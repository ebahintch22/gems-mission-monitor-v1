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
  getDatabaseStats
};
