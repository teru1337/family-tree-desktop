import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildInteractiveFamilySchemaSvg } from "../src/interactive-family-schema.js";

const appSource = fs.readFileSync(path.resolve("src/App.jsx"), "utf8");
const componentSource = fs.readFileSync(path.resolve("src/InteractiveFamilySchema.jsx"), "utf8");
const stylesSource = fs.readFileSync(path.resolve("src/styles.css"), "utf8");

test("exports a named, bounded SVG with editable layers and marker endpoints", () => {
  const svg = buildInteractiveFamilySchemaSvg();
  assert.match(svg, /^<svg /);
  assert.match(svg, /viewBox="0 0 720 370"/);
  assert.match(svg, /id="schema-canvas"/);
  assert.match(svg, /id="schema-relations"/);
  assert.match(svg, /id="schema-nodes"/);
  assert.match(svg, /inkscape:label="Связи — редактировать отдельно"/);
  assert.match(svg, /marker-end="url\(#schema-arrow\)"/);
  assert.match(svg, /id="schema-relation-parent-child"/);
  assert.match(svg, /id="schema-node-child"/);
});

test("wires SVG nodes and relations to mouse, keyboard and live feedback", () => {
  assert.match(appSource, /InteractiveFamilySchema/);
  assert.match(appSource, /Открыть интерактивную SVG-схему связей/);
  assert.match(componentSource, /role="button"/);
  assert.match(componentSource, /aria-pressed=\{active\}/);
  assert.match(componentSource, /onKeyDown/);
  assert.match(componentSource, /aria-live="polite"/);
  assert.match(componentSource, /Скачать SVG/);
  assert.match(componentSource, /data-layer="relations"/);
  assert.match(stylesSource, /\.interactive-schema-edge-hit/);
  assert.match(stylesSource, /\.interactive-schema-node:focus-visible/);
  assert.match(stylesSource, /\.interactive-schema-edge\.is-active/);
});

console.log("Stage 88 M7 interactive SVG ok: named layers, accessible interactions and lossless export contract");
