const fs = require("node:fs");
const { parse } = require("csv-parse/sync");

function importRoles(db, csvContent) {
  const records = parse(csvContent, {
    bom: true,
    columns: true,
    delimiter: ";",
    skip_empty_lines: true,
    trim: true
  });

  const header = Object.keys(records[0] || {});
  const codeColumn = header.find((column) => column.toLowerCase() === "rôle"
    || column.toLowerCase() === "role");
  const labelColumn = header.find((column) => column.toLowerCase() === "label");
  const descriptionColumn = header.find((column) => column.toLowerCase() === "description");

  if (!codeColumn || !labelColumn || !descriptionColumn) {
    throw new Error("Le CSV doit contenir les colonnes Role, Label et description.");
  }

  const upsertRole = db.prepare(`
    INSERT INTO roles (code_role, label, description)
    VALUES (@code_role, @label, @description)
    ON CONFLICT(code_role) DO UPDATE SET
      label = excluded.label,
      description = excluded.description
  `);

  db.transaction(() => {
    records.forEach((record, index) => {
      const role = {
        code_role: record[codeColumn],
        label: record[labelColumn],
        description: record[descriptionColumn] || null
      };
      if (!role.code_role || !role.label) {
        throw new Error(`Role ou label absent a la ligne ${index + 2}.`);
      }
      upsertRole.run(role);
    });
  })();

  return { roles: records.length };
}

function importRolesFromFile(db, csvPath) {
  return importRoles(db, fs.readFileSync(csvPath, "utf8"));
}

module.exports = {
  importRoles,
  importRolesFromFile
};
