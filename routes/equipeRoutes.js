const express = require("express");
const equipeController = require("../controllers/equipeController");

const router = express.Router();

router.get("/", equipeController.index);
router.get("/new", equipeController.new);
router.post("/", equipeController.create);
router.get("/:id/edit", equipeController.edit);
router.post("/:id", equipeController.update);
router.get("/:id", equipeController.show);

module.exports = router;
