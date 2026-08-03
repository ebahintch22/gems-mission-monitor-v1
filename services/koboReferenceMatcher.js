const fs = require("node:fs");
const path = require("node:path");
const { extractKoboGeometryBatch, extractKoboGeometryBatchV2 } = require("./koboGeometryExtractor");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const BATCHES_ROOT = path.join(PROJECT_ROOT, "KBase-docs", "kobo-geometry-extractions", "batches");
const DEFAULT_STRATEGY_PATH = path.join(
  PROJECT_ROOT,
  "KBase-docs",
  "kobo-data-analysis",
  "extraction_scripts",
  "kobo_geometry_parser_strategy_by_version.json"
);

const DEFAULT_THRESHOLDS = {
  siteHighScore: 0.6,
  siteMinimumScore: 0.25,
  siteAmbiguityDelta: 0.15,
  siteSamplingSteps: 36
};
const COTE_D_IVOIRE_BBOX = {
  minLon: -8.75,
  maxLon: -2.45,
  minLat: 4.25,
  maxLat: 10.8
};
const DEFAULT_PROXIMITY_TOLERANCE_METERS = 50;

function runReferenceMatching(options = {}) {
  const batchPath = resolveBatchPath(options.batch);
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
  const extractionPath = ensureExtractionOutput(batchPath, options);
  const references = loadReferenceLayers(batchPath, options);
  const payload = readJson(extractionPath);
  const results = Array.isArray(payload.results) ? payload.results : [];

  const siteReferenceFeatures = normalizeReferenceFeatures(references.siteContours, "site");
  const buildingReferenceFeatures = normalizeReferenceFeatures(references.buildingExtents, "building");
  const siteMatches = matchSites(results, siteReferenceFeatures, thresholds);
  const buildingMatches = matchBuildings(results, siteMatches, buildingReferenceFeatures);
  const reviewGeoJson = buildReviewGeoJson(siteMatches, buildingMatches);
  const report = buildMarkdownReport({
    batchName: path.basename(batchPath),
    extractionPath,
    references,
    siteMatches,
    buildingMatches,
    thresholds
  });

  const outputDir = path.join(batchPath, "06_matching");
  fs.mkdirSync(outputDir, { recursive: true });

  const siteMatchingPath = path.join(outputDir, "site_matching.json");
  const buildingMatchingPath = path.join(outputDir, "building_matching.json");
  const reviewPath = path.join(outputDir, "matching_review.geojson");
  const reportPath = path.join(outputDir, "matching_report.md");

  writeJson(siteMatchingPath, {
    schema_name: "g2m_site_reference_matching",
    schema_version: "0.1.0",
    generated_at: new Date().toISOString(),
    thresholds,
    matches: siteMatches
  });
  writeJson(buildingMatchingPath, {
    schema_name: "g2m_building_reference_matching",
    schema_version: "0.1.0",
    generated_at: new Date().toISOString(),
    matches: buildingMatches
  });
  writeJson(reviewPath, reviewGeoJson);
  fs.writeFileSync(reportPath, report, "utf8");

  return {
    ok: true,
    batchPath,
    extractionPath,
    outputs: {
      siteMatchingPath,
      buildingMatchingPath,
      reviewPath,
      reportPath
    },
    summary: summarize(siteMatches, buildingMatches)
  };
}

function runMatchingEngine({ koboData, sitePolygons, buildingFootprints, toleranceMeters, logger } = {}) {
  return processMatching(koboData, sitePolygons, buildingFootprints, { toleranceMeters, logger });
}

function runSiteReferenceMatchingV2(options = {}) {
  const batchPath = resolveBatchPathForSiteOnly(options.batch);
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
  const extractionPath = ensureExtractionOutputV2(batchPath, options);
  const siteContoursPath = options.siteContours
    ? path.resolve(PROJECT_ROOT, options.siteContours)
    : findReferenceFile(batchPath, "contours_sites.geojson");

  if (!siteContoursPath) {
    throw new Error("Fichier contours_sites.geojson introuvable.");
  }

  const extractionPayload = readJson(extractionPath);
  const results = Array.isArray(extractionPayload.results) ? extractionPayload.results : [];
  const siteContours = readFeatureCollection(siteContoursPath, "contours_sites");
  const siteReferenceFeatures = normalizeReferenceFeatures(siteContours, "site");
  const siteMatches = matchSites(results, siteReferenceFeatures, thresholds);
  const centroidLayer = buildBuildingCentroidLayerFromExtraction(results);
  const outputDir = path.join(batchPath, "06_matching");
  const centroidOutputPath = options.centroidOutput
    ? path.resolve(PROJECT_ROOT, options.centroidOutput)
    : path.join(outputDir, "centroid_batiment.geojson");
  const csvOutputPath = options.csvOutput
    ? path.resolve(PROJECT_ROOT, options.csvOutput)
    : path.join(outputDir, "site_submission_matching.csv");

  fs.mkdirSync(path.dirname(centroidOutputPath), { recursive: true });
  fs.mkdirSync(path.dirname(csvOutputPath), { recursive: true });
  writeJson(centroidOutputPath, centroidLayer);
  fs.writeFileSync(csvOutputPath, buildSiteSubmissionMatchingCsv(siteMatches, results), "utf8");

  return {
    ok: true,
    batchPath,
    extractionPath,
    siteContoursPath,
    outputs: {
      centroidOutputPath,
      csvOutputPath
    },
    summary: {
      submissions: siteMatches.length,
      centroid_features: centroidLayer.features.length,
      matched: siteMatches.filter((match) => match.status === "matched").length,
      review: siteMatches.filter((match) => match.status === "review").length,
      ambiguous: siteMatches.filter((match) => match.status === "ambiguous").length,
      unmatched: siteMatches.filter((match) => match.status === "unmatched").length
    }
  };
}

function processMatching(koboData, sitePolygons, buildingFootprints, options = {}) {
  return processMatchingOutputs(koboData, sitePolygons, buildingFootprints, options).buildingFootprints;
}

