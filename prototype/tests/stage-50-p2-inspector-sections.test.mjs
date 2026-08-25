import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  validateBasicPersonSection,
  validateFactSourcesSection,
  validateTimelineSection,
} from "../src/section-validation.js";

test("validates the basic, timeline and sources sections independently", () => {
  const basicErrors = validateBasicPersonSection({
    name: "Иван 123",
    datePrecision: "day",
    year: "31.02.2000",
  });
  assert.ok(basicErrors.name);
  assert.ok(basicErrors.year);
  assert.deepEqual(validateBasicPersonSection({ name: "Иван", datePrecision: "unknown", year: "" }), {});

  assert.ok(validateTimelineSection([{ title: "", date: "", type: "other", description: "" }]).timelineEvents);
  assert.ok(validateFactSourcesSection([{ label: "Рождение", source: "", note: "" }]).factSources);
});

test("wires active pencils, local section editors and single-save creation", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(source, /function SectionEditButton/);
  assert.match(source, /function BasicPersonSectionEditor/);
  assert.match(source, /function TimelineSectionEditor/);
  assert.match(source, /function FactSourcesSectionEditor/);
  assert.match(source, /SectionEditorFooter/);
  assert.match(source, /onSaveBasicSection/);
  assert.match(source, /onSaveTimelineSection/);
  assert.match(source, /onSaveFactSourcesSection/);
  assert.match(source, /initialKind=\{relationshipInitialKind\}/);
  assert.doesNotMatch(source, /Сохранить и добавить ещё одного/);
  assert.doesNotMatch(source, /handleSave\(true\)/);
  assert.match(styles, /\.section-edit-button/);
});

console.log("Stage 50 P2 inspector sections and validation ok");
