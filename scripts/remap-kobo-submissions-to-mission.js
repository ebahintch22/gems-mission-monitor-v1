const db = require("../config/database");
const AgentMissionAssignment = require("../models/AgentMissionAssignment");

const args = parseArgs(process.argv.slice(2));

const fromMissionId = Number(args.from);
const toMissionId = Number(args.to);
const assetUid = args.asset;

if (!Number.isInteger(fromMissionId) || !Number.isInteger(toMissionId) || !assetUid) {
  console.error("Usage: node scripts/remap-kobo-submissions-to-mission.js --from <missionId> --to <missionId> --asset <koboAssetUid>");
  process.exit(1);
}

const rows = db.prepare(`
  SELECT id, code_agent_source
  FROM soumissions_collecte
  WHERE source = 'kobo'
    AND mission_id = ?
    AND kobo_asset_uid = ?
  ORDER BY id
`).all(fromMissionId, assetUid);

const updateSubmission = db.prepare(`
  UPDATE soumissions_collecte
  SET mission_id = @mission_id,
      agent_id = @agent_id,
      equipe_id = @equipe_id,
      assignment_id = @assignment_id
  WHERE id = @id
`);

const moved = db.transaction(() => rows.map((row) => {
  const codeAgent = String(row.code_agent_source || "").trim();
  const assignment = codeAgent
    ? AgentMissionAssignment.activeByCodeAndMission(codeAgent, toMissionId)
    : null;

  updateSubmission.run({
    id: row.id,
    mission_id: toMissionId,
    agent_id: assignment ? assignment.agent_id : null,
    equipe_id: assignment ? assignment.equipe_id : null,
    assignment_id: assignment ? assignment.id : null
  });

  return {
    id: row.id,
    code_agent_source: codeAgent || null,
    agent_id: assignment ? assignment.agent_id : null,
    equipe_id: assignment ? assignment.equipe_id : null,
    assignment_id: assignment ? assignment.id : null
  };
}))();

console.log(JSON.stringify({
  fromMissionId,
  toMissionId,
  assetUid,
  rowsFound: rows.length,
  rowsMoved: moved.length,
  unresolvedAssignments: moved.filter((row) => !row.assignment_id).length,
  moved
}, null, 2));

function parseArgs(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    result[key] = argv[index + 1];
    index += 1;
  }

  return result;
}
