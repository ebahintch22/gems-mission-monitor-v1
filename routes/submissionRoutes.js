const express = require("express");
const submissionController = require("../controllers/submissionController");
const { requireAuth } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/permissionMiddleware");

const router = express.Router();

router.use(requireAuth);

router.get("/:id/detail", requirePermission("infographics.read"), submissionController.detail);

module.exports = router;
