import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("enables software rendering before Electron becomes ready when safe mode is requested", async () => {
  const mainSource = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  assert.match(mainSource, /--safe-mode/);
  assert.match(mainSource, /--software-rendering/);
  assert.match(mainSource, /FAMILY_TREE_SOFTWARE_RENDERING/);
  assert.match(mainSource, /app\.disableHardwareAcceleration\(\)/);
  assert.match(mainSource, /appendSwitch\("disable-gpu"\)/);
  assert.match(mainSource, /appendSwitch\("disable-gpu-compositing"\)/);
  assert.match(mainSource, /appendSwitch\("in-process-gpu"\)/);
  assert.match(mainSource, /appendSwitch\("use-gl", "swiftshader"\)/);
  assert.match(mainSource, /appendSwitch\("use-angle", "swiftshader"\)/);
  assert.match(mainSource, /safeModeRequested && !mainWindow\.isVisible\(\)/);
  assert.match(mainSource, /if \(safeModeRequested\) mainWindow\.show\(\)/);
  assert.ok(mainSource.indexOf("app.disableHardwareAcceleration()") < mainSource.indexOf("app.whenReady()"));
});

test("exposes and explains safe mode in the renderer", async () => {
  const mainSource = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const preloadSource = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(mainSource, /family-tree-runtime-status/);
  assert.match(preloadSource, /getRuntimeStatus/);
  assert.match(appSource, /safeMode/);
  assert.match(appSource, /Безопасный режим: используется программный рендеринг/);
  assert.match(styles, /main-menu-runtime-status/);
  assert.match(styles, /footer-safe-mode/);
});

console.log("Stage 77 P0.3 ok: Electron provides an explicit software-rendering safe mode");
