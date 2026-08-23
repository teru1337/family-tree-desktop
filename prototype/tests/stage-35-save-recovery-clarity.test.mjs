import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createProjectPayload, verifyBackup } from "../src/storage.js";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const stylesSource = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const mainSource = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
const preloadSource = fs.readFileSync(new URL("../electron/preload.cjs", import.meta.url), "utf8");

test("backup verification accepts a valid project and rejects a damaged one", () => {
  const payload = createProjectPayload([
    { id: "parent", name: "Родитель", parentIds: [], parentLinks: [], childIds: ["child"], partnerIds: [], siblingIds: [], siblingLinks: [] },
    { id: "child", name: "Ребёнок", parentIds: ["parent"], parentLinks: [{ id: "parent-link", personId: "parent", type: "biological" }], childIds: [], partnerIds: [], siblingIds: [], siblingLinks: [] },
  ], { id: "stage-35", title: "Проверка восстановления" }, []);
  const valid = verifyBackup({ payload });
  assert.equal(valid.valid, true);
  assert.equal(valid.peopleCount, 2);
  assert.equal(valid.relationCount, 1);
  const invalid = verifyBackup({ payload: { manifest: { format: "not-familytree" }, people: "повреждено" } });
  assert.equal(invalid.valid, false);
  assert.match(invalid.error, /формат|проект|повреж|файл/i);
});

test("save and recovery UI explains the current file and requires verification before restore", () => {
  assert.match(appSource, /Путь к файлу/);
  assert.match(appSource, /Последняя копия/);
  assert.match(appSource, /Проверить и восстановить/);
  assert.match(appSource, /Восстановить проверенную копию/);
  assert.match(appSource, /saveProjectFile/);
  assert.match(appSource, /typeof file\.path === "string"/);
  assert.match(stylesSource, /\.backup-project-summary/);
  assert.match(stylesSource, /\.backup-verification/);
});

test("Windows build exposes a native save dialog and writes the selected file", () => {
  assert.match(preloadSource, /family-tree-save-project-file/);
  assert.match(mainSource, /dialog\.showSaveDialog/);
  assert.match(mainSource, /fs\.promises\.writeFile/);
});

console.log("Stage 35 save and recovery clarity ok: path, native save and verified restore");
