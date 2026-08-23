import { PAPER_SIZES, buildPdfFromJpegs, buildTreeSvg, canvasToTiff } from "./exporters.js";

function report(percent, label) {
  self.postMessage({ type: "progress", percent, label });
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
}

async function renderSvg(svg, width, height) {
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") throw new Error("Фоновый экспорт недоступен в этом режиме.");
  const image = await createImageBitmap(new Blob([svg], { type: "image/svg+xml" }));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);
  image.close?.();
  return canvas;
}

function drawPageBadge(context, pageNumber, pageCount, width) {
  context.save();
  context.fillStyle = "rgba(255, 255, 255, 0.92)";
  context.strokeStyle = "#9aa5b2";
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect?.(12, 12, 118, 24, 5);
  if (!context.roundRect) context.rect(12, 12, 118, 24);
  context.fill();
  context.stroke();
  context.fillStyle = "#334155";
  context.font = "600 12px Segoe UI, Arial, sans-serif";
  context.fillText(`Лист ${pageNumber} из ${pageCount}`, Math.min(20, Math.max(8, width - 130)), 28);
  context.restore();
}

async function buildTiledPdf(canvas, { paper = "a4", orientation = "landscape" } = {}) {
  const size = PAPER_SIZES[paper] || PAPER_SIZES.a4;
  const pageWidth = orientation === "landscape" ? size.height : size.width;
  const pageHeight = orientation === "landscape" ? size.width : size.height;
  const pixelsPerPoint = 2;
  const tileWidth = Math.max(1, Math.round(pageWidth * pixelsPerPoint));
  const tileHeight = Math.max(1, Math.round(pageHeight * pixelsPerPoint));
  const columns = Math.ceil(canvas.width / tileWidth);
  const rows = Math.ceil(canvas.height / tileHeight);
  const pageCount = columns * rows;
  const pages = [];
  let pageNumber = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      pageNumber += 1;
      const tile = new OffscreenCanvas(tileWidth, tileHeight);
      const context = tile.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, tileWidth, tileHeight);
      const drawWidth = Math.min(tileWidth, canvas.width - column * tileWidth);
      const drawHeight = Math.min(tileHeight, canvas.height - row * tileHeight);
      context.drawImage(canvas, column * tileWidth, row * tileHeight, drawWidth, drawHeight, 0, 0, drawWidth, drawHeight);
      drawPageBadge(context, pageNumber, pageCount, tileWidth);
      const dataUrl = await blobToDataUrl(await tile.convertToBlob({ type: "image/jpeg", quality: 0.93 }));
      pages.push({ dataUrl, width: tileWidth, height: tileHeight });
      report(45 + Math.round((pageNumber / pageCount) * 45), `Подготовлен лист ${pageNumber} из ${pageCount}`);
    }
  }
  return buildPdfFromJpegs(pages, pageWidth, pageHeight);
}

async function buildPosterPdf(canvas, posterPlan) {
  const dataUrl = await blobToDataUrl(await canvas.convertToBlob({ type: "image/jpeg", quality: 0.93 }));
  const pageWidth = posterPlan?.pageWidth || 2551;
  const pageHeight = posterPlan?.pageHeight || Math.round(pageWidth * canvas.height / canvas.width);
  return buildPdfFromJpegs([{ dataUrl, width: canvas.width, height: canvas.height }], pageWidth, pageHeight);
}

async function createExport({ people, partnerships, layout, treeStyle, showPhotos, scale, fontScale, connectionGap, format, mode, paper, orientation, posterPlan }) {
  report(8, "Готовлю компоновку дерева…");
  const svg = await buildTreeSvg({ people, partnerships, layout, treeStyle, showPhotos, fontScale, connectionGap });
  report(25, "Рисую дерево в фоновом процессе…");
  const canvas = await renderSvg(svg, Math.max(1, Math.round(layout.width * scale)), Math.max(1, Math.round(layout.height * scale)));
  if (format === "png") return canvas.convertToBlob({ type: "image/png" });
  if (format === "tiff") return canvasToTiff(canvas);
  report(40, mode === "poster" ? "Готовлю большой плакат…" : "Разбиваю дерево на листы…");
  return mode === "poster" ? buildPosterPdf(canvas, posterPlan) : buildTiledPdf(canvas, { paper, orientation });
}

self.onmessage = async (event) => {
  try {
    const blob = await createExport(event.data);
    report(100, "Файл готов");
    self.postMessage({ type: "done", blob });
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || "Не удалось подготовить файл." });
  }
};
