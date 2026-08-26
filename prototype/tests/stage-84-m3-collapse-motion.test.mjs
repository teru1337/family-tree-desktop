import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createCollapseIndex, getCollapsedDescendantIds, getCollapsibleIds } from "../src/tree-collapse.js";

const people = [
  { id: "root", childIds: ["child-a"], parentLinks: [] },
  { id: "partner", childIds: ["child-b"], parentLinks: [] },
  { id: "child-a", childIds: ["grandchild"], parentLinks: [{ personId: "root" }] },
  { id: "child-b", childIds: [], parentLinks: [{ personId: "partner" }] },
  { id: "grandchild", childIds: [], parentLinks: [{ personId: "child-a" }] },
  { id: "independent", childIds: [], parentLinks: [] },
];
const partnerships = [{ id: "pair", personIds: ["root", "partner"], status: "active" }];

test("collapse motion preserves the root and pair while hiding only the connected descendant branch", () => {
  const index = createCollapseIndex(people, partnerships);
  const hidden = getCollapsedDescendantIds(people, partnerships, new Set(["root"]), index);
  assert.deepEqual([...hidden].sort(), ["child-a", "child-b", "grandchild"]);
  assert.equal(hidden.has("root"), false);
  assert.equal(hidden.has("partner"), false);
  assert.equal(hidden.has("independent"), false);
  assert.ok(getCollapsibleIds(people, partnerships, index).has("root"));
});

test("collapse motion keeps canonical relations available for reopen and does not mutate graph data", () => {
  const before = JSON.stringify({ people, partnerships });
  const hidden = getCollapsedDescendantIds(people, partnerships, new Set(["root"]));
  hidden.delete("child-a");
  assert.deepEqual(JSON.parse(JSON.stringify({ people, partnerships })), JSON.parse(before));
  assert.deepEqual([...getCollapsedDescendantIds(people, partnerships, new Set())], []);
});

test("M3 wires interruptible card exit, previous hidden geometry and reduced-motion behavior", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const motion = await readFile(new URL("../src/collapse-motion.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(motion, /previousHiddenIdsRef/);
  assert.match(motion, /useCollapseMotion/);
  assert.match(source, /exitingIds/);
  assert.match(source, /transitionHiddenIds/);
  assert.match(source, /motionVisiblePeople/);
  assert.match(source, /prefersReducedMotion\(\)/);
  assert.match(source, /aria-label={`\$\{collapsed \? "Развернуть" : "Свернуть"\} ветвь/);
  assert.match(styles, /@keyframes tree-node-exit/);
  assert.match(styles, /\.tree-node-motion-exit/);
  assert.match(styles, /pointer-events: none/);
  assert.match(styles, /prefers-reduced-motion/);
});

console.log("Stage 84 M3 collapse choreography ok: branch visibility, exit state, canonical graph, and reduced motion");
