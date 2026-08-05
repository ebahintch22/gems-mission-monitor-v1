const path = require("node:path");

function buildMediaGallery(rawData = {}, mediaConfig = {}, options = {}) {
  const attachments = Array.isArray(rawData._attachments) ? rawData._attachments : [];
  const declarations = collectDeclaredMedia(rawData);
  const wasabiIndex = buildWasabiIndex(options.wasabiMedia || []);
  const categories = (mediaConfig.categories || []).map((category) => ({
    ...category,
    items: matchCategoryMedia(category, declarations, attachments, wasabiIndex)
  }));
  const matched = new Set(categories.flatMap((category) => category.items.map((item) => item.attachmentName)));
  const uncategorized = attachments
    .filter((attachment) => !matched.has(attachmentName(attachment)))
    .map((attachment) => mediaItem({
      category: "Autres medias",
      declaration: null,
      attachment,
      wasabiMedia: findWasabiForAttachment({ attachment, wasabiIndex })
    }));
  return {
    categories: [
      ...categories,
      ...(uncategorized.length ? [{ id: "other", title: "Autres medias", items: uncategorized }] : [])
    ],
    missing: declarations.filter((declaration) => declaration.value && !findAttachmentForDeclaration(declaration, attachments))
  };
}

function matchCategoryMedia(category, declarations, attachments, wasabiIndex) {
  const fields = new Set(category.fields || []);
  return declarations
    .filter((declaration) => fields.has(declaration.path) || [...fields].some((field) => declaration.path.endsWith(`/${field}`)))
    .map((declaration) => {
      const attachment = findAttachmentForDeclaration(declaration, attachments);
      return attachment ? mediaItem({
        category: category.title,
        declaration,
        attachment,
        wasabiMedia: findWasabiForAttachment({ declaration, attachment, wasabiIndex })
      }) : null;
    })
    .filter(Boolean);
}

function collectDeclaredMedia(input, prefix = "") {
  const rows = [];
  Object.entries(input || {}).forEach(([key, value]) => {
    const fullPath = prefix ? `${prefix}/${key}` : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item && typeof item === "object") {
          rows.push(...collectDeclaredMedia(item, `${fullPath}[${index}]`));
        }
      });
      return;
    }
    if (value && typeof value === "object") {
      rows.push(...collectDeclaredMedia(value, fullPath));
      return;
    }
    if (looksLikeMediaField(fullPath, value)) {
      rows.push({
        path: fullPath.replace(/\[\d+\]/g, ""),
        indexedPath: fullPath,
        value: String(value || "").trim(),
        basename: basename(value)
      });
    }
  });
  return rows;
}

function findAttachmentForDeclaration(declaration, attachments = []) {
  return attachments.find((attachment) => {
    const name = attachmentName(attachment);
    const questionPath = attachment.question_xpath || attachment.question || "";
    const mediaBase = basename(attachment.media_file_basename || name);
    return questionPath === declaration.path
      || mediaBase === declaration.basename
      || name === declaration.value
      || basename(name) === declaration.basename;
  });
}

function mediaItem({ category, declaration, attachment, wasabiMedia }) {
  const name = attachmentName(attachment);
  const wasabiMediaId = wasabiMedia?.media_file_id || wasabiMedia?.id;
  return {
    category,
    field: declaration?.indexedPath || attachment.question_xpath || "",
    fileName: name,
    attachmentName: name,
    caption: declaration?.indexedPath || attachment.question_xpath || name,
    source: wasabiMediaId ? "wasabi" : "kobo",
    mediaFileId: wasabiMediaId || "",
    thumbnailUrl: wasabiMediaId ? `/media/${encodeURIComponent(wasabiMediaId)}/thumbnail` : attachment.download_medium_url || attachment.download_url || attachment.url || "",
    largeUrl: wasabiMediaId ? `/media/${encodeURIComponent(wasabiMediaId)}/view` : attachment.download_large_url || attachment.download_url || attachment.url || ""
  };
}

function attachmentName(attachment = {}) {
  return attachment.filename || attachment.media_file_basename || attachment.name || "";
}

function basename(value) {
  return path.basename(String(value || "")).toLowerCase();
}

function buildWasabiIndex(rows = []) {
  return (Array.isArray(rows) ? rows : []).reduce((index, row) => {
    [
      row.question_xpath,
      row.attachment_filename,
      row.media_file_basename,
      row.original_filename,
      basename(row.attachment_filename),
      basename(row.media_file_basename),
      basename(row.original_filename)
    ].filter(Boolean).forEach((key) => {
      index.set(normalizeKey(key), row);
    });
    return index;
  }, new Map());
}

function findWasabiForAttachment({ declaration, attachment, wasabiIndex } = {}) {
  if (!wasabiIndex?.size) {
    return null;
  }
  const candidates = [
    declaration?.path,
    declaration?.indexedPath?.replace(/\[\d+\]/g, ""),
    declaration?.basename,
    attachment?.question_xpath,
    attachment?.question,
    attachmentName(attachment),
    attachment?.media_file_basename,
    basename(attachmentName(attachment)),
    basename(attachment?.media_file_basename)
  ].filter(Boolean);
  for (const candidate of candidates) {
    const row = wasabiIndex.get(normalizeKey(candidate));
    if (row) {
      return row;
    }
  }
  return null;
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function looksLikeMediaField(fieldPath, value) {
  if (!value) {
    return false;
  }
  return /(photo|image|media)/i.test(fieldPath)
    || /\.(jpe?g|png|gif|webp)$/i.test(String(value));
}

module.exports = {
  buildMediaGallery,
  buildWasabiIndex,
  collectDeclaredMedia,
  findAttachmentForDeclaration,
  findWasabiForAttachment
};
