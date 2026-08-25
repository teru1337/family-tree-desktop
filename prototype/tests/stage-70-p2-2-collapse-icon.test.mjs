import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("uses centered library icons for expanded and collapsed branches", () => {
  assert.match(source, /collapsed \? <CaretRight size=\{14\} weight="bold" \/> : <CaretDown size=\{14\} weight="bold" \/>/);
  assert.doesNotMatch(source, /collapsed \? "›" : "⌄"/);
  assert.match(source, /tree-node-collapse-icon/);
  assert.match(source, /aria-label=\{`\$\{collapsed \? "Развернуть" : "Свернуть"\} ветвь/);
  assert.match(source, /title=\{`\$\{collapsed \? "Развернуть" : "Свернуть"\} ветвь`\}/);
});

test("keeps the collapse control optically centered in normal and large text modes", () => {
  assert.match(styles, /\.tree-node-collapse \{[^}]*display: grid;[^}]*place-items: center;[^}]*line-height: 0/);
  assert.match(styles, /\.tree-node-collapse-icon \{[^}]*display: grid;[^}]*place-items: center/);
  assert.match(styles, /\.tree-node-collapse-icon svg \{[^}]*display: block;[^}]*width: 14px;[^}]*height: 14px/);
  assert.match(styles, /\.app-large-text \.tree-node-collapse \{[^}]*width: 24px; height: 24px/);
  assert.match(styles, /\.app-large-text \.tree-node-collapse-icon svg \{[^}]*width: 16px;[^}]*height: 16px/);
  assert.match(styles, /\.tree-node-collapse:focus-visible[^}]*outline: 2px solid var\(--blue\)/);
});

console.log("Stage 70 P2.2 ok: collapse control uses centered library icons in both text modes");
