import { strict as assert } from "node:assert";
import test from "node:test";
import { buildTreeLayout } from "../src/tree-layout.js";
import { horizontalConnection, verticalConnection } from "../src/tree-geometry.js";

const people = [
  { id: "father", name: "Отец", year: "1970", childIds: ["older", "younger"] },
  { id: "mother", name: "Мать", year: "1972", childIds: ["older", "younger"] },
  { id: "older", name: "Старший ребёнок", year: "2005", parentIds: ["father", "mother"], siblingIds: ["younger"] },
  { id: "younger", name: "Младший ребёнок", year: "2010", parentIds: ["father", "mother"], siblingIds: ["older"] },
  { id: "independent", name: "Независимая ветвь", year: "1975" },
];

const partnerships = [{ id: "marriage", personIds: ["father", "mother"], type: "marriage", status: "active" }];
const layout = buildTreeLayout(people, partnerships);

function center(position) {
  return position.left + position.width / 2;
}

test("keeps partners in one adjacent family block", () => {
  const father = layout.positions.father;
  const mother = layout.positions.mother;
  const partnerBlock = layout.familyBlocks.find((block) => block.memberIds.includes("father"));

  assert.equal(father.top, mother.top);
  assert.equal(mother.left, father.left + father.width + layout.memberGap);
  assert.deepEqual(partnerBlock.memberIds, ["father", "mother"]);
  assert.equal(father.familyBlockId, mother.familyBlockId);
  assert.equal(layout.generations[0].blocks.length, 2);
});

test("places children in the next generation around the parent block center", () => {
  const parentBlock = layout.familyBlocks.find((block) => block.memberIds.includes("father"));
  const childPositions = [layout.positions.older, layout.positions.younger];
  const childrenCenter = childPositions.reduce((sum, position) => sum + center(position), 0) / childPositions.length;

  assert.equal(layout.positions.older.generation, layout.positions.father.generation + 1);
  assert.equal(layout.positions.younger.generation, layout.positions.father.generation + 1);
  assert.ok(Math.abs(childrenCenter - parentBlock.centerX) <= layout.blockGap / 2 + 1);
});

test("orders siblings by birth year without splitting the partner block", () => {
  assert.ok(layout.positions.older.left < layout.positions.younger.left);
  const sameGeneration = Object.values(layout.positions).filter((position) => position.generation === layout.positions.father.generation);
  const left = Math.min(layout.positions.father.left, layout.positions.mother.left);
  const right = Math.max(layout.positions.father.left, layout.positions.mother.left);
  assert.equal(sameGeneration.some((position) => position.left > left && position.left < right), false);
});

test("keeps cards non-overlapping inside each generation", () => {
  const positions = Object.values(layout.positions);
  layout.generations.forEach((generation) => {
    const members = generation.members.map((person) => layout.positions[person.id]).sort((first, second) => first.left - second.left);
    members.forEach((first, index) => {
      members.slice(index + 1).forEach((second) => {
        assert.ok(first.left + first.width <= second.left, `cards overlap in generation ${generation.index}`);
      });
    });
  });
  assert.ok(positions.every((position) => position.left >= 55 && position.left + position.width <= layout.width - 55));
});

test("uses card boundaries for vertical and horizontal connection geometry", () => {
  const parent = layout.positions.father;
  const child = layout.positions.older;
  const vertical = verticalConnection(parent, child);
  assert.equal(vertical.startX, parent.left + parent.width / 2);
  assert.equal(vertical.startY, parent.top + parent.height);
  assert.equal(vertical.endX, child.left + child.width / 2);
  assert.equal(vertical.endY, child.top);

  const horizontal = horizontalConnection(layout.positions.father, layout.positions.mother);
  assert.equal(horizontal.startX, Math.min(parent.left, layout.positions.mother.left) + parent.width);
  assert.equal(horizontal.endX, Math.max(parent.left, layout.positions.mother.left));
});

console.log("Stage 49 P1 family layout ok: family blocks, parent anchors, sibling order, collision bounds and connection boundaries");
