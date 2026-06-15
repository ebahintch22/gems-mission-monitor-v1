const SiteSearch = require("../models/SiteSearch");

exports.search = (req, res) => {
  const query = String(req.query.q || "").trim();
  if (query.length < 2) {
    return res.json({ results: [] });
  }

  return res.json({
    results: SiteSearch.search(query, req.query.limit)
  });
};
