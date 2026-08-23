import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { createProjectPayload, normalizeProject, serializeProject, validateProject } from "../src/storage.js";

const onePixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const project = createProjectPayload([{ id: "person-1", name: "Человек", image: onePixelPng }], { id: "photo-test" }, []);
const persisted = JSON.parse(serializeProject(project));

assert.equal(Object.hasOwn(persisted.people[0], "image"), false);
assert.equal(persisted.photos.length, 1);
assert.equal(persisted.photos[0].personId, "person-1");
assert.equal(persisted.photos[0].mimeType, "image/png");
assert.ok(persisted.photos[0].checksum);

const reopened = normalizeProject(persisted);
assert.equal(reopened.people[0].image, onePixelPng);
assert.equal(reopened.photos[0].bytes > 0, true);
assert.equal(validateProject(persisted).valid, true);

const corrupted = {
  ...persisted,
  photos: [{ ...persisted.photos[0], checksum: "00000000" }],
};
const report = validateProject(corrupted);
assert.equal(report.valid, true);
assert.ok(report.warnings.some((warning) => warning.includes("проверку целостности")));

const external = {
  ...persisted,
  photos: [{ id: "external", personId: "person-1", source: "C:/old-computer/photo.jpg", primary: true }],
};
const externalReport = validateProject(external);
assert.ok(externalReport.warnings.some((warning) => warning.includes("внешнему пути")));

const legacyExternalReport = validateProject({
  ...persisted,
  manifest: { ...persisted.manifest, version: 2, schemaVersion: 2 },
  people: [{ ...persisted.people[0], image: "C:/old-computer/photo.jpg" }],
  photos: undefined,
});
assert.ok(legacyExternalReport.warnings.some((warning) => warning.includes("внешнему пути")));

const appSource = fs.readFileSync(path.resolve("src/App.jsx"), "utf8");
assert.match(appSource, /readAsDataURL/);
assert.match(appSource, /8 \* 1024 \* 1024/);
assert.match(appSource, /accept="image\/png,image\/jpeg,image\/webp,image\/gif"/);

console.log("Stage 23 photo storage ok: embedded images, checksums, and external-path warnings");
