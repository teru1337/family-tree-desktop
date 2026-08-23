import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const assetNames = [
  "01-menu.svg",
  "02-project.svg",
  "03-person.svg",
  "04-tree.svg",
  "05-search.svg",
  "06-relationships.svg",
  "07-backups.svg",
  "08-export-settings.svg",
];
const sourceNames = [
  "source-01-menu.jpg",
  "source-02-project.jpg",
  "source-03-person.jpg",
  "source-04-tree.jpg",
  "source-05-search.jpg",
  "source-06-relationships.jpg",
  "source-07-backups.jpg",
  "source-08-export-settings.jpg",
];
const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

assert.match(appSource, /function InstructionModal/);
assert.match(appSource, /const openInstruction/);
assert.match(appSource, /Окно можно увеличить за правый нижний угол/);
assert.match(stylesSource, /\.instruction-card\s*\{[^}]*resize:\s*both/);
assert.match(stylesSource, /\.instruction-card::after/);
assert.match(stylesSource, /width:\s*min\(1540px/);
assert.match(stylesSource, /height:\s*min\(900px/);
assert.match(stylesSource, /\.instruction-page\s*\{[^}]*minmax\(0, 2fr\)/);
assert.match(appSource, /Открыть изображение крупно/);
assert.match(stylesSource, /\.instruction-preview-stage\s*\{[^}]*width:\s*1800px[^}]*height:\s*1000px/);
for (const assetName of assetNames) {
  const svg = await readFile(new URL(`../public/instruction/${assetName}`, import.meta.url), "utf8");
  assert.match(svg, /<svg[\s>]/);
  assert.match(svg, /marker-end/);
  assert.match(svg, /width="1800"/);
  assert.match(svg, /height="1000"/);
  assert.match(svg, /\.label\{font:600 16px Arial/);
  assert.match(svg, /\.note\{font:400 14px Arial/);
  assert.ok((svg.match(/<text[^>]*class="label"/g) || []).length >= 2, `${assetName} has too few readable labels`);
  assert.ok(svg.length > 500, `${assetName} unexpectedly short`);
  assert.match(appSource, new RegExp(assetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
for (const sourceName of sourceNames) {
  const source = await readFile(new URL(`../public/instruction/${sourceName}`, import.meta.url));
  assert.ok(source.length > 45000, `${sourceName} quality guard failed`);
}
for (let index = 0; index < assetNames.length; index += 1) {
  const svg = await readFile(new URL(`../public/instruction/${assetNames[index]}`, import.meta.url), "utf8");
  assert.match(svg, new RegExp(sourceNames[index].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
console.log(`Stage 15 instruction screenshots and SVG overlays ok: ${assetNames.length} steps`);
