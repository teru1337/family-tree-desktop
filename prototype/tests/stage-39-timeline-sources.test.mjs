import { strict as assert } from "node:assert";
import { createProjectPayload, normalizeProject, PROJECT_VERSION, serializeProject, validateProject } from "../src/storage.js";
import { normalizeFactSources, normalizeTimelineEvents, sortTimelineEvents, validateFactSources, validateTimelineEvents } from "../src/timeline.js";

const events = normalizeTimelineEvents([
  { id: "later", type: "work", title: "Работа", date: "1965", datePrecision: "year", source: "Трудовая книжка" },
  { id: "earlier", type: "education", title: "Учёба", date: "около 1948", datePrecision: "approximate", place: "Томск" },
  { id: "duplicate", type: "unknown", title: "", date: "1950" },
  { id: "later", type: "other", title: "Переезд", date: "1970" },
]);
assert.equal(events.length, 3);
assert.equal(events[0].title, "Учёба");
assert.notEqual(events[1].id, events[2].id);
assert.equal(sortTimelineEvents(events)[0].title, "Учёба");
assert.equal(validateTimelineEvents(events), "");
assert.match(validateTimelineEvents([{ title: "" }]), /название/);
assert.match(validateFactSources({ name: "" }), /удалите/);
assert.deepEqual(normalizeFactSources({ name: " рассказала мама ", unknown: "не сохранять" }), { name: "рассказала мама" });

const payload = createProjectPayload([
  { id: "parent", name: "Родитель" },
  { id: "child", name: "Ребёнок", factSources: { birthDate: "Семейная книга" }, timelineEvents: events },
  { id: "sibling", name: "Брат или сестра" },
  { id: "partner", name: "Партнёр" },
], { id: "timeline-sources" }, [
  { id: "parent-child", kind: "parent", parentId: "parent", childId: "child", type: "biological", source: "Архив семьи" },
  { id: "sibling-link", kind: "sibling", personIds: ["child", "sibling"], type: "half", source: "Рассказ родственников" },
  { id: "partnership-link", kind: "partnership", personIds: ["child", "partner"], type: "marriage", status: "active", source: "Свидетельство о браке" },
]);
const persisted = JSON.parse(serializeProject(payload));
assert.equal(persisted.manifest.version, PROJECT_VERSION);
assert.deepEqual(persisted.people.find((person) => person.id === "child").factSources, { birthDate: "Семейная книга" });
assert.equal(persisted.people.find((person) => person.id === "child").timelineEvents.length, 3);
assert.equal(persisted.relations.find((relation) => relation.id === "parent-child").source, "Архив семьи");
assert.equal(persisted.relations.find((relation) => relation.id === "sibling-link").source, "Рассказ родственников");
assert.equal(persisted.relations.find((relation) => relation.id === "partnership-link").source, "Свидетельство о браке");

const reopened = normalizeProject(persisted);
const reopenedChild = reopened.people.find((person) => person.id === "child");
assert.deepEqual(reopenedChild.factSources, { birthDate: "Семейная книга" });
assert.equal(reopenedChild.timelineEvents[0].title, "Учёба");
assert.equal(reopened.relations.find((relation) => relation.id === "parent-child").source, "Архив семьи");
assert.equal(reopened.relations.find((relation) => relation.id === "sibling-link").source, "Рассказ родственников");
assert.equal(reopened.partnerships.find((partnership) => partnership.id === "partnership-link").source, "Свидетельство о браке");
assert.equal(validateProject(persisted).valid, true);

const legacyV6 = { ...persisted, manifest: { ...persisted.manifest, version: 6, schemaVersion: 6 } };
const migrated = normalizeProject(legacyV6);
assert.equal(migrated.manifest.version, PROJECT_VERSION);
assert.equal(migrated.manifest.migratedFrom, 6);
assert.deepEqual(migrated.people.find((person) => person.id === "child").factSources, { birthDate: "Семейная книга" });
assert.equal(migrated.people.find((person) => person.id === "child").timelineEvents.length, 3);

console.log("Stage 39 timeline and sources ok: normalization, persistence, relations, and v6 migration");
