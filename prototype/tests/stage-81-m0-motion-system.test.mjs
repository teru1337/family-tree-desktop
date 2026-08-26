import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MOTION, prefersReducedMotion, restartAnimation } from "../src/motion.js";

test("exposes one motion vocabulary for transitions, entrances, and background", async () => {
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  for (const token of [
    "--motion-duration-fast",
    "--motion-duration-emphasis",
    "--motion-duration-scene",
    "--motion-duration-background-slow",
    "--motion-ease-emphasis",
    "--motion-ease-entrance",
    "--motion-opacity-enter",
    "--motion-scale-enter",
  ]) {
    assert.ok(styles.includes(token), `missing motion token ${token}`);
  }
  assert.equal(MOTION.duration.emphasis, "220ms");
  assert.equal(MOTION.easing.entrance, "cubic-bezier(.16, 1, .3, 1)");
});

test("keeps reduced motion explicit and preserves a restartable class transition", () => {
  assert.equal(prefersReducedMotion(() => ({ matches: true })), true);
  assert.equal(prefersReducedMotion(() => ({ matches: false })), false);

  const calls = [];
  const element = {
    classList: {
      remove: (name) => calls.push(["remove", name]),
      add: (name) => calls.push(["add", name]),
    },
    offsetWidth: 0,
  };
  assert.equal(restartAnimation(element, "is-animation-active"), element);
  assert.deepEqual(calls, [["remove", "is-animation-active"], ["add", "is-animation-active"]]);
});

test("does not let reduced motion remove the menu result or keyboard focus", async () => {
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /\.main-menu-background, \.main-menu-background \* \{ animation: none !important; \}/);
  assert.match(styles, /\.main-menu-backdrop\.is-animation-active \.main-menu-card \{ animation: main-menu-rise/);
  assert.match(styles, /focus-visible/);
});

console.log("Stage 81 M0 ok: shared motion tokens, reduced-motion contract, and restart helper");
