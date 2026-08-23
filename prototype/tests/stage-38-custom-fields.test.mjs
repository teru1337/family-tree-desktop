import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createProjectPayload, normalizeProject, serializeProject } from "../src/storage.js";
import { CARD_FIELD_OPTIONS, DEFAULT_CARD_FIELDS, formatCardFieldLines, normalizeCustomFields, sanitizeCardFields, validateCustomFields } from "../src/person-fields.js";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const exporterSource = fs.readFileSync(new URL("../src/exporters.js", import.meta.url), "utf8");
const stylesSource = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("custom fields are bounded, normalized and safe for cards", () => {
  const fields = normalizeCustomFields([
    { id: "title", label: "  Звание  ", value: "  капитан  " },
    { id: "empty", label: "", value: "" },
    { id: "incomplete", label: "Награда", value: "" },
    { id: "title", label: "Примечание", value: "Сохранил письма" },
  ]);
  assert.deepEqual(fields.map(({ id, label, value }) => ({ id, label, value })), [
    { id: "title", label: "Звание", value: "капитан" },
    { id: "title-2", label: "Примечание", value: "Сохранил письма" },
  ]);
  assert.equal(validateCustomFields([{ label: "Награда", value: "" }]), "Для каждого дополнительного поля заполните и название, и значение.");
  assert.equal(validateCustomFields([{ label: "Звание", value: "капитан" }]), "");
  assert.deepEqual(sanitizeCardFields(["place", "unknown", "custom", "year", "occupation"]), ["place", "custom", "year", "occupation"]);
  assert.deepEqual(sanitizeCardFields([]), DEFAULT_CARD_FIELDS);
  assert.equal(CARD_FIELD_OPTIONS.length, 4);
});

test("custom fields survive project file serialization and reopening", () => {
  const payload = createProjectPayload([{ id: "p1", name: "Иван Петров", year: "1926", customFields: [{ id: "rank", label: "Звание", value: "капитан" }] }], { id: "custom-fields", settings: { cardFields: ["year", "custom"] } }, []);
  const persisted = JSON.parse(serializeProject(payload));
  assert.deepEqual(persisted.people[0].customFields, [{ id: "rank", label: "Звание", value: "капитан" }]);
  const reopened = normalizeProject(persisted);
  assert.deepEqual(reopened.people[0].customFields, [{ id: "rank", label: "Звание", value: "капитан" }]);
  assert.deepEqual(reopened.project.settings.cardFields, ["year", "custom"]);
});

test("card lines follow selected fields and omit empty optional values", () => {
  const person = { year: "1926", place: "с. Берёзовка", occupation: "Механик", customFields: [{ label: "Звание", value: "капитан" }] };
  assert.deepEqual(formatCardFieldLines(person, ["year", "place", "occupation", "custom"]), ["1926", "Место: с. Берёзовка", "Профессия: Механик", "Звание: капитан"]);
  assert.deepEqual(formatCardFieldLines({ year: "", customFields: [{ label: "Звание", value: "капитан" }] }, ["custom"]), ["Звание: капитан"]);
});

test("UI and exports expose the same card-field settings", () => {
  assert.match(appSource, /CustomFieldsEditor/);
  assert.match(appSource, /Дополнительные поля/);
  assert.match(appSource, /CardFieldsPicker/);
  assert.match(appSource, /Поля на карточках/);
  assert.match(appSource, /cardFields=\{cardFields\}/);
  assert.match(appSource, /onCardFieldsChange/);
  assert.match(exporterSource, /formatCardFieldLines/);
  assert.match(exporterSource, /cardFields = \["year"\]/);
  assert.match(stylesSource, /\.custom-field-row/);
  assert.match(stylesSource, /\.card-field-choice/);
});

console.log("Stage 38 custom fields ok: bounded person fields, persistence, card visibility and export parity");
