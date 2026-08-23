import { strict as assert } from "node:assert";
import { createProjectPayload, normalizeProject, PROJECT_VERSION, serializeProject } from "../src/storage.js";

const legacyPeople = [
  { id: "parent", name: "Родитель", parentIds: [], parentLinks: [], partnerIds: ["child"], childIds: ["child"] },
  { id: "child", name: "Ребёнок", parentIds: ["parent"], parentLinks: [{ id: "parent-link", personId: "parent", type: "biological" }], partnerIds: ["parent"], childIds: [] },
];

const payload = createProjectPayload(legacyPeople, { id: "unified" }, [
  { id: "partnership-1", personIds: ["parent", "child"], type: "marriage", status: "active" },
]);
const persisted = JSON.parse(serializeProject(payload));

assert.equal(payload.manifest.version, PROJECT_VERSION);
assert.ok(Array.isArray(persisted.relations));
assert.equal(Object.hasOwn(persisted, "partnerships"), false);
assert.ok(persisted.relations.some((relation) => relation.kind === "parent" && relation.parentId === "parent" && relation.childId === "child"));
assert.ok(persisted.relations.some((relation) => relation.kind === "partnership"));
assert.ok(persisted.people.every((person) => !Object.hasOwn(person, "parentIds") && !Object.hasOwn(person, "parentLinks") && !Object.hasOwn(person, "partnerIds") && !Object.hasOwn(person, "childIds")));

const reopened = normalizeProject(persisted);
assert.equal(reopened.people.find((person) => person.id === "child").parentLinks.length, 1);
assert.equal(reopened.partnerships.length, 1);

const oldV2 = {
  manifest: { format: "familytree", version: 2 },
  project: { id: "old-v2" },
  people: legacyPeople,
  partnerships: [],
};
const migrated = normalizeProject(oldV2);
assert.equal(migrated.manifest.version, PROJECT_VERSION);
assert.equal(migrated.manifest.migratedFrom, 2);
assert.ok(migrated.relations.length >= 2);

console.log("Stage 22 unified relations ok: persisted files contain one canonical relations table");
