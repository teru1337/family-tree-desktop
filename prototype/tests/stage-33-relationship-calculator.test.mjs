import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calculateRelationship, createRelationshipGraph } from "../src/relationship-calculator.js";

const appSource = fs.readFileSync(path.resolve("src/App.jsx"), "utf8");
const stylesSource = fs.readFileSync(path.resolve("src/styles.css"), "utf8");

const people = [
  { id: "grandpa", name: "Иван Дедушкин", gender: "male", parentLinks: [], childIds: ["mother"] },
  { id: "mother", name: "Мария Иванова", gender: "female", parentLinks: [{ id: "parent-grandpa", personId: "grandpa", type: "biological" }], childIds: ["child"] },
  { id: "cousin-parent", name: "Ольга Иванова", gender: "female", parentLinks: [{ id: "parent-grandpa-2", personId: "grandpa", type: "biological" }], childIds: ["cousin"] },
  { id: "child", name: "Пётр Петров", gender: "male", parentLinks: [{ id: "parent-mother", personId: "mother", type: "biological" }, { id: "parent-step", personId: "step-parent", type: "step" }], childIds: [] },
  { id: "cousin", name: "Анна Сидорова", gender: "female", parentLinks: [{ id: "parent-cousin", personId: "cousin-parent", type: "biological" }], childIds: [] },
  { id: "step-parent", name: "Алексей Петров", gender: "male", parentLinks: [], childIds: ["child"] },
  { id: "unrelated", name: "Николай Орлов", gender: "male", parentLinks: [], childIds: [] },
];

test("calculates direct step-parent and maternal grandfather relationships", () => {
  const stepParent = calculateRelationship(people, [], "child", "step-parent");
  assert.equal(stepParent.status, "found");
  assert.equal(stepParent.label, "отчим");
  assert.equal(stepParent.steps[0].label, "степ-родство: ребёнок → родитель");

  const grandfather = calculateRelationship(people, [], "child", "grandpa");
  assert.equal(grandfather.status, "found");
  assert.equal(grandfather.label, "дедушка по материнской линии");
  assert.deepEqual(grandfather.path.map((person) => person.id), ["child", "mother", "grandpa"]);
});

test("calculates cousin relationship through a common biological ancestor", () => {
  const result = calculateRelationship(people, [], "child", "cousin");
  assert.equal(result.status, "found");
  assert.equal(result.label, "двоюродная сестра");
  assert.equal(result.path.length, 5);
});

test("handles identical people and disconnected branches", () => {
  const same = calculateRelationship(people, [], "child", "child");
  assert.equal(same.status, "same");
  assert.equal(same.label, "Это один и тот же человек");

  const unrelated = calculateRelationship(people, [], "child", "unrelated");
  assert.equal(unrelated.status, "unrelated");
  assert.equal(unrelated.label, "Связь между людьми не найдена");
});

test("keeps partnership edges available for the calculator", () => {
  const graph = createRelationshipGraph(people, [{ id: "marriage-1", personIds: ["child", "unrelated"], type: "marriage", status: "divorced" }]);
  assert.equal(graph.graph.get("child").some(({ edge }) => edge.kind === "partnership" && edge.status === "divorced"), true);
});

test("exposes the calculator through the selected person panel and menu", () => {
  assert.match(appSource, /Калькулятор родства/);
  assert.match(appSource, /Узнать родство/);
  assert.match(appSource, /onCalculateRelationship/);
  assert.match(appSource, /onShowOnMap=\{focusPersonOnMap\}/);
  assert.match(stylesSource, /\.relationship-calculator-card/);
  assert.match(stylesSource, /\.relationship-path/);
});

console.log("Stage 33 relationship calculator ok: direct, lineage, cousin and disconnected cases");
