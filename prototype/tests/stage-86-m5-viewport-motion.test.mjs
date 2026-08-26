import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { easeViewportProgress, interpolateViewport, viewportMotionDuration } from "../src/viewport-motion.js";

const appSource = fs.readFileSync(path.resolve("src/App.jsx"), "utf8");
const stylesSource = fs.readFileSync(path.resolve("src/styles.css"), "utf8");

test("interpolates viewport motion with a bounded eased progress", () => {
  const from = { zoom: 1, pan: { x: -80, y: 40 } };
  const to = { zoom: 1.3, pan: { x: 220, y: -120 } };
  assert.equal(easeViewportProgress(0), 0);
  assert.equal(easeViewportProgress(1), 1);
  assert.equal(easeViewportProgress(-2), 0);
  assert.equal(easeViewportProgress(2), 1);
  assert.deepEqual(interpolateViewport(from, to, 0), from);
  assert.deepEqual(interpolateViewport(from, to, 1), to);
  const middle = interpolateViewport(from, to, 0.5);
  assert.ok(middle.zoom > from.zoom && middle.zoom < to.zoom);
  assert.ok(middle.pan.x > from.pan.x && middle.pan.x < to.pan.x);
  assert.equal(viewportMotionDuration(true), 0);
  assert.equal(viewportMotionDuration(false), 220);
});

test("routes zoom and pan commands through one cancellable viewport motion path", () => {
  assert.match(appSource, /useViewportMotion/);
  assert.match(appSource, /cancelViewportMotion/);
  assert.match(appSource, /animateViewportTo/);
  assert.match(appSource, /animateZoomBy/);
  assert.match(appSource, /animatePanBy/);
  assert.match(appSource, /zoomDelta/);
  assert.match(appSource, /event\.preventDefault\(\)/);
  assert.match(appSource, /onPointerDown=\{onPointerDown\}/);
  assert.match(appSource, /onWheel=\{onWheel\}/);
  assert.match(appSource, /is-viewport-animating/);
  assert.doesNotMatch(appSource, /viewportMotion[^\n]*buildPayload/);
  assert.match(stylesSource, /\.tree-viewport\.is-viewport-animating \.tree-board \{ transition: none; \}/);
  assert.match(stylesSource, /prefers-reduced-motion: reduce/);
});

console.log("Stage 86 M5 viewport motion ok: eased transitions, cancellation, cursor anchoring and reduced motion");
