const express = require("express");
const mediaController = require("../controllers/mediaController");
const { requireAuth } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/permissionMiddleware");

const router = express.Router();

router.use(requireAuth);

router.get("/:id/view", requirePermission("media.read"), mediaController.view);
router.get("/:id/download", requirePermission("media.read"), mediaController.download);
router.get("/:id/thumbnail", requirePermission("media.read"), mediaController.thumbnail);

module.exports = router;
