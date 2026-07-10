import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { extractKoboGeometryBatch } = require("../services/koboGeometryExtractor");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const DEFAULT_SOURCE = "KBase-docs/kobo-data-sample/kobo-response-2026-07-02T09-48-01-0072.json";
const DEFAULT_STRATEGY = "KBase-docs/kobo-data-analysis/extraction_scripts/kobo_geometry_parser_strategy_by_version.json";
const DEFAULT_OUTPUT = "KBase-docs/kobo-data-sample/kobo-response-2026-07-02T09-48-01-0072-geometries-normalized.json";
const BATCHES_ROOT = "KBase-docs/kobo-geometry-extractions/batches";

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelpAndExit();
  }
  const { sourcePath, strategyPath, outputPath } = resolveExecutionPaths(args);

  const sourcePayload = readJson(sourcePath);
  const strategy = readJson(strategyPath);
  const output = extractKoboGeometryBatch(sourcePayload, strategy);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  const warningCount = output.results.reduce(
    (total, result) => total + result.geometry_quality_report.warnings.length,
    0
  );
  const errorCount = output.results.reduce(
    (total, result) => total + result.geometry_quality_report.errors.length,
    0
  );
  const coordinateCorrectionCount = output.results.reduce(
    (total, result) => total + countCoordinateCorrections(result),
    0
  );

  console.log(JSON.stringify({
    ok: true,
    source_count: output.source_count,
    extracted_count: output.extracted_count,
    warning_count: warningCount,
    error_count: errorCount,
    coordinate_correction_count: coordinateCorrectionCount,
    source: path.relative(projectRoot, sourcePath),
    strategy: path.relative(projectRoot, strategyPath),
    output: path.relative(projectRoot, outputPath)
  }, null, 2));
}

function countCoordinateCorrections(result) {
  return [
    result.site_geometry,
    ...(result.building_geometries || []),
    result.raccordement_geometry,
    ...(result.pylone_geometries || [])
  ].filter(Boolean).reduce((total, geometry) => {
    const warnings = geometry.quality?.warnings || [];
    return total + warnings.filter((warning) => warning.code === "coordinate_lat_lon_inversion_corrected").length;
  }, 0);
}

function parseArgs(argv) {
  const parsed = {
    positional: []
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--batch") {
      parsed.batch = argv[index + 1];
      index += 1;
    } else if (arg === "--source") {
      parsed.source = argv[index + 1];
      index += 1;
    } else if (arg === "--strategy") {
      parsed.strategy = argv[index + 1];
      index += 1;
    } else if (arg === "--output") {
      parsed.output = argv[index + 1];
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`Argument inconnu: ${arg}`);
    } else {
      parsed.positional.push(arg);
    }
  }
  return parsed;
}

function resolveExecutionPaths(args) {
  if (args.batch) {
    return resolveBatchExecutionPaths(args);
  }

  const [sourceArg, strategyArg, outputArg] = args.positional;
  return {
    sourcePath: resolveProjectPath(sourceArg || DEFAULT_SOURCE),
    strategyPath: resolveProjectPath(strategyArg || DEFAULT_STRATEGY),
    outputPath: resolveProjectPath(outputArg || DEFAULT_OUTPUT)
  };
}

function resolveBatchExecutionPaths(args) {
  if (args.positional.length > 0) {
    throw new Error("Le mode --batch n'accepte pas les anciens arguments positionnels. Utilisez --source, --strategy ou --output.");
  }

  const batchPath = resolveBatchPath(args.batch);
  const sourcePath = args.source
    ? resolveBatchInputPath(batchPath, args.source, ["00_source", "00-source"])
    : resolveUniqueJsonFile(batchPath, ["00_source", "00-source"], "source Kobo", "--source");
  const strategyPath = args.strategy
    ? resolveStrategyPath(batchPath, args.strategy)
    : resolveDefaultStrategyPath(batchPath);
  const outputPath = args.output
    ? resolveProjectPath(args.output)
    : path.join(batchPath, "02_output", `${path.basename(sourcePath, path.extname(sourcePath))}-geometries-normalized.json`);

  return {
    sourcePath,
    strategyPath,
    outputPath
  };
}

