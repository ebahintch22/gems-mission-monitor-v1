const SoumissionCollecte = require("../models/SoumissionCollecte");
const { buildSubmissionReport } = require("../services/submissionReportRenderer");
const { buildSubmissionDetail } = require("../services/submissionViewService");

exports.detail = (req, res) => {
  const submission = SoumissionCollecte.findById(req.params.id);

  if (!submission) {
    return res.status(404).render("errors/404", { title: req.t("errors.404.title") });
  }
  if (submission.mission_archived === 1 && req.currentUser?.role !== "admin") {
    return res.status(404).render("errors/404", { title: req.t("errors.404.title") });
  }

  const detail = buildSubmissionDetail(submission);

  return res.render("soumissions/detail", {
    title: `Soumission ${submission.display_submission_id || submission.source_submission_id}`,
    detail
  });
};

exports.report = (req, res) => {
  const submission = SoumissionCollecte.findById(req.params.id);

  if (!submission) {
    return res.status(404).render("errors/404", { title: req.t("errors.404.title") });
  }
  if (submission.mission_archived === 1 && req.currentUser?.role !== "admin") {
    return res.status(404).render("errors/404", { title: req.t("errors.404.title") });
  }

  const report = buildSubmissionReport(submission);
  const embedMode = req.query.embed === "pal" ? "pal" : null;

  return res.render("soumissions/report", {
    title: `Rapport ${submission.display_submission_id || submission.source_submission_id}`,
    submission,
    report,
    embedMode
  });
};
