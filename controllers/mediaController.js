const MediaFile = require("../models/MediaFile");
const { createPresignedUrl } = require("../services/wasabiStorageService");

function view(req, res) {
  return redirectToMedia(req, res, { disposition: "inline" });
}

function download(req, res) {
  return redirectToMedia(req, res, { disposition: "attachment" });
}

function thumbnail(req, res) {
  const media = MediaFile.findById(req.params.id);
  if (!media) {
    return res.status(404).render("errors/404", { title: req.t("errors.404.title") });
  }

  const variant = MediaFile.findVariant(media.id, "thumb");
  if (!variant) {
    return redirectToMedia(req, res, { disposition: "inline", media });
  }

  try {
    const url = createPresignedUrl({
      objectKey: variant.object_key,
      expiresIn: req.query.expires || undefined
    });
    return res.redirect(url);
  } catch (error) {
    return res.status(error.statusCode || 500).render("errors/500", {
      title: "Accès au média impossible",
      error
    });
  }
}

function redirectToMedia(req, res, { disposition, media: providedMedia } = {}) {
  const media = providedMedia || MediaFile.findById(req.params.id);
  if (!media) {
    return res.status(404).render("errors/404", { title: req.t("errors.404.title") });
  }

  try {
    const responseContentDisposition = [
      disposition || "inline",
      `filename="${sanitizeHeaderFilename(media.original_filename)}"`
    ].join("; ");
    const url = createPresignedUrl({
      objectKey: media.object_key,
      expiresIn: req.query.expires || undefined,
      responseContentDisposition
    });
    return res.redirect(url);
  } catch (error) {
    return res.status(error.statusCode || 500).render("errors/500", {
      title: "Accès au média impossible",
      error
    });
  }
}

function sanitizeHeaderFilename(value) {
  return String(value || "media")
    .replace(/["\\\r\n]/g, "_")
    .slice(0, 180);
}

module.exports = {
  download,
  thumbnail,
  view
};
