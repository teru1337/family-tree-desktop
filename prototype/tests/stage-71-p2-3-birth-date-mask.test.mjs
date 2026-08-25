import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dateMaskCaretForDigits, dateMaskCaretFromSelection, dateMaskDigits, formatDateMask } from "../src/date-input.js";
import { validateBasicPersonSection } from "../src/section-validation.js";

test("formats pasted and typed digits as a Russian exact-date mask", () => {
  assert.equal(dateMaskDigits("12a.05/1926"), "12051926");
  assert.equal(formatDateMask("12051926"), "12.05.1926");
  assert.equal(formatDateMask("12a.05/1926"), "12.05.1926");
  assert.equal(formatDateMask("1205"), "12.05");
  assert.equal(formatDateMask("120519269"), "12.05.1926");
});

test("keeps the caret aligned with the digit position around inserted separators", () => {
  assert.equal(dateMaskCaretForDigits("12.05.1926", 2), 2);
  assert.equal(dateMaskCaretForDigits("12.05.1926", 3), 4);
  assert.equal(dateMaskCaretForDigits("12.05.1926", 8), 10);
  assert.equal(dateMaskCaretFromSelection("12.05.1926", 3), 2);
  assert.equal(dateMaskCaretFromSelection("12.05.1926", 5), 5);
});

test("keeps incomplete exact dates in the draft and reports calendar errors on validation", () => {
  assert.equal(validateBasicPersonSection({ name: "Иван", datePrecision: "exact", year: "12.05." }).year.includes("Введите"), true);
  assert.match(validateBasicPersonSection({ name: "Иван", datePrecision: "exact", year: "29.02.2023" }).year, /день, месяц и год/);
  assert.deepEqual(validateBasicPersonSection({ name: "Иван", datePrecision: "exact", year: "29.02.2024" }), {});
});

test("wires the birth-date mask into both person-entry flows without changing date storage", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /function DateMaskInput/);
  assert.match(source, /placeholder="__\.__\.____"/);
  assert.match(source, /onBlur=\{\(\) => validateDateField\("year"\)\}/);
  assert.equal((source.match(/<DateMaskInput/g) || []).length, 2);
  assert.match(source, /formatDateRecord\(getDraftDateRecord\(draft\)\)/);
});

console.log("Stage 71 P2.3 ok: exact birth dates use a digit mask with calendar validation");
