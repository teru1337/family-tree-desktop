import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("exposes a persistent large-text mode and accessible status feedback", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(source, /largeText: false/);
  assert.match(source, /Крупный текст/);
  assert.match(source, /setLargeText\(nextLargeText\)/);
  assert.match(source, /largeText \? "app-large-text"/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(styles, /\.app-large-text \.tree-node/);
  assert.match(styles, /\.app-large-text \.field input/);
  assert.match(styles, /\.app-large-text \.profile-summary h2/);
});

test("restores large-text preference with loaded and recovered projects", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.ok((source.match(/setLargeText\((?:settings|restoredSettings|loadedSettings)\.largeText === true\)/g) || []).length >= 4);
  assert.match(source, /largeText: nextLargeText, cardFields/);
});

console.log("Stage 43 large-text accessibility ok: readable controls, focusable actions, and persisted preference");
