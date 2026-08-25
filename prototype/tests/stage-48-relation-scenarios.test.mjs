import { strict as assert } from "node:assert";
import test from "node:test";
import { applyRelationOperation } from "../src/relation-operations.js";
import { createProjectPayload, normalizeProject, validateRelationGraph } from "../src/storage.js";

const people = [
  { id: "child", name: "Ребёнок", year: "2010" },
  { id: "parent-a", name: "Родитель А", year: "1980" },
  { id: "parent-b", name: "Родитель Б", year: "1982" },
  { id: "sibling", name: "Брат", year: "2008" },
  { id: "spouse", name: "Супруг", year: "1981" },
  { id: "adoptive", name: "Усыновитель", year: "1975" },
  { id: "step", name: "Сводный родственник", year: "2009" },
];

function add(graph, relation) {
  return applyRelationOperation(graph.people, graph.partnerships, { type: "upsert", relation });
}

function reopen(graph) {
  const payload = createProjectPayload(graph.people, { id: "stage-48" }, graph.relations);
  const reopened = normalizeProject(JSON.parse(JSON.stringify(payload)));
  return { people: reopened.people, partnerships: reopened.partnerships, relations: reopened.relations };
}

function relationKinds(graph) {
  return graph.relations.map((relation) => `${relation.kind}:${relation.id}`).sort();
}

test("keeps parent-first and child-first creation equivalent after reopening", () => {
  let childFirst = { people, partnerships: [], relations: [] };
  childFirst = add(childFirst, { id: "parent-a-child", kind: "parent", parentId: "parent-a", childId: "child", type: "biological" });
  childFirst = add(childFirst, { id: "parent-b-child", kind: "parent", parentId: "parent-b", childId: "child", type: "biological" });

  let parentFirst = { people, partnerships: [], relations: [] };
  parentFirst = add(parentFirst, { id: "parent-b-child", kind: "parent", parentId: "parent-b", childId: "child", type: "biological" });
  parentFirst = add(parentFirst, { id: "parent-a-child", kind: "parent", parentId: "parent-a", childId: "child", type: "biological" });

  assert.deepEqual(relationKinds(reopen(childFirst)), relationKinds(reopen(parentFirst)));
  assert.deepEqual(reopen(childFirst).people.find((person) => person.id === "child").parentIds.sort(), ["parent-a", "parent-b"]);
});

test("preserves siblings added before their common parents", () => {
  let graph = { people, partnerships: [], relations: [] };
  graph = add(graph, { id: "sibling-link", kind: "sibling", personIds: ["child", "sibling"], type: "biological" });
  graph = add(graph, { id: "parent-a-child", kind: "parent", parentId: "parent-a", childId: "child", type: "biological" });
  graph = add(graph, { id: "parent-a-sibling", kind: "parent", parentId: "parent-a", childId: "sibling", type: "biological" });
  graph = add(graph, { id: "parent-b-child", kind: "parent", parentId: "parent-b", childId: "child", type: "biological" });
  graph = add(graph, { id: "parent-b-sibling", kind: "parent", parentId: "parent-b", childId: "sibling", type: "biological" });
  graph = reopen(graph);

  assert.equal(graph.relations.filter((relation) => relation.kind === "sibling").length, 1);
  assert.deepEqual(graph.people.find((person) => person.id === "child").siblingIds, ["sibling"]);
  assert.deepEqual(graph.people.find((person) => person.id === "sibling").siblingIds, ["child"]);
});

test("preserves partnerships created before children and spouses of parents", () => {
  let graph = { people, partnerships: [], relations: [] };
  graph = add(graph, { id: "marriage", kind: "partnership", personIds: ["parent-a", "spouse"], type: "marriage", status: "active" });
  graph = add(graph, { id: "parent-a-child", kind: "parent", parentId: "parent-a", childId: "child", type: "biological" });
  graph = add(graph, { id: "spouse-child", kind: "parent", parentId: "spouse", childId: "child", type: "biological" });
  graph = reopen(graph);

  assert.equal(graph.partnerships[0].id, "marriage");
  assert.deepEqual(graph.people.find((person) => person.id === "child").parentIds.sort(), ["parent-a", "spouse"]);
});

