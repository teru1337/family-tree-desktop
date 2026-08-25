import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { childNumberFor, orderChildrenForParent, orderSiblingMembers } from "../src/sibling-order.js";

test("orders children by complete birth date when manual order is absent", () => {
  const parent = { id: "parent", childIds: ["late", "early", "middle"] };
  const people = [
    { id: "late", name: "Поздний", year: "2005" },
    { id: "early", name: "Ранний", year: "12.01.2001" },
    { id: "middle", name: "Средний", year: "02.01.2001" },
  ];
  assert.deepEqual(orderChildrenForParent(parent, people).map((person) => person.id), ["middle", "early", "late"]);
  assert.equal(childNumberFor(parent, "early", people), 2);
});

test("keeps a manually corrected child order ahead of the birth date", () => {
  const parent = { id: "parent", childIds: ["older", "younger"] };
  const people = [
    { id: "older", name: "Старший", year: "2001", siblingOrder: 2 },
    { id: "younger", name: "Младший", year: "2005", siblingOrder: 1 },
  ];
  assert.deepEqual(orderChildrenForParent(parent, people).map((person) => person.id), ["younger", "older"]);
  assert.deepEqual(orderSiblingMembers(people).map((person) => person.id), ["younger", "older"]);
});

test("wires gender-safe selection, interactive relation labels and child numbers into the canvas", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(source, /tree-node-gender-male/);
  assert.match(source, /tree-node-gender-female/);
  assert.match(source, /tree-connection-labels/);
  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.match(source, /childNumberById/);
  assert.match(styles, /\.tree-node-selected \{ border-width: 1px/);
  assert.match(styles, /\.tree-node-gender-male/);
  assert.match(styles, /\.tree-node-gender-female/);
  assert.match(styles, /\.connection-label/);
});

console.log("Stage 52 P4 visual relation labels, gender borders and child numbering ok");
