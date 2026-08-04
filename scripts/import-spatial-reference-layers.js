require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const SpatialReferenceFeature = require("../models/SpatialReferenceFeature");

const DEFAULT_PATHS = {
  site_contour: "C:\\OPEN-PROJECTS\\Projects 2026\\2026 - RAKALL-BM\\02-Exécution\\09-Outils & Accessoires\\MultiFunctTOOL\\geodata-for G2M\\g2m_contours_sites.geojson",
  building_extent: "C:\\OPEN-PROJECTS\\Projects 2026\\2026 - RAKALL-BM\\02-Exécution\\09-Outils & Accessoires\\MultiFunctTOOL\\geodata-for G2M\\g2m_emprises_batiments.json",
  network_point: "C:\\OPEN-PROJECTS\\Projects 2026\\2026 - RAKALL-BM\\02-Exécution\\09-Outils & Accessoires\\MultiFunctTOOL\\geodata-for G2M\\g2m_network_points.geojson"
};

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourcePaths = {
    site_contour: args.siteContours || DEFAULT_PATHS.site_contour,
    building_extent: args.buildingExtents || DEFAULT_PATHS.building_extent,
    network_point: args.networkPoints || DEFAULT_PATHS.network_point
  };

  const layers = {
    site_contour: readGeoJson(sourcePaths.site_contour),
    building_extent: readGeoJson(sourcePaths.building_extent),
    network_point: readGeoJson(sourcePaths.network_point)
  };

  const results = SpatialReferenceFeature.importReferenceLayers(layers, {
    replaceType: !args.append,
    sourcePaths
  });

  results.forEach((result) => {
    console.log(`${result.entity_type}: ${result.saved} enregistrement(s), ${result.replaced} remplace(s), ${result.read} lu(s).`);
  });
}

function readGeoJson(filePath) {
  const resolved = path.resolve(filePath);
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--append") {
      parsed.append = true;
    } else if (arg === "--site-contours") {
      parsed.siteContours = args[++index];
    } else if (arg === "--building-extents") {
      parsed.buildingExtents = args[++index];
    } else if (arg === "--network-points") {
      parsed.networkPoints = args[++index];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return parsed;
}

function printHelp() {
  console.log([
    "Usage: node scripts/import-spatial-reference-layers.js [options]",
    "",
    "Options:",
    "  --site-contours <path>      GeoJSON des contours de sites, champ site_code.",
    "  --building-extents <path>   GeoJSON/JSON des emprises de batiments, champ site_code.",
    "  --network-points <path>     GeoJSON des noeuds reseau, champ kobo_id.",
    "  --append                    Ajoute/met a jour sans vider les couches existantes."
  ].join("\n"));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
