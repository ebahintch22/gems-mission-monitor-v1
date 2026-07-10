const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  downloadKoboImageAssets,
  encodeSelectedImage,
  listKoboImageAssets,
  normalizeSelectedImages
} = require("../services/koboAssetDownloadService");

test("listKoboImageAssets inventorie les images d'une plage de soumissions", async () => {
  const client = {
    async listAssetData(assetUid, params) {
      assert.equal(assetUid, "asset-001");
      assert.equal(params.limit, 2);
      return {
        results: [
          {
            _uuid: "sub-1",
            _attachments: [{
              filename: "photo-site.jpg",
              mimetype: "image/jpeg",
              download_url: "https://kf.test/media/photo-site.jpg",
              question_xpath: "modZ/photo_site"
            }]
          },
          {
            _uuid: "sub-2",
            photo: "https://kf.test/media/photo-batiment.png"
          }
        ]
      };
    }
  };

  const inventory = await listKoboImageAssets({
    client,
    assetUid: "asset-001",
    startIndex: 1,
    endIndex: 2
  });

  assert.equal(inventory.imageCount, 2);
  assert.equal(inventory.images[0].filename, "photo-site.jpg");
  assert.equal(inventory.images[0].field_path, "modZ/photo_site");
  assert.equal(inventory.images[1].filename, "photo-batiment.png");
});

test("downloadKoboImageAssets telecharge les images selectionnees dans data locale", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "g2m-kobo-assets-"));
  const selected = {
    asset_uid: "asset-001",
    submission_id: "sub-1",
    filename: "photo-site.jpg",
    url: "https://kf.test/media/photo-site.jpg"
  };
  const client = {
    async download(url) {
      assert.equal(url, selected.url);
      return {
        ok: true,
        arrayBuffer: async () => Buffer.from("image-bytes")
      };
    }
  };

  const summary = await downloadKoboImageAssets({
    client,
    assetUid: "asset-001",
    selectedImages: [encodeSelectedImage(selected)],
    downloadRoot: tmp
  });
  const decoded = normalizeSelectedImages(encodeSelectedImage(selected));

  assert.equal(summary.downloaded, 1);
  assert.equal(summary.errors.length, 0);
  assert.equal(decoded[0].filename, "photo-site.jpg");
  assert.equal(fs.readFileSync(summary.files[0].path, "utf8"), "image-bytes");
});
