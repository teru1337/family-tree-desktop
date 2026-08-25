import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applySuggestedChildSurname,
  composeName,
  formerSurnames,
  formatPersonName,
  normalizePersonNames,
  surnameSuggestionsForChild,
  validateSurnameHistory,
} from "../src/person-names.js";
import { createProjectPayload, normalizeProject, serializeProject, validateProject } from "../src/storage.js";

test("keeps legacy names readable while adding structured parts and surname history", () => {
  const person = normalizePersonNames({ id: "legacy", name: "Канонухин Владимир", maidenName: "Петрова" });
  assert.deepEqual(person.nameParts, { familyName: "Канонухин", givenName: "Владимир", patronymic: "" });
  assert.equal(person.name, "Канонухин Владимир");
  assert.equal(person.nameOrigin.status, "inferred");
  assert.equal(person.surnameHistory[0].surname, "Петрова");
  assert.equal(formatPersonName(person, { showFormerSurnames: true }), "Канонухин Владимир (Петрова)");
  assert.deepEqual(formerSurnames(person), ["Петрова"]);
  const removedHistory = normalizePersonNames({ ...person, surnameHistory: [] });
  assert.deepEqual(removedHistory.surnameHistory, []);
  assert.equal(removedHistory.maidenName, "");
  assert.equal(composeName({ familyName: "Иванов", givenName: "Иван", patronymic: "Петрович" }), "Иванов Иван Петрович");
});

test("persists structured names, provenance and surname history without a format bump", () => {
  const payload = createProjectPayload([{
    id: "person",
    nameParts: { familyName: "Сидорова", givenName: "Анна", patronymic: "Ивановна" },
    nameOrigin: { status: "suggested", source: "parents", personIds: ["parent-a", "parent-b"] },
    surnameHistory: [{ id: "old", surname: "Петрова", reason: "marriage", source: "Свидетельство", note: "" }],
  }], { id: "names" }, []);
  const persisted = JSON.parse(serializeProject(payload));
  assert.deepEqual(persisted.people[0].nameParts, { familyName: "Сидорова", givenName: "Анна", patronymic: "Ивановна" });
  assert.equal(persisted.people[0].nameOrigin.status, "suggested");
  assert.equal(persisted.people[0].surnameHistory[0].surname, "Петрова");
  const reopened = normalizeProject(persisted);
  assert.equal(reopened.people[0].name, "Сидорова Анна Ивановна");
  assert.equal(reopened.people[0].surnameHistory[0].reason, "marriage");
  const warningReport = validateProject({ ...persisted, people: [{ ...persisted.people[0], surnameHistory: "broken" }] });
  assert.ok(warningReport.warnings.some((warning) => warning.includes("История фамилии")));
});

test("suggests surnames from active marriage, engagement and partnership without overwriting edits", () => {
  const people = [
    { id: "parent", nameParts: { familyName: "Иванов", givenName: "Иван" }, partnerIds: ["spouse", "fiance", "partner"] },
    { id: "spouse", nameParts: { familyName: "Петрова", givenName: "Мария" } },
    { id: "fiance", nameParts: { familyName: "Сидорова", givenName: "Ольга" } },
    { id: "partner", nameParts: { familyName: "Кузнецов", givenName: "Павел" } },
    { id: "ex", nameParts: { familyName: "Бывшая", givenName: "Пара" } },
  ];
  const partnerships = [
    { id: "marriage", personIds: ["parent", "spouse"], type: "marriage", status: "active" },
    { id: "engagement", personIds: ["parent", "fiance"], type: "engagement", status: "active" },
    { id: "partnership", personIds: ["parent", "partner"], type: "partnership", status: "active" },
    { id: "divorce", personIds: ["parent", "ex"], type: "marriage", status: "divorced" },
  ];
  const suggestions = surnameSuggestionsForChild({ people, partnerships, parentId: "parent" });
  assert.deepEqual(suggestions[0].personIds, ["parent"]);
  assert.equal(suggestions[0].surname, "Иванов");
  assert.equal(suggestions.some((item) => item.surname === "Иванов-Петрова-Сидорова-Кузнецов"), false);
  assert.equal(suggestions.some((item) => item.surname === "Бывшая"), false);
  const coupleSuggestions = surnameSuggestionsForChild({ people: people.slice(0, 2), partnerships: [partnerships[0]], parentId: "parent" });
  assert.equal(coupleSuggestions[0].surname, "Иванов-Петрова");
  const draft = applySuggestedChildSurname({ nameParts: { familyName: "", givenName: "Ребёнок", patronymic: "" } }, coupleSuggestions[0]);
  assert.equal(draft.name, "Иванов-Петрова Ребёнок");
  assert.equal(draft.nameOrigin.status, "suggested");
  assert.deepEqual(draft.nameOrigin.personIds, ["parent", "spouse"]);
});

test("validates incomplete surname history without requiring any name part", () => {
  assert.equal(validateSurnameHistory([]), "");
  assert.match(validateSurnameHistory([{ surname: "", source: "Семейный архив", reason: "unknown" }]), /фамилию/);
  assert.equal(validateSurnameHistory([{ surname: "Иванова", from: "1980", to: "1990", reason: "marriage", source: "", note: "" }]), "");
});

test("wires structured names, provenance and former-surname display into the UI", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const storage = await readFile(new URL("../src/storage.js", import.meta.url), "utf8");
  assert.match(source, /NameEditorFields/);
  assert.match(source, /surnameSuggestionsForChild/);
  assert.match(source, /showFormerSurnames/);
  assert.match(source, /Прежние фамилии/);
  assert.match(storage, /normalizePersonNames/);
});

console.log("Stage 51 P3 names, surnames and safe suggestions ok");
