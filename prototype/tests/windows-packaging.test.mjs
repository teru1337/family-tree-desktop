import { strict as assert } from "node:assert";
import { access, readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const ignore = await readFile(new URL("../../.gitignore", import.meta.url), "utf8");

assert.equal(packageJson.main, "electron/main.cjs");
assert.equal(packageJson.build.appId, "ru.teru1337.familytree");
assert.equal(packageJson.build.productName, "Семейное древо");
assert.deepEqual(packageJson.build.win.target[0].arch, ["x64"]);
assert.equal(packageJson.build.nsis.oneClick, false);
assert.equal(packageJson.build.nsis.createDesktopShortcut, true);
assert.equal(packageJson.build.nsis.createStartMenuShortcut, true);
assert.match(packageJson.scripts["dist:win"], /electron-builder/);
assert.match(ignore, /release/);
await access(new URL("../electron/main.cjs", import.meta.url));
await access(new URL("../electron/preload.cjs", import.meta.url));
console.log("Windows packaging configuration ok: Electron + NSIS x64");