function processMatchingOutputs(koboData, sitePolygons, buildingFootprints, options = {}) {
  assertFeatureCollection(koboData, "base_kobo_normalisee");
  assertFeatureCollection(sitePolygons, "contour_sites");
  assertFeatureCollection(buildingFootprints, "emprises_batiment");

  const toleranceMeters = Number.isFinite(Number(options.toleranceMeters))
    ? Number(options.toleranceMeters)
    : DEFAULT_PROXIMITY_TOLERANCE_METERS;
  const logger = options.logger || console;
  const siteProjectionPairs = sitePolygons.features.map((feature, index) => ({
    source: feature,
    projected: projectFeatureToUtm30N(feature),
    siteCode: siteCodeFromProperties(feature.properties || {}, index)
  }));
  const centroidLayer = extractKoboCentroids(koboData, logger);

  centroidLayer.forEach((centroid) => {
    const containingSites = siteProjectionPairs.filter((site) => (
      site.projected.geometry && pointInGeometry(centroid.projected.geometry.coordinates, site.projected.geometry)
    ));
    if (containingSites.length > 0) {
      centroid.properties.site_code = containingSites[0].siteCode;
      centroid.properties.site_match_count = containingSites.length;
    }
  });
  inheritSiteCodesBySubmissionGroup(centroidLayer);

  const normalizedBuildings = {
    type: "FeatureCollection",
    name: "emprises_batiment_normalized",
    features: buildingFootprints.features.map((buildingFeature, buildingIndex) => {
      const projectedBuilding = projectFeatureToUtm30N(buildingFeature);
      const originalProperties = buildingFeature.properties || {};
      const buildingSiteCode = normalizeText(originalProperties.site_code);
      const eligibleCentroids = centroidLayer.filter((centroid) => {
        if (!centroid.properties.site_code) {
          return false;
        }
        return !buildingSiteCode || normalizeText(centroid.properties.site_code) === buildingSiteCode;
      });
      const contained = eligibleCentroids
        .filter((centroid) => pointInGeometry(centroid.projected.geometry.coordinates, projectedBuilding.geometry))
        .sort(compareCentroids);

      const match = selectBuildingMatch({
        buildingFeature,
        projectedBuilding,
        contained,
        eligibleCentroids,
        allCentroids: centroidLayer,
        toleranceMeters
      });
      annotateMatchedCentroids(matchCentroidsForAnnotation(match, contained), match, buildingIndex, originalProperties);

      return {
        type: "Feature",
        properties: {
          ...originalProperties,
          kobo_attributes: match.centroid ? { ...match.centroid.properties } : null,
          site_code: match.siteCode,
          link_status: match.linkStatus,
          nb_centroide: match.nbCentroide,
          score_fiabilite: match.scoreFiabilite,
          distance_to_centroid: match.distanceToCentroid
        },
        geometry: cloneJson(buildingFeature.geometry)
      };
    })
  };

  return {
    buildingFootprints: normalizedBuildings,
    centroidBatiment: buildCentroidBatimentLayer(centroidLayer)
  };
}

function matchCentroidsForAnnotation(match, contained) {
  if (contained.length > 0) {
    return contained;
  }
  return match.centroid ? [match.centroid] : [];
}

function annotateMatchedCentroids(centroids, match, buildingIndex, buildingProperties) {
  centroids.forEach((centroid) => {
    Object.assign(centroid.properties, {
      matched_building_index: buildingIndex,
      matched_building_id: buildingProperties.id ?? buildingProperties.bat_num ?? buildingProperties.building_id ?? null,
      matched_building_site_code: match.siteCode,
      link_status: match.linkStatus,
      nb_centroide: match.nbCentroide,
      score_fiabilite: match.scoreFiabilite,
      distance_to_centroid: match.distanceToCentroid
    });
  });
}

function resolveBatchPath(batchName) {
  if (batchName) {
    const direct = path.resolve(PROJECT_ROOT, batchName);
    const candidate = fs.existsSync(direct)
      ? direct
      : path.join(BATCHES_ROOT, batchName);
    if (!fs.existsSync(candidate)) {
      throw new Error(`Batch introuvable: ${batchName}`);
    }
    return candidate;
  }

  const batches = fs.existsSync(BATCHES_ROOT)
    ? fs.readdirSync(BATCHES_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(BATCHES_ROOT, entry.name))
      .filter((candidate) => findReferenceFile(candidate, "contours_sites.geojson") && findReferenceFile(candidate, "emprises_batiments.geojson"))
      .sort()
    : [];
  if (!batches.length) {
    throw new Error("Aucun batch avec couches GeoJSON de reference n'a ete trouve.");
  }
  return batches[batches.length - 1];
}

function resolveBatchPathForSiteOnly(batchName) {
  if (batchName) {
    return resolveBatchPath(batchName);
  }

  const batches = fs.existsSync(BATCHES_ROOT)
    ? fs.readdirSync(BATCHES_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(BATCHES_ROOT, entry.name))
      .filter((candidate) => findReferenceFile(candidate, "contours_sites.geojson"))
      .sort()
    : [];
  if (!batches.length) {
    throw new Error("Aucun batch avec contours_sites.geojson n'a ete trouve.");
  }
  return batches[batches.length - 1];
}

