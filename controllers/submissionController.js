const SoumissionCollecte = require("../models/SoumissionCollecte");
const { buildSubmissionReport } = require("../services/submissionReportRenderer");
const { buildSubmissionDetail } = require("../services/submissionViewService");
const { buildInteractiveSubmissionView } = require("../services/submission-detail-view.service");
const { buildSubmissionDiagnostic } = require("../services/submissionDiagnosticService");

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

exports.interactiveView = (req, res) => {
  const submission = SoumissionCollecte.findById(req.params.id);

  if (!submission) {
    return res.status(404).render("errors/404", { title: req.t("errors.404.title") });
  }
  if (submission.mission_archived === 1 && req.currentUser?.role !== "admin") {
    return res.status(404).render("errors/404", { title: req.t("errors.404.title") });
  }

  const view = buildInteractiveSubmissionView(submission);

  return res.render("submissions/interactive", {
    title: `Fiche detaillee ${submission.display_submission_id || submission.source_submission_id}`,
    submission,
    view
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

exports.diagnostic = (req, res) => {
  const submission = SoumissionCollecte.findById(req.params.id);

  if (!submission) {
    return res.status(404).render("errors/404", { title: req.t("errors.404.title") });
  }
  if (submission.mission_archived === 1 && req.currentUser?.role !== "admin") {
    return res.status(404).render("errors/404", { title: req.t("errors.404.title") });
  }

  const axis = req.params.axis || "geometric";
  const diagnostic = buildSubmissionDiagnostic(submission, axis);
  const embedMode = req.query.embed === "pal" ? "pal" : null;

  return res.render("soumissions/diagnostic", {
    title: diagnostic.title,
    submission,
    diagnostic,
    embedMode
  });
};
