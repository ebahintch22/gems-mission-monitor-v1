import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildKoboGeometryReviewSummary,
  loadKoboGeometryReviewData
} from "../services/koboGeometryReviewService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultOutputName = "kobo-geometries-review-standalone.html";

const args = parseArgs(process.argv.slice(2));
const reviewData = loadKoboGeometryReviewData({
  batch: args.batch,
  output: args.output
});
const summary = buildKoboGeometryReviewSummary(reviewData.payload);
const outputPath = resolveOutputPath(args.out, reviewData);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, renderHtml({
  payload: reviewData.payload,
  summary,
  sourcePath: path.relative(projectRoot, reviewData.filePath),
  generatedAt: new Date().toISOString()
}), "utf8");

console.log(JSON.stringify({
  ok: true,
  output: path.relative(projectRoot, outputPath),
  source: path.relative(projectRoot, reviewData.filePath),
  submissions: summary.records.length,
  mode: "standalone_html_with_cdn_assets"
}, null, 2));

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--batch") {
      parsed.batch = argv[index + 1];
      index += 1;
    } else if (arg === "--output") {
      parsed.output = argv[index + 1];
      index += 1;
    } else if (arg === "--out") {
      parsed.out = argv[index + 1];
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    } else {
      throw new Error(`Argument inconnu: ${arg}`);
    }
  }
  return parsed;
}

function printHelpAndExit() {
  console.log([
    "Usage:",
    "  node scripts/generate-kobo-geometries-review-offline.mjs [--batch <batch>] [--output <json>] [--out <html>]",
    "",
    "Produit une page HTML autonome du serveur Express.",
    "La page embarque les donnees Kobo, mais charge Leaflet, Tabulator et les fonds cartographiques depuis Internet."
  ].join("\n"));
  process.exit(0);
}

function resolveOutputPath(out, reviewData) {
  if (out) {
    return path.resolve(projectRoot, out);
  }
  if (reviewData.selectedBatch) {
    return path.join(
      projectRoot,
      "KBase-docs",
      "kobo-geometry-extractions",
      "batches",
      reviewData.selectedBatch,
      "04_reports",
      defaultOutputName
    );
  }
  return path.join(projectRoot, "KBase-docs", "kobo-geometry-extractions", "04_reports", defaultOutputName);
}

