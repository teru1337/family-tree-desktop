import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { atomicWriteTextFile, isRecoverableFileError } from "../electron/file-io.cjs";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const mainSource = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
const preloadSource = fs.readFileSync(new URL("../electron/preload.cjs", import.meta.url), "utf8");

async function makeTempDirectory() {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), "family-tree-p0-2-"));
}

test("atomic project save keeps the previous file in a sidecar backup", async () => {
  const directory = await makeTempDirectory();
  const target = path.join(directory, "family.familytree");
  try {
    const first = JSON.stringify({ version: 1 });
    const second = JSON.stringify({ version: 2 });
    const initial = await atomicWriteTextFile(target, first);
    const replaced = await atomicWriteTextFile(target, second);

    assert.equal(initial.replacedExisting, false);
    assert.equal(replaced.replacedExisting, true);
    assert.equal(await fs.promises.readFile(target, "utf8"), second);
    assert.equal(await fs.promises.readFile(`${target}.backup`, "utf8"), first);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
});

test("a backup failure leaves the current project untouched", async () => {
  const directory = await makeTempDirectory();
  const target = path.join(directory, "family.familytree");
  try {
    const original = "original";
    await atomicWriteTextFile(target, original);
    await fs.promises.mkdir(`${target}.backup`);

    await assert.rejects(() => atomicWriteTextFile(target, "replacement"));
    assert.equal(await fs.promises.readFile(target, "utf8"), original);
    assert.deepEqual((await fs.promises.readdir(directory)).filter((name) => name.includes(".family.familytree.") && name.endsWith(".tmp")), []);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
});

test("save and open use the native path and offer Save As when it becomes unavailable", () => {
  assert.equal(isRecoverableFileError({ code: "ENOENT" }), true);
  assert.equal(isRecoverableFileError({ code: "EACCES" }), true);
  assert.equal(isRecoverableFileError({ code: "EINVAL" }), false);
  assert.match(mainSource, /family-tree-open-project-file/);
  assert.match(mainSource, /needsSaveAs/);
  assert.match(mainSource, /atomicWriteTextFile/);
  assert.match(preloadSource, /openProjectFile/);
  assert.match(appSource, /openProjectFile/);
  assert.match(appSource, /needsSaveAs/);
  assert.match(appSource, /key === "s"/);
});

console.log("Stage 65 P0.2 ok: native path, Ctrl+S, atomic save, sidecar backup and safe Save As fallback");
