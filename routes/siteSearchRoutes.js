const express = require("express");
const siteSearchController = require("../controllers/siteSearchController");
const { requireAuth } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/permissionMiddleware");

const router = express.Router();

router.use(requireAuth);

router.get("/sites/search", requirePermission("infographics.read"), siteSearchController.search);

module.exports = router;
