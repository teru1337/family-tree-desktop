import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("adds a clickable full-tree mini-map and keeps the viewport visible", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(source, /function TreeMiniMap/);
  assert.match(source, /Нажмите на область, чтобы перейти к ней/);
  assert.match(source, /onNavigate=\{navigateToBoardPoint\}/);
  assert.match(styles, /\.tree-minimap/);
  assert.match(styles, /\.tree-minimap-viewport/);
});

test("supports resizing the inspector and keyboard navigation", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(source, /inspectorWidth/);
  assert.match(source, /inspector-resize-handle/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /Ctrl\+F|key === "f"/);
  assert.match(source, /ArrowUp.*ArrowDown.*ArrowLeft.*ArrowRight/);
  assert.match(source, /keyboardPanRequest/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\) var\(--inspector-width/);
  assert.match(styles, /cursor: col-resize/);
});

console.log("Stage 29 mini-map, inspector resize and keyboard navigation ok");
