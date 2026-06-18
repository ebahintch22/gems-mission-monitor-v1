const express = require("express");
const sigController = require("../controllers/sigController");
const buildingFeatureController = require("../controllers/buildingFeatureController");
const { requireAuth, requireRole } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/permissionMiddleware");

const router = express.Router();

router.use(requireAuth);

router.get("/kobo-light/status", requireRole("admin", "superviseur"), sigController.koboLightStatus);
router.post("/kobo-light/sync", requireRole("admin", "superviseur"), sigController.koboLightSync);
router.get("/buildings", requirePermission("sig.read"), buildingFeatureController.index);
router.post("/buildings/import", requirePermission("buildings.manage"), buildingFeatureController.importGeoJson);
router.get("/options", requirePermission("sig.read"), sigController.filterOptions);
router.get("/", requirePermission("sig.read"), sigController.index);

module.exports = router;
