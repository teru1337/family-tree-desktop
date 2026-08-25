import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { partnershipLabelAnchor } from "../src/connection-labels.js";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const exporterSource = fs.readFileSync(new URL("../src/exporters.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const mainSource = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");

test("anchors partnership labels at the upper-left edge of the pair", () => {
  assert.equal(partnershipLabelAnchor({ left: 240 }, { left: 40 }), 66);
  assert.match(appSource, /partnershipLabelAnchor\(positions\[first\.id\], positions\[second\.id\]\)/);
  assert.match(appSource, /anchor: "upper-left"/);
  assert.match(exporterSource, /partnershipLabelAnchor\(layout\.positions\[first\.id\], layout\.positions\[second\.id\]\)/);
});

test("keeps a slow entrance and continuous animated background for the start menu", () => {
  assert.match(styles, /main-menu-entrance 1500ms/);
  assert.match(styles, /main-menu-ambient 12s ease-in-out infinite alternate/);
  assert.match(styles, /main-menu-branch-drift 9s ease-in-out infinite alternate/);
  assert.match(styles, /translateY\(52vh\) scale\(\.86\)/);
  assert.doesNotMatch(appSource, /setTimeout\(\(\) => setAnimationActive\(false\), 900\)/);
});

test("reduces updater failures to an actionable message", () => {
  assert.match(mainSource, /ERR_UPDATER_CHANNEL_FILE_NOT_FOUND/);
  assert.match(mainSource, /служебный файл latest\.yml/);
  assert.match(mainSource, /slice\(0, 260\)/);
});

console.log("Stage 78 P1.7 ok: partnership labels, animated start menu, and updater errors are user-facing");
