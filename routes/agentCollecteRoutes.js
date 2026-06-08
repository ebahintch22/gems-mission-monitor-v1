const express = require("express");
const agentCollecteController = require("../controllers/agentCollecteController");
const { requireAuth } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/permissionMiddleware");

const router = express.Router();

router.use(requireAuth);

router.get("/", requirePermission("agents.read"), agentCollecteController.index);
router.get("/new", requirePermission("agents.manage"), agentCollecteController.new);
router.post("/", requirePermission("agents.manage"), agentCollecteController.create);
router.get("/:id/edit", requirePermission("agents.manage"), agentCollecteController.edit);
router.post("/:id", requirePermission("agents.manage"), agentCollecteController.update);
router.get("/:id", requirePermission("agents.read"), agentCollecteController.show);

module.exports = router;
