const express = require("express");
const submissionController = require("../controllers/submissionController");
const { requireAuth } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/permissionMiddleware");

const router = express.Router();

router.use(requireAuth);

router.get("/:id/view", requirePermission("infographics.read"), submissionController.interactiveView);
router.get("/:id/detail", requirePermission("infographics.read"), submissionController.detail);
router.get("/:id/report", requirePermission("infographics.read"), submissionController.report);
router.get("/:id/diagnostics/:axis", requirePermission("infographics.read"), submissionController.diagnostic);

module.exports = router;
