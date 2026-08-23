export const EXPORT_QUALITY = {
  screen: { label: "Экран", scale: 1, description: "быстрый файл для просмотра" },
  print: { label: "Печать", scale: 2, description: "чёткое изображение для принтера" },
  poster: { label: "Плакат", scale: 3, description: "максимальная детализация" },
};

export const PAPER_SIZES = {
  a4: { label: "A4", width: 595, height: 842 },
  a3: { label: "A3", width: 842, height: 1191 },
  a2: { label: "A2", width: 1191, height: 1684 },
};

export function calculatePosterPlan(layout, { scale = 1 } = {}) {
  const generations = Math.max(1, Number(layout?.generations?.length) || 1);
  const safeScale = Math.max(1, Number(scale) || 1);
  const sourceWidth = Math.max(1, Number(layout?.width) || 1);
  const sourceHeight = Math.max(1, Number(layout?.height) || 1);
  const contentWidth = Math.round(sourceWidth * safeScale);
  const contentHeight = Math.round(sourceHeight * safeScale);
  const generationAllowance = 2551 + Math.max(0, generations - 3) * 240;
  const generationHeightAllowance = Math.round((850 + generations * 180) * safeScale);
  const plannedHeight = Math.max(contentHeight, generationHeightAllowance);
  const longSide = Math.max(generationAllowance, contentWidth, plannedHeight);
  const ratio = contentWidth / plannedHeight;
  const pixelWidth = contentWidth >= plannedHeight ? longSide : Math.round(longSide * ratio);
  const pixelHeight = contentWidth >= plannedHeight ? Math.round(longSide / ratio) : longSide;
  const pageWidth = Math.max(1200, Math.round(pixelWidth / 2));
  const pageHeight = Math.max(900, Math.round(pixelHeight / 2));
  return {
    generations,
    pixelWidth,
    pixelHeight,
    pageWidth,
    pageHeight,
    widthCm: Math.round(pageWidth * 2.54 / 72),
    heightCm: Math.round(pageHeight * 2.54 / 72),
    orientation: pageWidth >= pageHeight ? "landscape" : "portrait",
  };
}

export function checkExportReadability({ format = "pdf", mode = "poster", scale = 1, fontScale = 1, peopleCount = 0 } = {}) {
  const renderedFontPixels = 13 * Math.max(0.5, Number(scale) || 1) * Math.max(0.8, Number(fontScale) || 1);
  const printablePoints = renderedFontPixels / 2;
  const isRaster = format === "png";
  const measuredSize = isRaster ? renderedFontPixels : printablePoints;
  const minimumSize = isRaster ? 14 : 10;
  const crowded = Number(peopleCount) > 300 && mode === "tiles";
  const readable = measuredSize >= minimumSize && !crowded;
  const level = readable ? "good" : measuredSize >= minimumSize * 0.8 && !crowded ? "warning" : "poor";
  const message = crowded
    ? "Для очень большого дерева лучше выбрать качество «Печать» или «Плакат»."
    : readable
      ? `Текст будет разборчивым: примерно ${isRaster ? `${Math.round(renderedFontPixels)} px` : `${printablePoints.toFixed(1)} pt`}.`
      : `Масштаб мал для печати: примерно ${isRaster ? `${Math.round(renderedFontPixels)} px` : `${printablePoints.toFixed(1)} pt`}. Увеличьте качество или размер шрифта.`;
  return { level, readable, renderedFontPixels, printablePoints, message };
}

const THEMES = {
  classic: { background: "#f8fafc", card: "#ffffff", border: "#d4dde8", line: "#8fa0b5", label: "#64748b", accent: "#355b93" },
  album: { background: "#f7f0e4", card: "#fffdf7", border: "#ddc4a5", line: "#b58f65", label: "#876d52", accent: "#8b5e3c" },
  minimal: { background: "#ffffff", card: "#ffffff", border: "#d9dee6", line: "#9aa5b2", label: "#7a8591", accent: "#4b647a" },
};

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getParentIds(person) {
  const links = Array.isArray(person?.parentLinks) ? person.parentLinks.map((link) => link.personId) : [];
  return [...new Set([...(links.length ? links : person?.parentIds || [])])];
}

