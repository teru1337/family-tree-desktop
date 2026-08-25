import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspectFamilyData } from "../src/data-quality.js";

test("warns about timeline events after death and invalid surname periods", () => {
  const report = inspectFamilyData([{
    id: "person-1",
    name: "Иван Петров",
    year: "1950",
    deathYear: "2000",
    timelineEvents: [{ title: "Переезд", date: "2005" }],
    surnameHistory: [{ surname: "Сидоров", from: "1995", to: "1990", reason: "personal" }],
  }]);
  assert.ok(report.warnings.some((warning) => warning.includes("событие «Переезд»") && warning.includes("после смерти")));
  assert.ok(report.warnings.some((warning) => warning.includes("период фамилии «Сидоров»") && warning.includes("заканчивается раньше")));
});

test("warns when a biological child's surname has no supporting parent or history", () => {
  const report = inspectFamilyData([
    { id: "parent-1", name: "Петров Иван", year: "1950" },
    { id: "parent-2", name: "Сидорова Мария", year: "1952" },
    { id: "child", name: "Иванов Алексей", year: "1980" },
  ], [
    { id: "parent-1-child", kind: "parent", parentId: "parent-1", childId: "child", type: "biological" },
    { id: "parent-2-child", kind: "parent", parentId: "parent-2", childId: "child", type: "biological" },
  ]);
  assert.ok(report.warnings.some((warning) => warning.includes("Проверьте фамилию") && warning.includes("Иванов Алексей")));

  const explained = inspectFamilyData([
    { id: "parent", name: "Петров Иван" },
    { id: "child", name: "Иванов Алексей", surnameHistory: [{ surname: "Петров", reason: "marriage" }] },
  ], [{ id: "parent-child", kind: "parent", parentId: "parent", childId: "child", type: "biological" }]);
  assert.equal(explained.warnings.some((warning) => warning.includes("Проверьте фамилию")), false);
});

test("warns about mutually contradictory kinship edges and excessive biological parents", () => {
  const people = [
    { id: "parent-1", name: "Иван Петров", year: "1950" },
    { id: "parent-2", name: "Мария Сидорова", year: "1952" },
    { id: "parent-3", name: "Олег Орлов", year: "1951" },
    { id: "child", name: "Алексей Петров", year: "1980" },
  ];
  const report = inspectFamilyData(people, [
    { id: "parent-1-child", kind: "parent", parentId: "parent-1", childId: "child", type: "biological" },
    { id: "parent-2-child", kind: "parent", parentId: "parent-2", childId: "child", type: "biological" },
    { id: "parent-3-child", kind: "parent", parentId: "parent-3", childId: "child", type: "biological" },
    { id: "sibling-conflict", kind: "sibling", personIds: ["parent-1", "child"], type: "biological" },
    { id: "partnership-conflict", kind: "partnership", personIds: ["parent-1", "child"], type: "marriage", status: "active" },
  ]);
  assert.ok(report.warnings.some((warning) => warning.includes("одновременно указаны как родитель и брат")));
  assert.ok(report.warnings.some((warning) => warning.includes("больше двух биологических родителей")));
  assert.ok(report.warnings.some((warning) => warning.includes("партнёрская связь соединяет") && warning.includes("родитель–ребёнок")));
});

test("keeps the quality check UI and roadmap documentation connected", async () => {
  const source = await readFile(new URL("../src/data-quality.js", import.meta.url), "utf8");
  const roadmap = await readFile(new URL("../../docs/remaining-roadmap.md", import.meta.url), "utf8");
  assert.match(source, /inspectSurnameConsistency/);
  assert.match(source, /inspectKinshipConflicts/);
  assert.match(roadmap, /предупреждения о противоречивых датах, фамилиях и родстве/);
});

console.log("Stage 59 P9 quality contradictions ok: dates, surnames and kinship conflicts");