function ensureExtractionOutput(batchPath, options = {}) {
  if (options.extraction) {
    const extraction = path.resolve(PROJECT_ROOT, options.extraction);
    if (!fs.existsSync(extraction)) {
      throw new Error(`Fichier d'extraction introuvable: ${options.extraction}`);
    }
    return extraction;
  }

  const outputDir = path.join(batchPath, "02_output");
  fs.mkdirSync(outputDir, { recursive: true });
  const existing = fs.readdirSync(outputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /geometries-normalized\.json$/i.test(entry.name) && !/-h1\.json$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (existing.length) {
    return path.join(outputDir, existing[existing.length - 1]);
  }

  const sourcePath = options.source
    ? path.resolve(PROJECT_ROOT, options.source)
    : findFirstJson(findBatchDir(batchPath, ["00_source", "00-source"]));
  if (!sourcePath) {
    throw new Error("Aucun fichier source Kobo n'a ete trouve pour generer l'extraction normalisee.");
  }
  const strategyPath = options.strategy ? path.resolve(PROJECT_ROOT, options.strategy) : DEFAULT_STRATEGY_PATH;
  const payload = readJson(sourcePath);
  const strategy = readJson(strategyPath);
  const extracted = extractKoboGeometryBatch(payload, strategy);
  const baseName = path.basename(sourcePath, path.extname(sourcePath));
  const outputPath = path.join(outputDir, `${baseName}-geometries-normalized.json`);
  writeJson(outputPath, extracted);
  return outputPath;
}

function ensureExtractionOutputV2(batchPath, options = {}) {
  if (options.extraction) {
    const extraction = path.resolve(PROJECT_ROOT, options.extraction);
    if (!fs.existsSync(extraction)) {
      throw new Error(`Fichier d'extraction introuvable: ${options.extraction}`);
    }
    return extraction;
  }

  const outputDir = path.join(batchPath, "02_output");
  fs.mkdirSync(outputDir, { recursive: true });
  const existingV2 = fs.readdirSync(outputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /geometries-normalized-v2\.json$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (existingV2.length) {
    return path.join(outputDir, existingV2[existingV2.length - 1]);
  }

  const sourcePath = options.source
    ? path.resolve(PROJECT_ROOT, options.source)
    : findFirstJson(findBatchDir(batchPath, ["00_source", "00-source"]));
  if (!sourcePath) {
    throw new Error("Aucun fichier source Kobo n'a ete trouve pour generer l'extraction normalisee V2.");
  }
  const strategyPath = options.strategy ? path.resolve(PROJECT_ROOT, options.strategy) : DEFAULT_STRATEGY_PATH;
  const payload = readJson(sourcePath);
  const strategy = readJson(strategyPath);
  const extracted = extractKoboGeometryBatchV2(payload, strategy);
  const baseName = path.basename(sourcePath, path.extname(sourcePath));
  const outputPath = path.join(outputDir, `${baseName}-geometries-normalized-v2.json`);
  writeJson(outputPath, extracted);
  return outputPath;
}

function loadReferenceLayers(batchPath, options = {}) {
  const siteContoursPath = options.siteContours
    ? path.resolve(PROJECT_ROOT, options.siteContours)
    : findReferenceFile(batchPath, "contours_sites.geojson");
  const buildingExtentsPath = options.buildingExtents
    ? path.resolve(PROJECT_ROOT, options.buildingExtents)
    : findReferenceFile(batchPath, "emprises_batiments.geojson");

  if (!siteContoursPath) {
    throw new Error("Fichier contours_sites.geojson introuvable.");
  }
  if (!buildingExtentsPath) {
    throw new Error("Fichier emprises_batiments.geojson introuvable.");
  }

  return {
    siteContoursPath,
    buildingExtentsPath,
    siteContours: readFeatureCollection(siteContoursPath, "contours_sites"),
    buildingExtents: readFeatureCollection(buildingExtentsPath, "emprises_batiments")
  };
}

function findReferenceFile(batchPath, fileName) {
  const candidates = [
    path.join(batchPath, "05_reference_layers", "source", fileName),
    path.join(batchPath, "05_reference_layers", "sources", fileName),
    path.join(batchPath, "05_reference_layers", fileName)
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function findBatchDir(batchPath, names) {
  return names.map((name) => path.join(batchPath, name)).find((candidate) => fs.existsSync(candidate)) || null;
}

function findFirstJson(dirPath) {
  if (!dirPath) {
    return null;
  }
  const files = fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
  return files.length ? path.join(dirPath, files[files.length - 1]) : null;
}

function readFeatureCollection(filePath, label) {
  const payload = readJson(filePath);
  if (payload?.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
    throw new Error(`${label} doit etre un GeoJSON FeatureCollection.`);
  }
  return payload;
}

function normalizeReferenceFeatures(collection, kind) {
  return collection.features
    .map((feature, index) => {
      const polygons = geometryPolygons(feature.geometry);
      const bbox = geometryBbox(feature.geometry);
      return {
        index,
        id: referenceId(feature, index, kind),
        kind,
        properties: feature.properties || {},
        geometry: feature.geometry,
        polygons,
        bbox,
        areaM2: polygons.reduce((sum, polygon) => sum + polygonAreaM2(polygon[0]), 0)
      };
    })
    .filter((feature) => feature.polygons.length > 0 && feature.bbox);
}

function matchSites(results, siteReferences, thresholds) {
  return results.map((result, index) => {
    const siteGeometry = result.site_geometry?.geometry || null;
    const descriptor = siteDescriptor(result, index);
    const candidates = siteReferences
      .map((reference) => scoreSiteCandidate(siteGeometry, reference, thresholds))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 8);
    const best = candidates[0] || null;
    const second = candidates[1] || null;
    const status = classifySiteMatch(best, second, thresholds);

    return {
      submission_index: index,
      source_submission_id: result.source_submission_id || null,
      kobo_id: result.kobo_id || null,
      site_description: result.site_description || {},
      site_geometry_source_field: result.site_geometry?.source_field || null,
      site_geometry_type: siteGeometry?.type || null,
      status,
      selected_reference: best ? referenceSummary(best.reference) : null,
      score: best?.score || 0,
      overlap_ratio: best?.overlapRatio || 0,
      reference_coverage_ratio: best?.referenceCoverageRatio || 0,
      candidates: candidates.map((candidate) => ({
        reference: referenceSummary(candidate.reference),
        score: candidate.score,
        overlap_ratio: candidate.overlapRatio,
        reference_coverage_ratio: candidate.referenceCoverageRatio,
        method: candidate.method
      })),
      reason: siteMatchReason(status, best, second),
      descriptor
    };
  });
}

function scoreSiteCandidate(siteGeometry, reference, thresholds) {
  if (!siteGeometry) {
    return { reference, score: 0, overlapRatio: 0, referenceCoverageRatio: 0, method: "missing_geometry" };
  }

  if (siteGeometry.type === "Point") {
    const contained = pointInGeometry(siteGeometry.coordinates, reference.geometry);
    return {
      reference,
      score: contained ? 0.5 : 0,
      overlapRatio: contained ? 1 : 0,
      referenceCoverageRatio: 0,
      method: "site_point_containment"
    };
  }

  const sitePolygons = geometryPolygons(siteGeometry);
  if (!sitePolygons.length) {
    return { reference, score: 0, overlapRatio: 0, referenceCoverageRatio: 0, method: "unsupported_geometry" };
  }
  const siteBbox = geometryBbox(siteGeometry);
  if (!bboxesIntersect(siteBbox, reference.bbox)) {
    return { reference, score: 0, overlapRatio: 0, referenceCoverageRatio: 0, method: "bbox_disjoint" };
  }

  const siteAreaM2 = sitePolygons.reduce((sum, polygon) => sum + polygonAreaM2(polygon[0]), 0);
  const intersectionM2 = approximateIntersectionAreaM2(siteGeometry, reference.geometry, thresholds.siteSamplingSteps);
  const overlapRatio = siteAreaM2 > 0 ? intersectionM2 / siteAreaM2 : 0;
  const referenceCoverageRatio = reference.areaM2 > 0 ? intersectionM2 / reference.areaM2 : 0;
  return {
    reference,
    score: (0.7 * overlapRatio) + (0.3 * referenceCoverageRatio),
    overlapRatio,
    referenceCoverageRatio,
    method: "sampled_area_overlap"
  };
}

function classifySiteMatch(best, second, thresholds) {
  if (!best || best.score < thresholds.siteMinimumScore) {
    return "unmatched";
  }
  if (best.score < thresholds.siteHighScore) {
    return "review";
  }
  if (second && (best.score - second.score) < thresholds.siteAmbiguityDelta) {
    return "ambiguous";
  }
  return "matched";
}

function siteMatchReason(status, best, second) {
  if (status === "matched") {
    return "Meilleur candidat spatial retenu automatiquement.";
  }
  if (status === "ambiguous") {
    return `Scores proches entre les deux meilleurs candidats (${formatNumber(best.score)} / ${formatNumber(second.score)}).`;
  }
  if (status === "review") {
    return `Score insuffisant pour validation automatique (${formatNumber(best.score)}).`;
  }
  return "Aucun contour de site de reference ne satisfait le seuil minimal.";
}

function matchBuildings(results, siteMatches, buildingReferences) {
  const matches = [];
  const referenceUsage = new Map();

  results.forEach((result, submissionIndex) => {
    const siteMatch = siteMatches[submissionIndex];
    const siteReference = siteMatch?.selected_reference;
    const siteBuildings = siteReference
      ? buildingReferences.filter((reference) => (
        sameReferenceSite(reference.properties, siteReference.properties)
          || pointInGeometry(bboxCenter(reference.bbox), siteReferencesGeometry(siteMatch, siteMatches))
      ))
      : [];

    const centroidMatches = (result.building_geometries || []).map((building, buildingIndex) => {
      const centroid = building.properties?.centroid_point || null;
      const containing = centroid?.type === "Point"
        ? siteBuildings.filter((reference) => pointInGeometry(centroid.coordinates, reference.geometry))
        : [];
      const outsideSite = centroid?.type === "Point" && siteMatch?.status !== "unmatched" && siteReference
        ? !containingPointInSelectedSite(centroid.coordinates, siteMatch)
        : false;
      const classification = classifyBuildingPoint(containing, outsideSite);
      const selected = containing.length === 1 ? containing[0] : null;
      if (selected) {
        const key = `${submissionIndex}:${selected.id}`;
        const current = referenceUsage.get(key) || [];
        current.push(buildingIndex);
        referenceUsage.set(key, current);
      }
      return {
        submission_index: submissionIndex,
        source_submission_id: result.source_submission_id || null,
        site_reference: siteReference,
        building_index: buildingIndex,
        kobo_building: buildingSummary(building),
        centroid_point: centroid,
        classification,
        selected_reference_building: selected ? referenceSummary(selected) : null,
        candidate_reference_buildings: containing.map(referenceSummary),
        reason: buildingReason(classification, containing)
      };
    });

    centroidMatches.forEach((match) => matches.push(match));

    const usedReferenceIds = new Set(centroidMatches
      .map((match) => match.selected_reference_building?.id)
      .filter(Boolean));
    siteBuildings
      .filter((reference) => !usedReferenceIds.has(reference.id))
      .forEach((reference) => {
        matches.push({
          submission_index: submissionIndex,
          source_submission_id: result.source_submission_id || null,
          site_reference: siteReference,
          building_index: null,
          kobo_building: null,
          centroid_point: null,
          classification: "D",
          selected_reference_building: referenceSummary(reference),
          candidate_reference_buildings: [],
          reason: "Emprise bâtiment de référence sans centroïde Kobo associé."
        });
      });
  });

  return matches.map((match) => {
    if (match.classification !== "A" || !match.selected_reference_building) {
      return match;
    }
    const usageKey = `${match.submission_index}:${match.selected_reference_building.id}`;
    const usage = referenceUsage.get(usageKey) || [];
    if (usage.length <= 1) {
      return match;
    }
    return {
      ...match,
      classification: "B",
      reason: `Conflit: ${usage.length} centroïdes Kobo dans la même emprise bâtiment.`
    };
  });
}

function siteReferencesGeometry(siteMatch, allSiteMatches) {
  const match = allSiteMatches.find((candidate) => candidate === siteMatch);
  return match?._reference_geometry || null;
}

function containingPointInSelectedSite(point, siteMatch) {
  const reference = siteMatch?.selected_reference?._source_reference;
  return reference?.geometry ? pointInGeometry(point, reference.geometry) : true;
}

function classifyBuildingPoint(containing, outsideSite) {
  if (outsideSite) {
    return "F";
  }
  if (containing.length === 0) {
    return "C";
  }
  if (containing.length > 1) {
    return "E";
  }
  return "A";
}

function buildingReason(classification, containing) {
  if (classification === "A") {
    return "Centroïde contenu dans une seule emprise bâtiment.";
  }
  if (classification === "C") {
    return "Centroïde non contenu dans une emprise bâtiment de référence.";
  }
  if (classification === "E") {
    return `Centroïde contenu dans ${containing.length} emprises bâtiment superposées.`;
  }
  if (classification === "F") {
    return "Centroïde hors du contour de site de référence retenu.";
  }
  return "Cas à vérifier.";
}

function sameReferenceSite(buildingProps, siteProps) {
  const buildingSiteCode = normalizeText(buildingProps.site_code);
  const siteCode = normalizeText(siteProps.site_code);
  if (buildingSiteCode && siteCode && buildingSiteCode === siteCode) {
    return true;
  }
  const buildingSiteId = normalizeId(buildingProps.site_id);
  const siteId = normalizeId(siteProps.site_id);
  return buildingSiteId !== "" && buildingSiteId === siteId;
}

function referenceSummary(reference) {
  return {
    id: reference.id,
    index: reference.index,
    properties: reference.properties,
    area_m2: Math.round(reference.areaM2),
    _source_reference: reference
  };
}

function buildingSummary(building) {
  const props = building.properties || {};
  return {
    repeat_index: building.repeat_index,
    source_field: building.source_field,
    parser: building.parser,
    building_number: props.building_number,
    building_name: props.building_name,
    building_status: props.building_status,
    building_vocation: props.building_vocation,
    building_services: props.building_services,
    requires_review: Boolean(building.requires_review)
  };
}

function siteDescriptor(result, index) {
  const description = result.site_description || {};
  return {
    index,
    official_name: description.official_name || "",
    region: description.region || "",
    locality: description.locality || "",
    submitted_at: description.submitted_at || ""
  };
}

function buildReviewGeoJson(siteMatches, buildingMatches) {
  const features = [];
  siteMatches.forEach((match) => {
    const reference = match.selected_reference?._source_reference;
    if (reference?.geometry) {
      features.push({
        type: "Feature",
        properties: {
          layer: "site_reference_match",
          class: match.status,
          source_submission_id: match.source_submission_id,
          official_name: match.site_description.official_name,
          score: match.score,
          reason: match.reason
        },
        geometry: reference.geometry
      });
    }
  });
  buildingMatches.forEach((match) => {
    if (match.centroid_point && shouldIncludeReviewGeometry(match.centroid_point)) {
      features.push({
        type: "Feature",
        properties: {
          layer: "building_centroid_match",
          class: match.classification,
          source_submission_id: match.source_submission_id,
          building_index: match.building_index,
          building_number: match.kobo_building?.building_number,
          building_name: match.kobo_building?.building_name,
          reason: match.reason
        },
        geometry: match.centroid_point
      });
    }
    const reference = match.selected_reference_building?._source_reference;
    if (reference?.geometry) {
      features.push({
        type: "Feature",
        properties: {
          layer: "building_reference_match",
          class: match.classification,
          source_submission_id: match.source_submission_id,
          building_index: match.building_index,
          reference_id: match.selected_reference_building.id,
          reason: match.reason
        },
        geometry: reference.geometry
      });
    }
  });
  return {
    type: "FeatureCollection",
    name: "matching_review",
    features
  };
}

function shouldIncludeReviewGeometry(geometry) {
  if (geometry?.type !== "Point") {
    return true;
  }
  return pointInBbox(geometry.coordinates, COTE_D_IVOIRE_BBOX);
}

function pointInBbox(point, bbox) {
  const lon = Number(point?.[0]);
  const lat = Number(point?.[1]);
  return Number.isFinite(lon)
    && Number.isFinite(lat)
    && lon >= bbox.minLon
    && lon <= bbox.maxLon
    && lat >= bbox.minLat
    && lat <= bbox.maxLat;
}

function buildMarkdownReport({ batchName, extractionPath, references, siteMatches, buildingMatches, thresholds }) {
  const siteStats = countBy(siteMatches, "status");
  const buildingStats = countBy(buildingMatches, "classification");
  const unresolvedSites = siteMatches.filter((match) => match.status !== "matched");
  const unresolvedBuildings = buildingMatches.filter((match) => match.classification !== "A");
  const lines = [];

  lines.push("# Rapport d'appariement des couches de référence");
  lines.push("");
  lines.push(`Batch : \`${batchName}\``);
  lines.push(`Généré le : ${new Date().toISOString()}`);
  lines.push(`Extraction Kobo : \`${relativePath(extractionPath)}\``);
  lines.push(`Contours sites : \`${relativePath(references.siteContoursPath)}\``);
  lines.push(`Emprises bâtiments : \`${relativePath(references.buildingExtentsPath)}\``);
  lines.push("");
  lines.push("## Paramètres");
  lines.push("");
  lines.push(`- Seuil haut site : ${thresholds.siteHighScore}`);
  lines.push(`- Seuil minimal site : ${thresholds.siteMinimumScore}`);
  lines.push(`- Écart minimal anti-ambiguïté : ${thresholds.siteAmbiguityDelta}`);
  lines.push(`- Pas d'échantillonnage du recouvrement : ${thresholds.siteSamplingSteps} x ${thresholds.siteSamplingSteps}`);
  lines.push("");
  lines.push("## Synthèse sites");
  lines.push("");
  lines.push(`- Sites traités : ${siteMatches.length}`);
  lines.push(`- Appariés automatiquement : ${siteStats.matched || 0}`);
  lines.push(`- À revoir : ${siteStats.review || 0}`);
  lines.push(`- Ambigus : ${siteStats.ambiguous || 0}`);
  lines.push(`- Non appariés : ${siteStats.unmatched || 0}`);
  lines.push("");
  lines.push("## Synthèse bâtiments");
  lines.push("");
  lines.push(`- Classe A, lien réussi : ${buildingStats.A || 0}`);
  lines.push(`- Classe B, conflit : ${buildingStats.B || 0}`);
  lines.push(`- Classe C, non résolu : ${buildingStats.C || 0}`);
  lines.push(`- Classe D, emprise sans centroïde : ${buildingStats.D || 0}`);
  lines.push(`- Classe E, inclusion multiple : ${buildingStats.E || 0}`);
  lines.push(`- Classe F, hors site : ${buildingStats.F || 0}`);
  lines.push("");
  lines.push("## Sites à revoir");
  lines.push("");
  if (!unresolvedSites.length) {
    lines.push("Aucun site à revoir.");
  } else {
    unresolvedSites.slice(0, 60).forEach((match) => {
      lines.push(`- ${match.site_description.official_name || match.source_submission_id || match.submission_index} : ${match.status}, score ${formatNumber(match.score)}. ${match.reason}`);
    });
  }
  lines.push("");
  lines.push("## Bâtiments à revoir");
  lines.push("");
  if (!unresolvedBuildings.length) {
    lines.push("Aucun bâtiment à revoir.");
  } else {
    unresolvedBuildings.slice(0, 120).forEach((match) => {
      const building = match.kobo_building;
      const label = building
        ? `${building.building_number || match.building_index} ${building.building_name || ""}`.trim()
        : `emprise ${match.selected_reference_building?.id || "-"}`;
      lines.push(`- Classe ${match.classification} - ${match.source_submission_id || match.submission_index} - ${label} : ${match.reason}`);
    });
  }
  lines.push("");
  lines.push("## Limites du prototype");
  lines.push("");
  lines.push("- Le recouvrement des sites est estimé par échantillonnage régulier ; il devra être remplacé par une intersection polygonale exacte si une bibliothèque géospatiale complète est ajoutée.");
  lines.push("- Les calculs de surface utilisent une projection métrique locale approximative adaptée au diagnostic, pas à un calcul cadastral.");
  lines.push("- Les appariements automatiques restent réversibles et doivent être validés sur les cas ambigus ou proches.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function summarize(siteMatches, buildingMatches) {
  return {
    sites: countBy(siteMatches, "status"),
    buildings: countBy(buildingMatches, "classification"),
    site_count: siteMatches.length,
    building_match_count: buildingMatches.length
  };
}

function countBy(items, field) {
  return items.reduce((counts, item) => {
    const key = item[field] || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function assertFeatureCollection(collection, label) {
  if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new Error(`${label} doit etre un GeoJSON FeatureCollection.`);
  }
}

function extractKoboCentroids(koboData, logger) {
  return koboData.features.reduce((centroids, feature, index) => {
    if (feature?.geometry?.type !== "Point" || !Array.isArray(feature.geometry.coordinates)) {
      return centroids;
    }
    const coordinates = feature.geometry.coordinates;
    if (!pointInBbox(coordinates, COTE_D_IVOIRE_BBOX)) {
      logger.warn?.(`Centroide Kobo ignore hors Cote d'Ivoire: ${feature.properties?.source_submission_id || feature.id || index}`);
      return centroids;
    }
    const properties = {
      ...(feature.properties || {}),
      submission_group_id: submissionGroupId(feature, index)
    };
    centroids.push({
      source: feature,
      sourceIndex: index,
      properties,
      projected: {
        type: "Feature",
        properties,
        geometry: {
          type: "Point",
          coordinates: lonLatToUtm30N(coordinates[0], coordinates[1])
        }
      }
    });
    return centroids;
  }, []);
}

function submissionGroupId(feature, index) {
  const props = feature.properties || {};
  return String(
    props.submission_group_id
    ?? props.parent_id
    ?? props.source_submission_id
    ?? props.kobo_id
    ?? props._id
    ?? feature.id
    ?? `centroid-${index + 1}`
  );
}

function inheritSiteCodesBySubmissionGroup(centroids) {
  const inherited = new Map();
  centroids.forEach((centroid) => {
    const groupId = centroid.properties.submission_group_id;
    if (groupId && centroid.properties.site_code && !inherited.has(groupId)) {
      inherited.set(groupId, centroid.properties.site_code);
    }
  });
  centroids.forEach((centroid) => {
    const groupId = centroid.properties.submission_group_id;
    if (!centroid.properties.site_code && inherited.has(groupId)) {
      centroid.properties.site_code = inherited.get(groupId);
      centroid.properties.site_code_inherited = true;
    }
  });
}

function buildCentroidBatimentLayer(centroids) {
  return {
    type: "FeatureCollection",
    name: "centroid_batiment",
    features: centroids.map((centroid) => {
      const coordinates = centroid.source?.geometry?.coordinates || [];
      return {
        type: "Feature",
        properties: flattenFeatureProperties({
          ...centroid.properties,
          longitude: coordinates[0] ?? null,
          latitude: coordinates[1] ?? null
        }),
        geometry: cloneJson(centroid.source.geometry)
      };
    })
  };
}

function buildBuildingCentroidLayerFromExtraction(results) {
  const features = [];
  results.forEach((submission, submissionIndex) => {
    const siteDescription = submission.site_description || {};
    (submission.building_geometries || []).forEach((building, buildingIndex) => {
      const centroid = building.properties?.centroid_point;
      if (centroid?.type !== "Point" || !Array.isArray(centroid.coordinates)) {
        return;
      }
      const buildingProperties = { ...(building.properties || {}) };
      delete buildingProperties.centroid_point;
      features.push({
        type: "Feature",
        properties: {
          submission_index: submissionIndex,
          building_index: buildingIndex,
          submission_group_id: submission.source_submission_id || submission.kobo_id || `submission-${submissionIndex + 1}`,
          source_submission_id: submission.source_submission_id || null,
          kobo_id: submission.kobo_id || null,
          form_version: submission.form_version || null,
          site_official_name: siteDescription.official_name || null,
          site_region: siteDescription.region || null,
          site_locality: siteDescription.locality || null,
          site_submitted_at: siteDescription.submitted_at || null,
          source_field: building.source_field || null,
          parser: building.parser || null,
          repeat_path: building.repeat_path || null,
          repeat_index: building.repeat_index ?? buildingIndex,
          raw_value: building.raw_value ?? null,
          requires_review: Boolean(building.requires_review),
          quality_status: submission.geometry_quality_report?.status || null,
          ...buildingProperties
        },
        geometry: {
          type: "Point",
          coordinates: [...centroid.coordinates]
        }
      });
    });
  });

  return {
    type: "FeatureCollection",
    name: "centroid_batiment",
    features
  };
}

function buildSiteSubmissionMatchingCsv(siteMatches, results) {
  const columns = [
    "reference_site_code",
    "reference_site_name",
    "kobo__id",
    "kobo_modA_fiche_id",
    "kobo_modB_nom_officiel",
    "match_status",
    "score",
    "overlap_ratio",
    "reference_coverage_ratio"
  ];
  const rows = siteMatches.map((match) => {
    const submission = results[match.submission_index] || {};
    const referenceProperties = match.selected_reference?.properties || {};
    return [
      referenceProperties.site_code || "",
      referenceProperties.site_name || "",
      koboSubmissionId(submission),
      koboFicheId(submission),
      koboOfficialName(submission),
      match.status,
      match.score,
      match.overlap_ratio,
      match.reference_coverage_ratio
    ];
  });

  return [
    columns.join(","),
    ...rows.map((row) => row.map(csvCell).join(","))
  ].join("\n") + "\n";
}

function koboSubmissionId(submission) {
  return submission.kobo_id
    ?? submission._id
    ?? submission.site_description?._id
    ?? "";
}

function koboFicheId(submission) {
  return submission["modA/fiche_id"]
    ?? submission.site_description?.fiche_id
    ?? submission.raw_data?.["modA/fiche_id"]
    ?? submission.raw?.["modA/fiche_id"]
    ?? "";
}

function koboOfficialName(submission) {
  return submission["modB/nom_officiel"]
    ?? submission.site_description?.official_name
    ?? submission.raw_data?.["modB/nom_officiel"]
    ?? submission.raw?.["modB/nom_officiel"]
    ?? "";
}

function csvCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function flattenFeatureProperties(properties, prefix = "") {
  return Object.entries(properties || {}).reduce((flat, [key, value]) => {
    const normalizedKey = normalizePropertyKey(prefix ? `${prefix}_${key}` : key);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(flat, flattenFeatureProperties(value, normalizedKey));
    } else if (Array.isArray(value)) {
      flat[normalizedKey] = value.every((item) => item === null || ["string", "number", "boolean"].includes(typeof item))
        ? value.join(", ")
        : JSON.stringify(value);
    } else {
      flat[normalizedKey] = value ?? null;
    }
    return flat;
  }, {});
}

function normalizePropertyKey(key) {
  return String(key)
    .replace(/[\\/.\s-]+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function selectBuildingMatch({ buildingFeature, projectedBuilding, contained, eligibleCentroids, allCentroids, toleranceMeters }) {
  if (contained.length === 1) {
    return {
      centroid: contained[0],
      siteCode: contained[0].properties.site_code,
      linkStatus: "direct",
      nbCentroide: 1,
      scoreFiabilite: 3,
      distanceToCentroid: null
    };
  }
  if (contained.length > 1) {
    return {
      centroid: contained[0],
      siteCode: contained[0].properties.site_code,
      linkStatus: "conflit",
      nbCentroide: contained.length,
      scoreFiabilite: 2,
      distanceToCentroid: null
    };
  }

  const candidates = eligibleCentroids.length ? eligibleCentroids : allCentroids;
  const nearest = nearestCentroidToBuilding(projectedBuilding.geometry, candidates);
  if (nearest && nearest.distance <= toleranceMeters) {
    return {
      centroid: nearest.centroid,
      siteCode: nearest.centroid.properties.site_code || siteCodeFromProperties(buildingFeature.properties || {}, null),
      linkStatus: "proximity",
      nbCentroide: 1,
      scoreFiabilite: 1,
      distanceToCentroid: roundMeters(nearest.distance)
    };
  }

  return {
    centroid: null,
    siteCode: siteCodeFromProperties(buildingFeature.properties || {}, null),
    linkStatus: "none",
    nbCentroide: 0,
    scoreFiabilite: -1,
    distanceToCentroid: null
  };
}

function nearestCentroidToBuilding(buildingGeometry, centroids) {
  const buildingPoint = projectedGeometryCentroid(buildingGeometry);
  if (!buildingPoint) {
    return null;
  }
  return centroids.reduce((nearest, centroid) => {
    const distance = euclideanDistanceMeters(buildingPoint, centroid.projected.geometry.coordinates);
    if (!nearest || distance < nearest.distance) {
      return { centroid, distance };
    }
    return nearest;
  }, null);
}

function projectedGeometryCentroid(geometry) {
  const polygons = geometryPolygons(geometry);
  if (!polygons.length) {
    return null;
  }
  const candidates = polygons.map((polygon) => ({
    point: ringCentroid(polygon[0]),
    area: planarRingArea(polygon[0])
  })).filter((candidate) => candidate.point);
  if (!candidates.length) {
    return null;
  }
  const totalArea = candidates.reduce((sum, candidate) => sum + candidate.area, 0);
  if (totalArea <= 0) {
    return candidates[0].point;
  }
  return [
    candidates.reduce((sum, candidate) => sum + (candidate.point[0] * candidate.area), 0) / totalArea,
    candidates.reduce((sum, candidate) => sum + (candidate.point[1] * candidate.area), 0) / totalArea
  ];
}

function ringCentroid(ring) {
  if (!Array.isArray(ring) || ring.length < 4) {
    return null;
  }
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    const cross = (x1 * y2) - (x2 * y1);
    twiceArea += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(twiceArea) < Number.EPSILON) {
    return bboxCenter(geometryBbox({ type: "Polygon", coordinates: [ring] }));
  }
  return [cx / (3 * twiceArea), cy / (3 * twiceArea)];
}

function planarRingArea(ring) {
  if (!Array.isArray(ring) || ring.length < 4) {
    return 0;
  }
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return Math.abs(area) / 2;
}

function euclideanDistanceMeters(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function roundMeters(value) {
  return Math.round(value * 100) / 100;
}

function compareCentroids(left, right) {
  const leftId = String(left.properties.id ?? left.properties.source_submission_id ?? left.sourceIndex);
  const rightId = String(right.properties.id ?? right.properties.source_submission_id ?? right.sourceIndex);
  return leftId.localeCompare(rightId, "fr", { numeric: true });
}

function siteCodeFromProperties(properties, index) {
  const value = properties.site_code
    ?? properties.code_site
    ?? properties.site_id
    ?? properties.id
    ?? (index === null ? null : `site-${index + 1}`);
  return value === undefined || value === null || value === "" ? null : String(value);
}

function projectFeatureToUtm30N(feature) {
  return {
    type: "Feature",
    properties: { ...(feature.properties || {}) },
    geometry: projectGeometryToUtm30N(feature.geometry)
  };
}

function projectGeometryToUtm30N(geometry) {
  if (!geometry) {
    return null;
  }
  if (geometry.type === "Point") {
    return { type: "Point", coordinates: lonLatToUtm30N(geometry.coordinates[0], geometry.coordinates[1]) };
  }
  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geometry.coordinates.map((ring) => ring.map(([lon, lat]) => lonLatToUtm30N(lon, lat)))
    };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geometry.coordinates.map((polygon) => (
        polygon.map((ring) => ring.map(([lon, lat]) => lonLatToUtm30N(lon, lat)))
      ))
    };
  }
  return cloneJson(geometry);
}

function lonLatToUtm30N(lon, lat) {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;
  const lonOriginRad = -3 * Math.PI / 180;
  const n = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
  const t = Math.tan(latRad) ** 2;
  const c = ep2 * Math.cos(latRad) ** 2;
  const aa = Math.cos(latRad) * (lonRad - lonOriginRad);
  const m = a * (
    (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * latRad
    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * latRad)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * latRad)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * latRad)
  );
  const easting = k0 * n * (
    aa
    + ((1 - t + c) * aa ** 3) / 6
    + ((5 - 18 * t + t ** 2 + 72 * c - 58 * ep2) * aa ** 5) / 120
  ) + 500000;
  const northing = k0 * (
    m + n * Math.tan(latRad) * (
      aa ** 2 / 2
      + ((5 - t + 9 * c + 4 * c ** 2) * aa ** 4) / 24
      + ((61 - 58 * t + t ** 2 + 600 * c - 330 * ep2) * aa ** 6) / 720
    )
  );
  return [easting, northing];
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function approximateIntersectionAreaM2(leftGeometry, rightGeometry, steps = 36) {
  const bbox = bboxIntersection(geometryBbox(leftGeometry), geometryBbox(rightGeometry));
  if (!bbox) {
    return 0;
  }
  const cellWidth = (bbox.maxLon - bbox.minLon) / steps;
  const cellHeight = (bbox.maxLat - bbox.minLat) / steps;
  if (cellWidth <= 0 || cellHeight <= 0) {
    return 0;
  }

  let inside = 0;
  for (let x = 0; x < steps; x += 1) {
    for (let y = 0; y < steps; y += 1) {
      const lon = bbox.minLon + (x + 0.5) * cellWidth;
      const lat = bbox.minLat + (y + 0.5) * cellHeight;
      if (pointInGeometry([lon, lat], leftGeometry) && pointInGeometry([lon, lat], rightGeometry)) {
        inside += 1;
      }
    }
  }
  return inside * projectedCellAreaM2(bbox, cellWidth, cellHeight);
}

function projectedCellAreaM2(bbox, widthDegrees, heightDegrees) {
  const meanLat = (bbox.minLat + bbox.maxLat) / 2;
  return Math.abs(widthDegrees * 111320 * Math.cos(meanLat * Math.PI / 180) * heightDegrees * 111320);
}

function pointInGeometry(point, geometry) {
  return geometryPolygons(geometry).some((polygon) => pointInPolygon(point, polygon));
}

function pointInPolygon(point, polygon) {
  const [lon, lat] = point;
  const outer = polygon[0];
  if (!pointInRing([lon, lat], outer)) {
    return false;
  }
  return polygon.slice(1).every((hole) => !pointInRing([lon, lat], hole));
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi) / ((yj - yi) || Number.EPSILON)) + xi);
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function geometryPolygons(geometry) {
  if (!geometry) {
    return [];
  }
  if (geometry.type === "Polygon") {
    return [normalizePolygon(geometry.coordinates)].filter(Boolean);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map(normalizePolygon).filter(Boolean);
  }
  return [];
}

function normalizePolygon(polygon) {
  if (!Array.isArray(polygon?.[0]) || polygon[0].length < 4) {
    return null;
  }
  return polygon
    .map((ring) => ring.map((point) => [Number(point[0]), Number(point[1])]))
    .filter((ring) => ring.length >= 4 && ring.every(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat)));
}

