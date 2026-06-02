const express = require("express");
const koboAdminController = require("../controllers/koboAdminController");

const router = express.Router();

router.get("/", koboAdminController.index);
router.post("/test", koboAdminController.testConnection);
router.post("/assets", koboAdminController.listAssets);
router.post("/sync", koboAdminController.sync);

module.exports = router;