function truncate(value, maxLength) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function formatPersonName(person) {
  const source = person?.isUnknown ? "Неизвестный человек" : person?.shortName || person?.name || "Человек без имени";
  return String(source).split("\n").map((line) => truncate(line, 24)).filter(Boolean).slice(0, 2);
}

async function imageToDataUrl(source) {
  if (!source) return null;
  if (source.startsWith("data:")) return source;
  try {
    const response = await fetch(new URL(source, window.location.href));
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "image/png";
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return `data:${contentType};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

function edgePath(from, to, connectionGap = 24) {
  const startX = from.left + from.width / 2;
  const startY = from.top + from.height;
  const endX = to.left + to.width / 2;
  const endY = to.top;
  const middleY = startY + Math.max(connectionGap, (endY - startY) / 2);
  return `M ${startX} ${startY} V ${middleY} H ${endX} V ${endY}`;
}

export async function buildTreeSvg({ people, partnerships = [], layout, treeStyle = "classic", showPhotos = true, fontScale = 1, connectionGap = 24 }) {
  const theme = THEMES[treeStyle] || THEMES.classic;
  const safeFontScale = Math.max(0.8, Number(fontScale) || 1);
  const safeConnectionGap = Math.max(18, Number(connectionGap) || 24);
  const byId = new Map(people.map((person) => [person.id, person]));
  const imageMap = new Map();
  if (showPhotos) {
    const sources = [...new Set(people.map((person) => person.image).filter(Boolean))];
    const loaded = await Promise.all(sources.map(async (source) => [source, await imageToDataUrl(source)]));
    loaded.forEach(([source, dataUrl]) => imageMap.set(source, dataUrl));
  }

  const parentEdges = people.flatMap((child) => getParentIds(child).map((parentId) => ({
    child,
    parent: byId.get(parentId),
    type: child.parentLinks?.find((link) => link.personId === parentId)?.type || "biological",
  }))).filter(({ parent, child }) => parent && layout.positions[parent.id] && layout.positions[child.id]);
  const partnerEdges = partnerships.map((partnership) => ({
    partnership,
    first: byId.get(partnership.personIds?.[0]),
    second: byId.get(partnership.personIds?.[1]),
  })).filter(({ first, second }) => first && second && layout.positions[first.id] && layout.positions[second.id]);

  const connectionMarkup = parentEdges.map(({ parent, child, type }) => {
    const path = edgePath(layout.positions[parent.id], layout.positions[child.id], safeConnectionGap);
    return `<path d="${path}" fill="none" stroke="${theme.line}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"${type === "adoptive" ? ' stroke-dasharray="7 6"' : ""} />`;
  }).join("");

  const partnershipMarkup = partnerEdges.map(({ partnership, first, second }) => {
    const firstPosition = layout.positions[first.id];
    const secondPosition = layout.positions[second.id];
    const start = firstPosition.left < secondPosition.left ? firstPosition : secondPosition;
    const end = firstPosition.left < secondPosition.left ? secondPosition : firstPosition;
    const startX = start.left + start.width;
    const startY = start.top + start.height / 2;
    const endX = end.left;
    const endY = end.top + end.height / 2;
    const middleX = startX + Math.max(safeConnectionGap / 2, (endX - startX) / 2);
    const label = partnership.status === "divorced" ? "Развод" : partnership.type === "marriage" ? "Брак" : "Связь";
    return `<path d="M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}" fill="none" stroke="${partnership.status === "divorced" ? "#b77979" : theme.line}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${partnership.status === "divorced" ? ' stroke-dasharray="6 5"' : ""} /><text x="${middleX}" y="${Math.min(startY, endY) - 10 * safeFontScale}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${11 * safeFontScale}" fill="${theme.label}">${escapeXml(label)}</text>`;
  }).join("");

  const generationTop = (layout.top ?? 78) - 38;
  const generationMarkup = layout.generations.map((group) => `<text x="24" y="${generationTop + group.index * (layout.rowStep ?? 190)}" font-family="Segoe UI, Arial, sans-serif" font-size="${12 * safeFontScale}" font-weight="600" letter-spacing="0.8" fill="${theme.label}">ПОКОЛЕНИЕ ${group.index + 1}</text>`).join("");
  const nodeMarkup = people.map((person) => {
    const position = layout.positions[person.id];
    if (!position) return "";
    const names = formatPersonName(person);
    const photo = showPhotos ? imageMap.get(person.image) : null;
    const imageMarkup = photo
      ? `<image href="${escapeXml(photo)}" x="${position.left + 13}" y="${position.top + 14}" width="48" height="62" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo-clip-${escapeXml(person.id)})" />`
      : `<circle cx="${position.left + 37}" cy="${position.top + 45}" r="22" fill="${theme.background}" stroke="${theme.border}" /><text x="${position.left + 37}" y="${position.top + 50}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="18" fill="${theme.accent}">?</text>`;
    const nameMarkup = names.map((name, index) => `<text x="${position.left + 74}" y="${position.top + 34 + index * 17 * safeFontScale}" font-family="Segoe UI, Arial, sans-serif" font-size="${13 * safeFontScale}" font-weight="600" fill="#293241">${escapeXml(name)}</text>`).join("");
    const year = person.year || "дата неизвестна";
    return `<g data-person-id="${escapeXml(person.id)}"><rect x="${position.left}" y="${position.top}" width="${position.width}" height="${position.height}" rx="9" fill="${theme.card}" stroke="${theme.border}" stroke-width="1.5" /><rect x="${position.left + 1}" y="${position.top + 1}" width="5" height="${position.height - 2}" rx="4" fill="${theme.accent}" opacity="0.8" /><clipPath id="photo-clip-${escapeXml(person.id)}"><rect x="${position.left + 13}" y="${position.top + 14}" width="48" height="62" rx="7" /></clipPath>${imageMarkup}${nameMarkup}<text x="${position.left + 74}" y="${position.top + position.height - 23}" font-family="Segoe UI, Arial, sans-serif" font-size="${11 * safeFontScale}" fill="${theme.label}">${escapeXml(truncate(year, 22))}</text></g>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}"><rect width="100%" height="100%" fill="${theme.background}" /><path d="M 0 66 H ${layout.width}" stroke="${theme.border}" stroke-width="1" opacity="0.65" />${generationMarkup}<g>${connectionMarkup}${partnershipMarkup}</g>${nodeMarkup}</svg>`;
}

function loadSvgImage(svg) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось подготовить изображение дерева"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export async function renderTreeImage({ people, partnerships, layout, treeStyle, showPhotos, scale = 1, fontScale = 1, connectionGap = 24 }) {
  const svg = await buildTreeSvg({ people, partnerships, layout, treeStyle, showPhotos, fontScale, connectionGap });
  const image = await loadSvgImage(svg);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(layout.width * scale));
  canvas.height = Math.max(1, Math.round(layout.height * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = THEMES[treeStyle]?.background || THEMES.classic.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, svg, width: canvas.width, height: canvas.height };
}

