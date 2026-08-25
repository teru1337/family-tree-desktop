import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { addBackup, createProjectPayload, normalizeProject, readBackups, readWorkingCopy, writeWorkingCopy } from "../src/storage.js";

const fixturePath = new URL("../test-data/stage-7-synthetic.familytree", import.meta.url);
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
const project = normalizeProject(fixture);

assert.equal(project.people.length, 37);
assert.equal(project.partnerships.length, 9);
assert.ok(project.people.some((person) => person.parentLinks.some((link) => link.type === "adoptive")));
assert.ok(project.people.some((person) => !person.name && !person.year));
assert.ok(project.partnerships.some((partnership) => partnership.status === "divorced"));
assert.ok(project.people.every((person) => person.parentLinks.every((link) => project.people.some((parent) => parent.id === link.personId))));

const localStorageMock = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => localStorageMock.get(key) || null,
    setItem: (key, value) => localStorageMock.set(key, String(value)),
  },
};
const payload = createProjectPayload(project.people, project.project, project.partnerships);
writeWorkingCopy(payload);
assert.equal(readWorkingCopy().people.length, 37);
addBackup(payload, "auto");
const changedPayload = createProjectPayload(payload.people.slice(0, -1), project.project, project.partnerships);
writeWorkingCopy(changedPayload);
assert.equal(readWorkingCopy().people.length, 36);
addBackup(changedPayload, "save");
assert.equal(readBackups().length, 2);
writeWorkingCopy(readBackups()[1].payload);
assert.equal(readWorkingCopy().people.length, 37);
console.log(`Stage 7 fixture ok: ${project.people.length} people, ${project.partnerships.length} partnerships`);
