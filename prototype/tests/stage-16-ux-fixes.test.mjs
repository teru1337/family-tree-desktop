import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

assert.match(appSource, /pointerStartedInsideCardRef/);
assert.match(appSource, /onPointerDown=\{handleBackdropPointerDown\}/);
assert.match(appSource, /clickedBackdrop/);
assert.match(appSource, /setTimeout\(onClose, 180\)/);
assert.match(appSource, /setReturnToMenuAfterModal/);
assert.match(appSource, /onCreate=\{\(\) => createNewTree\(true\)\}/);
assert.match(appSource, /onSettings=\{\(\) => openSettings\(true\)\}/);
assert.match(appSource, /onHelp=\{\(\) => openInstruction\(true\)\}/);
assert.match(appSource, /onClose=\{cancelNewTree\}/);
assert.match(stylesSource, /button\s*\{[^}]*transition:/);
assert.match(stylesSource, /@keyframes modal-card-in/);
assert.match(stylesSource, /@keyframes modal-card-out/);
assert.match(stylesSource, /\.instruction-image-frame\s*\{[^}]*grid-template-rows:/);
assert.match(stylesSource, /\.instruction-image-expand\s*\{[^}]*background:\s*#eef6e9/);
assert.match(stylesSource, /\.instruction-nav-item:hover\s*\{[^}]*transform:/);
console.log("Stage 16 UX fixes ok: resize-safe instructions, menu return paths, and motion styles");
