const topics = {
  globale: {
    titleKey: "infographics.global.title",
    subjectKey: "infographics.global.subject"
  },
  superviseur: {
    titleKey: "infographics.supervisor.title",
    subjectKey: "infographics.supervisor.subject"
  },
  region: {
    titleKey: "infographics.region.title",
    subjectKey: "infographics.region.subject"
  }
};

function renderTopic(topicKey) {
  return (req, res) => {
    const topic = topics[topicKey];
    const subject = req.t(topic.subjectKey);

    res.render("infographies/show", {
      title: req.t(topic.titleKey),
      subject,
      message: req.t("infographics.placeholder", { subject })
    });
  };
}

exports.global = renderTopic("globale");
exports.supervisor = renderTopic("superviseur");
exports.region = renderTopic("region");
