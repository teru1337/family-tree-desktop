import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { appendChangeLog, changeLogForPerson, normalizeChangeLog, normalizeRecordOrigin, recordOriginLabel } from "../src/change-log.js";
import { createProjectPayload, normalizeProject, serializeProject } from "../src/storage.js";

test("normalizes the three record-origin states and rejects unknown values", () => {
  assert.deepEqual(normalizeRecordOrigin({ status: "imported", source: " GEDCOM " }), { status: "imported", source: "GEDCOM" });
  assert.deepEqual(normalizeRecordOrigin({ status: "unexpected", source: "x" }), { status: "manual", source: "x" });
  assert.equal(recordOriginLabel({ status: "inferred" }), "Выведено приложением");
});

test("keeps a bounded journal and filters entries by person", () => {
  const entries = Array.from({ length: 105 }, (_, index) => ({ id: `change-${index}`, summary: `Изменение ${index}`, entityType: "person", entityId: `person-${index}`, personIds: [`person-${index}`] }));
  const normalized = normalizeChangeLog(entries);
  assert.equal(normalized.length, 100);
  assert.equal(normalized[0].id, "change-5");
  const appended = appendChangeLog(normalized, { summary: "Изменён человек", entityType: "person", entityId: "person-99", personIds: ["person-99"] }, "2026-08-25T12:00:00.000Z");
  assert.equal(appended.at(-1).timestamp, "2026-08-25T12:00:00.000Z");
  assert.equal(changeLogForPerson(appended, "person-99").length, 2);
});

test("persists provenance and journal without introducing secrets or a format bump", () => {
  const payload = createProjectPayload([{ id: "person-1", name: "Иван", recordOrigin: { status: "inferred", source: "по родительской связи" } }], { changeLog: [{ id: "change-1", timestamp: "2026-08-25T12:00:00.000Z", summary: "Добавлен человек", entityType: "person", entityId: "person-1", personIds: ["person-1"] }] }, []);
  const persisted = JSON.parse(serializeProject(payload));
  assert.equal(persisted.manifest.version, 7);
  assert.deepEqual(persisted.people[0].recordOrigin, { status: "inferred", source: "по родительской связи" });
  assert.equal(persisted.project.changeLog.length, 1);
  const normalized = normalizeProject(persisted);
  assert.equal(normalized.project.changeLog[0].summary, "Добавлен человек");
});

test("keeps old people and projects compatible when optional quality fields are absent", () => {
  const payload = createProjectPayload([{ id: "person-1", name: "Старый формат" }], {}, []);
  assert.equal(Object.hasOwn(payload.people[0], "recordOrigin"), false);
  assert.equal(Object.hasOwn(payload.project, "changeLog"), false);
});

test("wires provenance editing, journal recording and the history menu into the UI", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const originField = await readFile(new URL("../src/RecordOriginField.jsx", import.meta.url), "utf8");
  const modal = await readFile(new URL("../src/ChangeLogModal.jsx", import.meta.url), "utf8");
  assert.match(source, /recordChange/);
  assert.match(source, /История изменений/);
  assert.match(source, /RecordOriginField/);
  assert.match(originField, /Происхождение записи/);
  assert.match(modal, /Последние изменения людей и связей/);
});

console.log("Stage 57 P9 quality journal ok: provenance, bounded persistence, compatibility and UI wiring");