test("keeps biological and adoptive parents as distinct supported relations", () => {
  let graph = { people, partnerships: [], relations: [] };
  graph = add(graph, { id: "bio-parent", kind: "parent", parentId: "parent-a", childId: "child", type: "biological" });
  graph = add(graph, { id: "adoptive-parent", kind: "parent", parentId: "adoptive", childId: "child", type: "adoptive" });
  graph = reopen(graph);

  const child = graph.people.find((person) => person.id === "child");
  assert.deepEqual(child.parentIds, ["parent-a"]);
  assert.deepEqual(child.parentLinks.map((link) => link.type).sort(), ["adoptive", "biological"]);
});

test("keeps half and step sibling relations separate", () => {
  let graph = { people, partnerships: [], relations: [] };
  graph = add(graph, { id: "half-link", kind: "sibling", personIds: ["child", "sibling"], type: "half" });
  graph = add(graph, { id: "step-link", kind: "sibling", personIds: ["child", "step"], type: "step" });
  graph = reopen(graph);

  assert.deepEqual(graph.relations.filter((relation) => relation.kind === "sibling").map((relation) => relation.type).sort(), ["half", "step"]);
});

test("keeps a partnership after a surname or display-name correction", () => {
  let graph = { people, partnerships: [], relations: [] };
  graph = add(graph, { id: "marriage", kind: "partnership", personIds: ["parent-a", "spouse"], type: "marriage", status: "active" });
  graph = { ...graph, people: graph.people.map((person) => person.id === "spouse" ? { ...person, name: "Исправленная Фамилия Мария" } : person) };
  graph = reopen(graph);

  assert.equal(graph.people.find((person) => person.id === "spouse").name, "Исправленная Фамилия Мария");
  assert.equal(graph.partnerships.some((partnership) => partnership.id === "marriage"), true);
});

test("removes one relation or a person without leaving a dangling pair", () => {
  let graph = { people, partnerships: [], relations: [] };
  graph = add(graph, { id: "marriage", kind: "partnership", personIds: ["parent-a", "spouse"], type: "marriage", status: "active" });
  graph = add(graph, { id: "parent-a-child", kind: "parent", parentId: "parent-a", childId: "child", type: "biological" });
  graph = applyRelationOperation(graph.people, graph.partnerships, { type: "remove", relationId: "parent-a-child" });
  assert.equal(graph.relations.some((relation) => relation.id === "marriage"), true);

  graph = applyRelationOperation(graph.people, graph.partnerships, { type: "remove-person", personId: "spouse" });
  assert.equal(graph.people.some((person) => person.id === "spouse"), false);
  assert.equal(graph.relations.some((relation) => relation.personIds?.includes("spouse")), false);
});

test("rejects two active partnerships for one pair but allows a completed history", () => {
  const peopleForTest = people.slice(0, 2);
  const duplicate = validateRelationGraph(peopleForTest, [
    { id: "marriage-1", kind: "partnership", personIds: ["child", "parent-a"], type: "marriage", status: "active" },
    { id: "engagement-1", kind: "partnership", personIds: ["parent-a", "child"], type: "engagement", status: "active" },
  ]);
  assert.equal(duplicate.valid, false);
  assert.ok(duplicate.errors.some((error) => error.includes("активные партнёрские связи")));

  const history = validateRelationGraph(peopleForTest, [
    { id: "marriage-1", kind: "partnership", personIds: ["child", "parent-a"], type: "marriage", status: "divorced" },
    { id: "engagement-1", kind: "partnership", personIds: ["parent-a", "child"], type: "engagement", status: "active" },
  ]);
  assert.equal(history.valid, true);
});

console.log("Stage 48 relation scenarios ok: creation order, supported relations, removal, reopening and contradiction checks");
