import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createProjectPayload, normalizeProject } from "../src/storage.js";
import { DEFAULT_SHORTCUTS, SHORTCUT_COMMANDS, shortcutFromKeyboardEvent, shortcutDisplayName, validateShortcutMap } from "../src/shortcuts.js";

test("provides stable defaults and normalizes captured keyboard events", () => {
  assert.equal(SHORTCUT_COMMANDS.length >= 15, true);
  assert.equal(DEFAULT_SHORTCUTS.save, "Ctrl+S");
  assert.equal(DEFAULT_SHORTCUTS.zoomIn, "+");
  assert.equal(DEFAULT_SHORTCUTS.panUp, "ArrowUp");
  assert.equal(shortcutFromKeyboardEvent({ key: "s", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false }), "Ctrl+S");
  assert.equal(shortcutFromKeyboardEvent({ key: "ArrowUp", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }), "ArrowUp");
  assert.equal(shortcutFromKeyboardEvent({ key: "+", ctrlKey: false, altKey: false, shiftKey: true, metaKey: false }), "+");
  assert.equal(shortcutDisplayName("Ctrl+Shift+S"), "Ctrl + Shift + S");
});

test("rejects conflicts and Windows-global combinations while warning about system shortcuts", () => {
  const validation = validateShortcutMap({ ...DEFAULT_SHORTCUTS, save: "Ctrl+Z", open: "Win+O", search: "Alt+F4" });
  assert.equal(validation.valid, false);
  assert.equal(validation.conflicts.some((item) => item.shortcut === "Ctrl+Z"), true);
  assert.equal(validation.unsupported.some((item) => item.commandId === "open"), true);
  assert.equal(validation.warnings.some((item) => item.commandId === "search"), true);
});

test("keeps shortcut settings optional and supplies defaults to old project files", () => {
  const payload = createProjectPayload([], { id: "old-project", settings: {} }, []);
  const reopened = normalizeProject({ ...payload, project: { ...payload.project, settings: {} } });
  assert.deepEqual(reopened.project.settings.shortcuts, DEFAULT_SHORTCUTS);
});

test("routes commands through one registry and exposes editable settings instructions", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const shortcutSource = await readFile(new URL("../src/shortcuts.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(source, /function ShortcutSettings\(/);
  assert.match(source, /shortcutCommandId\(shortcuts, event\)/);
  assert.match(source, /data-shortcut-capture="true"/);
  assert.match(source, /Нажмите сочетание/);
  assert.match(source, /Сбросить все/);
  assert.match(shortcutSource, /Сочетания с клавишей Windows не перехватываются приложением/);
  assert.match(source, /shortcuts=\{shortcuts\}/);
  assert.match(source, /if \(commandId === "save"\)/);
  assert.match(source, /else if \(commandId === "toggleBranch"\)/);
  assert.doesNotMatch(source, /key === "f"/);
  assert.match(styles, /\.shortcut-settings/);
  assert.match(styles, /\.shortcut-row/);
});

console.log("Stage 73 P3.2 ok: shortcuts use one registry, safe defaults, conflict validation and editable settings");
