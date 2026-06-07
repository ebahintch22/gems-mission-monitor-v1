const express = require("express");
const authController = require("../controllers/authController");
const activationController = require("../controllers/activationController");

const router = express.Router();

router.get("/login", authController.loginForm);
router.post("/login", authController.login);
router.post("/logout", authController.logout);
router.get("/activation/:token", activationController.show);
router.post("/activation/:token", activationController.activate);

module.exports = router;
