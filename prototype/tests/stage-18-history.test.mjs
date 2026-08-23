import { strict as assert } from "node:assert";
import {
  createHistory,
  createSnapshot,
  getHistoryStatus,
  recordHistory,
  redoHistory,
  snapshotsEqual,
  undoHistory,
} from "../src/history.js";

const first = createSnapshot([{ id: "one" }], [], { title: "Первое" });
const second = createSnapshot([{ id: "one" }, { id: "two" }], [], { title: "Второе" });
const third = createSnapshot([{ id: "one" }, { id: "two" }], [{ id: "pair" }], { title: "Третье" });
const fourth = createSnapshot([{ id: "four" }], [], { title: "Четвёртое" });

let history = createHistory(first, 2);
assert.deepEqual(getHistoryStatus(history), { canUndo: false, canRedo: false });
assert.equal(snapshotsEqual(first, first), true);
assert.equal(snapshotsEqual(first, second), false);

history = recordHistory(history, second);
history = recordHistory(history, third);
assert.equal(history.present, third);
assert.deepEqual(getHistoryStatus(history), { canUndo: true, canRedo: false });

history = undoHistory(history);
assert.equal(history.present, second);
assert.deepEqual(getHistoryStatus(history), { canUndo: true, canRedo: true });

history = redoHistory(history);
assert.equal(history.present, third);
assert.deepEqual(getHistoryStatus(history), { canUndo: true, canRedo: false });

history = undoHistory(history);
history = recordHistory(history, fourth);
assert.equal(history.present, fourth);
assert.equal(history.future.length, 0);
assert.deepEqual(getHistoryStatus(history), { canUndo: true, canRedo: false });

history = recordHistory(history, first);
history = recordHistory(history, second);
history = recordHistory(history, third);
assert.equal(history.past.length, 2);
assert.equal(history.past[0], first);
assert.equal(history.past[1], second);

console.log("Stage 18 undo/redo history ok: branching and history limit");
