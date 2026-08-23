import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const appPath = path.resolve("src/App.jsx");
const stylesPath = path.resolve("src/styles.css");
const appSource = fs.readFileSync(appPath, "utf8");
const stylesSource = fs.readFileSync(stylesPath, "utf8");

test("export modal contains a full-tree preview before file creation", () => {
  assert.match(appSource, /buildTreeSvg/);
  assert.match(appSource, /Предпросмотр/);
  assert.match(appSource, /export-preview-stage/);
  assert.match(appSource, /export-preview-image/);
  assert.match(appSource, /URL\.createObjectURL/);
  assert.match(appSource, /URL\.revokeObjectURL/);
  assert.match(appSource, /preview-retry/);
});

test("export preview remains visible with poster or tiled layout summary", () => {
  assert.match(appSource, /exportMode/);
  assert.match(appSource, /Большой плакат/);
  assert.match(appSource, /Листы по страницам/);
  assert.match(appSource, /pageCount/);
});

test("export preview has a bounded frame and readable fallback state", () => {
  assert.match(stylesSource, /\.export-preview\s*\{/);
  assert.match(stylesSource, /\.export-preview-stage\s*\{/);
  assert.match(stylesSource, /\.export-preview-image\s*\{/);
  assert.match(stylesSource, /\.export-preview-placeholder\s*\{/);
  assert.match(stylesSource, /\.preview-spinner\s*\{/);
});
