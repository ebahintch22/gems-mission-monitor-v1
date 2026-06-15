const express = require("express");
const sigController = require("../controllers/sigController");
const { requireAuth, requireRole } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/permissionMiddleware");

const router = express.Router();

router.use(requireAuth);

router.get("/kobo-light/status", requireRole("admin", "superviseur"), sigController.koboLightStatus);
router.post("/kobo-light/sync", requireRole("admin", "superviseur"), sigController.koboLightSync);
router.get("/options", requirePermission("sig.read"), sigController.filterOptions);
router.get("/", requirePermission("sig.read"), sigController.index);

module.exports = router;
