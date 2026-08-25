import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getFamilyView, getNearbyFamilyIds } from "../src/family-view.js";
import { canMovePersonNavigation, createPersonNavigation, currentPersonId, movePersonNavigation, visitPerson } from "../src/person-navigation.js";

test("keeps a bounded person navigation history with back and forward movement", () => {
  let history = createPersonNavigation("ivan");
  history = visitPerson(history, "maria");
  history = visitPerson(history, "olga");
  assert.equal(currentPersonId(history), "olga");
  assert.equal(canMovePersonNavigation(history, -1), true);
  history = movePersonNavigation(history, -1);
  assert.equal(currentPersonId(history), "maria");
  history = visitPerson(history, "petr");
  assert.deepEqual(history.entries, ["ivan", "maria", "petr"]);
  assert.equal(canMovePersonNavigation(history, 1), false);
});

test("collects the selected person and direct relatives for nearby-family mode", () => {
  const people = [
    { id: "parent", parentIds: [], parentLinks: [], childIds: ["ivan"], siblingIds: [], siblingLinks: [], partnerIds: [] },
    { id: "ivan", parentIds: ["parent"], parentLinks: [{ personId: "parent" }], childIds: ["child"], siblingIds: ["sibling"], siblingLinks: [{ personId: "sibling" }], partnerIds: ["partner"] },
    { id: "child" },
    { id: "sibling" },
    { id: "partner" },
    { id: "distant" },
  ];
  const ids = getNearbyFamilyIds(people, [{ personIds: ["ivan", "partner"] }], "ivan");
  assert.deepEqual([...ids].sort(), ["child", "ivan", "parent", "partner", "sibling"]);
  assert.deepEqual([...getNearbyFamilyIds(people, [], "missing")], []);
});

test("exposes history controls and family branch view in the interface", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(source, /Предыдущий/);
  assert.match(source, /Следующий/);
  assert.match(source, /Родственная ветвь/);
  assert.match(source, /treeBranchDepth/);
  assert.match(source, /getFamilyView/);
  assert.match(source, /getNearbyFamilyIds/);
  assert.match(source, /viewMode=\{treeViewMode\}/);
  assert.match(styles, /tree-view-mode/);
  assert.match(styles, /person-navigation-actions/);
});

console.log("Stage 42 navigation and family branch view ok: history, focused relatives, and UI controls");
