const express = require("express");
const adminController = require("../controllers/adminController");
const { requireAuth } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/permissionMiddleware");

const router = express.Router();

router.use(requireAuth);

router.get("/", requirePermission("admin.access"), adminController.index);
router.get("/settings", requirePermission("settings.manage"), adminController.settings);
router.post("/settings", requirePermission("settings.manage"), adminController.updateSettings);
router.get("/db-stats", requirePermission("db.stats.read"), adminController.databaseStats);
router.get("/email-test", requirePermission("email.test"), adminController.emailTest);
router.post("/email-test", requirePermission("email.test"), adminController.sendEmailTest);
router.get("/monitoring", requirePermission("monitoring.read"), adminController.monitoring);
router.get("/permissions", requirePermission("permissions.manage"), adminController.permissions);
router.post("/permissions", requirePermission("permissions.manage"), adminController.updatePermissions);

module.exports = router;
