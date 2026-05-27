const express = require("express");
const userController = require("../controllers/userController");

const router = express.Router();

router.get("/", userController.index);
router.get("/new", userController.new);
router.post("/", userController.create);
router.get("/:id/edit", userController.edit);
router.post("/:id", userController.update);
router.get("/:id", userController.show);

module.exports = router;
