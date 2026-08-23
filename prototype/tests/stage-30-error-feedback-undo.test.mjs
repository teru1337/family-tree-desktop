import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { explainUserError } from "../src/ui-feedback.js";

test("explains a project-file error with a reason and next action", () => {
  const message = explainUserError(new Error("Это не файл семейного дерева."), {
    action: "Не удалось открыть файл проекта",
    next: "повторите действие",
  });
  assert.match(message, /Причина:/);
  assert.match(message, /Следующее действие:/);
  assert.match(message, /резервную копию/);
});

test("offers undo after deleting a person or an existing relationship", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(source, /toastAction/);
  assert.match(source, /setToastAction\(\{ message, label: "Отменить", onClick: undoAction \}\)/);
  assert.match(source, /Удалить существующую связь/);
  assert.match(source, /relationshipDeleteConfirm/);
  assert.match(source, /onDeleteRelationship=\{requestDeleteRelationship\}/);
  assert.match(source, /Последнее действие отменено/);
  assert.match(styles, /\.toast-action/);
  assert.match(styles, /\.relationship-delete-block/);
});

console.log("Stage 30 error feedback and delete undo ok");
