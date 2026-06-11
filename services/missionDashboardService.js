const db = require("../config/database");
const { attachDisplaySubmissionIds } = require("./submissionIdentityService");

function getMissionDashboard(missionId) {
  const mission = db.prepare("SELECT * FROM missions WHERE id = ?").get(missionId);
  if (!mission) {
    return null;
  }

  return {
    mission,
    metrics: getMetrics(mission.id),
    recentSubmissions: getRecentSubmissions(mission.id),
    submissionsByStatus: getSubmissionsByStatus(mission.id),
    activeTeams: getActiveTeams(mission.id)
  };
}

function getMetrics(missionId) {
  const assignments = db.prepare(`
    SELECT
      COUNT(*) AS active_agents,
      COUNT(DISTINCT equipe_id) AS active_teams
    FROM agent_mission_assignments
    WHERE mission_id = ?
      AND statut = 'active'
  `).get(missionId);
  const submissions = db.prepare(`
    SELECT
      COUNT(*) AS total_submissions,
      SUM(CASE WHEN statut_validation = 'a_verifier' THEN 1 ELSE 0 END) AS to_review,
      SUM(CASE WHEN statut_validation = 'validee' THEN 1 ELSE 0 END) AS validated,
      SUM(CASE WHEN statut_validation = 'rejetee' THEN 1 ELSE 0 END) AS rejected,
      MAX(submitted_at) AS last_submission_at
    FROM soumissions_collecte
    WHERE mission_id = ?
  `).get(missionId);

  return {
    activeAgents: assignments.active_agents || 0,
    activeTeams: assignments.active_teams || 0,
    totalSubmissions: submissions.total_submissions || 0,
    toReview: submissions.to_review || 0,
    validated: submissions.validated || 0,
    rejected: submissions.rejected || 0,
    lastSubmissionAt: submissions.last_submission_at || null
  };
}

function getRecentSubmissions(missionId, limit = 8) {
  return attachDisplaySubmissionIds(db.prepare(`
    SELECT
      s.id,
      s.source_submission_id,
      s.raw_data_json,
      s.submitted_at,
      s.statut_validation,
      s.anomaly_count,
      e.nom_equipe,
      a.code_agent,
      a.nom AS agent_nom,
      a.prenoms AS agent_prenoms
    FROM soumissions_collecte s
    LEFT JOIN equipes e ON e.id = s.equipe_id
    LEFT JOIN agents_collecte a ON a.id = s.agent_id
    WHERE s.mission_id = ?
    ORDER BY s.submitted_at DESC
    LIMIT ?
  `).all(missionId, limit));
}

function getSubmissionsByStatus(missionId) {
  return db.prepare(`
    SELECT statut_validation, COUNT(*) AS total
    FROM soumissions_collecte
    WHERE mission_id = ?
    GROUP BY statut_validation
    ORDER BY statut_validation
  `).all(missionId);
}

function getActiveTeams(missionId) {
  return db.prepare(`
    SELECT
      e.id,
      e.nom_equipe,
      COUNT(DISTINCT ama.agent_id) AS active_agents,
      COUNT(s.id) AS submissions
    FROM equipes e
    LEFT JOIN agent_mission_assignments ama
      ON ama.equipe_id = e.id
      AND ama.statut = 'active'
    LEFT JOIN soumissions_collecte s ON s.equipe_id = e.id
    WHERE e.mission_id = ?
    GROUP BY e.id, e.nom_equipe
    ORDER BY e.nom_equipe
  `).all(missionId);
}

module.exports = {
  getMissionDashboard
};
