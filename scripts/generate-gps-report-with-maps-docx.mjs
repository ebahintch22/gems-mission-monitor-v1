import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import zlib from "node:zlib";
import { marked } from "marked";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";

const inputMarkdownPath = process.argv[2];
const inputKoboPath = process.argv[3];
const outputPath = process.argv[4];

if (!inputMarkdownPath || !inputKoboPath || !outputPath) {
  console.error("Usage: node scripts/generate-gps-report-with-maps-docx.mjs <report.md> <kobo.json> <output.docx>");
  process.exit(1);
}

const markdown = await fs.readFile(inputMarkdownPath, "utf8");
const koboPayload = JSON.parse(await fs.readFile(inputKoboPath, "utf8"));
const submissions = koboPayload.response?.results || [];
const tileCacheDir = path.join(path.dirname(inputKoboPath), "osm-tile-cache");
const osmEnabled = process.env.G2M_OSM_DISABLED !== "1";

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
        return token.text ? [textRun(token.text, formatting)] : [];
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
        token.items.forEach((item) => {
          const first = item.tokens.find((child) => child.type === "text" || child.type === "paragraph");
          const content = first || { type: "text", text: item.text };
          blocks.push(paragraphFromToken(content, token.ordered
            ? { numbering: { reference: "report-numbering", level: listLevel } }
            : { bullet: { level: listLevel } }));
          blocks.push(...convertBlocks(item.tokens.filter((child) => child.type === "list"), listLevel + 1));
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
            ...token.rows.map((row) => new TableRow({ children: row.map((cell) => tableCell(cell)) }))
          ]
        }));
        blocks.push(new Paragraph({ text: "", spacing: { after: 80 } }));
        break;
      default:
        if (token.text) blocks.push(new Paragraph({ text: token.text }));
    }
  });
  return blocks;
}

function isFilled(value) {
  return value !== null && value !== undefined && !(typeof value === "string" && value.trim() === "");
}

function parseKoboPoint(value) {
  if (!isFilled(value)) return null;
  if (Array.isArray(value) && value.length >= 2) {
    const lat = Number(value[0]);
    const lon = Number(value[1]);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  }
  const parts = String(value).trim().split(/[ ,]+/).map(Number).filter(Number.isFinite);
  if (parts.length < 2) return null;
  return { lat: parts[0], lon: parts[1] };
}

function parseKoboShape(value) {
  if (!isFilled(value)) return [];
  return String(value).split(";").map((part) => parseKoboPoint(part)).filter(Boolean);
}

function parseTextCoordinates(value) {
  if (!isFilled(value)) return [];
  const points = [];
  const lines = String(value).replace(/\r/g, "\n").split("\n");
  for (const line of lines) {
    const koboPoint = parseKoboPoint(line);
    if (koboPoint && Math.abs(koboPoint.lat) <= 90 && Math.abs(koboPoint.lon) <= 180) {
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
        if (Number.isFinite(lat) && Number.isFinite(lon)) points.push({ lat, lon });
      }
    }
  }
  return points;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function colorToRgba(color, alpha = 1) {
  const named = {
    "#f8fafc": [248, 250, 252],
    "#eef6f8": [238, 246, 248],
    "#cbd5e1": [203, 213, 225],
    "#dbe5ea": [219, 229, 234],
    "#182B37": [24, 43, 55],
    "#64748b": [100, 116, 139],
    "#475569": [71, 85, 105],
    "#334155": [51, 65, 85],
    "#e11d48": [225, 29, 72],
    "#dc2626": [220, 38, 38],
    "#2563eb": [37, 99, 235],
    "#1d4ed8": [29, 78, 216],
    "#16a34a": [22, 163, 74],
    "#0f766e": [15, 118, 110],
    "#111827": [17, 24, 39],
    "#374151": [55, 65, 81],
    "#7c3aed": [124, 58, 237],
    "#a855f7": [168, 85, 247],
    "#c084fc": [192, 132, 252],
    "#f97316": [249, 115, 22],
    "#fb923c": [251, 146, 60],
    "#ffffff": [255, 255, 255]
  };
  const rgb = named[color] || [0, 0, 0];
  return [rgb[0], rgb[1], rgb[2], Math.round(alpha * 255)];
}

