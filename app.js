require("dotenv").config();

const express = require("express");
const path = require("path");
const dashboardRoutes = require("./routes/dashboardRoutes");
const missionRoutes = require("./routes/missionRoutes");
const userRoutes = require("./routes/userRoutes");
const equipeRoutes = require("./routes/equipeRoutes");
const agentCollecteRoutes = require("./routes/agentCollecteRoutes");
const sigRoutes = require("./routes/sigRoutes");
require("./config/database");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use("/", dashboardRoutes);
app.use("/missions", missionRoutes);
app.use("/users", userRoutes);
app.use("/equipes", equipeRoutes);
app.use("/agents", agentCollecteRoutes);
app.use("/cartographie", sigRoutes);

app.use((req, res) => {
  res.status(404).render("errors/404", { title: "Page introuvable" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render("errors/500", { title: "Erreur serveur" });
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Serveur demarre sur http://localhost:${port}`);
  });
}

module.exports = app;