function geometryBbox(geometry) {
  const coordinates = coordinatesOf(geometry);
  if (!coordinates.length) {
    return null;
  }
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  coordinates.forEach(([lon, lat]) => {
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  });
  return Number.isFinite(minLon) ? { minLon, maxLon, minLat, maxLat } : null;
}

function coordinatesOf(geometry) {
  if (!geometry) {
    return [];
  }
  if (geometry.type === "Point") {
    return [geometry.coordinates];
  }
  if (geometry.type === "Polygon") {
    return geometry.coordinates.flat();
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flat(2);
  }
  if (geometry.type === "LineString") {
    return geometry.coordinates;
  }
  return [];
}

function bboxesIntersect(left, right) {
  if (!left || !right) {
    return false;
  }
  return left.minLon <= right.maxLon
    && left.maxLon >= right.minLon
    && left.minLat <= right.maxLat
    && left.maxLat >= right.minLat;
}

function bboxIntersection(left, right) {
  if (!bboxesIntersect(left, right)) {
    return null;
  }
  return {
    minLon: Math.max(left.minLon, right.minLon),
    maxLon: Math.min(left.maxLon, right.maxLon),
    minLat: Math.max(left.minLat, right.minLat),
    maxLat: Math.min(left.maxLat, right.maxLat)
  };
}

