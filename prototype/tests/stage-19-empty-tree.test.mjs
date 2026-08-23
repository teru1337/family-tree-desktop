import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

assert.match(appSource, /const initialPeople = \[\];/);
assert.match(appSource, /const initialPartnerships = \[\];/);
assert.match(appSource, /Дерево пока пустое/);
assert.match(appSource, /Добавьте первого человека/);
assert.match(appSource, /sessionPeople = loadedSession \? loadedSession\.people : initialPeople/);

console.log("Stage 19 empty tree ok: first launch does not inject demonstration people");
