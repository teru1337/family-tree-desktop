import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildTreeSvg } from "../src/exporters.js";
import { buildTreeLayout } from "../src/tree-layout.js";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const exportModalSource = await readFile(new URL("../src/ExportModal.jsx", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../src/export-worker.js", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

const person = {
  id: "person-1",
  name: "Иванов Иван",
  shortName: "Иванов Иван",
  nameParts: { familyName: "Иванов", givenName: "Иван", patronymic: "" },
  surnameHistory: [{ id: "old-name", surname: "Петров", reason: "marriage" }],
  year: "1980",
  parentIds: [],
  parentLinks: [],
};

test("export includes former surnames according to the current view setting", async () => {
  const layout = buildTreeLayout([person], [], { cardWidth: 190, cardHeight: 92 });
  const withoutHistory = await buildTreeSvg({ people: [person], layout, showPhotos: false, showFormerSurnames: false });
  const withHistory = await buildTreeSvg({ people: [person], layout, showPhotos: false, showFormerSurnames: true });
  assert.doesNotMatch(withoutHistory, /Петров/);
  assert.match(withHistory, /Петров/);
});

test("export receives all persistent view settings in foreground, preview, and worker paths", () => {
  assert.match(appSource, /showFormerSurnames=\{showFormerSurnames\} largeText=\{largeText\} cardFields=\{cardFields\}/);
  assert.match(exportModalSource, /showFormerSurnames, largeText, cardFields/);
  assert.match(exportModalSource, /buildTreeSvg\(\{[^}]*showFormerSurnames/s);
  assert.match(exportModalSource, /renderTreeImage\(\{[^}]*showFormerSurnames/s);
  assert.match(exportModalSource, /runBackgroundExport\(\{[^}]*showFormerSurnames/s);
  assert.match(workerSource, /buildTreeSvg\(\{[^}]*showFormerSurnames/s);
});

test("export defaults to the screen card size and large-text setting", () => {
  assert.match(exportModalSource, /useState\("screen"\)/);
  assert.match(exportModalSource, /largeText \? "large" : "standard"/);
  assert.match(exportModalSource, /value="screen">Как на экране/);
  assert.match(exportModalSource, /Стиль, фотографии, поля карточек, прежние фамилии и крупный текст взяты из текущих настроек вида дерева/);
  assert.match(stylesSource, /\.export-setting-help/);
});

console.log("Stage 61 export/view synchronization ok: persistent display settings reach preview and all export paths");
