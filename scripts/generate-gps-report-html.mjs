import fs from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

const inputMarkdownPath = process.argv[2];
const inputKoboPath = process.argv[3];
const outputPath = process.argv[4];

if (!inputMarkdownPath || !inputKoboPath || !outputPath) {
  console.error("Usage: node scripts/generate-gps-report-html.mjs <report.md> <kobo.json> <output.html>");
  process.exit(1);
}

const markdown = await fs.readFile(inputMarkdownPath, "utf8");
const koboPayload = JSON.parse(await fs.readFile(inputKoboPath, "utf8"));
const submissions = koboPayload.response?.results || [];

function isFilled(value) {
  return value !== null && value !== undefined && !(typeof value === "string" && value.trim() === "");
}

function parseKoboPoint(value) {
  if (!isFilled(value)) return null;
  if (Array.isArray(value) && value.length >= 2) {
    const lat = Number(value[0]);
    const lon = Number(value[1]);
    return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
  }
  const parts = String(value).trim().split(/[ ,]+/).map(Number).filter(Number.isFinite);
  return parts.length >= 2 ? [parts[0], parts[1]] : null;
}

function parseKoboShape(value) {
  if (!isFilled(value)) return [];
  return String(value).split(";").map((part) => parseKoboPoint(part)).filter(Boolean);
}

function parseTextCoordinates(value) {
  if (!isFilled(value)) return [];
  const points = [];
  for (const line of String(value).replace(/\r/g, "\n").split("\n")) {
    const koboPoint = parseKoboPoint(line);
    if (koboPoint && Math.abs(koboPoint[0]) <= 90 && Math.abs(koboPoint[1]) <= 180) {
      points.push(koboPoint);
      continue;
    }
    const patterns = [
      /(-?\d{1,2}[.,]\d+)\s*,\s*(-?\d{1,3}[.,]\d+)/g,
      /(-?\d{1,2}[.,]\d+)\s*;\s*(-?\d{1,3}[.,]\d+)/g,
      /(-?\d{1,2}[.,]\d+)\s*-\s*(\d{1,3}[.,]\d+)/g
    ];
    for (const pattern of patterns) {
      for (const match of line.matchAll(pattern)) {
        const lat = Number(match[1].replace(",", "."));
        const negativeLon = pattern.source.includes("\\s*-\\s*") && !match[2].startsWith("-");
        const lon = Number(match[2].replace(",", ".")) * (negativeLon ? -1 : 1);
        if (Number.isFinite(lat) && Number.isFinite(lon)) points.push([lat, lon]);
      }
    }
  }
  return points;
}

function collectSiteLayers(row) {
  const layers = [];
  const addPoint = (label, value, color) => {
    const point = parseKoboPoint(value);
    if (point) layers.push({ type: "point", label, point, color });
  };
  const addPointList = (label, values, color) => {
    values.forEach((point) => layers.push({ type: "point", label, point, color }));
  };
  const addPolygon = (label, value, color, fillColor) => {
    const points = parseKoboShape(value);
    if (points.length >= 2) layers.push({ type: "polygon", label, points, color, fillColor });
  };
  const addLine = (label, value, color) => {
    const points = parseTextCoordinates(value);
    if (points.length >= 2) layers.push({ type: "line", label, points, color });
    else addPointList(label, points, color);
  };

  addPoint("_geolocation", row._geolocation, "#e11d48");
  addPoint("gps_site", row["modA/gps_site"], "#dc2626");
  addPoint("gps_centre", row["modA/gps_centre"], "#2563eb");
  addPolygon("emprise_site", row["modB/emprise_site"], "#1d4ed8", "#93c5fd");
  addLine("emprise_site_manuel", row["modB/emprise_site_manuel"], "#16a34a");
  addLine("gps_manuel", row["modA/gps_manuel"], "#0f766e");
  addPoint("gps_raccord", row["modH/gps_raccord"], "#111827");
  addLine("gps_raccord_manuel", row["modH/gps_raccord_manuel"], "#374151");
  for (const item of row["modE/pylone_rep"] || []) {
    addPoint("pylône", item["modE/pylone_rep/gps_pylone"], "#7c3aed");
    addPointList("pylône manuel", parseTextCoordinates(item["modE/pylone_rep/gps_pylone_manuel"]), "#a855f7");
    addPointList("pylône coords", parseTextCoordinates(item["modE/pylone_rep/gps_pylone_coords"]), "#c084fc");
  }
  for (const item of row.batiment || []) {
    addPolygon("bâtiment", item["batiment/coins_bat"], "#f97316", "#fed7aa");
    addPointList("bâtiment coords", parseTextCoordinates(item["batiment/coins_bat_coords"]), "#fb923c");
  }
  return layers;
}

