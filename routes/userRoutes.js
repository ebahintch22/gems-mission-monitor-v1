const express = require("express");
const userController = require("../controllers/userController");
const userInvitationController = require("../controllers/userInvitationController");
const { requireAuth } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/permissionMiddleware");

const router = express.Router();

router.use(requireAuth);

router.get("/", requirePermission("users.read"), userController.index);
router.get("/invitations", requirePermission("users.invite.read"), userInvitationController.index);
router.get("/invitations/new", requirePermission("users.invite.manage"), userInvitationController.new);
router.post("/invitations", requirePermission("users.invite.manage"), userInvitationController.create);
router.get("/invitations/:id/edit", requirePermission("users.invite.manage"), userInvitationController.edit);
router.post("/invitations/:id", requirePermission("users.invite.manage"), userInvitationController.update);
router.get("/new", requirePermission("users.manage"), userController.new);
router.post("/", requirePermission("users.manage"), userController.create);
router.get("/:id/edit", requirePermission("users.manage"), userController.edit);
router.post("/:id", requirePermission("users.manage"), userController.update);
router.get("/:id", requirePermission("users.read"), userController.show);

module.exports = router;
