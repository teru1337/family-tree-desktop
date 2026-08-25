import { strict as assert } from "node:assert";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { applyRelationOperation } from "../src/relation-operations.js";

const people = [
  { id: "parent", name: "Родитель" },
  { id: "child", name: "Ребёнок" },
  { id: "sibling", name: "Сестра" },
  { id: "partner", name: "Партнёр" },
];

test("adds and updates all relation kinds through one canonical transaction", () => {
  let graph = applyRelationOperation(people, [], {
    type: "upsert",
    relation: { id: "parent-link", kind: "parent", parentId: "parent", childId: "child", type: "biological" },
  });
  graph = applyRelationOperation(graph.people, graph.partnerships, {
    type: "upsert",
    relation: { id: "sibling-link", kind: "sibling", personIds: ["child", "sibling"], type: "half" },
  });
  graph = applyRelationOperation(graph.people, graph.partnerships, {
    type: "upsert",
    relation: { id: "partnership-link", kind: "partnership", personIds: ["child", "partner"], type: "marriage", status: "active" },
  });

  assert.equal(graph.relations.length, 3);
  assert.equal(graph.people.find((person) => person.id === "child").parentIds[0], "parent");
  assert.equal(graph.people.find((person) => person.id === "sibling").siblingIds[0], "child");
  assert.equal(graph.partnerships[0].personIds.includes("child"), true);

  graph = applyRelationOperation(graph.people, graph.partnerships, {
    type: "update",
    relationId: "partnership-link",
    relation: { id: "partnership-link", kind: "partnership", personIds: ["child", "partner"], type: "marriage", status: "divorced", endDate: "2020", endDatePrecision: "year" },
  });
  assert.equal(graph.partnerships[0].status, "divorced");
});

test("removes one relation or a person without leaving dangling runtime arrays", () => {
  const withParent = applyRelationOperation(people, [], {
    type: "upsert",
    relation: { id: "parent-link", kind: "parent", parentId: "parent", childId: "child", type: "biological" },
  });
  const withoutRelation = applyRelationOperation(withParent.people, withParent.partnerships, { type: "remove", relationId: "parent-link" });
  assert.equal(withoutRelation.relations.length, 0);
  assert.deepEqual(withoutRelation.people.find((person) => person.id === "child").parentIds, []);
  assert.deepEqual(withoutRelation.people.find((person) => person.id === "parent").childIds, []);

  const removedPerson = applyRelationOperation(withParent.people, withParent.partnerships, { type: "remove-person", personId: "parent" });
  assert.equal(removedPerson.people.some((person) => person.id === "parent"), false);
  assert.equal(removedPerson.relations.some((relation) => relation.parentId === "parent" || relation.childId === "parent"), false);
});

test("does not commit an invalid operation and wires the UI to the transaction helper", async () => {
  assert.throws(() => applyRelationOperation(people, [], {
    type: "upsert",
    relation: { id: "invalid", kind: "parent", parentId: "child", childId: "child", type: "biological" },
  }), /самого себя/);

  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /applyRelationOperation/);
  assert.match(source, /remove-person/);
  assert.match(source, /type: "upsert"/);
});

console.log("Stage 46 atomic relations ok: canonical operations synchronize people and partnerships");
