const path = require("node:path");

function buildMediaGallery(rawData = {}, mediaConfig = {}) {
  const attachments = Array.isArray(rawData._attachments) ? rawData._attachments : [];
  const declarations = collectDeclaredMedia(rawData);
  const categories = (mediaConfig.categories || []).map((category) => ({
    ...category,
    items: matchCategoryMedia(category, declarations, attachments)
  }));
  const matched = new Set(categories.flatMap((category) => category.items.map((item) => item.attachmentName)));
  const uncategorized = attachments
    .filter((attachment) => !matched.has(attachmentName(attachment)))
    .map((attachment) => mediaItem({
      category: "Autres medias",
      declaration: null,
      attachment
    }));
  return {
    categories: [
      ...categories,
      ...(uncategorized.length ? [{ id: "other", title: "Autres medias", items: uncategorized }] : [])
    ],
    missing: declarations.filter((declaration) => declaration.value && !findAttachmentForDeclaration(declaration, attachments))
  };
}

function matchCategoryMedia(category, declarations, attachments) {
  const fields = new Set(category.fields || []);
  return declarations
    .filter((declaration) => fields.has(declaration.path) || [...fields].some((field) => declaration.path.endsWith(`/${field}`)))
    .map((declaration) => {
      const attachment = findAttachmentForDeclaration(declaration, attachments);
      return attachment ? mediaItem({ category: category.title, declaration, attachment }) : null;
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

function mediaItem({ category, declaration, attachment }) {
  const name = attachmentName(attachment);
  return {
    category,
    field: declaration?.indexedPath || attachment.question_xpath || "",
    fileName: name,
    attachmentName: name,
    caption: declaration?.indexedPath || attachment.question_xpath || name,
    thumbnailUrl: attachment.download_medium_url || attachment.download_url || attachment.url || "",
    largeUrl: attachment.download_large_url || attachment.download_url || attachment.url || ""
  };
}

function attachmentName(attachment = {}) {
  return attachment.filename || attachment.media_file_basename || attachment.name || "";
}

function basename(value) {
  return path.basename(String(value || "")).toLowerCase();
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
  collectDeclaredMedia,
  findAttachmentForDeclaration
};
