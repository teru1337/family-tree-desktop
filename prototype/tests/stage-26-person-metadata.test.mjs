import { strict as assert } from "node:assert";
import { createProjectPayload, normalizeProject, PROJECT_VERSION, serializeProject } from "../src/storage.js";

const payload = createProjectPayload([
  { id: "unknown", name: "", isUnknown: true, source: "Рассказала мама", confidence: "high" },
], { id: "metadata" }, []);
const persisted = JSON.parse(serializeProject(payload));

assert.equal(persisted.manifest.version, PROJECT_VERSION);
assert.equal(persisted.people[0].isUnknown, true);
assert.equal(persisted.people[0].source, "Рассказала мама");
assert.equal(persisted.people[0].confidence, "high");
assert.equal(normalizeProject(persisted).people[0].isUnknown, true);

const legacyV4 = {
  manifest: { format: "familytree", version: 4 },
  project: { id: "legacy-metadata" },
  people: [{ id: "legacy", name: "Старая запись", year: "1900" }],
  relations: [],
  photos: [],
};
const migrated = normalizeProject(legacyV4);
assert.equal(migrated.manifest.version, PROJECT_VERSION);
assert.equal(migrated.manifest.migratedFrom, 4);
assert.equal(migrated.people[0].isUnknown, false);
assert.equal(migrated.people[0].confidence, "unknown");
assert.equal(migrated.people[0].source, "");

console.log("Stage 26 person metadata ok: sources, confidence, unknown people, and v4 migration");
