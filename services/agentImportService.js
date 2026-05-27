const fs = require("node:fs");
const { parse } = require("csv-parse/sync");

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findColumn(headers, acceptedNames) {
  const normalizedNames = acceptedNames.map(normalize);
  return headers.find((header) => normalizedNames.includes(normalize(header)));
}

function importAgents(db, csvContent) {
  const records = parse(csvContent, {
    bom: true,
    columns: true,
    delimiter: ";",
    skip_empty_lines: true,
    trim: true
  });
  const headers = Object.keys(records[0] || {});
  const columns = {
    code: findColumn(headers, ["Code-agent", "code_agent", "code agent"]),
    nom: findColumn(headers, ["Nom"]),
    prenoms: findColumn(headers, ["Prenoms", "Prenoms"]),
    equipe: findColumn(headers, ["Equipe"]),
    telephone: findColumn(headers, ["telephone", "telephone"])
  };

  if (!columns.code || !columns.nom || !columns.prenoms) {
    throw new Error("Le CSV doit contenir les colonnes Code-agent, Nom et Prenoms.");
  }

  const equipes = db.prepare("SELECT id, nom_equipe FROM equipes").all();
  const equipeByName = new Map(equipes.map((equipe) => [normalize(equipe.nom_equipe), equipe.id]));
  const users = db.prepare(`
    SELECT id, nom, prenoms
    FROM users
    WHERE role = 'agent'
  `).all();
  const usersByName = new Map();
  users.forEach((user) => {
    const key = `${normalize(user.nom)}|${normalize(user.prenoms)}`;
    const current = usersByName.get(key) || [];
    current.push(user.id);
    usersByName.set(key, current);
  });
  const userAssignments = new Map(db.prepare(`
    SELECT user_id, code_agent FROM agents_collecte WHERE user_id IS NOT NULL
  `).all().map((agent) => [agent.user_id, agent.code_agent]));

  const existingByCode = db.prepare(`
    SELECT id, code_agent FROM agents_collecte WHERE code_agent = ?
  `);
  const insertAgent = db.prepare(`
    INSERT INTO agents_collecte (
      nom, prenoms, user_id, equipe_id, code_agent, telephone, equipement, statut
    ) VALUES (
      @nom, @prenoms, @user_id, @equipe_id, @code_agent, @telephone, NULL, 'actif'
    )
  `);
  const updateAgent = db.prepare(`
    UPDATE agents_collecte SET
      nom = @nom,
      prenoms = @prenoms,
      telephone = @telephone,
      equipe_id = COALESCE(@equipe_id, equipe_id),
      user_id = COALESCE(@user_id, user_id)
    WHERE id = @id
  `);
  const report = {
    total: records.length,
    inserted: 0,
    updated: 0,
    equipeMatched: 0,
    equipeUnmatched: [],
    userMatched: 0,
    userUnmatched: []
  };

  db.transaction(() => {
    records.forEach((record, index) => {
      const codeAgent = String(record[columns.code] || "").trim().toUpperCase();
      const nom = String(record[columns.nom] || "").trim();
      const prenoms = String(record[columns.prenoms] || "").trim();
      if (!codeAgent || !nom || !prenoms) {
        throw new Error(`Agent incomplet a la ligne ${index + 2}.`);
      }

      const equipeName = columns.equipe ? String(record[columns.equipe] || "").trim() : "";
      const equipeId = equipeName ? (equipeByName.get(normalize(equipeName)) || null) : null;
      if (equipeId) {
        report.equipeMatched += 1;
      } else if (equipeName) {
        report.equipeUnmatched.push({ code_agent: codeAgent, equipe: equipeName });
      }

      const userCandidates = usersByName.get(`${normalize(nom)}|${normalize(prenoms)}`) || [];
      const candidateId = userCandidates.length === 1 ? userCandidates[0] : null;
      const assignedCode = candidateId ? userAssignments.get(candidateId) : null;
      const userId = candidateId && (!assignedCode || assignedCode === codeAgent) ? candidateId : null;
      if (userId) {
        report.userMatched += 1;
        userAssignments.set(userId, codeAgent);
      } else {
        report.userUnmatched.push(codeAgent);
      }

      const values = {
        nom,
        prenoms,
        telephone: columns.telephone ? String(record[columns.telephone] || "").trim() || null : null,
        code_agent: codeAgent,
        user_id: userId,
        equipe_id: equipeId
      };
      const existing = existingByCode.get(codeAgent);
      if (existing) {
        updateAgent.run({ id: existing.id, ...values });
        report.updated += 1;
      } else {
        insertAgent.run(values);
        report.inserted += 1;
      }
    });
  })();

  return report;
}

function importAgentsFromFile(db, csvPath) {
  return importAgents(db, fs.readFileSync(csvPath, "utf8"));
}

module.exports = {
  importAgents,
  importAgentsFromFile
};
