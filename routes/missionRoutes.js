const express = require("express");
const missionController = require("../controllers/missionController");

const router = express.Router();

router.get("/", missionController.index);
router.get("/new", missionController.new);
router.post("/", missionController.create);
router.get("/:id", missionController.show);

module.exports = router;
