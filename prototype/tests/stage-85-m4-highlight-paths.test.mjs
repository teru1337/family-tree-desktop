import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calculateRelationship, relationshipEdgeKey } from "../src/relationship-calculator.js";

const appSource = fs.readFileSync(path.resolve("src/App.jsx"), "utf8");
const stylesSource = fs.readFileSync(path.resolve("src/styles.css"), "utf8");

const people = [
  { id: "parent", name: "Родитель", gender: "female", parentLinks: [], childIds: ["child"] },
  { id: "child", name: "Ребёнок", gender: "male", parentLinks: [{ personId: "parent", type: "adoptive" }], childIds: [] },
  { id: "sibling", name: "Сиблинг", gender: "female", parentLinks: [], siblingLinks: [{ personId: "child", type: "half" }], childIds: [] },
  { id: "partner", name: "Партнёр", gender: "male", parentLinks: [], childIds: [] },
];

test("builds stable visual keys for parent, partnership and sibling edges", () => {
  assert.equal(relationshipEdgeKey({ kind: "parent", parentId: "parent", childId: "child", type: "adoptive" }), "parent:parent:child:adoptive");
  assert.equal(relationshipEdgeKey({ kind: "partnership", id: "marriage-1", personIds: ["partner", "child"] }), "partnership:marriage-1");
  assert.equal(relationshipEdgeKey({ kind: "sibling", personIds: ["sibling", "child"], type: "half" }), "sibling:child|sibling:half");
});

test("preserves relationship edge kinds for an explicit highlighted path", () => {
  const adoptive = calculateRelationship(people, [], "child", "parent");
  assert.equal(adoptive.status, "found");
  assert.equal(adoptive.displayEdges[0].kind, "parent");
  assert.equal(adoptive.displayEdges[0].type, "adoptive");

  const partnership = calculateRelationship(people, [{ id: "marriage-1", personIds: ["child", "partner"], type: "marriage" }], "child", "partner");
  assert.equal(partnership.status, "found");
  assert.equal(partnership.displayEdges[0].kind, "partnership");
  assert.equal(partnership.displayEdges[0].id, "marriage-1");
});

test("wires relationship highlighting through the tree without persisting UI state", () => {
  assert.match(appSource, /relationshipHighlight/);
  assert.match(appSource, /relationshipEdgeKey/);
  assert.match(appSource, /Показать и подсветить путь/);
  assert.match(appSource, /connection-highlighted/);
  assert.match(appSource, /connection-dimmed/);
  assert.match(appSource, /aria-live="polite"/);
  assert.match(appSource, /onClearHighlight/);
  assert.doesNotMatch(appSource, /relationshipHighlight[^\n]*buildPayload/);
  assert.match(stylesSource, /\.connection-path-highlight/);
  assert.match(stylesSource, /\.tree-node-path-highlight/);
  assert.match(stylesSource, /prefers-contrast/);
});

console.log("Stage 85 M4 highlight paths ok: edge identity, relation types and accessible UI wiring");
