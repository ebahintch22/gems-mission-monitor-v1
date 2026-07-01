import fs from "node:fs/promises";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeightRule,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType
} from "docx";

const args = process.argv.slice(2);
const outputFlagIndex = args.indexOf("--output");
const outputPath = outputFlagIndex >= 0
  ? args[outputFlagIndex + 1]
  : args[1] || "KBase-docs/FICHE_VERIFICATION_TERRAIN_BATIMENTS_MODELE.docx";
const inputPath = outputFlagIndex >= 0 ? args.find((arg, index) => index !== outputFlagIndex && index !== outputFlagIndex + 1) || "" : args[0] || "";

const CHECK = "☐";
const FONT = "Arial";
const MAX_MAIN_ROWS_PER_PAGE = 8;
const MAX_INTERCALARY_ROWS_PER_PAGE = 12;
const TABLE_HEADER_HEIGHT = 360;
const TABLE_BODY_HEIGHT = 520;
const COLORS = {
  ink: "182B37",
  muted: "5F7280",
  border: "D9E2E8",
  header: "D9F0EB",
  section: "EEF7F5",
  warning: "FFF7ED"
};

const DEFAULT_DATA = {
  site: {
    region: "",
    ministere: "",
    localite: "",
    code: "",
    site_name: "Nom du site",
    verification_team: "",
    verification_date: "",
    investigator_name: ""
  },
  map: {
    scale: "",
    source_date: "",
    source_label: "OpenStreetMap / extraction G2M"
  },
  options: {
    mainRows: MAX_MAIN_ROWS_PER_PAGE,
    intercalaryRows: MAX_INTERCALARY_ROWS_PER_PAGE,
    blankIntercalaryPages: 1
  },
  buildings: Array.from({ length: 24 }, (_, index) => ({
    map_number: `B${String(index + 1).padStart(2, "0")}`,
    kobo_number: "",
    building_name: index < 8 ? `Bâtiment ${index + 1}` : "",
    source_feature_id: "",
    properties: {}
  }))
};

const payload = inputPath ? mergeDefaults(JSON.parse(await fs.readFile(inputPath, "utf8"))) : DEFAULT_DATA;
const normalized = normalizePayload(payload);
const document = buildDocument(normalized);

await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await fs.writeFile(outputPath, await Packer.toBuffer(document));
console.log(`Fiche générée : ${path.resolve(outputPath)}`);

function mergeDefaults(input) {
  return {
    ...DEFAULT_DATA,
    ...input,
    site: { ...DEFAULT_DATA.site, ...(input.site || {}) },
    map: { ...DEFAULT_DATA.map, ...(input.map || {}) },
    options: { ...DEFAULT_DATA.options, ...(input.options || {}) }
  };
}

function normalizePayload(input) {
  const site = {
    ...DEFAULT_DATA.site,
    ...(input.site || {})
  };
  site.site_name = site.site_name || site.name || site.nom || "Nom du site";
  site.code = site.code || site.site_code || "";

  const features = Array.isArray(input.buildings?.features)
    ? input.buildings.features
    : Array.isArray(input.buildings)
      ? input.buildings
      : [];
  const buildings = features.map((feature, index) => {
    const properties = feature.properties || feature;
    return {
      map_number: properties.map_number
        || properties.building_export_index
        || properties.building_code
        || `B${String(index + 1).padStart(2, "0")}`,
      kobo_number: properties.kobo_number || "",
      building_name: properties.building_name || properties.name || properties.nom || "",
      source_feature_id: properties.source_feature_id || properties.source_reference || "",
      properties
    };
  });

  return {
    site,
    map: { ...DEFAULT_DATA.map, ...(input.map || {}) },
    options: { ...DEFAULT_DATA.options, ...(input.options || {}) },
    buildings: buildings.length ? buildings : DEFAULT_DATA.buildings
  };
}

function buildDocument(data) {
  return new Document({
    creator: "GEMS Mission Monitor",
    title: `Fiche de vérification terrain - ${data.site.site_name}`,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 20, color: COLORS.ink },
          paragraph: { spacing: { line: 240, after: 80 } }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 720, right: 540, bottom: 720, left: 540, header: 360, footer: 360 }
        }
      },
      headers: { default: buildHeader(data.site) },
      footers: { default: buildFooter() },
      children: buildPages(data)
    }]
  });
}

