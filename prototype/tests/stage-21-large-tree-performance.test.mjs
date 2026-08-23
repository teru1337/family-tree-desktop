import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const appSource = fs.readFileSync(path.resolve("src/App.jsx"), "utf8");

test("tree rendering reuses the shared layout instead of calculating it twice", () => {
  assert.match(appSource, /function TreeCanvas\(\{[^}]*layout/);
  assert.match(appSource, /<TreeCanvas[^>]*layout=\{treeLayout\}/);
  assert.equal((appSource.match(/const layout = useMemo\(\(\) => buildTreeLayout/g) || []).length, 1);
});

test("large trees use viewport-aware node and connector rendering", () => {
  assert.match(appSource, /ResizeObserver/);
  assert.match(appSource, /const visibleIds = useMemo/);
  assert.match(appSource, /const visiblePeople = useMemo/);
  assert.match(appSource, /visibleIds=\{visibleIds\}/);
  assert.match(appSource, /visiblePeople\.map/);
});

test("relationship connectors use an index instead of repeated people.find calls", () => {
  assert.match(appSource, /const byId = useMemo\(\(\) => new Map\(people\.map/);
  assert.match(appSource, /parent: byId\.get\(parentId\)/);
  assert.match(appSource, /first: byId\.get\(partnership\.personIds\?\.\[0\]\)/);
  assert.doesNotMatch(appSource, /people\.find\(\(person\) => person\.id === partnership\.personIds/);
});
