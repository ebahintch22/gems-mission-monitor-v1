const express = require("express");
const agentCollecteController = require("../controllers/agentCollecteController");

const router = express.Router();

router.get("/", agentCollecteController.index);
router.get("/new", agentCollecteController.new);
router.post("/", agentCollecteController.create);
router.get("/:id/edit", agentCollecteController.edit);
router.post("/:id", agentCollecteController.update);
router.get("/:id", agentCollecteController.show);

module.exports = router;
