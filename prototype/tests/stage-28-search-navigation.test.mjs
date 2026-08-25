import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_SEARCH_FILTERS, filterPeople } from "../src/search.js";

const people = [
  { id: "parent", name: "Иван Петров", year: "1938", place: "Томск", parentLinks: [], childIds: ["child"], siblingLinks: [] },
  { id: "child", name: "Мария Петрова", birthDate: { precision: "year", value: "1965" }, place: "Новосибирск", parentLinks: [{ personId: "parent", type: "biological" }], childIds: [], siblingLinks: [] },
  { id: "sibling", name: "Ольга Петрова", year: "1968", place: "Омск", parentLinks: [], childIds: [], siblingLinks: [{ personId: "child", type: "half" }] },
];
const positions = { parent: { generation: 0 }, child: { generation: 1 }, sibling: { generation: 1 } };

test("filters people by generation, relation, date and birthplace", () => {
  assert.deepEqual(filterPeople(people, [], positions, "", { ...DEFAULT_SEARCH_FILTERS, generation: "1" }).map((person) => person.id), ["child", "sibling"]);
  assert.deepEqual(filterPeople(people, [], positions, "", { ...DEFAULT_SEARCH_FILTERS, relation: "sibling" }).map((person) => person.id), ["sibling"]);
  assert.deepEqual(filterPeople(people, [], positions, "", { ...DEFAULT_SEARCH_FILTERS, yearFrom: "1966", yearTo: "1970" }).map((person) => person.id), ["sibling"]);
  assert.deepEqual(filterPeople(people, [], positions, "", { ...DEFAULT_SEARCH_FILTERS, place: "ново" }).map((person) => person.id), ["child"]);
  assert.deepEqual(filterPeople(people, [], positions, "мария", DEFAULT_SEARCH_FILTERS).map((person) => person.id), ["child"]);
});

test("exposes navigation commands and keeps the single-save wizard flow", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Сохранить и добавить ещё одного/);
  assert.match(source, /Показать всё дерево/);
  assert.match(source, /Вернуться к выбранному человеку/);
  assert.match(source, /SearchFilterPanel/);
  assert.match(source, /generation|Поколение/);
  assert.match(source, /yearFrom|Место рождения/);
  assert.match(source, /const fitAll/);
  assert.match(styles, /view-command-control/);
  assert.match(styles, /search-filters/);
});

console.log("Stage 28 search filters and navigation commands ok");
