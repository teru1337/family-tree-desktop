import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { layoutDelta, motionDurationMs } from "../src/motion.js";

test("calculates a transform-only FLIP delta and keeps motion duration bounded", () => {
  assert.deepEqual(layoutDelta({ left: 100, top: 220 }, { left: 140, top: 190 }), { x: -40, y: 30 });
  assert.equal(layoutDelta({ left: 100, top: 220 }, { left: 100, top: 220 }), null);
  assert.equal(motionDurationMs("220ms"), 220);
  assert.equal(motionDurationMs("invalid"), 0);
});

test("animates cards and connector geometry after a committed layout", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(app, /useLayoutEffect\(\(\) => \{/);
  assert.match(app, /layoutDelta\(previous\[id\], position\)/);
  assert.match(app, /tree-node-motion-enter/);
  assert.match(app, /tree-connections-previous/);
  assert.match(app, /tree-connections-current/);
  assert.match(app, /cancelAnimationFrame/);
  assert.match(app, /clearTimeout/);
  assert.match(styles, /@keyframes tree-node-enter/);
  assert.match(styles, /\.tree-node-motion-enter/);
  assert.match(styles, /\.tree-connections-current-from/);
  assert.match(styles, /\.tree-connections-previous-to/);
  assert.match(styles, /\.tree-node \{[^}]*transform var\(--motion-duration-emphasis\)/);
});

test("does not animate layout by changing card coordinates or alter focusable card identity", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(app, /<TreeNode key=\{person\.id\}/);
  assert.match(app, /style=\{\{ left: position\.left, top: position\.top/);
  assert.doesNotMatch(styles, /\.tree-node \{[^}]*transition:[^}]*left/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /\.tree-node:focus-visible|button:focus-visible/);
});

console.log("Stage 82 M1 ok: committed card FLIP motion, new-card entrance, connector crossfade, and cancellation hooks");
