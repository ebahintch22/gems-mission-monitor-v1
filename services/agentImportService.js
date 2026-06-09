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
    koboCode: findColumn(headers, ["Code Kobo", "code_kobo", "kobo_code_agent", "code agent kobo", "code_agent_kobo"]),
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
  const koboCodeAssignments = new Map(db.prepare(`
    SELECT kobo_code_agent, code_agent
    FROM agents_collecte
    WHERE kobo_code_agent IS NOT NULL
      AND kobo_code_agent <> ''
  `).all().map((agent) => [agent.kobo_code_agent, agent.code_agent]));

  const existingByCode = db.prepare(`
    SELECT id, code_agent FROM agents_collecte WHERE code_agent = ?
  `);
  const equipeMissionById = db.prepare("SELECT id, mission_id FROM equipes WHERE id = ?");
  const activeAssignment = db.prepare(`
    SELECT id, mission_id, equipe_id
    FROM agent_mission_assignments
    WHERE agent_id = ?
      AND statut = 'active'
  `);
  const closeActiveAssignment = db.prepare(`
    UPDATE agent_mission_assignments
    SET statut = 'terminee',
        end_date = CURRENT_DATE,
        updated_at = CURRENT_TIMESTAMP
    WHERE agent_id = ?
      AND statut = 'active'
  `);
  const insertAssignment = db.prepare(`
    INSERT INTO agent_mission_assignments (
      agent_id, mission_id, equipe_id, start_date, statut
    ) VALUES (
      @agent_id, @mission_id, @equipe_id, CURRENT_DATE, 'active'
    )
  `);
  const insertAgent = db.prepare(`
    INSERT INTO agents_collecte (
      nom, prenoms, user_id, equipe_id, code_agent, kobo_code_agent, telephone, equipement, statut
    ) VALUES (
      @nom, @prenoms, @user_id, @equipe_id, @code_agent, @kobo_code_agent, @telephone, NULL, 'actif'
    )
  `);
  const updateAgent = db.prepare(`
    UPDATE agents_collecte SET
      nom = @nom,
      prenoms = @prenoms,
      telephone = @telephone,
      kobo_code_agent = COALESCE(@kobo_code_agent, kobo_code_agent),
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
    userUnmatched: [],
    koboCodeMatched: 0,
    koboCodeConflicts: []
  };

  db.transaction(() => {
    records.forEach((record, index) => {
      const codeAgent = String(record[columns.code] || "").trim().toUpperCase();
      const nom = String(record[columns.nom] || "").trim();
      const prenoms = String(record[columns.prenoms] || "").trim();
      const koboCodeAgent = columns.koboCode ? String(record[columns.koboCode] || "").trim() || null : null;
      if (!codeAgent || !nom || !prenoms) {
        throw new Error(`Agent incomplet a la ligne ${index + 2}.`);
      }

      const assignedKoboCode = koboCodeAgent ? koboCodeAssignments.get(koboCodeAgent) : null;
      const validKoboCode = koboCodeAgent && (!assignedKoboCode || assignedKoboCode === codeAgent)
        ? koboCodeAgent
        : null;
      if (validKoboCode) {
        report.koboCodeMatched += 1;
        koboCodeAssignments.set(validKoboCode, codeAgent);
      } else if (koboCodeAgent) {
        report.koboCodeConflicts.push({ code_agent: codeAgent, kobo_code_agent: koboCodeAgent });
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
        kobo_code_agent: validKoboCode,
        user_id: userId,
        equipe_id: equipeId
      };
      const existing = existingByCode.get(codeAgent);
      if (existing) {
        updateAgent.run({ id: existing.id, ...values });
        if (equipeId) {
          replaceActiveAssignment(existing.id, equipeId);
        }
        report.updated += 1;
      } else {
        const result = insertAgent.run(values);
        if (equipeId) {
          replaceActiveAssignment(result.lastInsertRowid, equipeId);
        }
        report.inserted += 1;
      }
    });
  })();

  return report;

  function replaceActiveAssignment(agentId, equipeId) {
    const equipe = equipeMissionById.get(equipeId);
    if (!equipe) {
      return;
    }

    const active = activeAssignment.get(agentId);
    if (active && active.equipe_id === equipe.id && active.mission_id === equipe.mission_id) {
      return;
    }

    closeActiveAssignment.run(agentId);
    insertAssignment.run({
      agent_id: agentId,
      mission_id: equipe.mission_id,
      equipe_id: equipe.id
    });
  }
}

function importAgentsFromFile(db, csvPath) {
  return importAgents(db, fs.readFileSync(csvPath, "utf8"));
}

module.exports = {
  importAgents,
  importAgentsFromFile
};
