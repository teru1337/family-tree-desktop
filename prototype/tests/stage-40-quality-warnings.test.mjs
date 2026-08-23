import { strict as assert } from "node:assert";
import { createProjectPayload, validateProject } from "../src/storage.js";

const people = [
  { id: "person-a", name: "Алексей Орлов", year: "1940", place: "Тула", timelineEvents: [{ id: "event-a", title: "Переезд", date: "1935", datePrecision: "year" }] },
  { id: "person-b", name: "Алексей Орлов", year: "1960", place: "Томск" },
  { id: "person-c", name: "Мария Орлова", year: "1942" },
];

const payload = createProjectPayload(people, { id: "quality-v2" }, [
  { id: "marriage-1", kind: "partnership", personIds: ["person-a", "person-c"], type: "marriage", status: "active", startDate: "1965", startDatePrecision: "year" },
  { id: "marriage-2", kind: "partnership", personIds: ["person-c", "person-a"], type: "marriage", status: "active", startDate: "1970", startDatePrecision: "year" },
]);
const report = validateProject(payload);

assert.ok(report.warnings.some((warning) => warning.includes("Противоречие данных") && warning.includes("разные годы рождения")));
assert.ok(report.warnings.some((warning) => warning.includes("разные места рождения")));
assert.ok(report.warnings.some((warning) => warning.includes("Противоречие дат") && warning.includes("Переезд")));
assert.ok(report.warnings.some((warning) => warning.includes("несколько активных записей")));

const duplicateParentPayload = {
  ...payload,
  people: [...payload.people, { id: "child", name: "Ольга Орлова", year: "1970" }],
  relations: [
    ...payload.relations,
    { id: "parent-link-1", kind: "parent", parentId: "person-a", childId: "child", type: "biological" },
    { id: "parent-link-2", kind: "parent", parentId: "person-a", childId: "child", type: "biological" },
  ],
};
const duplicateRelationReport = validateProject(duplicateParentPayload);
assert.ok(duplicateRelationReport.warnings.some((warning) => warning.includes("Возможный дубликат связи")));

console.log("Stage 40 quality warnings ok: contradictions, timeline dates, duplicate people, and relations");
