const express = require("express");
const infographieController = require("../controllers/infographieController");

const router = express.Router();

router.get("/mission-globale", infographieController.global);
router.get("/par-superviseur", infographieController.supervisor);
router.get("/par-region", infographieController.region);

module.exports = router;
