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
router.post("/media/list", koboAdminController.listMedia);
router.post("/media/download", koboAdminController.downloadMedia);
router.post("/media/download-item", koboAdminController.downloadMediaItem);
router.post("/advanced-sync/jobs", koboAdminController.startAdvancedSync);
router.get("/advanced-sync/jobs/:jobId", koboAdminController.advancedSyncStatus);
router.get("/advanced-sync/jobs/:jobId/manifest", koboAdminController.advancedSyncManifest);

module.exports = router;