function createCanvas(width, height, background = "#f8fafc") {
  const pixels = new Uint8Array(width * height * 4);
  const [r, g, b, a] = colorToRgba(background);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = a;
  }
  return { width, height, pixels };
}

function blendPixel(canvas, x, y, color, alpha = 1) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= canvas.width || iy >= canvas.height) return;
  const [r, g, b, a] = colorToRgba(color, alpha);
  const offset = (iy * canvas.width + ix) * 4;
  const sourceAlpha = a / 255;
  const destAlpha = canvas.pixels[offset + 3] / 255;
  const outAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);
  if (outAlpha === 0) return;
  canvas.pixels[offset] = Math.round((r * sourceAlpha + canvas.pixels[offset] * destAlpha * (1 - sourceAlpha)) / outAlpha);
  canvas.pixels[offset + 1] = Math.round((g * sourceAlpha + canvas.pixels[offset + 1] * destAlpha * (1 - sourceAlpha)) / outAlpha);
  canvas.pixels[offset + 2] = Math.round((b * sourceAlpha + canvas.pixels[offset + 2] * destAlpha * (1 - sourceAlpha)) / outAlpha);
  canvas.pixels[offset + 3] = Math.round(outAlpha * 255);
}

function drawRect(canvas, x, y, width, height, fill, stroke = null) {
  for (let yy = Math.round(y); yy < Math.round(y + height); yy += 1) {
    for (let xx = Math.round(x); xx < Math.round(x + width); xx += 1) {
      blendPixel(canvas, xx, yy, fill);
    }
  }
  if (stroke) {
    drawLine(canvas, x, y, x + width, y, stroke, 1);
    drawLine(canvas, x + width, y, x + width, y + height, stroke, 1);
    drawLine(canvas, x + width, y + height, x, y + height, stroke, 1);
    drawLine(canvas, x, y + height, x, y, stroke, 1);
  }
}

function drawCircle(canvas, cx, cy, radius, color, stroke = null) {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius - 1); y <= Math.ceil(cy + radius + 1); y += 1) {
    for (let x = Math.floor(cx - radius - 1); x <= Math.ceil(cx + radius + 1); x += 1) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 <= r2) blendPixel(canvas, x, y, color);
    }
  }
  if (stroke) {
    for (let y = Math.floor(cy - radius - 2); y <= Math.ceil(cy + radius + 2); y += 1) {
      for (let x = Math.floor(cx - radius - 2); x <= Math.ceil(cx + radius + 2); x += 1) {
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (Math.abs(d - radius) <= 1.2) blendPixel(canvas, x, y, stroke);
      }
    }
  }
}

function drawLine(canvas, x1, y1, x2, y2, color, width = 2, dash = false) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= steps; i += 1) {
    if (dash && Math.floor(i / 8) % 2 === 1) continue;
    const x = x1 + dx * i / steps;
    const y = y1 + dy * i / steps;
    for (let ox = -Math.floor(width / 2); ox <= Math.floor(width / 2); ox += 1) {
      for (let oy = -Math.floor(width / 2); oy <= Math.floor(width / 2); oy += 1) {
        blendPixel(canvas, x + ox, y + oy, color);
      }
    }
  }
}