function resolveBatchPath(batch) {
  const value = String(batch || "").trim();
  if (!value) {
    throw new Error("Le parametre --batch est vide.");
  }
  if (!path.isAbsolute(value) && (value.includes("/") || value.includes("\\") || value.includes(".."))) {
    throw new Error("Nom de batch invalide.");
  }

  const batchPath = path.isAbsolute(value)
    ? value
    : resolveProjectPath(path.join(BATCHES_ROOT, value));
  if (!fs.existsSync(batchPath) || !fs.statSync(batchPath).isDirectory()) {
    throw new Error(`Dossier batch introuvable: ${value}`);
  }
  return batchPath;
}

function resolveBatchInputPath(batchPath, inputPath, candidateDirs) {
  const explicitPath = path.isAbsolute(inputPath) ? inputPath : path.resolve(batchPath, inputPath);
  if (fs.existsSync(explicitPath) && fs.statSync(explicitPath).isFile()) {
    return explicitPath;
  }

  if (!path.isAbsolute(inputPath)) {
    for (const dirName of candidateDirs) {
      const candidate = path.join(batchPath, dirName, inputPath);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }

  throw new Error(`Fichier introuvable: ${inputPath}`);
}

function resolveStrategyPath(batchPath, strategyPath) {
  const batchCandidate = resolveOptionalBatchInputPath(batchPath, strategyPath, ["01_strategy"]);
  if (batchCandidate) {
    return batchCandidate;
  }
  const projectCandidate = resolveProjectPath(strategyPath);
  if (fs.existsSync(projectCandidate) && fs.statSync(projectCandidate).isFile()) {
    return projectCandidate;
  }
  throw new Error(`Strategie introuvable: ${strategyPath}`);
}

function resolveOptionalBatchInputPath(batchPath, inputPath, candidateDirs) {
  const explicitPath = path.isAbsolute(inputPath) ? inputPath : path.resolve(batchPath, inputPath);
  if (fs.existsSync(explicitPath) && fs.statSync(explicitPath).isFile()) {
    return explicitPath;
  }
  if (!path.isAbsolute(inputPath)) {
    for (const dirName of candidateDirs) {
      const candidate = path.join(batchPath, dirName, inputPath);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }
  return null;
}

function resolveDefaultStrategyPath(batchPath) {
  const strategyFiles = jsonFilesInDirectories(batchPath, ["01_strategy"]);
  if (strategyFiles.length === 1) {
    return strategyFiles[0];
  }
  if (strategyFiles.length > 1) {
    throw new Error("Plusieurs strategies detectees dans 01_strategy/. Precisez --strategy <fichier.json>.");
  }
  return resolveProjectPath(DEFAULT_STRATEGY);
}

function resolveUniqueJsonFile(batchPath, candidateDirs, label, optionName) {
  const files = jsonFilesInDirectories(batchPath, candidateDirs);
  if (files.length === 0) {
    throw new Error(`Aucun fichier ${label} JSON detecte dans ${candidateDirs.join(" ou ")}. Precisez ${optionName} <fichier.json>.`);
  }
  if (files.length > 1) {
    throw new Error(`Plusieurs fichiers ${label} detectes. Precisez ${optionName} <fichier.json>.`);
  }
  return files[0];
}

function jsonFilesInDirectories(batchPath, candidateDirs) {
  return candidateDirs
    .map((dirName) => path.join(batchPath, dirName))
    .filter((dirPath) => fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory())
    .flatMap((dirPath) => fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => path.join(dirPath, entry.name)))
    .sort();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveProjectPath(inputPath) {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(projectRoot, inputPath);
}

function printHelpAndExit() {
  console.log([
    "Usage:",
    "  node scripts/extract-kobo-geometries.mjs [source.json] [strategy.json] [output.json]",
    "  node scripts/extract-kobo-geometries.mjs --batch <batch> [--source <json>] [--strategy <json>] [--output <json>]",
    "",
    "Mode --batch:",
    "  - source automatique : fichier JSON unique dans 00_source/ ou 00-source/",
    "  - strategie automatique : fichier JSON unique dans 01_strategy/, sinon strategie par defaut du projet",
    "  - sortie automatique : 02_output/<source>-geometries-normalized.json"
  ].join("\n"));
  process.exit(0);
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error.message
  }, null, 2));
  process.exitCode = 1;
}
