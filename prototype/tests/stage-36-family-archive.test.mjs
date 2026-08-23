import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createFamilyArchive, serializeFamilyArchive, verifyFamilyArchive } from "../src/archive.js";
import { createProjectPayload } from "../src/storage.js";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const mainSource = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
const preloadSource = fs.readFileSync(new URL("../electron/preload.cjs", import.meta.url), "utf8");

function createFixture() {
  return createProjectPayload([
    { id: "parent", name: "Родитель", biography: "Работал на железной дороге.", source: "Семейный альбом", parentIds: [], parentLinks: [], childIds: ["child"], partnerIds: [], siblingIds: [], siblingLinks: [] },
    { id: "child", name: "Ребёнок", biography: "Сохранил семейные письма.", source: "Запись со слов семьи", parentIds: ["parent"], parentLinks: [{ id: "parent-link", personId: "parent", type: "biological" }], childIds: [], partnerIds: [], siblingIds: [], siblingLinks: [] },
  ], { id: "stage-36", title: "Архив семьи", photos: [{ id: "photo-child", personId: "child", fileName: "child.png", dataUrl: "data:image/png;base64,iVBORw0KGgo=", primary: true }] }, [{ id: "parent-link", kind: "parent", parentId: "parent", childId: "child", type: "biological" }]);
}

test("family archive preserves project materials and verifies its contents", () => {
  const archive = createFamilyArchive(createFixture());
  assert.equal(archive.manifest.format, "familyarchive");
  assert.equal(archive.manifest.version, 1);
  assert.deepEqual(archive.contents, { project: true, people: 2, relations: 1, photos: 1, biographies: 2, sources: 2 });
  assert.equal(archive.payload.people[0].biography, "Работал на железной дороге.");
  assert.equal(archive.payload.people[0].source, "Семейный альбом");
  assert.equal(archive.payload.photos[0].dataUrl, "data:image/png;base64,iVBORw0KGgo=");

  const roundTrip = verifyFamilyArchive(JSON.parse(serializeFamilyArchive(createFixture())));
  assert.equal(roundTrip.valid, true);
  assert.deepEqual(roundTrip.contents, archive.contents);
  assert.equal(roundTrip.payload.people.length, 2);
  assert.equal(roundTrip.payload.photos.length, 1);
});

test("family archive rejects an unknown format or damaged project", () => {
  const invalidFormat = verifyFamilyArchive({ manifest: { format: "familytree", version: 1 }, payload: {} });
  assert.equal(invalidFormat.valid, false);
  assert.match(invalidFormat.error, /архив|материалов|формат/i);

  const damagedPayload = verifyFamilyArchive({ manifest: { format: "familyarchive", version: 1 }, payload: { manifest: { format: "familytree", version: 6 }, people: "повреждено" } });
  assert.equal(damagedPayload.valid, false);
  assert.match(damagedPayload.error, /проект|повреж|списка|файл/i);
});

test("archive UI exposes full download, checked import and recovery", () => {
  assert.match(appSource, /Архив семейных материалов/);
  assert.match(appSource, /Скачать полный архив/);
  assert.match(appSource, /Загрузить архив/);
  assert.match(appSource, /restoreFamilyArchive/);
  assert.match(appSource, /accept="\.familyarchive,application\/json"/);
  assert.match(mainSource, /request\.kind === "archive"/);
  assert.match(mainSource, /familyarchive/);
  assert.match(preloadSource, /kind = "project"/);
});

console.log("Stage 36 family archive ok: materials, integrity verification and recovery UI");
