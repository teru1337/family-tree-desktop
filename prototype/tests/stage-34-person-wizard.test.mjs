import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createProjectPayload, normalizeProject } from "../src/storage.js";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const stylesSource = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("wizard exposes explicit scenarios for incomplete family data", () => {
  assert.match(appSource, /Неизвестный родитель/);
  assert.match(appSource, /Известен только один родитель/);
  assert.match(appSource, /Ребёнок вне брака/);
  assert.match(appSource, /Добавить без указания родителей/);
  assert.match(appSource, /существующие союзы не заменяются/);
  assert.match(stylesSource, /\.wizard-scenario-box/);
  assert.match(stylesSource, /\.wizard-scenario-option/);
});

test("repeated add keeps the selected relation target for multiple relatives or partnerships", () => {
  assert.match(appSource, /setRelationshipMode\(relationshipMode\)/);
  assert.match(appSource, /setConnectionTargetId\(relationTarget\?\.id \|\| ""\)/);
  assert.match(appSource, /setPartnershipType\(partnershipType\)/);
});

test("family situation markers survive project serialization and reopening", () => {
  const people = [{
    id: "child",
    name: "Ребёнок",
    familyContext: ["single-known-parent", "out-of-marriage"],
    parentLinks: [{ id: "parent-link", personId: "parent", type: "biological" }],
    parentIds: ["parent"],
    childIds: [],
    partnerIds: [],
    siblingIds: [],
    siblingLinks: [],
  }, {
    id: "parent",
    name: "Родитель",
    parentLinks: [],
    parentIds: [],
    childIds: ["child"],
    partnerIds: [],
    siblingIds: [],
    siblingLinks: [],
  }];
  const payload = createProjectPayload(people, { id: "stage-34", title: "Мастер добавления" }, []);
  const reopened = normalizeProject(JSON.parse(JSON.stringify(payload)));
  assert.deepEqual(reopened.people.find((person) => person.id === "child").familyContext, ["single-known-parent", "out-of-marriage"]);
});

console.log("Stage 34 person wizard ok: incomplete parents, out-of-marriage child, siblings and multiple partnerships");
