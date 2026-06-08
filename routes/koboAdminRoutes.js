const express = require("express");
const koboAdminController = require("../controllers/koboAdminController");
const { requireAuth } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/permissionMiddleware");

const router = express.Router();

router.use(requireAuth);
router.use(requirePermission("kobo.manage"));

router.get("/", koboAdminController.index);
router.post("/config", koboAdminController.updateConfig);
router.post("/test", koboAdminController.testConnection);
router.post("/assets", koboAdminController.listAssets);
router.post("/sync", koboAdminController.sync);

module.exports = router;
