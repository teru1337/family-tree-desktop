import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { layoutConnectionLabels, partnershipLabelAnchor } from "../src/connection-labels.js";
import { buildTreeLayout } from "../src/tree-layout.js";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const exporterSource = fs.readFileSync(new URL("../src/exporters.js", import.meta.url), "utf8");

function rect(label) {
  return { left: label.left - label.width / 2, right: label.left + label.width / 2, top: label.top - label.height / 2, bottom: label.top + label.height / 2 };
}

function intersects(first, second, gap = 0) {
  return first.left < second.right + gap && first.right > second.left - gap && first.top < second.bottom + gap && first.bottom > second.top - gap;
}

test("separates repeated vertical labels on a shared channel", () => {
  const labels = layoutConnectionLabels([
    { id: "parent-a", short: "Родство", left: 95, top: 166, orientation: "vertical" },
    { id: "parent-b", short: "Родство", left: 95, top: 166, orientation: "vertical" },
  ], { positions: [{ left: 0, top: 0, width: 190, height: 92 }, { left: 238, top: 240, width: 190, height: 92 }] });
  assert.notEqual(labels[0].left, labels[1].left);
  assert.equal(intersects(rect(labels[0]), rect(labels[1]), 8), false);
});

test("keeps a partnership label inside the enlarged gap between cards", () => {
  const cards = [{ left: 0, top: 0, width: 190, height: 92 }, { left: 238, top: 0, width: 190, height: 92 }];
  const [label] = layoutConnectionLabels([{ id: "marriage", short: "Брак", left: 214, top: 38, orientation: "horizontal" }], { positions: cards });
  assert.equal(intersects(rect(label), { left: 0, right: 190, top: 0, bottom: 92 }, 2), false);
  assert.equal(intersects(rect(label), { left: 238, right: 428, top: 0, bottom: 92 }, 2), false);
});

test("anchors partnership labels above the upper-left edge of the pair", () => {
  const cards = [{ left: 0, top: 180, width: 190, height: 92 }, { left: 238, top: 180, width: 190, height: 92 }];
  const [label] = layoutConnectionLabels([{ id: "marriage", short: "Брак", left: partnershipLabelAnchor(cards[0], cards[1]), top: 180, orientation: "horizontal", aboveCards: true, anchor: "upper-left" }], { positions: cards });
  assert.equal(label.left, 26);
  assert.equal(label.top + label.height / 2 < 180, true);
});

test("reserves an upper lane for a full partnership label", () => {
  const cards = [{ left: 0, top: 180, width: 190, height: 92 }, { left: 238, top: 180, width: 190, height: 92 }];
  const [label] = layoutConnectionLabels([{ id: "marriage", short: "Брак", full: "Брак: Александр Михайлович — Эвелина Владимировна Каноныхина", left: 214, top: 180, orientation: "horizontal", aboveCards: true }], { positions: cards });
  assert.ok(label.expandedWidth > label.width);
  assert.ok(label.expandedHeight > label.height);
  assert.equal(label.top + label.expandedHeight / 2 < 180, true);
});

test("retains full label text while bounding the short canvas label", () => {
  const [label] = layoutConnectionLabels([{ id: "adoption", short: "Усыновление", full: "Биологический родитель — усыновитель", left: 95, top: 166, orientation: "vertical" }]);
  assert.equal(label.full, "Биологический родитель — усыновитель");
  assert.ok(label.width >= 42 && label.width <= 220);
});

test("keeps the partner card gap wide enough for the partnership channel", () => {
  const people = [
    { id: "first", name: "Первый", childIds: [] },
    { id: "second", name: "Второй", childIds: [] },
  ];
  const layout = buildTreeLayout(people, [{ id: "pair", personIds: ["first", "second"], type: "marriage", status: "active" }]);
  assert.ok(layout.positions.second.left - (layout.positions.first.left + layout.positions.first.width) >= 48);
});

test("uses the shared label layout on the canvas and in exports", () => {
  assert.match(appSource, /layoutConnectionLabels\(labels/);
  assert.match(appSource, /const positionedLabels = useMemo/);
  assert.match(exporterSource, /layoutConnectionLabels\(\[/);
  assert.match(exporterSource, /labelMarkup/);
});

console.log("Stage 67 P1.2 ok: collision-aware relation labels, partnership spacing and export parity");
