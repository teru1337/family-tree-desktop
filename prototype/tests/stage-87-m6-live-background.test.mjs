import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ambientMotionVisible } from "../src/motion.js";

const appSource = fs.readFileSync(path.resolve("src/App.jsx"), "utf8");
const stylesSource = fs.readFileSync(path.resolve("src/styles.css"), "utf8");

test("pauses ambient motion for hidden and prerendered documents", () => {
  assert.equal(ambientMotionVisible("visible"), true);
  assert.equal(ambientMotionVisible("hidden"), false);
  assert.equal(ambientMotionVisible("prerender"), false);
});

test("keeps the start background decorative, visible-state aware and contrast safe", () => {
  assert.match(appSource, /function useAmbientMotionVisibility\(\)/);
  assert.match(appSource, /visibilitychange/);
  assert.match(appSource, /pageshow/);
  assert.match(appSource, /pagehide/);
  assert.match(appSource, /is-ambient-hidden/);
  assert.match(stylesSource, /contain: strict/);
  assert.match(stylesSource, /is-ambient-hidden .*animation-play-state: paused/);
  assert.match(stylesSource, /prefers-contrast: more/);
  assert.match(stylesSource, /forced-colors: active/);
  assert.match(stylesSource, /\.main-menu-background, \.main-menu-background \* \{ animation: none !important; \}/);
  const backgroundSource = appSource.slice(appSource.indexOf("function MainMenuBackground"), appSource.indexOf("function useAmbientMotionVisibility"));
  assert.doesNotMatch(backgroundSource, /people/);
});

console.log("Stage 87 M6 live background ok: visibility pause, reduced motion and contrast-safe decoration");
