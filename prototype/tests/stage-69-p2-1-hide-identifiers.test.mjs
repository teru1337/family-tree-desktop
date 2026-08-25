import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createProjectPayload, normalizeProject, serializeProject } from "../src/storage.js";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const qualitySource = readFileSync(new URL("../src/data-quality.js", import.meta.url), "utf8");

for (const visibleIdentifierText of ["ID человека", "ID связей", "ID связи", "Идентификаторы"]) {
  assert.equal(appSource.includes(visibleIdentifierText), false, `обычный интерфейс не должен показывать «${visibleIdentifierText}»`);
}
assert.equal(stylesSource.includes("relationship-id"), false, "в стилях не должно оставаться пользовательского блока ID связи");
assert.equal(stylesSource.includes("relationship-identifiers"), false, "в стилях не должно оставаться панели идентификаторов");
assert.equal(qualitySource.includes("(ID "), false, "диагностика не должна раскрывать ID человека");
assert.equal(qualitySource.includes("ID связей"), false, "диагностика не должна ссылаться на ID связей");

assert.match(appSource, /relationshipId/, "идентификатор связи должен оставаться доступным внутренней логике");
assert.match(appSource, /person\.id/, "идентификатор человека должен оставаться внутренним ключом приложения");

const people = [
  { id: "person-parent", name: "Родитель", parentIds: [], parentLinks: [], partnerIds: ["person-child"], childIds: ["person-child"] },
  { id: "person-child", name: "Ребёнок", parentIds: ["person-parent"], parentLinks: [{ id: "relation-parent-child", personId: "person-parent", type: "biological" }], partnerIds: ["person-parent"], childIds: [] },
];
const payload = createProjectPayload(people, { id: "project-with-hidden-identifiers" }, [
  { id: "relation-partnership", personIds: ["person-parent", "person-child"], type: "marriage", status: "active" },
]);
const persisted = JSON.parse(serializeProject(payload));

assert.equal(persisted.people[0].id, "person-parent");
assert.ok(persisted.relations.some((relation) => relation.id === "relation-parent-child"));
assert.ok(persisted.relations.some((relation) => relation.id === "relation-partnership"));

const reopened = normalizeProject(persisted);
assert.equal(reopened.people.find((person) => person.id === "person-child").parentLinks[0].id, "relation-parent-child");
assert.equal(reopened.partnerships[0].id, "relation-partnership");

console.log("Stage 69 P2.1 ok: technical identifiers stay persisted but are hidden from ordinary UI");
