const AgentCollecte = require("../models/AgentCollecte");

const statuses = ["actif", "inactif", "suspendu"];

function normalizedId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function renderForm(res, values, error, options = {}) {
  return res.status(options.status || 200).render("agents/form", {
    title: options.title || "Nouvel agent",
    formHeading: options.formHeading || "Nouvel agent de collecte",
    formAction: options.formAction || "/agents",
    submitLabel: options.submitLabel || "Enregistrer",
    cancelHref: options.cancelHref || "/agents",
    statuses,
    agentUsers: AgentCollecte.availableAgentUsers(),
    equipes: AgentCollecte.availableEquipes(),
    values,
    error
  });
}

function submittedValues(body) {
  return {
    nom: body.nom?.trim(),
    prenoms: body.prenoms?.trim(),
    code_agent: body.code_agent?.trim().toUpperCase(),
    telephone: body.telephone?.trim() || null,
    equipement: body.equipement?.trim() || null,
    statut: body.statut || "actif",
    user_id: normalizedId(body.user_id),
    equipe_id: normalizedId(body.equipe_id)
  };
}

function validationError(values, body, excludedId = null) {
  if (!values.nom || !values.prenoms || !values.code_agent || !statuses.includes(values.statut)) {
    return "Verifiez le nom, les prenoms, le code agent et le statut.";
  }
  if ((body.user_id && !values.user_id) || !AgentCollecte.validAgentUserId(values.user_id)) {
    return "L'utilisateur associe doit avoir le role agent.";
  }
  if ((body.equipe_id && !values.equipe_id) || !AgentCollecte.validEquipeId(values.equipe_id)) {
    return "L'equipe selectionnee n'existe pas.";
  }
  if (AgentCollecte.findByCode(values.code_agent, excludedId)) {
    return "Ce code agent est deja utilise.";
  }
  if (values.user_id && AgentCollecte.findByUserId(values.user_id, excludedId)) {
    return "Cet utilisateur est deja rattache a un agent de collecte.";
  }
  return null;
}

exports.index = (req, res) => {
  res.render("agents/index", {
    title: "Agents de collecte",
    agents: AgentCollecte.all()
  });
};

exports.new = (req, res) => {
  renderForm(res, { statut: "actif" }, null);
};

exports.create = (req, res) => {
  const values = submittedValues(req.body);
  const error = validationError(values, req.body);

  if (error) {
    return renderForm(res, req.body, error, { status: 400 });
  }

  const agent = AgentCollecte.create(values);
  return res.redirect(`/agents/${agent.id}`);
};

exports.show = (req, res, next) => {
  const agent = AgentCollecte.findById(req.params.id);
  if (!agent) {
    return next();
  }

  return res.render("agents/show", {
    title: agent.code_agent,
    agent
  });
};

exports.edit = (req, res, next) => {
  const agent = AgentCollecte.findById(req.params.id);
  if (!agent) {
    return next();
  }

  return renderForm(res, agent, null, {
    title: `Modifier ${agent.code_agent}`,
    formHeading: "Modifier l'agent de collecte",
    formAction: `/agents/${agent.id}`,
    submitLabel: "Mettre a jour",
    cancelHref: `/agents/${agent.id}`
  });
};

exports.update = (req, res, next) => {
  const agent = AgentCollecte.findById(req.params.id);
  if (!agent) {
    return next();
  }

  const values = submittedValues(req.body);
  const error = validationError(values, req.body, agent.id);
  const options = {
    title: `Modifier ${agent.code_agent}`,
    formHeading: "Modifier l'agent de collecte",
    formAction: `/agents/${agent.id}`,
    submitLabel: "Mettre a jour",
    cancelHref: `/agents/${agent.id}`,
    status: 400
  };

  if (error) {
    return renderForm(res, req.body, error, options);
  }

  AgentCollecte.update(agent.id, values);
  return res.redirect(`/agents/${agent.id}`);
};
