import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { cardAnchor, cardBounds, horizontalConnection, verticalConnection } from "../src/tree-geometry.js";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const stylesSource = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

const upper = { left: 110.5, top: 80, width: 210, height: 124 };
const lower = { left: 250, top: 340.25, width: 190, height: 96 };

test("card bounds expose one canonical border-box contract", () => {
  assert.deepEqual(cardBounds(upper), {
    left: 110.5,
    top: 80,
    width: 210,
    height: 124,
    right: 320.5,
    bottom: 204,
    centerX: 215.5,
    centerY: 142,
  });
  assert.deepEqual(cardAnchor(upper, "bottom"), { x: 215.5, y: 204 });
  assert.deepEqual(cardAnchor(upper, "top"), { x: 215.5, y: 80 });
  assert.deepEqual(cardAnchor(upper, "right"), { x: 320.5, y: 142 });
  assert.deepEqual(cardAnchor(upper, "left"), { x: 110.5, y: 142 });
});

test("vertical connections terminate exactly at the lower and upper card borders", () => {
  const geometry = verticalConnection(upper, lower, 32);
  assert.equal(geometry.startX, 215.5);
  assert.equal(geometry.startY, 204);
  assert.equal(geometry.endX, 345);
  assert.equal(geometry.endY, 340.25);
  assert.match(geometry.path, /^M 215\.5 204 V /);
  assert.match(geometry.path, / V 340\.25$/);

  const reversed = verticalConnection(lower, upper, 32);
  assert.equal(reversed.startY, lower.top);
  assert.equal(reversed.endY, upper.top + upper.height);
});

test("horizontal connections terminate at the facing left and right card borders", () => {
  const geometry = horizontalConnection(upper, lower, 28);
  assert.equal(geometry.startX, upper.left + upper.width);
  assert.equal(geometry.startY, upper.top + upper.height / 2);
  assert.equal(geometry.endX, lower.left);
  assert.equal(geometry.endY, lower.top + lower.height / 2);

  const reversed = horizontalConnection(lower, upper, 28);
  assert.equal(reversed.startX, upper.left + upper.width);
  assert.equal(reversed.endX, lower.left);
});

test("the rendered card uses the same dimensions as the geometry and does not shift on hover", () => {
  assert.match(appSource, /width: position\.width, height: position\.height/);
  assert.match(appSource, /<TreeConnections people=\{people\} partnerships=\{partnerships\} positions=\{renderedPositions\}/);
  assert.doesNotMatch(stylesSource, /\.tree-node:hover[^}]*transform:\s*translateY/);
});

console.log("Stage 66 P1.1 ok: canonical card bounds, exact edge anchors and stable rendered geometry");
