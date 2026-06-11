const express = require("express");
const adminController = require("../controllers/adminController");
const { requireAuth, requireRole } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/permissionMiddleware");

const router = express.Router();

router.use(requireAuth);

router.get("/", requirePermission("admin.access"), adminController.index);
router.get("/settings", requirePermission("settings.manage"), adminController.settings);
router.post("/settings", requirePermission("settings.manage"), adminController.updateSettings);
router.get("/db-stats", requirePermission("db.stats.read"), adminController.databaseStats);
router.get("/system-status", requirePermission("system.status.read"), adminController.systemStatus);
router.get("/seeds", requirePermission("seed.manage"), adminController.seeds);
router.post("/seeds/export", requirePermission("seed.manage"), adminController.exportSeed);
router.post("/seeds/import", requirePermission("seed.manage"), adminController.importSeed);
router.get("/email-test", requirePermission("email.test"), adminController.emailTest);
router.post("/email-test", requirePermission("email.test"), adminController.sendEmailTest);
router.get("/monitoring", requirePermission("monitoring.read"), adminController.monitoring);
router.get("/login-history", requireRole("admin"), adminController.loginHistory);
router.get("/permissions", requirePermission("permissions.manage"), adminController.permissions);
router.post("/permissions", requirePermission("permissions.manage"), adminController.updatePermissions);

module.exports = router;
