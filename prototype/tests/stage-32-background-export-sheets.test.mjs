import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const appSource = fs.readFileSync(path.resolve("src/App.jsx"), "utf8");
const clientSource = fs.readFileSync(path.resolve("src/export-worker-client.js"), "utf8");
const workerSource = fs.readFileSync(path.resolve("src/export-worker.js"), "utf8");
const exporterSource = fs.readFileSync(path.resolve("src/exporters.js"), "utf8");

test("heavy exports use a background worker with a safe fallback", () => {
  assert.match(appSource, /runBackgroundExport/);
  assert.match(appSource, /Фоновый режим недоступен/);
  assert.match(appSource, /exportProgress/);
  assert.match(clientSource, /new Worker\(new URL\("\.\/export-worker\.js", import\.meta\.url\)/);
});

test("multi-page exports number sheets in both export paths", () => {
  assert.match(workerSource, /Лист \$\{pageNumber\} из \$\{pageCount\}/);
  assert.match(workerSource, /Подготовлен лист/);
  assert.match(exporterSource, /pageNumber/);
  assert.match(exporterSource, /Лист \$\{pageNumber\} из \$\{pageCount\}/);
});
