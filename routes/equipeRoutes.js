const express = require("express");
const equipeController = require("../controllers/equipeController");
const { requireAuth } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/permissionMiddleware");

const router = express.Router();

router.use(requireAuth);

router.get("/", requirePermission("teams.read"), equipeController.index);
router.get("/new", requirePermission("teams.manage"), equipeController.new);
router.post("/", requirePermission("teams.manage"), equipeController.create);
router.get("/:id/edit", requirePermission("teams.manage"), equipeController.edit);
router.post("/:id", requirePermission("teams.manage"), equipeController.update);
router.get("/:id", requirePermission("teams.read"), equipeController.show);

module.exports = router;
