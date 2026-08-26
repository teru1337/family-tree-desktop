import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ADDITION_PHASES, additionEdgeMatches, additionRole, additionSequenceDurations } from "../src/addition-motion.js";

test("uses one interruptible addition sequence for every supported relative kind", () => {
  const motion = { newPersonId: "new", targetPersonId: "target" };
  assert.equal(additionRole("new", motion), "new");
  assert.equal(additionRole("target", motion), "target");
  assert.equal(additionRole("other", motion), "");
  for (const kind of ["parent", "sibling", "partnership"]) {
    assert.equal(additionEdgeMatches({ kind, personIds: ["target", "new"] }, motion), true);
  }
  assert.equal(additionEdgeMatches({ kind: "parent", personIds: ["target", "other"] }, motion), false);
  assert.deepEqual(additionSequenceDurations(true), { leadIn: 0, reveal: 0, settle: 0 });
  assert.equal(ADDITION_PHASES.prepare, "prepare");
  assert.equal(ADDITION_PHASES.reveal, "reveal");
  assert.equal(ADDITION_PHASES.settle, "settle");
});

test("coordinates committed relative additions, errors, cancellation and accessible completion", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(app, /startAdditionMotion\(\{ newPersonId: newId/);
  assert.match(app, /phase: ADDITION_PHASES\.prepare/);
  assert.match(app, /phase: ADDITION_PHASES\.reveal/);
  assert.match(app, /phase: ADDITION_PHASES\.settle/);
  assert.match(app, /cancelAdditionMotion\(\);/);
  assert.match(app, /setToast\("Добавление записи в дерево…"\)/);
  assert.match(app, /setToast\(message\)/);
  assert.match(app, /try \{\s*nextGraph = relation/);
  assert.match(app, /Не удалось добавить человека/);
  assert.match(app, /additionMotion=\{additionMotion\}/);
  assert.match(styles, /\.tree-node-addition-target/);
  assert.match(styles, /\.tree-node-addition-new\.tree-node-addition-reveal/);
  assert.match(styles, /\.connection-addition-prepare/);
  assert.match(styles, /\.connection-addition-settle/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});

console.log("Stage 83 M2 ok: relative addition choreography, cancellation, error recovery and accessible completion");
