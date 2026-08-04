const express = require("express");
const sitesPlanningController = require("../controllers/sitesPlanningController");
const { requireAuth } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/permissionMiddleware");

const router = express.Router();

router.use(requireAuth);
router.get("/", requirePermission("sites.planning.read"), sitesPlanningController.index);
router.get("/stats", requirePermission("sites.planning.read"), sitesPlanningController.stats);
router.get("/spatial-reference", requirePermission("sig.read"), sitesPlanningController.spatialReference);
router.post("/import", requirePermission("sites.planning.manage"), sitesPlanningController.importCsv);
router.post("/buildings/osm-preview", requirePermission("sites.planning.manage"), sitesPlanningController.previewOsmBuildingExtents);
router.post("/buildings/osm-save", requirePermission("sites.planning.manage"), sitesPlanningController.saveOsmBuildingExtents);
router.get("/:id/buildings/plan", requirePermission("sites.planning.read"), sitesPlanningController.buildingsPlan);
router.patch("/:id/location", requirePermission("sites.planning.manage"), sitesPlanningController.updateLocation);
router.patch("/:id/georeferencing", requirePermission("sites.planning.manage"), sitesPlanningController.updateGeoreferencing);

module.exports = router;
