const express = require("express");
const sigController = require("../controllers/sigController");

const router = express.Router();

router.get("/", sigController.index);

module.exports = router;