function renderHtml({ payload, summary, sourcePath, generatedAt }) {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Revue autonome des geometries Kobo</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <link rel="stylesheet" href="https://unpkg.com/tabulator-tables@6.3.1/dist/css/tabulator.min.css">
  <style>
${standaloneCss()}
  </style>
</head>
<body>
  <main class="review-shell">
    <aside class="left-pane">
      <header class="app-header">
        <h1>Revue des extractions Kobo</h1>
        <p>${escapeHtml(sourcePath)}</p>
        <p>Genere le ${escapeHtml(generatedAt)} - ${summary.records.length} soumission(s)</p>
      </header>

      <section class="source-panel">
        <div class="metric"><span>Soumissions</span><strong>${summary.source_count}</strong></div>
        <div class="metric"><span>Extraites</span><strong>${summary.extracted_count}</strong></div>
        <button id="fitButton" type="button">Cadrer la carte</button>
      </section>

      <section class="filters">
        <input id="searchInput" type="search" placeholder="Filtrer par nom, localite, Kobo ou version">
        <label><input id="reviewOnly" type="checkbox"> A revoir uniquement</label>
      </section>

      <section class="table-panel">
        <div id="submissionTable"></div>
      </section>

      <section class="details">
        <h2 id="currentTitle">Aucune selection</h2>
        <div id="currentMeta" class="meta-grid"></div>
        <h3>Qualite</h3>
        <div id="qualityBox" class="info-box"></div>
        <h3>Objet selectionne</h3>
        <div id="featureBox" class="info-box">Cliquez une geometrie sur la carte.</div>
      </section>
    </aside>

    <section class="map-pane">
      <div id="map"></div>
    </section>
  </main>

  <script id="payload" type="application/json">${escapeScript(JSON.stringify(payload))}</script>
  <script id="summary" type="application/json">${escapeScript(JSON.stringify(summary))}</script>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/tabulator-tables@6.3.1/dist/js/tabulator.min.js"></script>
  <script>
${standaloneJs()}
  </script>
</body>
</html>
`;
}

function standaloneCss() {
  return `
* { box-sizing: border-box; }
html, body { height: 100%; }
body { margin: 0; font-family: Arial, sans-serif; color: #172033; background: #f4f6f8; }
.review-shell { display: grid; grid-template-columns: minmax(380px, 38vw) 1fr; height: 100vh; overflow: hidden; }
.left-pane { display: flex; flex-direction: column; min-width: 0; border-right: 1px solid #cbd5e1; background: #fff; }
.app-header { padding: 14px 16px; border-bottom: 1px solid #e2e8f0; }
.app-header h1 { margin: 0 0 6px; font-size: 20px; }
.app-header p { margin: 2px 0; color: #64748b; font-size: 12px; overflow-wrap: anywhere; }
.source-panel { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: center; padding: 10px 16px; border-bottom: 1px solid #e2e8f0; }
.metric { padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; }
.metric span { display: block; color: #64748b; font-size: 11px; }
.metric strong { font-size: 18px; }
button { cursor: pointer; border: 1px solid #94a3b8; border-radius: 6px; background: #fff; color: #172033; padding: 8px 10px; }
.filters { display: grid; gap: 8px; padding: 10px 16px; border-bottom: 1px solid #e2e8f0; }
.filters input[type="search"] { width: 100%; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; }
.table-panel { height: 34vh; min-height: 210px; border-bottom: 1px solid #e2e8f0; }
#submissionTable { height: 100%; }
#submissionTable .tabulator-row.requires-review { background: #fff7ed; }
.details { flex: 1; overflow: auto; padding: 14px 16px; }
.details h2 { margin: 0 0 10px; font-size: 18px; }
.details h3 { margin: 16px 0 8px; font-size: 14px; color: #334155; }
.meta-grid { display: grid; grid-template-columns: 135px 1fr; gap: 6px 10px; font-size: 13px; }
.meta-grid span:nth-child(odd) { color: #64748b; }
.info-box { padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; font-size: 13px; overflow-wrap: anywhere; }
.map-pane { position: relative; min-width: 0; }
#map { width: 100%; height: 100%; }
.leaflet-control-layers { font-size: 13px; }
.leaflet-popup-content { font-size: 13px; line-height: 1.4; }
.popup-grid { display: grid; grid-template-columns: 105px 1fr; gap: 3px 8px; min-width: 240px; }
.popup-grid span { color: #64748b; }
.popup-grid strong { font-weight: 600; }
@media (max-width: 900px) {
  .review-shell { grid-template-columns: 1fr; grid-template-rows: 48vh 52vh; }
  .left-pane { border-right: 0; border-bottom: 1px solid #cbd5e1; }
}
`;
}

function standaloneJs() {
  return `
const payload = JSON.parse(document.getElementById("payload").textContent);
const summary = JSON.parse(document.getElementById("summary").textContent);
const results = Array.isArray(payload.results) ? payload.results : [];
const records = Array.isArray(summary.records) ? summary.records : [];
let selectedIndex = null;
let table = null;

const map = L.map("map", {
  maxZoom: 20,
  zoomSnap: 0.1,
  zoomDelta: 0.1
}).setView([7.54, -5.55], 6);

const baseLayers = {
  "OSM routes": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
    attribution: "&copy; OpenStreetMap contributors"
  }),
  "Google Satellite": L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    attribution: "&copy; Google Satellite",
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    maxZoom: 20
  }),
  "Esri Satellite": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Tiles &copy; Esri",
    maxZoom: 19
  }),
  "Carto clair": L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; CARTO &copy; OpenStreetMap contributors",
    subdomains: "abcd",
    maxZoom: 19
  })
};
baseLayers["Google Satellite"].addTo(map);

const siteLayer = L.geoJSON(null, {
  style: { color: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.12, opacity: 1, weight: 3 },
  pointToLayer(feature, latlng) { return L.circleMarker(latlng, pointStyle("#2563eb", 7)); },
  onEachFeature: bindFeaturePopup
}).addTo(map);

const buildingLayer = L.geoJSON(null, {
  style(feature) {
    const review = feature.properties?.requires_review;
    return {
      color: review ? "#dc2626" : "#f97316",
      fillColor: review ? "#dc2626" : "#f97316",
      fillOpacity: review ? 0.26 : 0.2,
      opacity: 1,
      weight: review ? 3 : 2
    };
  },
  pointToLayer(feature, latlng) {
    return L.circleMarker(latlng, pointStyle(feature.properties?.requires_review ? "#dc2626" : "#f97316", 7));
  },
  onEachFeature: bindFeaturePopup
}).addTo(map);

const buildingCentroidLayer = L.geoJSON(null, {
  pointToLayer(feature, latlng) {
    return L.circleMarker(latlng, {
      ...pointStyle(feature.properties?.requires_review ? "#dc2626" : "#0891b2", 5),
      color: "#111827",
      weight: 2
    });
  },
  onEachFeature: bindFeaturePopup
}).addTo(map);

const raccordementLayer = L.geoJSON(null, {
  pointToLayer(feature, latlng) { return L.circleMarker(latlng, pointStyle("#16a34a", 7)); },
  onEachFeature: bindFeaturePopup
}).addTo(map);

const pyloneLayer = L.geoJSON(null, {
  pointToLayer(feature, latlng) { return L.circleMarker(latlng, pointStyle("#7c3aed", 7)); },
  onEachFeature: bindFeaturePopup
}).addTo(map);

L.control.layers(baseLayers, {
  "Emprise site": siteLayer,
  "Batiments": buildingLayer,
  "Centroides batiments": buildingCentroidLayer,
  "Raccordement": raccordementLayer,
  "Pylones": pyloneLayer
}, { collapsed: false, position: "topright" }).addTo(map);

initTable();
bindEvents();
if (records.length) selectSubmission(0);

function initTable() {
  table = new Tabulator("#submissionTable", {
    data: records,
    layout: "fitDataStretch",
    height: "100%",
    selectableRows: 1,
    index: "index",
    columns: [
      { title: "Nom officiel", field: "official_name", width: 210 },
      { title: "Localite", field: "locality", width: 130 },
      { title: "Kobo", field: "kobo_id", width: 100 },
      { title: "Statut", field: "status", width: 85, formatter: statusFormatter },
      { title: "Bat.", field: "building_count", width: 65, hozAlign: "right" },
      { title: "Warn.", field: "warning_count", width: 75, hozAlign: "right" },
      { title: "Revue", field: "requires_review", width: 75, formatter: booleanFormatter },
      { title: "Version", field: "form_version", minWidth: 170 }
    ],
    rowFormatter(row) {
      row.getElement().classList.toggle("requires-review", Boolean(row.getData().requires_review));
    }
  });
  table.on("rowClick", (event, row) => selectSubmission(row.getData().index));
}

function bindEvents() {
  document.getElementById("fitButton").addEventListener("click", fitActiveLayers);
  document.getElementById("searchInput").addEventListener("input", applyFilters);
  document.getElementById("reviewOnly").addEventListener("change", applyFilters);
  window.addEventListener("resize", () => {
    map.invalidateSize();
    table?.redraw(true);
  });
}

function applyFilters() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  const reviewOnly = document.getElementById("reviewOnly").checked;
  table.setFilter((record) => {
    const text = [
      record.official_name,
      record.locality,
      record.source_submission_id,
      record.kobo_id,
      record.form_version
    ].join(" ").toLowerCase();
    return (!query || text.includes(query)) && (!reviewOnly || record.requires_review);
  });
}

function selectSubmission(index) {
  const result = results[index];
  const record = records.find((candidate) => candidate.index === index);
  if (!result || !record) return;

  selectedIndex = index;
  table?.deselectRow();
  table?.selectRow(index);

  document.getElementById("currentTitle").textContent = record.official_name || record.source_submission_id || "Soumission Kobo";
  document.getElementById("currentMeta").innerHTML = metaRows({
    "Localite": record.locality,
    "Kobo": record.kobo_id,
    "Version": record.form_version,
    "Batiments": record.building_count,
    "Warnings": record.warning_count,
    "Revue": record.requires_review ? "Oui" : "Non"
  });

  const report = result.geometry_quality_report || {};
  document.getElementById("qualityBox").innerHTML = metaRows({
    "Statut": report.status || "-",
    "Sources": Array.isArray(report.selected_sources) ? report.selected_sources.length : 0,
    "Warnings": Array.isArray(report.warnings) ? report.warnings.length : 0,
    "Errors": Array.isArray(report.errors) ? report.errors.length : 0
  });
  document.getElementById("featureBox").textContent = "Cliquez une geometrie sur la carte.";

  renderGeometries(result);
  fitActiveLayers();
}

function renderGeometries(result) {
  siteLayer.clearLayers();
  buildingLayer.clearLayers();
  buildingCentroidLayer.clearLayers();
  raccordementLayer.clearLayers();
  pyloneLayer.clearLayers();

  addGeometry(siteLayer, result.site_geometry, "Site");
  (result.building_geometries || []).forEach((entry, index) => {
    addGeometry(buildingLayer, entry, "Batiment " + (index + 1));
    addBuildingCentroid(entry, index);
  });
  addGeometry(raccordementLayer, result.raccordement_geometry, "Raccordement");
  (result.pylone_geometries || []).forEach((entry, index) => {
    addGeometry(pyloneLayer, entry, "Pylone " + (index + 1));
  });
}

function addBuildingCentroid(entry, index) {
  const centroid = entry?.properties?.centroid_point;
  if (!centroid || centroid.type !== "Point" || !Array.isArray(centroid.coordinates)) return;

  buildingCentroidLayer.addData({
    type: "Feature",
    properties: {
      label: "Centroide batiment " + (index + 1),
      ...featureProperties(entry),
      role: "building_centroid"
    },
    geometry: centroid
  });
}

function addGeometry(layer, entry, label) {
  if (!entry?.geometry) return;
  layer.addData({
    type: "Feature",
    properties: {
      label,
      ...featureProperties(entry),
      role: entry.role
    },
    geometry: entry.geometry
  });
}

function featureProperties(entry) {
  const props = entry?.properties || {};
  return {
    source_field: entry.source_field,
    parser: entry.parser,
    requires_review: Boolean(entry.requires_review),
    building_number: props.building_number,
    building_name: props.building_name,
    building_status: props.building_status,
    building_vocation: props.building_vocation,
    building_services: props.building_services
  };
}

function fitActiveLayers() {
  const bounds = L.latLngBounds([]);
  [siteLayer, buildingLayer, buildingCentroidLayer, raccordementLayer, pyloneLayer].forEach((group) => {
    if (!map.hasLayer(group)) return;
    group.eachLayer((layer) => {
      if (typeof layer.getBounds === "function") {
        const layerBounds = layer.getBounds();
        if (layerBounds.isValid()) bounds.extend(layerBounds);
      } else if (typeof layer.getLatLng === "function") {
        bounds.extend(layer.getLatLng());
      }
    });
  });
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 19 });
}

function bindFeaturePopup(feature, layer) {
  const props = feature.properties || {};
  layer.bindPopup('<strong>' + escapeHtml(props.label || "Geometrie") + '</strong>' +
    '<div class="popup-grid">' + metaRows({
      "Numero": props.building_number,
      "Nom": props.building_name,
      "Statut": props.building_status,
      "Vocation": props.building_vocation,
      "Services": props.building_services,
      "Champ": props.source_field,
      "Parseur": props.parser,
      "Revue": props.requires_review ? "Oui" : ""
    }) + '</div>');
  layer.on("click", () => {
    document.getElementById("featureBox").innerHTML = metaRows({
      "Objet": props.label,
      "Numero": props.building_number,
      "Nom": props.building_name,
      "Statut": props.building_status,
      "Vocation": props.building_vocation,
      "Services installes": props.building_services,
      "Champ source": props.source_field,
      "Parseur": props.parser,
      "Revue": props.requires_review ? "Oui" : "Non"
    });
  });
}

function pointStyle(color, radius) {
  return { radius, color, fillColor: color, fillOpacity: 0.85, opacity: 1, weight: 2 };
}

function statusFormatter(cell) {
  const value = cell.getValue() || "unknown";
  return '<span>' + escapeHtml(value) + '</span>';
}

function booleanFormatter(cell) {
  return cell.getValue() ? "Oui" : "Non";
}

function metaRows(data) {
  return Object.entries(data)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => "<span>" + escapeHtml(key) + "</span><strong>" + escapeHtml(formatValue(value)) + "</strong>")
    .join("");
}

function formatValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
`;
}

function escapeScript(value) {
  return value.replace(/</g, "\\u003c");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
