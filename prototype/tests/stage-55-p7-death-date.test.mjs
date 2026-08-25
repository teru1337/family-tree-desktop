import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calculateAgeAtDeath, formatAgeAtDeath, validateDateRecord } from "../src/dates.js";
import { inspectFamilyData } from "../src/data-quality.js";
import { validateBasicPersonSection } from "../src/section-validation.js";
import { createProjectPayload, normalizeProject, serializeProject } from "../src/storage.js";

const deathInput = {
  id: "person-1",
  name: "Иван Иванов",
  year: "12.05.1926",
  datePrecision: "exact",
  deathYear: "10.04.2020",
  deathDatePrecision: "exact",
  deathPlace: "Новосибирск",
  deathCause: "Естественные причины",
  deathSource: "Свидетельство о смерти",
  deathComment: "Сведения подтверждены архивом",
};

test("persists and reopens structured death information without adding it to old people", () => {
  const payload = createProjectPayload([deathInput, { id: "legacy", name: "Старая запись", year: "1900" }], { id: "stage-55" }, []);
  const persisted = JSON.parse(serializeProject(payload));
  const saved = persisted.people.find((person) => person.id === "person-1");
  assert.deepEqual(saved.deathDate, {
    precision: "exact",
    text: "10.04.2020",
    value: "2020-04-10",
    from: "",
    to: "",
  });
  assert.equal(saved.deathPlace, "Новосибирск");
  assert.equal(saved.deathCause, "Естественные причины");
  assert.equal(normalizeProject(persisted).people.find((person) => person.id === "person-1").deathYear, "10.04.2020");
  assert.equal(Object.hasOwn(persisted.people.find((person) => person.id === "legacy"), "deathDate"), false);
});

test("accepts every supported death-date precision and rejects invalid chronology", () => {
  for (const [precision, value] of [["exact", "10.04.2020"], ["year", "2020"], ["approximate", "около 2020"], ["range", ""]]) {
    const record = precision === "range"
      ? { precision, from: "2020", to: "2021" }
      : { precision, text: value, value };
    assert.equal(validateDateRecord(record).valid, true, precision);
  }
  const errors = validateBasicPersonSection({ name: "Иван", year: "1926", datePrecision: "year", deathYear: "1900", deathDatePrecision: "year" });
  assert.match(errors.deathYear, /раньше даты рождения/);
});

test("calculates an approximate age interval instead of false precision", () => {
  const age = calculateAgeAtDeath({ precision: "year", value: "1926" }, { precision: "approximate", value: "2020", text: "около 2020" });
  assert.deepEqual(age, { minimum: 93, maximum: 94, approximate: true });
  assert.equal(formatAgeAtDeath({ precision: "year", value: "1926" }, { precision: "approximate", value: "2020", text: "около 2020" }), "около 93–94 лет");
});

test("reports impossible death dates in loaded data quality warnings", () => {
  const report = inspectFamilyData([{ id: "person-1", name: "Иван", birthDate: { precision: "exact", value: "1926-05-12" }, deathDate: { precision: "exact", value: "1900-04-10" } }]);
  assert.ok(report.warnings.some((warning) => warning.includes("смерть") && warning.includes("раньше рождения")));
});

test("wires death fields, death marker and generated timeline event into the UI", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /DeathFields/);
  assert.match(source, /tree-node-death-marker/);
  assert.match(source, /generatedDeathEvent/);
  assert.match(source, /formatAgeAtDeath/);
  const timeline = await readFile(new URL("../src/timeline.js", import.meta.url), "utf8");
  assert.match(timeline, /value: "death", label: "Смерть"/);
});

console.log("Stage 55 P7 death date ok: persistence, precision, chronology, approximate age and timeline marker");