function buildHeader(site) {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          run("Fiche de vérification terrain – ", { bold: true, size: 18 }),
          run(site.site_name || "Site", { bold: true, size: 18 })
        ],
        spacing: { after: 40 }
      })
    ]
  });
}

function buildFooter() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          run("Page ", { size: 16, color: COLORS.muted }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: COLORS.muted }),
          run(" sur ", { size: 16, color: COLORS.muted }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: COLORS.muted })
        ],
        spacing: { before: 80, after: 0 }
      })
    ]
  });
}

function buildPages(data) {
  const rows = data.buildings;
  const mainRows = boundedRows(data.options.mainRows, MAX_MAIN_ROWS_PER_PAGE);
  const intercalaryRows = boundedRows(data.options.intercalaryRows, MAX_INTERCALARY_ROWS_PER_PAGE);
  const blankPages = Math.max(0, Number(data.options.blankIntercalaryPages) || 0);
  const pages = [];
  const mainPageRows = rows.slice(0, mainRows);

  pages.push(...buildMainPage(data, mainPageRows, mainRows));

  let offset = mainRows;
  let intercalaryIndex = 1;
  while (offset < rows.length) {
    pages.push(new Paragraph({ children: [new PageBreak()] }));
    pages.push(...buildIntercalaryPage(data, rows.slice(offset, offset + intercalaryRows), intercalaryRows, intercalaryIndex));
    offset += intercalaryRows;
    intercalaryIndex += 1;
  }

  for (let index = 0; index < blankPages; index += 1) {
    pages.push(new Paragraph({ children: [new PageBreak()] }));
    pages.push(...buildIntercalaryPage(data, [], intercalaryRows, intercalaryIndex));
    intercalaryIndex += 1;
  }

  return pages;
}

function boundedRows(value, maximum) {
  const rows = Number(value);
  return Math.max(1, Math.min(maximum, Number.isFinite(rows) ? rows : maximum));
}

function buildMainPage(data, pageRows, targetRows) {
  return [
    title("Fiche de contrôle terrain des bâtiments", 24),
    sectionTitle("1. Informations générales du site"),
    keyValueTable([
      ["Région", data.site.region, "Ministère", data.site.ministere],
      ["Localité", data.site.localite, "Code du site", data.site.code],
      ["Nom du site", data.site.site_name, "Équipe de vérification", data.site.verification_team],
      ["Date de vérification", data.site.verification_date, "Nom de l'enquêteur", data.site.investigator_name]
    ]),
    compactTwoColumns([
      [
        sectionTitle("2. Indicateurs avant vérification"),
        keyValueTable([
          ["Bâtiments sur la carte", String(data.buildings.length), "Bâtiments attribués", String(countAssigned(data.buildings))],
          ["Bâtiments non attribués", String(data.buildings.length - countAssigned(data.buildings)), "Échelle de la carte", data.map.scale],
          ["Source cartographique", data.map.source_label, "Date de la source", data.map.source_date]
        ])
      ],
      [
        sectionTitle("3. Indicateurs après vérification"),
        keyValueTable([
          ["Bâtiments vérifiés", "", "Conformes", ""],
          ["Omis", "", "Commis", ""],
          ["Scindés", "", "Regroupés", ""],
          ["Observations générales", "", "", ""]
        ])
      ]
    ]),
    sectionTitle("4. Relevés et annotations terrain"),
    hint("Type d'écart : aucun écart / omis / commis / scission / regroupement. Pour scission et regroupement, renseigner les bâtiments concernés et les numéros Kobo dans les commentaires."),
    verificationTable(pageRows, targetRows)
  ];
}

function buildIntercalaryPage(data, pageRows, targetRows, intercalaryIndex) {
  return [
    title(`Intercalaire n° ${intercalaryIndex}`, 20),
    keyValueTable([
      ["Code du site", data.site.code, "Nom du site", data.site.site_name],
      ["Numéro d'ordre de l'intercalaire", "", "Enquêteur", ""]
    ]),
    verificationTable(pageRows, targetRows),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [run("N° d'ordre intercalaire : ____________________", { bold: true, size: 18 })],
      spacing: { before: 120, after: 0 }
    })
  ];
}

function countAssigned(buildings) {
  return buildings.filter((building) => String(building.building_name || "").trim() !== "").length;
}

