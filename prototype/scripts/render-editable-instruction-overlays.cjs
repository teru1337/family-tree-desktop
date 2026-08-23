const fs = require("node:fs/promises");
const path = require("node:path");
const { steps, boxDefaults, sourceOffset, escapeXml, getPath } = require("./render-instruction-overlays.cjs");

const root = path.resolve(__dirname, "..");
const sourceRoot = path.join(root, "public", "instruction");
const outputRoot = path.join(sourceRoot, "editable");

function renderStandalone(step, sourceData) {
  const baseName = path.basename(step.file, ".svg");
  const lines = step.labels.map(([side, x, y, title, note, targetX, targetY, route], index) => {
    const d = getPath(side, x, y, boxDefaults.width, boxDefaults.height, targetX, targetY, route);
    return `<path id="${baseName}-arrow-${index + 1}" class="line" d="${d}"/>`;
  }).join("");
  const labels = step.labels.map(([, x, y, title, note], index) => {
    const textX = x + 14;
    return `<g id="${baseName}-label-${index + 1}"><rect x="${x}" y="${y}" width="${boxDefaults.width}" height="${boxDefaults.height}" rx="10" fill="#f4f8f0" stroke="#b7c8aa"/><text x="${textX}" y="${y + 25}" class="label"><tspan x="${textX}">${escapeXml(title)}</tspan><tspan x="${textX}" dy="20" class="note">${escapeXml(note)}</tspan></text></g>`;
  }).join("");
  const source = sourceData.toString("base64");
  const sourceName = escapeXml(step.source);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="1800" height="1000" viewBox="0 0 1800 1000" data-source="${sourceName}" data-captured-from="electron-desktop" role="img" aria-label="${escapeXml(step.aria)}"><title>${escapeXml(step.aria)}</title><desc>Самостоятельный редактируемый SVG: скриншот, стрелки и подписи разделены по группам.</desc><metadata>Скриншот встроен из новой desktop-версии Electron. Стрелки заканчиваются у внешних краёв элементов.</metadata><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0 10 5 0 10Z" fill="#6e8d52"/></marker><style>.label{font:700 17px Arial,sans-serif;fill:#4e5947}.note{font:400 14.5px Arial,sans-serif;fill:#6f7769}.line{fill:none;stroke:#6e8d52;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;marker-end:url(#arrow)}</style></defs><g id="canvas-background" inkscape:groupmode="layer" inkscape:label="Фон"><rect width="1800" height="1000" fill="#f1eee7"/></g><g id="source-screenshot" inkscape:groupmode="layer" inkscape:label="Оригинальный скриншот новой desktop-версии"><image id="${baseName}-source" xlink:href="data:image/jpeg;base64,${source}" x="${sourceOffset.x}" y="${sourceOffset.y}" width="1265" height="712" preserveAspectRatio="none"/><rect x="${sourceOffset.x}" y="${sourceOffset.y}" width="1265" height="712" rx="6" fill="none" stroke="#c9c4b9" stroke-width="2"/></g><g id="annotation-lines" inkscape:groupmode="layer" inkscape:label="Стрелки — редактировать отдельно">${lines}</g><g id="annotation-labels" inkscape:groupmode="layer" inkscape:label="Подписи — редактировать отдельно">${labels}</g></svg>\n`;
}

(async () => {
  await fs.mkdir(outputRoot, { recursive: true });
  await Promise.all(steps.map(async (step) => {
    const sourceData = await fs.readFile(path.join(sourceRoot, step.source));
    const editableName = step.file.replace(/\.svg$/i, "-editable.svg");
    await fs.writeFile(path.join(outputRoot, editableName), renderStandalone(step, sourceData), "utf8");
  }));
  console.log(`Editable instruction images ready: ${steps.length} SVG files`);
})().catch((error) => {
  console.error("Не удалось подготовить редактируемые изображения инструкции:", error);
  process.exitCode = 1;
});
