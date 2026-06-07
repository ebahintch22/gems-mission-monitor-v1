const express = require("express");
const userController = require("../controllers/userController");
const userInvitationController = require("../controllers/userInvitationController");

const router = express.Router();

router.get("/", userController.index);
router.get("/invitations", userInvitationController.index);
router.get("/invitations/new", userInvitationController.new);
router.post("/invitations", userInvitationController.create);
router.get("/invitations/:id/edit", userInvitationController.edit);
router.post("/invitations/:id", userInvitationController.update);
router.get("/new", userController.new);
router.post("/", userController.create);
router.get("/:id/edit", userController.edit);
router.post("/:id", userController.update);
router.get("/:id", userController.show);

module.exports = router;