function pointInPixelPolygon(px, py, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function drawPolygon(canvas, points, stroke, fill = null, dash = false) {
  if (fill && points.length >= 3) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y += 1) {
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x += 1) {
        if (pointInPixelPolygon(x, y, points)) blendPixel(canvas, x, y, fill.color, fill.alpha);
      }
    }
  }
  for (let i = 1; i < points.length; i += 1) {
    drawLine(canvas, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y, stroke, 3, dash);
  }
  if (points.length > 2) {
    drawLine(canvas, points.at(-1).x, points.at(-1).y, points[0].x, points[0].y, stroke, 3, dash);
  }
}

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(canvas) {
  const raw = Buffer.alloc((canvas.width * 4 + 1) * canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    const rowStart = y * (canvas.width * 4 + 1);
    raw[rowStart] = 0;
    Buffer.from(canvas.pixels.buffer, canvas.pixels.byteOffset + y * canvas.width * 4, canvas.width * 4)
      .copy(raw, rowStart + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(canvas.width, 0);
  header.writeUInt32BE(canvas.height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buffer) {
  const signature = buffer.subarray(0, 8);
  if (!signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("Format PNG invalide");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  let transparency = null;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") {
      palette = [];
      for (let i = 0; i < data.length; i += 3) {
        palette.push([data[i], data[i + 1], data[i + 2], 255]);
      }
    } else if (type === "tRNS") {
      transparency = data;
      if (palette) {
        for (let i = 0; i < data.length && i < palette.length; i += 1) {
          palette[i][3] = data[i];
        }
      }
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (bitDepth !== 8 || interlace !== 0) {
    throw new Error(`PNG non supporté (bitDepth=${bitDepth}, interlace=${interlace})`);
  }
  const bytesPerPixel = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!bytesPerPixel) {
    throw new Error(`Type PNG non supporté (${colorType})`);
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const scanlineLength = width * bytesPerPixel;
  const unfiltered = Buffer.alloc(height * scanlineLength);
  let rawOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset++];
    const line = raw.subarray(rawOffset, rawOffset + scanlineLength);
    rawOffset += scanlineLength;
    const outOffset = y * scanlineLength;
    for (let x = 0; x < scanlineLength; x += 1) {
      const left = x >= bytesPerPixel ? unfiltered[outOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? unfiltered[outOffset + x - scanlineLength] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? unfiltered[outOffset + x - scanlineLength - bytesPerPixel] : 0;
      let value = line[x];
      if (filter === 1) value = (value + left) & 255;
      else if (filter === 2) value = (value + up) & 255;
      else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) value = (value + paethPredictor(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`Filtre PNG non supporté (${filter})`);
      unfiltered[outOffset + x] = value;
    }
  }
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0, p = 0; i < unfiltered.length; p += 4) {
    if (colorType === 0) {
      const gray = unfiltered[i++];
      pixels[p] = gray; pixels[p + 1] = gray; pixels[p + 2] = gray; pixels[p + 3] = 255;
    } else if (colorType === 2) {
      pixels[p] = unfiltered[i++]; pixels[p + 1] = unfiltered[i++]; pixels[p + 2] = unfiltered[i++]; pixels[p + 3] = 255;
    } else if (colorType === 3) {
      const rgba = palette?.[unfiltered[i++]] || [0, 0, 0, 0];
      pixels[p] = rgba[0]; pixels[p + 1] = rgba[1]; pixels[p + 2] = rgba[2]; pixels[p + 3] = rgba[3];
    } else if (colorType === 4) {
      const gray = unfiltered[i++];
      pixels[p] = gray; pixels[p + 1] = gray; pixels[p + 2] = gray; pixels[p + 3] = unfiltered[i++];
    } else if (colorType === 6) {
      pixels[p] = unfiltered[i++]; pixels[p + 1] = unfiltered[i++]; pixels[p + 2] = unfiltered[i++]; pixels[p + 3] = unfiltered[i++];
    }
  }
  return { width, height, pixels };
}

function drawImage(canvas, image, dx, dy, alpha = 1) {
  for (let sy = 0; sy < image.height; sy += 1) {
    const ty = Math.round(dy + sy);
    if (ty < 0 || ty >= canvas.height) continue;
    for (let sx = 0; sx < image.width; sx += 1) {
      const tx = Math.round(dx + sx);
      if (tx < 0 || tx >= canvas.width) continue;
      const sourceOffset = (sy * image.width + sx) * 4;
      const sourceAlpha = image.pixels[sourceOffset + 3] / 255 * alpha;
      if (sourceAlpha <= 0) continue;
      const destOffset = (ty * canvas.width + tx) * 4;
      const destAlpha = canvas.pixels[destOffset + 3] / 255;
      const outAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);
      canvas.pixels[destOffset] = Math.round((image.pixels[sourceOffset] * sourceAlpha + canvas.pixels[destOffset] * destAlpha * (1 - sourceAlpha)) / outAlpha);
      canvas.pixels[destOffset + 1] = Math.round((image.pixels[sourceOffset + 1] * sourceAlpha + canvas.pixels[destOffset + 1] * destAlpha * (1 - sourceAlpha)) / outAlpha);
      canvas.pixels[destOffset + 2] = Math.round((image.pixels[sourceOffset + 2] * sourceAlpha + canvas.pixels[destOffset + 2] * destAlpha * (1 - sourceAlpha)) / outAlpha);
      canvas.pixels[destOffset + 3] = Math.round(outAlpha * 255);
    }
  }
}

function lonLatToWorld(lon, lat, zoom) {
  const sinLat = Math.sin(lat * Math.PI / 180);
  const scale = 256 * 2 ** zoom;
  return {
    x: (lon + 180) / 360 * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
  };
}

function clampTile(value, zoom) {
  return Math.max(0, Math.min(2 ** zoom - 1, value));
}

async function fetchTile(zoom, x, y) {
  const cachePath = path.join(tileCacheDir, String(zoom), String(x), `${y}.png`);
  try {
    return await fs.readFile(cachePath);
  } catch {
    // Cache miss.
  }
  const url = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
  const data = await new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: { "User-Agent": "G2M-GPS-QA-Report/1.0 (local report generation)" }
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Tuile OSM indisponible ${response.statusCode}: ${url}`));
        return;
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    request.on("error", reject);
    request.setTimeout(15000, () => request.destroy(new Error(`Timeout OSM: ${url}`)));
  });
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, data);
  return data;
}

function validMapPoints(points) {
  const valid = points.filter((point) => point.lon >= -8.7 && point.lon <= -2.4 && point.lat >= 4 && point.lat <= 10.8);
  return valid.length ? valid : points;
}

function chooseZoom(points, mapWidth, mapHeight) {
  for (let zoom = 18; zoom >= 11; zoom -= 1) {
    const projected = points.map((point) => lonLatToWorld(point.lon, point.lat, zoom));
    const width = Math.max(...projected.map((p) => p.x)) - Math.min(...projected.map((p) => p.x));
    const height = Math.max(...projected.map((p) => p.y)) - Math.min(...projected.map((p) => p.y));
    if (width <= mapWidth * 0.76 && height <= mapHeight * 0.76) {
      return zoom;
    }
  }
  return 11;
}

async function drawOsmBackground(canvas, points, viewport) {
  if (!osmEnabled || !points.length) return null;
  const mapPoints = validMapPoints(points);
  const zoom = chooseZoom(mapPoints, viewport.width, viewport.height);
  const projected = mapPoints.map((point) => lonLatToWorld(point.lon, point.lat, zoom));
  const center = {
    x: (Math.min(...projected.map((p) => p.x)) + Math.max(...projected.map((p) => p.x))) / 2,
    y: (Math.min(...projected.map((p) => p.y)) + Math.max(...projected.map((p) => p.y))) / 2
  };
  const topLeft = {
    x: center.x - viewport.width / 2,
    y: center.y - viewport.height / 2
  };
  const minTileX = clampTile(Math.floor(topLeft.x / 256), zoom);
  const maxTileX = clampTile(Math.floor((topLeft.x + viewport.width) / 256), zoom);
  const minTileY = clampTile(Math.floor(topLeft.y / 256), zoom);
  const maxTileY = clampTile(Math.floor((topLeft.y + viewport.height) / 256), zoom);
  for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      const buffer = await fetchTile(zoom, tileX, tileY);
      const image = decodePng(buffer);
      drawImage(
        canvas,
        image,
        viewport.x + tileX * 256 - topLeft.x,
        viewport.y + tileY * 256 - topLeft.y,
        0.36
      );
    }
  }
  return {
    zoom,
    project(point) {
      const projectedPoint = lonLatToWorld(point.lon, point.lat, zoom);
      return {
        x: viewport.x + projectedPoint.x - topLeft.x,
        y: viewport.y + projectedPoint.y - topLeft.y
      };
    }
  };
}

function collectSiteGeometry(row) {
  const geometries = [];
  const points = [];
  const addPoint = (label, value, color, radius = 5) => {
    const point = parseKoboPoint(value);
    if (point) {
      points.push(point);
      geometries.push({ kind: "point", label, point, color, radius });
    }
  };
  const addPointList = (label, values, color, radius = 4) => {
    values.filter(Boolean).forEach((point) => {
      points.push(point);
      geometries.push({ kind: "point", label, point, color, radius });
    });
  };
  const addPolygon = (label, value, color, fill, dash = "") => {
    const polygon = parseKoboShape(value);
    if (polygon.length >= 2) {
      points.push(...polygon);
      geometries.push({ kind: "polygon", label, points: polygon, color, fill, dash });
    }
  };
  const addManualLine = (label, value, color) => {
    const line = parseTextCoordinates(value);
    if (line.length >= 2) {
      points.push(...line);
      geometries.push({ kind: "line", label, points: line, color, dash: "6 5" });
    } else if (line.length === 1) {
      addPointList(label, line, color, 4);
    }
  };

  addPoint("_geolocation", row._geolocation, "#e11d48", 5);
  addPoint("gps_site", row["modA/gps_site"], "#dc2626", 6);
  addPoint("gps_centre", row["modA/gps_centre"], "#2563eb", 5);
  addPolygon("emprise_site", row["modB/emprise_site"], "#1d4ed8", "rgba(37,99,235,0.12)");
  addManualLine("emprise_site_manuel", row["modB/emprise_site_manuel"], "#16a34a");
  addManualLine("gps_manuel", row["modA/gps_manuel"], "#0f766e");
  addPoint("gps_raccord", row["modH/gps_raccord"], "#111827", 5);
  addManualLine("gps_raccord_manuel", row["modH/gps_raccord_manuel"], "#374151");

  for (const item of row["modE/pylone_rep"] || []) {
    addPoint("pylône", item["modE/pylone_rep/gps_pylone"], "#7c3aed", 4);
    addPointList("pylône manuel", parseTextCoordinates(item["modE/pylone_rep/gps_pylone_manuel"]), "#a855f7", 4);
    addPointList("pylône coords", parseTextCoordinates(item["modE/pylone_rep/gps_pylone_coords"]), "#c084fc", 4);
  }

  for (const item of row.batiment || []) {
    addPolygon("bâtiment", item["batiment/coins_bat"], "#f97316", "rgba(249,115,22,0.16)");
    addPointList("bâtiment coords", parseTextCoordinates(item["batiment/coins_bat_coords"]), "#fb923c", 3);
  }

  return { geometries, points };
}

function svgMap(row) {
  const id = row._id || "sans-id";
  const siteName = String(row["modB/nom_officiel"] || "Site non renseigné").replace(/\s+/g, " ").trim();
  const { geometries, points } = collectSiteGeometry(row);
  const width = 900;
  const height = 560;
  const margin = 54;
  if (!points.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#f8fafc"/>
      <text x="36" y="52" font-family="Arial" font-size="24" font-weight="700" fill="#182B37">${escapeXml(id)} - ${escapeXml(siteName)}</text>
      <text x="36" y="104" font-family="Arial" font-size="18" fill="#64748b">Aucune géométrie exploitable pour cette soumission.</text>
    </svg>`;
  }
  let minLat = Math.min(...points.map((p) => p.lat));
  let maxLat = Math.max(...points.map((p) => p.lat));
  let minLon = Math.min(...points.map((p) => p.lon));
  let maxLon = Math.max(...points.map((p) => p.lon));
  const latPad = Math.max((maxLat - minLat) * 0.12, 0.0004);
  const lonPad = Math.max((maxLon - minLon) * 0.12, 0.0004);
  minLat -= latPad; maxLat += latPad; minLon -= lonPad; maxLon += lonPad;
  const x = (lon) => margin + ((lon - minLon) / ((maxLon - minLon) || 1)) * (width - margin * 2);
  const y = (lat) => margin + ((maxLat - lat) / ((maxLat - minLat) || 1)) * (height - margin * 2 - 68) + 50;
  const pointList = (list) => list.map((p) => `${x(p.lon).toFixed(1)},${y(p.lat).toFixed(1)}`).join(" ");
  const shapes = [];
  shapes.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#f8fafc"/>`);
  shapes.push(`<rect x="${margin}" y="${margin + 50}" width="${width - margin * 2}" height="${height - margin * 2 - 68}" fill="#eef6f8" stroke="#cbd5e1" stroke-width="1"/>`);
  for (let i = 1; i <= 4; i += 1) {
    const gx = margin + i * (width - margin * 2) / 5;
    const gy = margin + 50 + i * (height - margin * 2 - 68) / 5;
    shapes.push(`<line x1="${gx}" y1="${margin + 50}" x2="${gx}" y2="${height - margin - 18}" stroke="#dbe5ea" stroke-width="1"/>`);
    shapes.push(`<line x1="${margin}" y1="${gy}" x2="${width - margin}" y2="${gy}" stroke="#dbe5ea" stroke-width="1"/>`);
  }
  for (const geometry of geometries.filter((item) => item.kind !== "point")) {
    if (geometry.kind === "polygon") {
      shapes.push(`<polygon points="${pointList(geometry.points)}" fill="${geometry.fill}" stroke="${geometry.color}" stroke-width="2" stroke-dasharray="${geometry.dash}"/>`);
    } else {
      shapes.push(`<polyline points="${pointList(geometry.points)}" fill="none" stroke="${geometry.color}" stroke-width="2" stroke-dasharray="${geometry.dash}"/>`);
    }
  }
  for (const geometry of geometries.filter((item) => item.kind === "point")) {
    shapes.push(`<circle cx="${x(geometry.point.lon).toFixed(1)}" cy="${y(geometry.point.lat).toFixed(1)}" r="${geometry.radius}" fill="${geometry.color}" stroke="#fff" stroke-width="1.5"/>`);
  }
  const legend = [
    ["#dc2626", "Site"],
    ["#2563eb", "Centre"],
    ["#1d4ed8", "Emprise"],
    ["#f97316", "Bâtiment"],
    ["#7c3aed", "Pylône"],
    ["#111827", "Raccordement"]
  ];
  shapes.push(`<text x="36" y="34" font-family="Arial" font-size="22" font-weight="700" fill="#182B37">${escapeXml(id)} - ${escapeXml(siteName)}</text>`);
  shapes.push(`<text x="36" y="58" font-family="Arial" font-size="13" fill="#64748b">Carte schématique des données spatiales collectées - WGS84</text>`);
  shapes.push(`<text x="${margin}" y="${height - 20}" font-family="Arial" font-size="12" fill="#475569">Bbox locale : lon ${minLon.toFixed(6)} à ${maxLon.toFixed(6)} ; lat ${minLat.toFixed(6)} à ${maxLat.toFixed(6)}</text>`);
  legend.forEach(([color, label], index) => {
    const lx = 610 + (index % 2) * 130;
    const ly = 34 + Math.floor(index / 2) * 20;
    shapes.push(`<circle cx="${lx}" cy="${ly - 4}" r="5" fill="${color}"/>`);
    shapes.push(`<text x="${lx + 11}" y="${ly}" font-family="Arial" font-size="12" fill="#334155">${escapeXml(label)}</text>`);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${shapes.join("")}</svg>`;
}

async function pngMap(row) {
  const { geometries, points } = collectSiteGeometry(row);
  const width = 900;
  const height = 560;
  const margin = 54;
  const viewport = {
    x: margin,
    y: margin + 50,
    width: width - margin * 2,
    height: height - margin * 2 - 68
  };
  const canvas = createCanvas(width, height, "#f8fafc");
  drawRect(canvas, viewport.x, viewport.y, viewport.width, viewport.height, "#eef6f8", "#cbd5e1");
  for (let i = 1; i <= 4; i += 1) {
    const gx = viewport.x + i * viewport.width / 5;
    const gy = viewport.y + i * viewport.height / 5;
    drawLine(canvas, gx, viewport.y, gx, viewport.y + viewport.height, "#dbe5ea", 1);
    drawLine(canvas, viewport.x, gy, viewport.x + viewport.width, gy, "#dbe5ea", 1);
  }
  if (!points.length) {
    return encodePng(canvas);
  }
  let projection = null;
  try {
    projection = await drawOsmBackground(canvas, points, viewport);
  } catch (error) {
    console.warn(`Fond OSM indisponible pour ${row._id || "site"} : ${error.message}`);
  }
  if (!projection) {
    let minLat = Math.min(...points.map((p) => p.lat));
    let maxLat = Math.max(...points.map((p) => p.lat));
    let minLon = Math.min(...points.map((p) => p.lon));
    let maxLon = Math.max(...points.map((p) => p.lon));
    const latPad = Math.max((maxLat - minLat) * 0.12, 0.0004);
    const lonPad = Math.max((maxLon - minLon) * 0.12, 0.0004);
    minLat -= latPad; maxLat += latPad; minLon -= lonPad; maxLon += lonPad;
    projection = {
      zoom: null,
      project(point) {
        return {
          x: viewport.x + ((point.lon - minLon) / ((maxLon - minLon) || 1)) * viewport.width,
          y: viewport.y + ((maxLat - point.lat) / ((maxLat - minLat) || 1)) * viewport.height
        };
      }
    };
  }
  const project = (list) => list.map((point) => projection.project(point));
  for (const geometry of geometries.filter((item) => item.kind !== "point")) {
    if (geometry.kind === "polygon") {
      const fill = geometry.fill?.includes("249") ? { color: "#f97316", alpha: 0.16 } : { color: "#2563eb", alpha: 0.12 };
      drawPolygon(canvas, project(geometry.points), geometry.color, fill, Boolean(geometry.dash));
    } else {
      const pointsProjected = project(geometry.points);
      for (let i = 1; i < pointsProjected.length; i += 1) {
        drawLine(canvas, pointsProjected[i - 1].x, pointsProjected[i - 1].y, pointsProjected[i].x, pointsProjected[i].y, geometry.color, 3, true);
      }
    }
  }
  for (const geometry of geometries.filter((item) => item.kind === "point")) {
    const point = projection.project(geometry.point);
    drawCircle(canvas, point.x, point.y, geometry.radius + 2, "#ffffff");
    drawCircle(canvas, point.x, point.y, geometry.radius, geometry.color);
  }
  return encodePng(canvas);
}

async function mapAnnexBlocks() {
  const blocks = [
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      text: "Annexe - Cartes de situation par site",
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 180 }
    }),
    new Paragraph({
      text: "Chaque carte présente les géométries collectées pour une soumission : points de site, emprises, bâtiments, pylônes et raccordements lorsque ces données sont disponibles.",
      spacing: { after: 180 }
    })
  ];
  for (const [index, row] of submissions.entries()) {
    const id = row._id || index + 1;
    const siteName = String(row["modB/nom_officiel"] || "Site non renseigné").replace(/\s+/g, " ").trim();
    blocks.push(new Paragraph({ children: [new PageBreak()] }));
    blocks.push(new Paragraph({
      text: `${id} - ${siteName}`,
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 120 }
    }));
    blocks.push(new Paragraph({
      children: [
        new ImageRun({
          type: "png",
          data: await pngMap(row),
          transformation: { width: 650, height: 405 }
        })
      ],
      spacing: { after: 100 }
    }));
    blocks.push(new Paragraph({
      text: "Note : carte statique schématique, générée depuis les coordonnées collectées. Elle ne remplace pas une validation SIG sur fond administratif ou orthophoto.",
      spacing: { after: 80 }
    }));
  }
  return blocks;
}

const document = new Document({
  creator: "GEMS Mission Monitor",
  title: "Rapport de contrôle qualité GPS - Enquête GEMS",
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
        margin: { top: 900, right: 900, bottom: 900, left: 900 }
      }
    },
    children: [
      ...convertBlocks(marked.lexer(markdown)),
      ...await mapAnnexBlocks()
    ]
  }]
});

await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await fs.writeFile(outputPath, await Packer.toBuffer(document));
console.log(`Document généré : ${path.resolve(outputPath)}`);
