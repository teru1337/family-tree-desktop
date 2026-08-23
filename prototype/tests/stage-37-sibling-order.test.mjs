import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createProjectPayload, normalizeProject } from "../src/storage.js";
import { getSiblingComponent, orderGenerationMembers, reorderSiblingComponent } from "../src/sibling-order.js";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const stylesSource = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

const siblings = [
  { id: "young", name: "Младший", year: "1990", siblingIds: ["old", "middle"] },
  { id: "old", name: "Старший", year: "1960", siblingIds: ["young", "middle"] },
  { id: "middle", name: "Средний", year: "1975", siblingIds: ["young", "old"] },
  { id: "unrelated", name: "Отдельная запись", year: "1950", siblingIds: [] },
];

test("automatic order uses birth year only inside sibling groups", () => {
  assert.deepEqual(orderGenerationMembers(siblings).map((person) => person.id), ["old", "middle", "young", "unrelated"]);
  assert.deepEqual(getSiblingComponent(siblings, "young").map((person) => person.id), ["old", "middle", "young"]);
});

test("manual order overrides automatic order and persists on the whole group", () => {
  const movedUp = reorderSiblingComponent(siblings, "young", "up");
  assert.deepEqual(getSiblingComponent(movedUp, "young").map((person) => person.id), ["old", "young", "middle"]);
  assert.equal(movedUp.find((person) => person.id === "young").siblingOrder, 2);
  assert.equal(movedUp.find((person) => person.id === "old").siblingOrder, 1);
  assert.equal(movedUp.find((person) => person.id === "middle").siblingOrder, 3);
  assert.strictEqual(reorderSiblingComponent(movedUp, "old", "up"), movedUp);
});

test("sibling order survives project normalization and invalid values fall back safely", () => {
  const payload = createProjectPayload(siblings.map((person) => ({ ...person, siblingOrder: person.id === "young" ? 1 : null })), { id: "sibling-order" }, []);
  const reopened = normalizeProject(payload);
  assert.equal(reopened.people.find((person) => person.id === "young").siblingOrder, 1);
  const invalid = normalizeProject({ ...payload, people: payload.people.map((person) => ({ ...person, siblingOrder: person.id === "old" ? "старший" : person.siblingOrder })) });
  assert.equal(invalid.people.find((person) => person.id === "old").siblingOrder, null);
});

test("UI exposes sibling order controls and explains automatic fallback", () => {
  assert.match(appSource, /Порядок братьев и сестёр/);
  assert.match(appSource, /По умолчанию порядок определяется датой рождения/);
  assert.match(appSource, /Переместить/);
  assert.match(appSource, /onMoveSiblingOrder/);
  assert.match(stylesSource, /\.sibling-order-section/);
  assert.match(stylesSource, /\.sibling-order-item/);
});

console.log("Stage 37 sibling order ok: automatic date order, manual movement and safe persistence");
