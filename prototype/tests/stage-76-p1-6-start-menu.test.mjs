import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("starts the Electron window in borderless system fullscreen", async () => {
  const source = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  assert.match(source, /frame: false/);
  assert.match(source, /fullscreen: true/);
  assert.match(source, /fullscreenable: true/);
  assert.doesNotMatch(source, /mainWindow\.maximize\(\)/);
});

test("provides the animated start-menu scene without a manual skip action", async () => {
  const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(appSource, /function MainMenuBackground\(\)/);
  assert.match(appSource, /main-menu-background/);
  assert.doesNotMatch(appSource, /Пропустить анимацию/);
  assert.doesNotMatch(appSource, /setAnimationActive/);
  assert.match(styles, /main-menu-branch/);
  assert.match(styles, /main-menu-leaf/);
  assert.match(styles, /main-menu-relation-line/);
  assert.match(styles, /main-menu-ghost-card/);
  assert.match(styles, /main-menu-particle/);
  assert.match(styles, /main-menu-rise/);
  assert.doesNotMatch(styles, /is-animation-skipped/);
});

test("keeps the menu entrance while disabling ambient decoration for reduced motion", async () => {
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /\.main-menu-background, \.main-menu-background \* \{ animation: none !important; \}/);
  assert.match(styles, /\.main-menu-backdrop\.is-animation-active \.main-menu-card \{ animation: main-menu-rise/);
});

console.log("Stage 76 P1.6 ok: the application opens with a borderless fullscreen animated start menu");
