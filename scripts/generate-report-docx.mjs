import fs from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";

const inputPath = process.argv[2] || "RAPPORT_TECHNIQUE.md";
const outputPath = process.argv[3] || inputPath.replace(/\.md$/i, ".docx");
const markdown = await fs.readFile(inputPath, "utf8");

function textRun(text, formatting = {}) {
  return new TextRun({ text, ...formatting });
}

function inlineRuns(tokens = [], formatting = {}) {
  return tokens.flatMap((token) => {
    switch (token.type) {
      case "text":
        return token.tokens ? inlineRuns(token.tokens, formatting) : [textRun(token.text, formatting)];
      case "strong":
        return inlineRuns(token.tokens, { ...formatting, bold: true });
      case "em":
        return inlineRuns(token.tokens, { ...formatting, italics: true });
      case "codespan":
        return [textRun(token.text, { ...formatting, font: "Courier New", shading: { fill: "E9EEF2" } })];
      case "link":
        return [...inlineRuns(token.tokens, formatting), textRun(` (${token.href})`, { ...formatting, color: "006B5B" })];
      case "br":
        return [new TextRun({ break: 1 })];
      default:
        return token.text ? [textRun(token.text)] : [];
    }
  });
}

function paragraphFromToken(token, options = {}) {
  return new Paragraph({
    children: inlineRuns(token.tokens || [{ type: "text", text: token.text || "" }]),
    spacing: { after: 130 },
    ...options
  });
}

function tableCell(cell, header = false) {
  return new TableCell({
    shading: header ? { fill: "D9F0EB" } : undefined,
    children: [
      new Paragraph({
        children: inlineRuns(cell.tokens || [{ type: "text", text: cell.text || "" }]),
        spacing: { after: 0 }
      })
    ]
  });
}

function convertBlocks(tokens, listLevel = 0) {
  const blocks = [];

  tokens.forEach((token) => {
    switch (token.type) {
      case "heading": {
        const headings = {
          1: HeadingLevel.TITLE,
          2: HeadingLevel.HEADING_1,
          3: HeadingLevel.HEADING_2,
          4: HeadingLevel.HEADING_3
        };
        blocks.push(paragraphFromToken(token, {
          heading: headings[token.depth] || HeadingLevel.HEADING_3,
          spacing: { before: token.depth === 1 ? 0 : 260, after: 140 }
        }));
        break;
      }
      case "paragraph":
        blocks.push(paragraphFromToken(token));
        break;
      case "list":
        token.items.forEach((item, index) => {
          const first = item.tokens.find((child) => child.type === "text" || child.type === "paragraph");
          const content = first || { type: "text", text: item.text };
          blocks.push(paragraphFromToken(content, token.ordered
            ? { numbering: { reference: "report-numbering", level: listLevel } }
            : { bullet: { level: listLevel } }));
          const nested = item.tokens.filter((child) => child.type === "list");
          blocks.push(...convertBlocks(nested, listLevel + 1));
        });
        break;
      case "table":
        blocks.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, color: "D9E2E8", size: 1 },
            bottom: { style: BorderStyle.SINGLE, color: "D9E2E8", size: 1 },
            left: { style: BorderStyle.SINGLE, color: "D9E2E8", size: 1 },
            right: { style: BorderStyle.SINGLE, color: "D9E2E8", size: 1 },
            insideHorizontal: { style: BorderStyle.SINGLE, color: "D9E2E8", size: 1 },
            insideVertical: { style: BorderStyle.SINGLE, color: "D9E2E8", size: 1 }
          },
          rows: [
            new TableRow({ children: token.header.map((cell) => tableCell(cell, true)) }),
            ...token.rows.map((row) => new TableRow({
              children: row.map((cell) => tableCell(cell))
            }))
          ]
        }));
        blocks.push(new Paragraph({ text: "", spacing: { after: 80 } }));
        break;
      case "code":
        blocks.push(new Paragraph({
          children: [textRun(token.text, { font: "Courier New", size: 18 })],
          shading: { fill: "F1F4F5" },
          spacing: { before: 80, after: 160 },
          indent: { left: 220, right: 220 }
        }));
        break;
      case "space":
      case "hr":
        break;
      default:
        if (token.text) {
          blocks.push(new Paragraph({ text: token.text }));
        }
    }
  });

  return blocks;
}

const document = new Document({
  creator: "GEMS Mission Monitor",
  title: "Rapport technique - Socle GEMS Mission Monitor",
  numbering: {
    config: [{
      reference: "report-numbering",
      levels: [{
        level: 0,
        format: "decimal",
        text: "%1.",
        alignment: AlignmentType.START,
        style: { paragraph: { indent: { left: 360, hanging: 240 } } }
      }]
    }]
  },
  styles: {
    default: {
      document: {
        run: { font: "Arial", size: 21, color: "182B37" },
        paragraph: { spacing: { line: 280 } }
      }
    }
  },
  sections: [{
    properties: {
      page: {
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
      }
    },
    children: convertBlocks(marked.lexer(markdown))
  }]
});

await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await fs.writeFile(outputPath, await Packer.toBuffer(document));
console.log(`Document genere : ${path.resolve(outputPath)}`);
