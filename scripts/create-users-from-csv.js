const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const db = require("../config/database");
const { hashPassword } = require("../services/passwordService");

const csvPath = process.argv[2];
const outputPath = process.argv[3] || path.join(path.dirname(csvPath || ""), "G2M-UserCredentials.json");
const simplePasswords = process.argv.includes("--simple-passwords");

if (!csvPath) {
  console.error("Usage: node scripts/create-users-from-csv.js <csvPath> [outputJsonPath]");
  process.exit(1);
}

const roleMap = new Map([
  ["directeur de mission", "directeur_mission"],
  ["directeur de misison", "directeur_mission"],
  ["coordinateur national", "coordinateur"],
  ["superviseur regional", "superviseur"],
  ["superviseur régional", "superviseur"],
  ["responsable sig", "specialiste_gis"],
  ["specialiste analyste de donnees", "specialiste_analyste_donnees"],
  ["spécialiste analyste de données", "specialiste_analyste_donnees"],
  ["analyste de donnees", "specialiste_analyste_donnees"],
  ["analyste de données", "specialiste_analyste_donnees"],
  ["controleur qualite", "controleur"],
  ["contrôleur qualité", "controleur"],
  ["administrateur", "admin"]
]);

const statusMap = new Map([
  ["actif", "actif"],
  ["active", "actif"],
  ["inactif", "inactif"],
  ["suspendu", "suspendu"]
]);

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const rows = parseCsv(readTextFile(csvPath));
  const credentials = [];
  const created = [];
  const updated = [];

  for (const row of rows) {
    const input = normalizeRow(row);
    validateInput(input);

    const password = simplePasswords ? generateSimplePassword(input) : generatePassword();
    const passwordHash = await hashPassword(password);
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(input.email);

    if (existing) {
      db.prepare(`
        UPDATE users
        SET nom = @nom,
            prenoms = @prenoms,
            telephone = @telephone,
            role = @role,
            statut = @statut,
            zone_affectation = @zone_affectation,
            password_hash = @password_hash,
            email_verified = 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
      `).run({
        id: existing.id,
        ...input,
        password_hash: passwordHash
      });
      updated.push({ id: existing.id, email: input.email, role: input.role });
    } else {
      const result = db.prepare(`
        INSERT INTO users (
          nom, prenoms, email, telephone, role, statut, zone_affectation,
          password_hash, email_verified, updated_at
        ) VALUES (
          @nom, @prenoms, @email, @telephone, @role, @statut, @zone_affectation,
          @password_hash, 1, CURRENT_TIMESTAMP
        )
      `).run({
        ...input,
        password_hash: passwordHash
      });
      created.push({ id: result.lastInsertRowid, email: input.email, role: input.role });
    }

    credentials.push({
      nom: input.nom,
      prenoms: input.prenoms,
      email: input.email,
      role: input.role,
      statut: input.statut,
      zone_affectation: input.zone_affectation,
      telephone: input.telephone,
      temporary_password: password
    });
  }

  const payload = {
    generated_at: new Date().toISOString(),
    source_csv: csvPath,
    note: "Mots de passe temporaires generes pour activation manuelle des comptes G2M. A changer apres premiere connexion.",
    accounts: credentials
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    created,
    updated,
    credentials_file: outputPath
  }, null, 2));
  db.close();
}

function normalizeRow(row) {
  const roleLabel = getValue(row, "Rôle", "Role");
  const statusLabel = getValue(row, "Statut");
  const role = roleMap.get(normalizeKey(roleLabel));
  const statut = statusMap.get(normalizeKey(statusLabel)) || "actif";

  return {
    nom: toTitleCase(getValue(row, "Nom")),
    prenoms: clean(getValue(row, "Prénoms", "Prenoms")),
    email: clean(getValue(row, "Email")).toLowerCase(),
    telephone: clean(getValue(row, "Téléphone", "Telephone")) || null,
    role,
    statut,
    zone_affectation: clean(
      getValue(row, "Equipe d’affectation", "Equipe d'affectation", "Equipe affectation")
      || getValueByHeaderFragment(row, "affect")
    ) || null
  };
}

function validateInput(input) {
  if (!input.nom || !input.prenoms || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    throw new Error(`Ligne utilisateur invalide: ${JSON.stringify(input)}`);
  }
  if (!input.role) {
    throw new Error(`Role non reconnu pour ${input.email}`);
  }
}

function parseCsv(content) {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const headers = splitCsvLine(lines.shift()).map((header) => header.trim());

  return lines.map((line) => {
    const values = splitCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] || "";
      return row;
    }, {});
  });
}

function readTextFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const utf8 = buffer.toString("utf8");
  if (!utf8.includes("\uFFFD")) {
    return utf8;
  }

  return new TextDecoder("windows-1252").decode(buffer);
}

function splitCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ";" && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }

  values.push(value);
  return values.map((entry) => entry.trim());
}

function getValue(row, ...labels) {
  const keys = Object.keys(row);
  for (const label of labels) {
    const key = keys.find((entry) => normalizeKey(entry) === normalizeKey(label));
    if (key) {
      return row[key];
    }
  }
  return "";
}

function getValueByHeaderFragment(row, fragment) {
  const normalizedFragment = normalizeKey(fragment);
  const key = Object.keys(row).find((entry) => normalizeKey(entry).includes(normalizedFragment));
  return key ? row[key] : "";
}

function clean(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeKey(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .toLowerCase();
}

function toTitleCase(value) {
  const cleaned = clean(value);
  if (!cleaned) {
    return "";
  }
  return cleaned.toLocaleUpperCase("fr-FR");
}

function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#%+?";
  let password = "";

  while (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[!#%+?]/.test(password)) {
    password = Array.from({ length: 16 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
  }

  return password;
}

function generateSimplePassword(input) {
  const namePart = normalizeKey(input.nom)
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);
  return `G2M-${namePart}-2026`;
}
