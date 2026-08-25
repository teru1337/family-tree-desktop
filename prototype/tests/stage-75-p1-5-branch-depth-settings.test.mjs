import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_TREE_BRANCH_DEPTH, MAX_TREE_BRANCH_DEPTH, MIN_TREE_BRANCH_DEPTH, normalizeTreeBranchDepth } from "../src/tree-branch-depth.js";
import { normalizeProject } from "../src/storage.js";

test("normalizes the branch depth to the supported 1-10 range", () => {
  assert.equal(DEFAULT_TREE_BRANCH_DEPTH, 10);
  assert.equal(normalizeTreeBranchDepth(1), "1");
  assert.equal(normalizeTreeBranchDepth(10), "10");
  assert.equal(normalizeTreeBranchDepth(0), String(MIN_TREE_BRANCH_DEPTH));
  assert.equal(normalizeTreeBranchDepth(11), String(MAX_TREE_BRANCH_DEPTH));
  assert.equal(normalizeTreeBranchDepth("all"), String(DEFAULT_TREE_BRANCH_DEPTH));
  assert.equal(normalizeTreeBranchDepth("invalid"), String(DEFAULT_TREE_BRANCH_DEPTH));
});

test("normalizes and persists branch depth inside the project settings", () => {
  const project = normalizeProject({
    manifest: { format: "familytree", version: 7 },
    project: { id: "test", title: "Тест", settings: { branchDepth: 42 } },
    people: [],
    relations: [],
    photos: [],
  });
  assert.equal(project.project.settings.branchDepth, String(MAX_TREE_BRANCH_DEPTH));
});

test("wires branch depth into project settings and the centered branch selector", async () => {
  const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(appSource, /branchDepth: String\(DEFAULT_TREE_BRANCH_DEPTH\)/);
  assert.match(appSource, /normalizeTreeBranchDepth\(settings\?\.branchDepth\)/);
  assert.match(appSource, /branchDepth: normalizedDepth/);
  assert.match(appSource, /Array\.from\(\{ length: MAX_TREE_BRANCH_DEPTH - MIN_TREE_BRANCH_DEPTH \+ 1 \}/);
  assert.match(appSource, /setTreeBranchDepth\(loadedSettings\.branchDepth\)/);
  assert.match(styles, /\.tree-view-mode-branch/);
  assert.match(styles, /\.tree-branch-depth select/);
  assert.match(styles, /text-align-last: center/);
});

console.log("Stage 75 P1.5 ok: branch depth is persisted and presented as a centered 1-10 selector");
