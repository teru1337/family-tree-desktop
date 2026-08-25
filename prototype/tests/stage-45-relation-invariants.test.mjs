import { strict as assert } from "node:assert";
import test from "node:test";
import { createProjectPayload, normalizeProject, validateProject, validateRelationGraph } from "../src/storage.js";

const people = [
  { id: "grandparent", name: "Старший" },
  { id: "parent", name: "Родитель" },
  { id: "child", name: "Ребёнок" },
  { id: "partner", name: "Партнёр" },
];

test("accepts a complete canonical graph and rejects structural contradictions", () => {
  const relations = [
    { id: "parent-link-1", kind: "parent", parentId: "grandparent", childId: "parent", type: "biological" },
    { id: "parent-link-2", kind: "parent", parentId: "parent", childId: "child", type: "biological" },
    { id: "sibling-link", kind: "sibling", personIds: ["parent", "partner"], type: "unknown" },
    { id: "partnership-1", kind: "partnership", personIds: ["child", "partner"], type: "marriage", status: "active" },
  ];

  assert.equal(validateRelationGraph(people, relations).valid, true);

  const invalid = validateRelationGraph(people, [
    ...relations,
    { id: "duplicate-parent", kind: "parent", parentId: "parent", childId: "child", type: "biological" },
    { id: "orphan", kind: "parent", parentId: "missing", childId: "child", type: "biological" },
    { id: "self", kind: "parent", parentId: "child", childId: "child", type: "biological" },
    { id: "bad-sibling", kind: "sibling", personIds: ["parent", "child", "partner"], type: "biological" },
  ]);

  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.includes("дублирует")));
  assert.ok(invalid.errors.some((error) => error.includes("отсутствующего человека")));
  assert.ok(invalid.errors.some((error) => error.includes("самого себя")));
  assert.ok(invalid.errors.some((error) => error.includes("ровно двух")));
});

test("rejects duplicate relation identifiers, exact duplicate partnerships, and parent cycles", () => {
  const duplicateId = validateRelationGraph(people, [
    { id: "same", kind: "parent", parentId: "grandparent", childId: "parent", type: "biological" },
    { id: "same", kind: "parent", parentId: "parent", childId: "child", type: "biological" },
  ]);
  assert.ok(duplicateId.errors.some((error) => error.includes("совпадает технический ключ")));

  const duplicatePartnership = validateRelationGraph(people, [
    { id: "marriage-1", kind: "partnership", personIds: ["child", "partner"], type: "marriage", status: "active" },
    { id: "marriage-2", kind: "partnership", personIds: ["partner", "child"], type: "marriage", status: "active" },
  ]);
  assert.ok(duplicatePartnership.errors.some((error) => error.includes("дублирует")));

  const cycle = validateRelationGraph(people, [
    { id: "cycle-1", kind: "parent", parentId: "grandparent", childId: "parent", type: "biological" },
    { id: "cycle-2", kind: "parent", parentId: "parent", childId: "grandparent", type: "biological" },
  ]);
  assert.ok(cycle.errors.some((error) => error.includes("образуют цикл")));
});

test("blocks invalid canonical files before normalization silently drops relations", () => {
  const payload = createProjectPayload(people, { id: "invariants" }, [
    { id: "parent-link", kind: "parent", parentId: "grandparent", childId: "parent", type: "biological" },
  ]);
  const invalidPayload = {
    ...payload,
    relations: [
      ...payload.relations,
      { id: "orphan", kind: "parent", parentId: "missing", childId: "child", type: "biological" },
    ],
  };

  const report = validateProject(invalidPayload);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((error) => error.includes("отсутствующего человека")));
  assert.throws(() => normalizeProject(invalidPayload), /отсутствующего человека/);
});

test("keeps legacy dangling references as warnings for backward compatibility", () => {
  const payload = createProjectPayload(people, { id: "legacy-compatibility" }, []);
  const legacyReference = {
    ...payload,
    people: [{ ...payload.people[0], parentIds: ["missing-person"] }, ...payload.people.slice(1)],
  };
  const report = validateProject(legacyReference);

  assert.equal(report.valid, true);
  assert.ok(report.warnings.some((warning) => warning.includes("ссылка на отсутствующего человека")));
});

console.log("Stage 45 relation invariants ok: canonical graph errors are explicit and legacy references remain compatible");
