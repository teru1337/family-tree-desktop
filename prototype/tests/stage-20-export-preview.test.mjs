import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const appPath = path.resolve("src/App.jsx");
const exportModalPath = path.resolve("src/ExportModal.jsx");
const stylesPath = path.resolve("src/styles.css");
const appSource = fs.readFileSync(appPath, "utf8");
const exportModalSource = fs.readFileSync(exportModalPath, "utf8");
const stylesSource = fs.readFileSync(stylesPath, "utf8");

test("export modal contains a full-tree preview before file creation", () => {
  assert.match(appSource, /ExportModal\.jsx/);
  assert.match(exportModalSource, /buildTreeSvg/);
  assert.match(exportModalSource, /Предпросмотр/);
  assert.match(exportModalSource, /export-preview-stage/);
  assert.match(exportModalSource, /export-preview-image/);
  assert.match(exportModalSource, /URL\.createObjectURL/);
  assert.match(exportModalSource, /URL\.revokeObjectURL/);
  assert.match(exportModalSource, /preview-retry/);
});

test("export preview remains visible with poster or tiled layout summary", () => {
  assert.match(exportModalSource, /exportMode/);
  assert.match(exportModalSource, /Большой плакат/);
  assert.match(exportModalSource, /Листы по страницам/);
  assert.match(exportModalSource, /pageCount/);
});

test("export preview has a bounded frame and readable fallback state", () => {
  assert.match(stylesSource, /\.export-preview\s*\{/);
  assert.match(stylesSource, /\.export-preview-stage\s*\{/);
  assert.match(stylesSource, /\.export-preview-image\s*\{/);
  assert.match(stylesSource, /\.export-preview-placeholder\s*\{/);
  assert.match(stylesSource, /\.preview-spinner\s*\{/);
});