function bboxCenter(bbox) {
  return [(bbox.minLon + bbox.maxLon) / 2, (bbox.minLat + bbox.maxLat) / 2];
}

function polygonAreaM2(ring) {
  if (!Array.isArray(ring) || ring.length < 4) {
    return 0;
  }
  const meanLat = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = 111320 * Math.cos(meanLat * Math.PI / 180);
  const projected = ring.map(([lon, lat]) => [lon * metersPerDegreeLon, lat * metersPerDegreeLat]);
  let area = 0;
  for (let index = 0; index < projected.length - 1; index += 1) {
    area += projected[index][0] * projected[index + 1][1] - projected[index + 1][0] * projected[index][1];
  }
  return Math.abs(area) / 2;
}

function referenceId(feature, index, kind) {
  const props = feature.properties || {};
  return String(
    props.id
    ?? props.site_id
    ?? props.site_code
    ?? props.bat_num
    ?? `${kind}-${index + 1}`
  );
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeId(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : String(value).trim();
}

function formatNumber(value) {
  return Number(value || 0).toFixed(3);
}

function relativePath(filePath) {
  return path.relative(PROJECT_ROOT, filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(stripPrivateReferences(payload), null, 2)}\n`, "utf8");
}

function stripPrivateReferences(value) {
  if (Array.isArray(value)) {
    return value.map(stripPrivateReferences);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !key.startsWith("_"))
      .map(([key, entry]) => [key, stripPrivateReferences(entry)]));
  }
  return value;
}

module.exports = {
  DEFAULT_THRESHOLDS,
  DEFAULT_PROXIMITY_TOLERANCE_METERS,
  approximateIntersectionAreaM2,
  matchSites,
  pointInGeometry,
  processMatching,
  processMatchingOutputs,
  runMatchingEngine,
  runReferenceMatching,
  runSiteReferenceMatchingV2
};
