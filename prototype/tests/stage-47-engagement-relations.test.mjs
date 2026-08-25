import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createProjectPayload, normalizeProject } from "../src/storage.js";
import { formatRelationshipStep } from "../src/relationship-calculator.js";
import { buildTreeLayout } from "../src/tree-layout.js";
import { buildTreeSvg } from "../src/exporters.js";

const people = [
  { id: "one", name: "Алексей", gender: "male", year: "1980" },
  { id: "two", name: "Мария", gender: "female", year: "1982" },
];

test("persists engagement as a distinct canonical partnership type", () => {
  const payload = createProjectPayload(people, { id: "engagement" }, [
    { id: "engagement-1", kind: "partnership", personIds: ["one", "two"], type: "engagement", status: "active", startDate: "2024", startDatePrecision: "year" },
  ]);
  const reopened = normalizeProject(JSON.parse(JSON.stringify(payload)));
  const engagement = reopened.relations.find((relation) => relation.id === "engagement-1");

  assert.equal(engagement.type, "engagement");
  assert.equal(reopened.partnerships[0].type, "engagement");
});

test("shows engagement in the relationship calculator and export", async () => {
  const partnership = { id: "engagement-1", personIds: ["one", "two"], type: "engagement", status: "active" };
  assert.equal(formatRelationshipStep(people[0], people[1], { kind: "partnership", ...partnership }), "помолвка");

  const layout = buildTreeLayout(people, [partnership]);
  const svg = await buildTreeSvg({ people, partnerships: [partnership], layout });
  assert.match(svg, /Помолвка/);
});

test("exposes engagement in both relationship editors", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /relationshipMode === "partner"/);
  assert.match(source, /partnershipType === "engagement"/);
  assert.match(source, /жених или невеста/);
  assert.match(source, /draft\.kind === "engagement"/);
  assert.match(source, /kind === "engagement"/);
  assert.match(source, /Помолвка добавлена/);
});

console.log("Stage 47 engagement relations ok: storage, editors, calculator and export preserve the new type");
