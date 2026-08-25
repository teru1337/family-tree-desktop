import assert from "node:assert/strict";
import test from "node:test";
import { buildTreeLayout, withExpandedPartnershipClearance } from "../src/tree-layout.js";

const people = [
  { id: "parent", name: "Родитель", childIds: ["first", "second"] },
  { id: "first", name: "Александр", parentIds: ["parent"], childIds: ["child"] },
  { id: "second", name: "Эвелина", parentIds: ["parent"], childIds: ["child"] },
  { id: "child", name: "Ребёнок", parentIds: ["first", "second"], childIds: [] },
];
const partnerships = [{ id: "pair", personIds: ["first", "second"], type: "marriage", status: "active" }];

test("moves an expanded partnership generation and all descendants together", () => {
  const layout = buildTreeLayout(people, partnerships);
  const expanded = withExpandedPartnershipClearance(layout, partnerships, "partnership-pair", 48);
  assert.equal(expanded.positions.parent.top, layout.positions.parent.top);
  assert.equal(expanded.positions.first.top, layout.positions.first.top + 48);
  assert.equal(expanded.positions.second.top, layout.positions.second.top + 48);
  assert.equal(expanded.positions.child.top, layout.positions.child.top + 48);
  assert.equal(expanded.generations.find((group) => group.index === 1).top, layout.generations.find((group) => group.index === 1).top + 48);
  assert.equal(expanded.height, layout.height + 48);
});

test("ignores an unknown partnership label without changing the layout", () => {
  const layout = buildTreeLayout(people, partnerships);
  assert.equal(withExpandedPartnershipClearance(layout, partnerships, "partnership-missing"), layout);
});

console.log("Stage 74 P1.4 ok: expanded partnership labels reserve an upper lane and shift complete generations");
