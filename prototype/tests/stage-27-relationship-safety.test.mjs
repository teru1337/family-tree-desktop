import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createProjectPayload, normalizeProject, serializeProject } from "../src/storage.js";

const people = [
  { id: "alex", name: "Алексей" },
  { id: "maria", name: "Мария" },
  { id: "olga", name: "Ольга" },
];

test("stores guardian and sibling relationships with stable IDs on both people", () => {
  const payload = createProjectPayload(people, { id: "relations" }, [
    { id: "guardian-1", kind: "parent", parentId: "alex", childId: "maria", type: "guardian" },
    { id: "sibling-1", kind: "sibling", personIds: ["maria", "olga"], type: "half" },
  ]);
  const persisted = JSON.parse(serializeProject(payload));
  const reopened = normalizeProject(persisted);

  assert.deepEqual(reopened.relations.find((relation) => relation.id === "guardian-1"), {
    id: "guardian-1", kind: "parent", parentId: "alex", childId: "maria", type: "guardian",
  });
  assert.deepEqual(reopened.relations.find((relation) => relation.id === "sibling-1"), {
    id: "sibling-1", kind: "sibling", personIds: ["maria", "olga"], type: "half",
  });
  assert.equal(reopened.people.find((person) => person.id === "maria").parentLinks[0].type, "guardian");
  assert.deepEqual(reopened.people.find((person) => person.id === "maria").siblingLinks[0], { id: "sibling-1", personId: "olga", type: "half" });
  assert.deepEqual(reopened.people.find((person) => person.id === "olga").siblingLinks[0], { id: "sibling-1", personId: "maria", type: "half" });
});

test("supports legacy sibling arrays without losing the relationship", () => {
  const payload = createProjectPayload([
    { id: "one", name: "Один", siblingIds: ["two"] },
    { id: "two", name: "Два" },
  ], { id: "legacy-siblings" }, []);
  const sibling = payload.relations.find((relation) => relation.kind === "sibling");
  assert.equal(sibling.type, "biological");
  assert.equal(sibling.personIds.length, 2);
});

test("guards destructive navigation when the project is dirty", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /pendingUnsavedAction/);
  assert.match(source, /Сохранить и продолжить/);
  assert.match(source, /Не сохранять/);
  assert.match(source, /beforeunload/);
  assert.match(source, /createNewTree\(action\.fromMenu, true\)/);
  assert.match(source, /exitApplication\(true\)/);
  assert.match(source, /openProject\(true\)/);
});

console.log("Stage 27 relationship and unsaved-change guards ok");
