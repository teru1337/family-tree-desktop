import { strict as assert } from "node:assert";
import { createProjectPayload, normalizeProject } from "../src/storage.js";

const raw = {
  manifest: { format: "familytree", version: 1, createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z" },
  project: { id: "stage-13", title: "Проверка связей" },
  people: [
    { id: "child", name: "Ребёнок", gender: "female", parentIds: ["parent"], parentLinks: [{ id: "shared-link", personId: "step-parent", type: "step" }], partnerIds: ["parent"], childIds: [] },
    { id: "parent", name: "Родитель", gender: "male", parentIds: [], parentLinks: [], partnerIds: ["child"], childIds: ["child", "child-2"] },
    { id: "step-parent", name: "Отчим", gender: "male", parentIds: [], parentLinks: [], partnerIds: [], childIds: ["child"] },
    { id: "child-2", name: "Второй ребёнок", gender: "male", parentIds: [], parentLinks: [{ id: "shared-link", personId: "parent", type: "adoptive" }], partnerIds: [], childIds: [] },
  ],
  partnerships: [
    { id: "same-id", personIds: ["child", "parent"], type: "marriage", status: "active" },
    { id: "same-id", personIds: ["parent", "step-parent"], type: "partnership", status: "active" },
  ],
};

const project = normalizeProject(raw);
const child = project.people.find((person) => person.id === "child");
const stepLink = child.parentLinks.find((link) => link.personId === "step-parent");
const biologicalLink = child.parentLinks.find((link) => link.personId === "parent");

assert.equal(stepLink.type, "step");
assert.equal(stepLink.id, "shared-link");
assert.equal(biologicalLink.id, "parent-link-child-parent-biological");
const parentLinkIds = project.people.flatMap((person) => person.parentLinks.map((link) => link.id));
assert.equal(new Set(parentLinkIds).size, parentLinkIds.length);
assert.equal(project.people.find((person) => person.id === "child-2").parentLinks[0].id, "shared-link-child-2-1");
assert.equal(new Set(project.partnerships.map((partnership) => partnership.id)).size, 2);

const payload = createProjectPayload(project.people, project.project, project.partnerships);
assert.equal(payload.people.find((person) => person.id === "child").parentLinks[0].id, stepLink.id);
assert.equal(new Set(payload.people.flatMap((person) => person.parentLinks.map((link) => link.id))).size, parentLinkIds.length);
assert.equal(new Set(payload.partnerships.map((partnership) => partnership.id)).size, 2);
console.log("Stage 13 relationship identifiers ok");