const maps = submissions.map((row, index) => ({
  id: String(row._id || index + 1),
  name: String(row["modB/nom_officiel"] || "Site non renseigné").replace(/\s+/g, " ").trim(),
  layers: collectSiteLayers(row)
}));

const siteIds = new Set(maps.map((site) => site.id));
function htmlId(value) {
  return `site-map-${String(value).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function linkSiteIds(html) {
  return html.replace(/<code>(\d+)<\/code>/g, (match, id) => {
    if (!siteIds.has(id)) return match;
    return `<a class="site-ref" href="#${htmlId(id)}"><code>${id}</code></a>`;
  });
}

const reportHtml = linkSiteIds(marked.parse(markdown));

const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rapport de contrôle qualité GPS - Enquête GEMS</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <style>
    body { margin: 0; font-family: Arial, sans-serif; color: #182B37; background: #f7faf9; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px; background: #fff; }
    h1, h2, h3 { color: #12313b; }
    table { border-collapse: collapse; width: 100%; margin: 14px 0 22px; font-size: 13px; }
    th, td { border: 1px solid #d9e2e8; padding: 7px 8px; vertical-align: top; }
    th { background: #d9f0eb; text-align: left; }
    code { background: #e9eef2; padding: 1px 4px; border-radius: 3px; }
    a.site-ref { color: #0f766e; font-weight: 700; text-decoration: none; }
    a.site-ref:hover, a.site-ref:focus { text-decoration: underline; }
    .site-map-section { break-before: page; margin-top: 34px; padding-top: 18px; border-top: 2px solid #d9e2e8; }
    .site-map-section:target { outline: 3px solid rgba(15, 118, 110, 0.28); outline-offset: 8px; }
    .site-map { height: 520px; border: 1px solid #b8c7d0; border-radius: 6px; background: #eef6f8; }
    .map-note { color: #64748b; font-size: 13px; }
    .legend { display: flex; flex-wrap: wrap; gap: 10px 18px; margin: 8px 0 12px; font-size: 13px; }
    .legend span::before { content: ""; display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; background: var(--c); }
    @media print { main { max-width: none; padding: 10mm; } .site-map { height: 430px; } }
  </style>
</head>
<body>
<main>
${reportHtml}
<h1>Annexe - Cartes de situation par site</h1>
<p>Les cartes ci-dessous présentent les données spatiales collectées sur fond OpenStreetMap estompé. Attribution : © OpenStreetMap contributors.</p>
${maps.map((site, index) => `
  <section id="${htmlId(site.id)}" class="site-map-section">
    <h2>${site.id} - ${site.name}</h2>
    <div class="legend">
      <span style="--c:#dc2626">Site</span>
      <span style="--c:#2563eb">Centre</span>
      <span style="--c:#1d4ed8">Emprise</span>
      <span style="--c:#f97316">Bâtiment</span>
      <span style="--c:#7c3aed">Pylône</span>
      <span style="--c:#111827">Raccordement</span>
    </div>
    <div id="map-${index}" class="site-map"></div>
    <p class="map-note">Carte interactive Leaflet. Les coordonnées manifestement hors zone peuvent ne pas être visibles dans l’emprise initiale.</p>
  </section>
`).join("")}
</main>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const maps = ${JSON.stringify(maps)};
function validPoint(point) {
  return Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]) && point[0] >= -90 && point[0] <= 90 && point[1] >= -180 && point[1] <= 180;
}
maps.forEach((site, index) => {
  const map = L.map("map-" + index, { scrollWheelZoom: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
    opacity: 0.38,
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);
  const group = L.featureGroup().addTo(map);
  site.layers.forEach((layer) => {
    if (layer.type === "point" && validPoint(layer.point)) {
      L.circleMarker(layer.point, {
        radius: 6,
        color: "#fff",
        weight: 1,
        fillColor: layer.color,
        fillOpacity: 0.95
      }).bindPopup(layer.label).addTo(group);
    } else if ((layer.type === "polygon" || layer.type === "line") && Array.isArray(layer.points) && layer.points.length) {
      const points = layer.points.filter(validPoint);
      if (points.length < 2) return;
      const options = {
        color: layer.color,
        weight: 2,
        opacity: 0.95,
        fillColor: layer.fillColor || layer.color,
        fillOpacity: layer.type === "polygon" ? 0.22 : 0
      };
      const item = layer.type === "polygon" ? L.polygon(points, options) : L.polyline(points, options);
      item.bindPopup(layer.label).addTo(group);
    }
  });
  const validLayers = group.getLayers();
  if (validLayers.length) {
    map.fitBounds(group.getBounds().pad(0.18));
  } else {
    map.setView([7.54, -5.55], 6);
  }
});
</script>
</body>
</html>`;

await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await fs.writeFile(outputPath, html, "utf8");
console.log(`Rapport HTML généré : ${path.resolve(outputPath)}`);
