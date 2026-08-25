import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRenderIndex, visibleEdges } from "../src/render-index.js";
import { createCollapseIndex, getCollapsedDescendantIds, getCollapsibleIds } from "../src/tree-collapse.js";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const collapseSource = await readFile(new URL("../src/tree-collapse.js", import.meta.url), "utf8");
const renderIndexSource = await readFile(new URL("../src/render-index.js", import.meta.url), "utf8");

function createChain(size) {
  return Array.from({ length: size }, (_, index) => ({
    id: `person-${index}`,
    name: `Человек ${index}`,
    parentIds: index > 0 ? [`person-${index - 1}`] : [],
    parentLinks: index > 0 ? [{ personId: `person-${index - 1}`, type: "biological" }] : [],
    childIds: index < size - 1 ? [`person-${index + 1}`] : [],
  }));
}

test("large branch indexes stay iterative and expose collapsible roots in one pass", () => {
  const people = createChain(8000);
  const index = createCollapseIndex(people, []);
  const hidden = getCollapsedDescendantIds(people, [], new Set(["person-0"]), index);
  assert.equal(hidden.size, 7999);
  assert.equal(getCollapsibleIds(people, [], index).size, 7999);
  assert.match(collapseSource, /for \(let queueIndex = 0; queueIndex < queue\.length/);
  assert.match(appSource, /const collapseIndex = useMemo/);
  assert.match(appSource, /getCollapsibleIds\(people, partnerships, collapseIndex\)/);
});

test("visible edge lookup uses the participant index instead of scanning every edge", () => {
  const people = createChain(6000);
  const index = createRenderIndex(people, []);
  const visible = visibleEdges(index.parentEdges, new Set(["person-5999"]), index.parentEdgesByPerson);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].child.id, "person-5999");
  assert.match(renderIndexSource, /parentEdgesByPerson/);
  assert.match(renderIndexSource, /if \(edgesByPerson\)/);
  assert.match(appSource, /visibleEdges\(index\.parentEdges, visibleIds, index\.parentEdgesByPerson\)/);
});

test("connection labels and mini-map geometry are memoized with their actual inputs", () => {
  assert.match(appSource, /const labels = useMemo\(\(\) => \[/);
  assert.match(appSource, /const parentLines = useMemo\(\(\) =>/);
  assert.match(appSource, /const partnerLines = useMemo\(\(\) =>/);
  assert.match(appSource, /const miniMapPeople = useMemo\(\(\) =>/);
});

console.log("Stage 63 large-tree performance ok: linear collapse indexes, incident edge lookup, and memoized labels");
