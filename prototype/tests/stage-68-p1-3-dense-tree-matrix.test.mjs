import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { denseFixture } from "./fixtures/stage-68-dense-tree.mjs";
import { getFamilyView } from "../src/family-view.js";
import { createRenderIndex, visibleEdges } from "../src/render-index.js";
import { horizontalConnection, verticalConnection } from "../src/tree-geometry.js";
import { layoutConnectionLabels } from "../src/connection-labels.js";
import { buildTreeLayout } from "../src/tree-layout.js";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const stylesSource = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function rect(position) {
  return { left: position.left, top: position.top, right: position.left + position.width, bottom: position.top + position.height };
}

function overlap(first, second, gap = 0) {
  return first.left < second.right + gap && first.right > second.left - gap && first.top < second.bottom + gap && first.bottom > second.top - gap;
}

function lineSegments(geometry) {
  return [
    [geometry.startX, geometry.startY, geometry.startX, geometry.middleY],
    [geometry.startX, geometry.middleY, geometry.endX, geometry.middleY],
    [geometry.endX, geometry.middleY, geometry.endX, geometry.endY],
  ];
}

function crossesCardInterior(segment, card) {
  const [x1, y1, x2, y2] = segment;
  const epsilon = 0.01;
  if (Math.abs(x1 - x2) < epsilon) {
    return x1 > card.left + epsilon && x1 < card.right - epsilon && Math.max(y1, y2) > card.top + epsilon && Math.min(y1, y2) < card.bottom - epsilon;
  }
  if (Math.abs(y1 - y2) < epsilon) {
    return y1 > card.top + epsilon && y1 < card.bottom - epsilon && Math.max(x1, x2) > card.left + epsilon && Math.min(x1, x2) < card.right - epsilon;
  }
  return false;
}

function labelCandidates(index, positions) {
  const parentLabels = index.parentEdges.map(({ parent, child, type }) => {
    const geometry = verticalConnection(positions[parent.id], positions[child.id]);
    return { id: `parent-${parent.id}-${child.id}-${type}`, short: type === "biological" ? "Родство" : "Усыновление", left: (geometry.startX + geometry.endX) / 2, top: geometry.middleY, orientation: "vertical" };
  });
  const partnerLabels = index.partnershipEdges.map(({ partnership, first, second }) => {
    const geometry = horizontalConnection(positions[first.id], positions[second.id]);
    return { id: `partnership-${partnership.id}`, short: partnership.type === "marriage" ? "Брак" : partnership.type === "engagement" ? "Помолвка" : "Партнёрство", left: geometry.middleX, top: Math.min(geometry.startY, geometry.endY) - 8, orientation: "horizontal" };
  });
  return [...parentLabels, ...partnerLabels];
}

function assertLayoutGeometry(layout, people, partnerships, label = "обычная раскладка") {
  const positions = layout.positions;
  const cards = Object.values(positions).map(rect);
  layout.generations.forEach((generation) => {
    const generationCards = generation.members.map((person) => rect(positions[person.id])).sort((first, second) => first.left - second.left);
    generationCards.forEach((first, index) => generationCards.slice(index + 1).forEach((second) => assert.equal(overlap(first, second), false, `${label}: карточки пересекаются в поколении ${generation.index}`)));
  });

  const index = createRenderIndex(people, partnerships);
  index.parentEdges.forEach(({ parent, child }) => {
    const geometry = verticalConnection(positions[parent.id], positions[child.id]);
    lineSegments(geometry).forEach((segment) => cards.forEach((card) => assert.equal(crossesCardInterior(segment, card), false, `${label}: родительская линия вошла в карточку`)));
  });
  index.partnershipEdges.forEach(({ first, second }) => {
    const geometry = horizontalConnection(positions[first.id], positions[second.id]);
    lineSegments(geometry).forEach((segment) => cards.forEach((card) => assert.equal(crossesCardInterior(segment, card), false, `${label}: партнёрская линия вошла в карточку`)));
  });

  const labels = layoutConnectionLabels(labelCandidates(index, positions), { positions, labelGap: 8, channelGap: 24 });
  labels.forEach((labelItem) => {
    const labelRect = { left: labelItem.left - labelItem.width / 2, top: labelItem.top - labelItem.height / 2, right: labelItem.left + labelItem.width / 2, bottom: labelItem.top + labelItem.height / 2 };
    cards.forEach((card) => assert.equal(overlap(labelRect, card, 3), false, `${label}: подпись пересекла карточку`));
    assert.ok(labelRect.left >= 0 && labelRect.right <= layout.width && labelRect.top >= 0 && labelRect.bottom <= layout.height, `${label}: подпись вышла за доску`);
  });
  labels.forEach((first, index) => labels.slice(index + 1).forEach((second) => {
    const firstRect = { left: first.left - first.width / 2, top: first.top - first.height / 2, right: first.left + first.width / 2, bottom: first.top + first.height / 2 };
    const secondRect = { left: second.left - second.width / 2, top: second.top - second.height / 2, right: second.left + second.width / 2, bottom: second.top + second.height / 2 };
    assert.equal(overlap(firstRect, secondRect, 8), false, `${label}: подписи наложились друг на друга`);
  }));
  return { index, labels };
}