export function canvasToBlob(canvas, type = "image/png", quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Не удалось создать изображение"))), type, quality));
}

export function canvasToTiff(canvas) {
  const context = canvas.getContext("2d");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const tagCount = 11;
  const ifdOffset = 8;
  const bitsOffset = ifdOffset + 2 + tagCount * 12 + 4;
  const pixelOffset = bitsOffset + 8;
  const buffer = new ArrayBuffer(pixelOffset + pixels.byteLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  bytes[0] = 0x49; bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);
  view.setUint16(ifdOffset, tagCount, true);
  let entryOffset = ifdOffset + 2;
  const writeEntry = (tag, type, count, value) => {
    view.setUint16(entryOffset, tag, true);
    view.setUint16(entryOffset + 2, type, true);
    view.setUint32(entryOffset + 4, count, true);
    if (type === 3 && count === 1) view.setUint16(entryOffset + 8, value, true);
    else view.setUint32(entryOffset + 8, value, true);
    entryOffset += 12;
  };
  writeEntry(256, 4, 1, canvas.width);
  writeEntry(257, 4, 1, canvas.height);
  writeEntry(258, 3, 4, bitsOffset);
  writeEntry(259, 3, 1, 1);
  writeEntry(262, 3, 1, 2);
  writeEntry(273, 4, 1, pixelOffset);
  writeEntry(277, 3, 1, 4);
  writeEntry(278, 4, 1, canvas.height);
  writeEntry(279, 4, 1, pixels.byteLength);
  writeEntry(284, 3, 1, 1);
  writeEntry(338, 3, 1, 2);
  view.setUint32(entryOffset, 0, true);
  [8, 8, 8, 8].forEach((value, index) => view.setUint16(bitsOffset + index * 2, value, true));
  bytes.set(pixels, pixelOffset);
  return new Blob([buffer], { type: "image/tiff" });
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",", 2)[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function textBytes(value) {
  return new TextEncoder().encode(value);
}

function mergeBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => { result.set(part, offset); offset += part.length; });
  return result;
}

