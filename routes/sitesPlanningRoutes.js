const express = require("express");
const sitesPlanningController = require("../controllers/sitesPlanningController");
const { requireAuth } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/permissionMiddleware");

const router = express.Router();

router.use(requireAuth);
router.get("/", requirePermission("sites.planning.read"), sitesPlanningController.page);

module.exports = router;
