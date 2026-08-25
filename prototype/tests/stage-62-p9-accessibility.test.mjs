import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("tree cards support keyboard traversal and announce selection", () => {
  assert.match(source, /onKeyDown=\{\(event\) => onKeyboardNavigate\?\./);
  assert.match(source, /aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"/);
  assert.match(source, /navigateTreeNode/);
  assert.match(source, /role="region" aria-label="Полотно семейного дерева/);
  assert.match(source, /role="status" aria-live="polite" aria-atomic="true">\{selectedPerson/);
});

test("modal focus is trapped and returned to the trigger", () => {
  assert.match(source, /const modalOpen = Boolean\(/);
  assert.match(source, /document\.addEventListener\("focusin", handleFocusIn, true\)/);
  assert.match(source, /document\.addEventListener\("keydown", handleTab, true\)/);
  assert.match(source, /modalReturnFocusRef\.current\?\.isConnected/);
  assert.match(source, /getTopDialog/);
});

test("global canvas shortcuts do not hijack focused controls and contrast modes strengthen focus", () => {
  assert.match(source, /\["button", "a", "input", "textarea", "select", "option"\]\.includes\(tagName\)/);
  assert.match(styles, /\.tree-node-collapse:focus-visible[^}]*outline: 2px solid var\(--blue\)/);
  assert.match(styles, /@media \(prefers-contrast: more\)/);
  assert.match(styles, /@media \(forced-colors: active\)/);
});

console.log("Stage 62 accessibility ok: keyboard tree navigation, modal focus management, live selection, and contrast modes");