export function buildPdfFromJpegs(pages, pageWidth, pageHeight) {
  const objects = [
    { text: "<< /Type /Catalog /Pages 2 0 R >>" },
    { text: "" },
  ];
  const pageRefs = [];
  pages.forEach((page, index) => {
    const pageObject = 3 + index * 3;
    const contentObject = pageObject + 1;
    const imageObject = pageObject + 2;
    pageRefs.push(`${pageObject} 0 R`);
    objects.push({ text: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /ProcSet [/PDF /ImageC] /XObject << /Im${index + 1} ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>` });
    const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im${index + 1} Do\nQ\n`;
    objects.push({ stream: textBytes(`<< /Length ${textBytes(content).length} >>\nstream\n${content}endstream`) });
    const imageBytes = dataUrlToBytes(page.dataUrl);
    objects.push({ stream: mergeBytes([textBytes(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`), imageBytes, textBytes("\nendstream")]) });
  });
  objects[1] = { text: `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pages.length} >>` };

  const parts = [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xff, 0xff, 0xff, 0xff, 0x0a])];
  const offsets = [0];
  let byteLength = parts[0].length;
  objects.forEach((object, index) => {
    offsets[index + 1] = byteLength;
    const body = object.text !== undefined ? textBytes(object.text) : object.stream;
    const objectBytes = mergeBytes([textBytes(`${index + 1} 0 obj\n`), body, textBytes("\nendobj\n")]);
    parts.push(objectBytes);
    byteLength += objectBytes.length;
  });
  const xrefOffset = byteLength;
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`];
  for (let index = 1; index < offsets.length; index += 1) xref.push(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
  xref.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  parts.push(textBytes(xref.join("")));
  return new Blob(parts, { type: "application/pdf" });
}

function canvasToJpegDataUrl(canvas) {
  return canvas.toDataURL("image/jpeg", 0.93);
}

function makeTileCanvas(source, x, y, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, x, y, Math.min(width, source.width - x), Math.min(height, source.height - y), 0, 0, Math.min(width, source.width - x), Math.min(height, source.height - y));
  return canvas;
}

export async function buildPdfFromCanvas(canvas, { mode = "poster", paper = "a4", orientation = "landscape", posterPlan = null } = {}) {
  if (mode === "poster") {
    const fallbackLongSide = 2551;
    const fallbackWidth = orientation === "landscape" ? fallbackLongSide : Math.round(fallbackLongSide * canvas.height / canvas.width);
    const fallbackHeight = orientation === "landscape" ? Math.round(fallbackLongSide * canvas.height / canvas.width) : fallbackLongSide;
    const pageWidth = posterPlan?.pageWidth || fallbackWidth;
    const pageHeight = posterPlan?.pageHeight || fallbackHeight;
    return buildPdfFromJpegs([{ dataUrl: canvasToJpegDataUrl(canvas), width: canvas.width, height: canvas.height }], pageWidth, pageHeight);
  }
  const size = PAPER_SIZES[paper] || PAPER_SIZES.a4;
  const pageWidth = orientation === "landscape" ? size.height : size.width;
  const pageHeight = orientation === "landscape" ? size.width : size.height;
  const pixelsPerPoint = 2;
  const tileWidth = Math.max(1, Math.round(pageWidth * pixelsPerPoint));
  const tileHeight = Math.max(1, Math.round(pageHeight * pixelsPerPoint));
  const columns = Math.ceil(canvas.width / tileWidth);
  const rows = Math.ceil(canvas.height / tileHeight);
  const pages = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const tile = makeTileCanvas(canvas, column * tileWidth, row * tileHeight, tileWidth, tileHeight);
      pages.push({ dataUrl: canvasToJpegDataUrl(tile), width: tile.width, height: tile.height });
    }
  }
  return buildPdfFromJpegs(pages, pageWidth, pageHeight);
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
