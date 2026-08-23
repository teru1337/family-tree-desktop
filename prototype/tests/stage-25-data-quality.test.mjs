import { strict as assert } from "node:assert";
import { createProjectPayload, validateProject } from "../src/storage.js";

const people = [
  { id: "parent", name: "Иван Петров", year: "1980" },
  { id: "child-before-parent", name: "Ольга Петрова", year: "1970", parentIds: ["parent"] },
  { id: "duplicate-1", name: "Мария Соколова", year: "1940", place: "Тула" },
  { id: "duplicate-2", name: "Мария Соколова", year: "1940", place: "Тула" },
  { id: "young-partner", name: "Анна Иванова", year: "2010" },
];

const payload = createProjectPayload(people, { id: "quality" }, [
  { id: "parent-link", kind: "parent", parentId: "parent", childId: "child-before-parent", type: "biological" },
  { id: "young-marriage", kind: "partnership", personIds: ["parent", "young-partner"], type: "marriage", status: "active", startDate: "2020", startDatePrecision: "year" },
]);
const report = validateProject(payload);

assert.equal(report.valid, true);
assert.ok(report.warnings.some((warning) => warning.includes("Возможный дубликат")));
assert.ok(report.warnings.some((warning) => warning.includes("родился раньше родителя")));
assert.ok(report.warnings.some((warning) => warning.includes("младше 12 лет на начало отношений")));

const cyclePayload = createProjectPayload([
  { id: "cycle-a", name: "Первый", year: "1980" },
  { id: "cycle-b", name: "Второй", year: "1981" },
], { id: "cycle" }, [
  { id: "cycle-a-b", kind: "parent", parentId: "cycle-a", childId: "cycle-b", type: "biological" },
  { id: "cycle-b-a", kind: "parent", parentId: "cycle-b", childId: "cycle-a", type: "biological" },
]);
const cycleReport = validateProject(cyclePayload);
assert.ok(cycleReport.warnings.some((warning) => warning.includes("образуют цикл")));

console.log("Stage 25 data quality ok: duplicate and impossible-data warnings");