test("fixture contains four generations, multiple parents and dense partnerships", () => {
  assert.equal(new Set(denseFixture.people.map((person) => person.id)).size, denseFixture.people.length);
  assert.equal(denseFixture.people.filter((person) => person.parentIds.length >= 2).length >= 5, true);
  assert.equal(denseFixture.partnerships.length >= 5, true);
  const layout = buildTreeLayout(denseFixture.people, denseFixture.partnerships);
  assert.equal(layout.generations.length, 4);
  assert.ok(denseFixture.people.some((person) => person.name.length > 30));
});

test("standard and large-text layouts keep cards, lines and labels disjoint", () => {
  const standard = buildTreeLayout(denseFixture.people, denseFixture.partnerships, { cardWidth: 190, cardHeight: 92, rowStep: 260, horizontalPadding: 300, verticalPadding: 200 });
  const large = buildTreeLayout(denseFixture.people, denseFixture.partnerships, { cardWidth: 220, cardHeight: 108, rowStep: 300, horizontalPadding: 340, verticalPadding: 230 });
  const standardResult = assertLayoutGeometry(standard, denseFixture.people, denseFixture.partnerships, "обычная раскладка");
  const largeResult = assertLayoutGeometry(large, denseFixture.people, denseFixture.partnerships, "крупный текст");
  assert.ok(large.width >= standard.width);
  assert.ok(large.height >= standard.height);
  assert.equal(standardResult.index.parentEdges.length > 0, true);
  assert.equal(largeResult.labels.length, standardResult.labels.length);
});

test("branch view keeps a selected blood branch and contextual partner without invalid edges", () => {
  const view = getFamilyView(denseFixture.people, denseFixture.partnerships, denseFixture.selectedId, 1);
  assert.equal(view.bloodIds.has(denseFixture.selectedId), true);
  assert.equal(view.contextIds.has("g2f"), true);
  const index = createRenderIndex(denseFixture.people, denseFixture.partnerships);
  const strictParents = visibleEdges(index.parentEdges, view.visibleIds, index.parentEdgesByPerson).filter(({ parent, child }) => view.visibleIds.has(parent.id) && view.visibleIds.has(child.id));
  const strictPartners = visibleEdges(index.partnershipEdges, view.visibleIds, index.partnershipEdgesByPerson).filter(({ first, second }) => view.visibleIds.has(first.id) && view.visibleIds.has(second.id));
  assert.ok(strictParents.every(({ parent, child }) => view.visibleIds.has(parent.id) && view.visibleIds.has(child.id)));
  assert.ok(strictPartners.some(({ first, second }) => first.id === "g2b" || second.id === "g2b"));
});

test("the workspace contract supports open and closed inspector widths", () => {
  assert.match(stylesSource, /grid-template-columns: minmax\(0, 1fr\) var\(--inspector-width, 380px\)/);
  assert.match(stylesSource, /\.workspace\.workspace-inspector-closed/);
  assert.match(appSource, /\"--inspector-width\": `\$\{inspectorWidth\}px`/);
  assert.match(appSource, /strictVisible=\{viewMode === \"branch\"\}/);
});

console.log("Stage 68 P1.3 ok: anonymous dense four-generation matrix, geometry invariants, branch view and inspector-width contract");
