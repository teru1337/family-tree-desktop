import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getCollapsedDescendantIds, hasDescendants } from "../src/tree-collapse.js";

const people = [
  { id: "parent", childIds: ["child-1"], parentLinks: [] },
  { id: "partner", childIds: ["child-2"], parentLinks: [] },
  { id: "child-1", childIds: ["grandchild"], parentLinks: [{ personId: "parent" }] },
  { id: "child-2", childIds: [], parentLinks: [{ personId: "partner" }] },
  { id: "grandchild", childIds: [], parentLinks: [{ personId: "child-1" }] },
];
const partnerships = [{ id: "partnership", personIds: ["parent", "partner"], status: "active" }];

test("collapsing a family member hides descendants of both partners but keeps the pair visible", () => {
  assert.deepEqual([...getCollapsedDescendantIds(people, partnerships, new Set(["parent"]))].sort(), ["child-1", "child-2", "grandchild"]);
  assert.equal(hasDescendants(people, "parent", partnerships), true);
  assert.equal(hasDescendants(people, "grandchild", partnerships), false);
});

test("keeps unrelated branches visible and supports clearing all collapsed roots", () => {
  const withUnrelated = [...people, { id: "unrelated", childIds: [], parentLinks: [] }];
  const hidden = getCollapsedDescendantIds(withUnrelated, partnerships, new Set(["parent"]));
  assert.equal(hidden.has("unrelated"), false);
  assert.deepEqual([...getCollapsedDescendantIds(withUnrelated, partnerships, new Set())], []);
});

test("wires collapse controls and family-pair centering into the canvas", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(source, /getCollapsedDescendantIds/);
  assert.match(source, /tree-node-collapse/);
  assert.match(source, /Развернуть ветви/);
  assert.match(source, /Центрировать семейную пару/);
  assert.match(source, /centerFamilyPair/);
  assert.match(styles, /tree-node-collapse/);
});

console.log("Stage 60 P9 collapse and family-pair centering ok");