function verificationTable(buildings, targetRows) {
  const headers = [
    "N? carte",
    "N? Kobo",
    "Existence terrain",
    "Conformit? emprise",
    "?carts constat?s",
    "Type d'?cart",
    "B?timents concern?s (IDs carte)",
    "Affectation",
    "Croquis / dimensions",
    "Commentaires"
  ];
  const rows = [
    new TableRow({
      tableHeader: true,
      height: { value: TABLE_HEADER_HEIGHT, rule: HeightRule.EXACT },
      children: headers.map((header) => cell(header, { header: true, size: 15, compact: true }))
    })
  ];
  const sourceRows = [...buildings];
  while (sourceRows.length < targetRows) sourceRows.push({});
  sourceRows.slice(0, targetRows).forEach((building) => {
    rows.push(new TableRow({
      cantSplit: true,
      height: { value: TABLE_BODY_HEIGHT, rule: HeightRule.ATLEAST },
      children: [
        cell("", { size: 15, bold: true, compact: true }),
        cell(building.kobo_number || "", { size: 15, compact: true }),
        cell(`${CHECK} Oui\n${CHECK} Non\n${CHECK} Partiel`, { size: 14, compact: true }),
        cell(`${CHECK} Oui\n${CHECK} Non\n${CHECK} N/C`, { size: 14, compact: true }),
        cell("", { size: 14, compact: true }),
        cell("Aucun / Omis / Commis / Scission / Regroupement", { size: 14, compact: true }),
        cell("", { size: 14, compact: true }),
        cell("Admin. / Scolaire / Sanitaire / Logement / Autre", { size: 14, compact: true }),
        cell("Long. ___ m\nLarg. ___ m\nCroquis r?f. ___", { size: 14, compact: true }),
        cell("", { size: 14, compact: true })
      ]
    }));
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: tableBorders(),
    rows
  });
}

function keyValueTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders(),
    rows: rows.map((row) => new TableRow({
      children: [
        cell(row[0], { header: true, width: 14, size: 17 }),
        cell(row[1] || "", { width: 36, size: 17 }),
        cell(row[2] || "", { header: Boolean(row[2]), width: 14, size: 17 }),
        cell(row[3] || "", { width: 36, size: 17 })
      ]
    }))
  });
}

function compactTwoColumns(columns) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders(),
    rows: [
      new TableRow({
        children: columns.map((items) => new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          margins: { top: 80, bottom: 80, left: 80, right: 80 },
          children: items
        }))
      })
    ]
  });
}

function title(text, size = 22) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [run(text, { bold: true, size })],
    spacing: { before: 120, after: 140 }
  });
}

function sectionTitle(text) {
  return new Paragraph({
    children: [run(text, { bold: true, size: 20 })],
    shading: { fill: COLORS.section },
    spacing: { before: 100, after: 70 }
  });
}

function hint(text) {
  return new Paragraph({
    children: [run(text, { italics: true, color: COLORS.muted, size: 16 })],
    spacing: { before: 0, after: 70 }
  });
}

function cell(text, options = {}) {
  const margin = options.compact ? 30 : 45;
  return new TableCell({
    width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
    shading: options.header ? { fill: COLORS.header } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: margin, bottom: margin, left: 45, right: 45 },
    children: [
      new Paragraph({
        children: [run(String(text ?? ""), {
          bold: options.bold || options.header,
          size: options.size || 18,
          color: options.header ? COLORS.ink : COLORS.ink
        })],
        spacing: { after: 0 }
      })
    ]
  });
}

function run(text, options = {}) {
  return new TextRun({
    text,
    font: FONT,
    size: options.size || 20,
    bold: options.bold,
    italics: options.italics,
    color: options.color || COLORS.ink
  });
}

function tableBorders() {
  return {
    top: { style: BorderStyle.SINGLE, color: COLORS.border, size: 1 },
    bottom: { style: BorderStyle.SINGLE, color: COLORS.border, size: 1 },
    left: { style: BorderStyle.SINGLE, color: COLORS.border, size: 1 },
    right: { style: BorderStyle.SINGLE, color: COLORS.border, size: 1 },
    insideHorizontal: { style: BorderStyle.SINGLE, color: COLORS.border, size: 1 },
    insideVertical: { style: BorderStyle.SINGLE, color: COLORS.border, size: 1 }
  };
}

function noBorders() {
  return {
    top: { style: BorderStyle.NONE },
    bottom: { style: BorderStyle.NONE },
    left: { style: BorderStyle.NONE },
    right: { style: BorderStyle.NONE },
    insideHorizontal: { style: BorderStyle.NONE },
    insideVertical: { style: BorderStyle.NONE }
  };
}
