const express = require("express");
const missionController = require("../controllers/missionController");
const { requireAuth } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/permissionMiddleware");

const router = express.Router();

router.use(requireAuth);

router.get("/", requirePermission("missions.read"), missionController.index);
router.get("/new", requirePermission("missions.manage"), missionController.new);
router.post("/", requirePermission("missions.manage"), missionController.create);
router.get("/:id/dashboard", requirePermission("dashboard.mission.read"), missionController.dashboard);
router.get("/:id/edit", requirePermission("missions.manage"), missionController.edit);
router.post("/:id", requirePermission("missions.manage"), missionController.update);
router.get("/:id", requirePermission("missions.read"), missionController.show);

module.exports = router;
