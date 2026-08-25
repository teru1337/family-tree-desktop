import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calculateRelationship, orientRelationshipPath } from "../src/relationship-calculator.js";

const generations = [
  { id: "grandparent", name: "Старший", year: "1940", childIds: ["parent"] },
  { id: "parent", name: "Родитель", year: "1970", parentIds: ["grandparent"], childIds: ["child"] },
  { id: "child", name: "Ребёнок", year: "2000", parentIds: ["parent"] },
];

test("orients the displayed path from older generations to younger ones", () => {
  const result = calculateRelationship(generations, [], "child", "grandparent");
  assert.deepEqual(result.path.map((person) => person.id), ["child", "parent", "grandparent"]);
  assert.deepEqual(result.displayPath.map((person) => person.id), ["grandparent", "parent", "child"]);
  assert.equal(result.displaySteps[0].label, "родственная связь: родитель → ребёнок");

  const reverseSelection = calculateRelationship(generations, [], "grandparent", "child");
  assert.deepEqual(reverseSelection.displayPath.map((person) => person.id), result.displayPath.map((person) => person.id));
});

test("uses age and then manual sibling order for equal-generation endpoints", () => {
  const people = [
    { id: "older", name: "Старший", year: "1980", siblingLinks: [{ personId: "younger", type: "biological" }] },
    { id: "younger", name: "Младший", year: "1990", siblingLinks: [{ personId: "older", type: "biological" }] },
  ];
  assert.deepEqual(calculateRelationship(people, [], "younger", "older").displayPath.map((person) => person.id), ["older", "younger"]);
  const manual = people.map((person) => ({ ...person, year: "1980", siblingOrder: person.id === "younger" ? 1 : 2 }));
  assert.deepEqual(calculateRelationship(manual, [], "older", "younger").displayPath.map((person) => person.id), ["younger", "older"]);
});

test("keeps path orientation as a pure, reusable calculation", () => {
  const source = generations[2];
  const target = generations[0];
  const path = [source, generations[1], target];
  const edges = [{ kind: "parent", parentId: "parent", childId: "child" }, { kind: "parent", parentId: "grandparent", childId: "parent" }];
  const oriented = orientRelationshipPath(source, target, path, edges);
  assert.equal(oriented.reversed, true);
  assert.deepEqual(oriented.path.map((person) => person.id), ["grandparent", "parent", "child"]);
});

test("wires the ordered display path and direction explanation into the calculator UI", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /displayPath/);
  assert.match(source, /displaySteps/);
  assert.match(source, /Путь от старших к младшим/);
});

console.log("Stage 54 P6 relationship calculator ordering ok: older-first path, age and sibling order");
