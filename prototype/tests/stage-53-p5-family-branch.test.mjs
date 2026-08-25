import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getFamilyView } from "../src/family-view.js";

const people = [
  { id: "grandparent", parentIds: [], childIds: ["parent"] },
  { id: "parent", parentIds: ["grandparent"], childIds: ["selected"] },
  { id: "selected", parentIds: ["parent"], childIds: ["child"], siblingLinks: [{ personId: "half-sibling", type: "half" }], partnerIds: ["spouse"] },
  { id: "child", parentIds: ["selected"] },
  { id: "half-sibling", siblingLinks: [{ personId: "selected", type: "half" }] },
  { id: "spouse", partnerIds: ["selected"] },
  { id: "spouse-sibling", siblingLinks: [{ personId: "spouse", type: "biological" }] },
  { id: "distant" },
];

test("keeps blood relatives through every generation and adds partners as context", () => {
  const view = getFamilyView(people, [{ personIds: ["selected", "spouse"], type: "marriage" }], "selected", "all");
  assert.deepEqual([...view.bloodIds].sort(), ["child", "grandparent", "half-sibling", "parent", "selected"].sort());
  assert.deepEqual([...view.contextIds].sort(), ["spouse", "spouse-sibling"].sort());
  assert.equal(view.visibleIds.has("distant"), false);
});

test("limits blood traversal by generation while preserving direct family context", () => {
  const view = getFamilyView(people, [{ personIds: ["selected", "spouse"], type: "marriage" }], "selected", 1);
  assert.deepEqual([...view.bloodIds].sort(), ["child", "half-sibling", "parent", "selected"].sort());
  assert.equal(view.contextIds.has("spouse"), true);
  assert.equal(view.bloodIds.has("grandparent"), false);
});

test("wires branch depth, muted cards and a full-tree return into the UI", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(source, /Родственная ветвь/);
  assert.match(source, /Глубина родственной ветви/);
  assert.match(source, /tree-node-branch-muted/);
  assert.match(source, /viewMode === "full"/);
  assert.match(styles, /\.tree-node-branch-muted/);
  assert.match(styles, /\.connection-branch-muted/);
});

console.log("Stage 53 P5 family branch view ok: blood traversal, depth and contextual partners");
