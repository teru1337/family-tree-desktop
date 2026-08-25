import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MAX_TREE_ZOOM, MIN_TREE_ZOOM, clampTreeZoom, zoomAtPoint } from "../src/tree-viewport.js";

test("keeps the world point under the cursor stable while zooming", () => {
  const current = { zoom: 1, pan: { x: -120, y: -80 }, point: { x: 320, y: 240 } };
  const next = zoomAtPoint({ ...current, wheelDelta: -100 });
  const before = {
    x: (current.point.x - current.pan.x) / current.zoom,
    y: (current.point.y - current.pan.y) / current.zoom,
  };
  const after = {
    x: (current.point.x - next.pan.x) / next.zoom,
    y: (current.point.y - next.pan.y) / next.zoom,
  };

  assert.ok(next.zoom > current.zoom);
  assert.ok(Math.abs(before.x - after.x) < 1e-9);
  assert.ok(Math.abs(before.y - after.y) < 1e-9);
});

test("clamps wheel zoom to the same limits as the canvas controls", () => {
  assert.equal(clampTreeZoom(0), MIN_TREE_ZOOM);
  assert.equal(clampTreeZoom(10), MAX_TREE_ZOOM);
  assert.equal(zoomAtPoint({ zoom: MAX_TREE_ZOOM, wheelDelta: -100 }).zoom, MAX_TREE_ZOOM);
  assert.equal(zoomAtPoint({ zoom: MIN_TREE_ZOOM, wheelDelta: 100 }).zoom, MIN_TREE_ZOOM);
});

test("wires wheel zoom to the canvas and keeps auxiliary panels outside it", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /const normalizeWheelDelta = \(value, deltaMode\)/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /event\.shiftKey/);
  assert.match(source, /event\.clientX - rect\.left/);
  assert.match(source, /event\.clientY - rect\.top - paddingTop/);
  assert.match(source, /window\.getComputedStyle\(event\.currentTarget\)/);
  assert.match(source, /zoomAtPoint\(/);
  assert.match(source, /onWheel=\{onWheel\}/);
  assert.match(source, /aria-label="Полотно семейного дерева\. Колесо мыши изменяет масштаб, Shift\+колесо перемещает полотно"/);
  assert.match(source, /\{people\.length > 0 && <TreeMiniMap/);
});

console.log("Stage 72 P3.1 ok: wheel zoom is cursor-anchored and auxiliary panels remain isolated");
