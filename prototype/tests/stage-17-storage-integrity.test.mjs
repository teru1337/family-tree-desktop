import { strict as assert } from "node:assert";
import {
  BACKUPS_KEY,
  PROJECT_VERSION,
  WORKING_COPY_KEY,
  addBackup,
  createProjectPayload,
  normalizeProject,
  readBackups,
  readWorkingCopy,
  validateProject,
  writeWorkingCopy,
} from "../src/storage.js";

const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  },
};

const legacyProject = {
  manifest: { format: "familytree", version: 1, createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z" },
  project: { id: "legacy", title: "Старая версия" },
  people: [
    { id: "parent", name: "Родитель", parentIds: [], partnerIds: [], childIds: ["child"] },
    { id: "child", name: "Ребёнок", parentIds: ["parent"], partnerIds: [], childIds: [] },
  ],
};

const migrated = normalizeProject(legacyProject);
assert.equal(migrated.manifest.version, PROJECT_VERSION);
assert.equal(migrated.manifest.schemaVersion, PROJECT_VERSION);
assert.equal(migrated.manifest.migratedFrom, 1);
assert.ok(migrated.validationWarnings.some((warning) => warning.includes("обновлён")));
assert.equal(validateProject(legacyProject).valid, true);

const payload = createProjectPayload(migrated.people, migrated.project, migrated.partnerships);
writeWorkingCopy(payload);
assert.equal(JSON.parse(store.get(WORKING_COPY_KEY)).payload.manifest.version, PROJECT_VERSION);
assert.equal(readWorkingCopy().people.length, 2);

const changedPayload = createProjectPayload([{ id: "only-person", name: "Только один" }], migrated.project, []);
writeWorkingCopy(changedPayload);
store.set(WORKING_COPY_KEY, "{ повреждённая запись");
const recovered = readWorkingCopy();
assert.equal(recovered.recoveredFrom, "previous");
assert.equal(recovered.people.length, 2);

const temporaryEnvelope = { storageVersion: PROJECT_VERSION, savedAt: new Date().toISOString(), payload: changedPayload };
store.set(`${WORKING_COPY_KEY}-tmp`, JSON.stringify(temporaryEnvelope));
store.set(WORKING_COPY_KEY, "{ повреждённая запись снова");
const recoveredTemporary = readWorkingCopy();
assert.equal(recoveredTemporary.recoveredFrom, "temporary");
assert.equal(recoveredTemporary.people.length, 1);

const danglingReference = {
  ...payload,
  people: [{ ...payload.people[0], parentIds: ["missing-person"] }, payload.people[1]],
};
const validation = validateProject(danglingReference);
assert.equal(validation.valid, true);
assert.ok(validation.warnings.some((warning) => warning.includes("missing-person")));

assert.throws(() => normalizeProject({ ...payload, manifest: { ...payload.manifest, version: 99 } }), /более новой версии/);
assert.throws(() => normalizeProject({ ...payload, people: [{ id: "same" }, { id: "same" }] }), /повторяющиеся идентификаторы/);

store.delete(`${WORKING_COPY_KEY}-tmp`);
store.set(BACKUPS_KEY, JSON.stringify([
  { id: "valid", createdAt: "2026-08-22T00:00:00.000Z", reason: "auto", payload },
  { id: "broken", payload: { manifest: { format: "wrong" } } },
]));
assert.equal(readBackups().length, 1);
assert.equal(addBackup(changedPayload, "save").peopleCount, 1);

const originalSetItem = window.localStorage.setItem;
window.localStorage.setItem = () => { throw new Error("quota"); };
assert.throws(() => writeWorkingCopy(payload), /Не удалось сохранить данные/);
window.localStorage.setItem = originalSetItem;

console.log("Stage 17 storage integrity ok: migration, validation, atomic recovery, and save failure handling");
