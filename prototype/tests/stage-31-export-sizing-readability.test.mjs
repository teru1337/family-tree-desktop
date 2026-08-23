import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calculatePosterPlan, checkExportReadability } from "../src/exporters.js";

test("poster size grows with the number of generations", () => {
  const threeGenerations = calculatePosterPlan({ width: 2200, height: 1400, generations: [{}, {}, {}] }, { scale: 3 });
  const sevenGenerations = calculatePosterPlan({ width: 2200, height: 1400, generations: [{}, {}, {}, {}, {}, {}, {}] }, { scale: 3 });
  assert.ok(sevenGenerations.pageHeight > threeGenerations.pageHeight);
  assert.equal(sevenGenerations.generations, 7);
  assert.ok(sevenGenerations.widthCm > 0 && sevenGenerations.heightCm > 0);
});

test("readability check warns about a small export scale", () => {
  const small = checkExportReadability({ format: "pdf", mode: "tiles", scale: 1, fontScale: 1, peopleCount: 20 });
  const large = checkExportReadability({ format: "pdf", mode: "poster", scale: 3, fontScale: 1, peopleCount: 20 });
  assert.equal(small.readable, false);
  assert.equal(large.readable, true);
  assert.match(small.message, /увеличьте качество|размер шрифта/i);
});

test("export UI exposes sizing, readability and poster planning", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(source, /calculatePosterPlan/);
  assert.match(source, /checkExportReadability/);
  assert.match(source, /Размер карточек/);
  assert.match(source, /Плотность связей/);
  assert.match(source, /Авторазмер плаката/);
  assert.match(source, /export-readability/);
  assert.match(styles, /\.export-readability/);
});

console.log("Stage 31 export sizing and readability ok");
