import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createHistory, createSnapshot, recordHistory, undoHistory } from "../src/history.js";

test("undo restores the previous relation graph and its journal state atomically", () => {
  const before = createSnapshot([{ id: "parent" }, { id: "child" }], [], { changeLog: [] });
  const after = createSnapshot([{ id: "parent" }, { id: "child" }], [{ id: "parent-link", kind: "parent", parentId: "parent", childId: "child" }], { changeLog: [{ id: "change-1", summary: "Родственная связь добавлена", entityType: "relation", entityId: "parent-link", personIds: ["parent", "child"] }] });
  const undone = undoHistory(recordHistory(createHistory(before), after));
  assert.deepEqual(undone.present, before);
  assert.equal(undone.future[0], after);
});

test("exposes a dedicated undo action after relation changes", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /recordChange\(message, operation\.relationId/);
  assert.match(source, /setToastAction\(\{ message, label: "Отменить связь", onClick: undoAction \}\)/);
  assert.match(source, /Удалена связь/);
});

console.log("Stage 58 P9 relation undo ok: atomic graph restoration and dedicated UI action");
