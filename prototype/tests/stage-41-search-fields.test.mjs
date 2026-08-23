import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_SEARCH_FILTERS, filterPeople } from "../src/search.js";

const people = [
  {
    id: "ivan",
    name: "Иван Петров",
    year: "1938",
    place: "Томск",
    occupation: "Механик",
    biography: "Сохранял семейные письма и фотографии.",
    source: "Рассказала мама",
    image: "family-photo.jpg",
    factSources: { occupation: "Трудовая книжка" },
    timelineEvents: [{ title: "Переезд", date: "1960", description: "Переехал в Новосибирск", source: "Семейный архив" }],
    customFields: [{ label: "Звание", value: "капитан" }],
    parentLinks: [],
    childIds: [],
    siblingLinks: [],
    siblingIds: [],
    partnerIds: ["maria"],
  },
  {
    id: "maria",
    name: "Мария Петрова",
    year: "1940",
    place: "Омск",
    occupation: "Учитель",
    biography: "Любила сад и музыку.",
    image: "",
    parentLinks: [],
    childIds: [],
    siblingLinks: [],
    siblingIds: [],
    partnerIds: ["ivan"],
  },
];
const partnerships = [{ id: "marriage", personIds: ["ivan", "maria"], type: "marriage", status: "active", source: "Свидетельство о браке" }];
const positions = { ivan: { generation: 0 }, maria: { generation: 0 } };

function ids(query, filters = DEFAULT_SEARCH_FILTERS) {
  return filterPeople(people, partnerships, positions, query, filters).map((person) => person.id);
}

test("searches professional, biographical, source, timeline and custom data", () => {
  assert.deepEqual(ids("механик"), ["ivan"]);
  assert.deepEqual(ids("письма"), ["ivan"]);
  assert.deepEqual(ids("переезд"), ["ivan"]);
  assert.deepEqual(ids("капитан"), ["ivan"]);
  assert.deepEqual(ids("семейный архив"), ["ivan"]);
});

test("supports exact filters for occupation, biography, source and photos", () => {
  assert.deepEqual(ids("", { ...DEFAULT_SEARCH_FILTERS, occupation: "учитель" }), ["maria"]);
  assert.deepEqual(ids("", { ...DEFAULT_SEARCH_FILTERS, biography: "музыку" }), ["maria"]);
  assert.deepEqual(ids("", { ...DEFAULT_SEARCH_FILTERS, source: "свидетельство" }), ["ivan", "maria"]);
  assert.deepEqual(ids("", { ...DEFAULT_SEARCH_FILTERS, photo: "with" }), ["ivan"]);
  assert.deepEqual(ids("", { ...DEFAULT_SEARCH_FILTERS, photo: "without" }), ["maria"]);
});

test("exposes the new search fields in the interface", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(source, /Профессия/);
  assert.match(source, /Биография/);
  assert.match(source, /Источник/);
  assert.match(source, /Только с фотографией/);
  assert.match(source, /Поиск по семейным сведениям/);
  assert.match(styles, /max-height: min\(72vh, 560px\)/);
});

console.log("Stage 41 search fields ok: full-text fields, exact filters, sources and photos");
