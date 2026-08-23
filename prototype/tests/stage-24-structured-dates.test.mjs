import { strict as assert } from "node:assert";
import { createProjectPayload, normalizeProject, PROJECT_VERSION, serializeProject, validateProject } from "../src/storage.js";
import { formatDateRecord, validateDateRecord } from "../src/dates.js";

const exact = createProjectPayload([{ id: "exact", name: "Точная дата", year: "12.05.1926", datePrecision: "exact" }], { id: "dates" }, []);
const exactPersisted = JSON.parse(serializeProject(exact));
assert.deepEqual(exactPersisted.people[0].birthDate, {
  precision: "exact",
  text: "12.05.1926",
  value: "1926-05-12",
  from: "",
  to: "",
});
assert.equal(Object.hasOwn(exactPersisted.people[0], "year"), false);
assert.equal(normalizeProject(exactPersisted).people[0].year, "12.05.1926");

const range = createProjectPayload([{ id: "range", name: "Диапазон", datePrecision: "range", birthDateFrom: "1940", birthDateTo: "1945" }], { id: "range" }, []);
const rangePersisted = JSON.parse(serializeProject(range));
assert.deepEqual(rangePersisted.people[0].birthDate, {
  precision: "range",
  text: "1940 – 1945",
  value: "",
  from: "1940",
  to: "1945",
});
assert.equal(normalizeProject(rangePersisted).people[0].year, "1940 – 1945");

const invalidRange = validateDateRecord({ precision: "range", from: "1950", to: "1949" });
assert.equal(invalidRange.valid, false);
assert.match(invalidRange.error, /позже/);

const optionalEmpty = validateDateRecord({ precision: "exact", text: "", value: "", from: "", to: "" });
assert.equal(optionalEmpty.valid, true);
assert.equal(optionalEmpty.normalized.precision, "unknown");

const legacyV3 = {
  manifest: { format: "familytree", version: 3 },
  project: { id: "legacy-date" },
  people: [{ id: "legacy", name: "Старая запись", year: "1900" }],
  relations: [],
  photos: [],
};
const migrated = normalizeProject(legacyV3);
assert.equal(migrated.manifest.version, PROJECT_VERSION);
assert.equal(migrated.manifest.migratedFrom, 3);
assert.equal(migrated.people[0].birthDate.precision, "year");
assert.equal(formatDateRecord(migrated.people[0].birthDate), "1900");

const invalidReport = validateProject({
  ...exactPersisted,
  people: [{ ...exactPersisted.people[0], birthDate: { precision: "exact", value: "1926", text: "1926", from: "", to: "" } }],
});
assert.equal(invalidReport.valid, true);
assert.ok(invalidReport.warnings.some((warning) => warning.includes("Дата рождения")));

console.log("Stage 24 structured dates ok: canonical values, ranges, migration, and validation");
