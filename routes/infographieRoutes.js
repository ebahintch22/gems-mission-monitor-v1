const express = require("express");
const infographieController = require("../controllers/infographieController");
const { requireAuth } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/permissionMiddleware");

const router = express.Router();

router.use(requireAuth);
router.use(requirePermission("infographics.read"));

router.get("/mission-globale", infographieController.global);
router.get("/par-superviseur", infographieController.supervisor);
router.get("/par-region", infographieController.region);

module.exports = router;
