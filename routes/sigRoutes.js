const express = require("express");
const sigController = require("../controllers/sigController");
const { requireAuth } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/permissionMiddleware");

const router = express.Router();

router.use(requireAuth);

router.get("/", requirePermission("sig.read"), sigController.index);

module.exports = router;
