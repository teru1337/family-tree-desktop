import { orderGenerationMembers } from "./sibling-order.js";

function getParentIds(person) {
  const links = Array.isArray(person.parentLinks) ? person.parentLinks.map((link) => link.personId) : [];
  return [...new Set([...(links.length ? links : person.parentIds || [])])];
}

function blockWidth(memberCount, cardWidth, memberGap) {
  return memberCount * cardWidth + Math.max(0, memberCount - 1) * memberGap;
}

function shiftBlocksIntoBoard(blocks, boardWidth, boardPadding) {
  if (!blocks.length) return;
  const minimumLeft = Math.min(...blocks.map((block) => block.left));
  const maximumRight = Math.max(...blocks.map((block) => block.left + block.width));
  let shift = 0;
  if (maximumRight > boardWidth - boardPadding) shift = boardWidth - boardPadding - maximumRight;
  if (minimumLeft + shift < boardPadding) shift = boardPadding - minimumLeft;
  blocks.forEach((block) => { block.left += shift; });
}

function placeGenerationBlocks(blocks, boardWidth, boardPadding, blockGap) {
  const ordered = [...blocks].sort((first, second) => first.desiredCenter - second.desiredCenter || first.order - second.order);
  const clusters = [];
  ordered.forEach((block) => {
    const current = clusters[clusters.length - 1];
    if (current && Math.abs(current[0].desiredCenter - block.desiredCenter) < 0.5) current.push(block);
    else clusters.push([block]);
  });
  let previousRight = boardPadding - blockGap;
  clusters.forEach((cluster) => {
    const clusterWidth = cluster.reduce((total, block) => total + block.width, 0) + Math.max(0, cluster.length - 1) * blockGap;
    const desiredLeft = cluster[0].desiredCenter - clusterWidth / 2;
    let clusterLeft = Math.max(boardPadding, desiredLeft, previousRight + blockGap);
    cluster.forEach((block) => {
      block.left = clusterLeft;
      clusterLeft += block.width + blockGap;
    });
    previousRight = clusterLeft - blockGap;
  });
  shiftBlocksIntoBoard(ordered, boardWidth, boardPadding);
  return ordered;
}

export function buildTreeLayout(people, partnerships = [], options = {}) {
  const sourcePeople = Array.isArray(people) ? people : [];
  const byId = new Map(sourcePeople.map((person) => [person.id, person]));
  const groupParent = new Map(sourcePeople.map((person) => [person.id, person.id]));
  const findGroup = (id) => {
    let root = groupParent.get(id) || id;
    while (groupParent.get(root) !== root) root = groupParent.get(root);
    let current = id;
    while (groupParent.get(current) !== current) {
      const next = groupParent.get(current);
      groupParent.set(current, root);
      current = next;
    }
    return root;
  };
  const unionGroups = (firstId, secondId) => {
    const first = findGroup(firstId);
    const second = findGroup(secondId);
    if (first !== second) groupParent.set(second, first);
  };

  partnerships.forEach((partnership) => {
    const [firstId, secondId] = partnership.personIds || [];
    if (byId.has(firstId) && byId.has(secondId)) unionGroups(firstId, secondId);
  });

  const groupMembers = new Map();
  sourcePeople.forEach((person) => {
    const group = findGroup(person.id);
    if (!groupMembers.has(group)) groupMembers.set(group, []);
    groupMembers.get(group).push(person);
  });

  const groupParents = new Map();
  sourcePeople.forEach((person) => {
    const group = findGroup(person.id);
    if (!groupParents.has(group)) groupParents.set(group, new Set());
    getParentIds(person).filter((parentId) => byId.has(parentId)).forEach((parentId) => {
      const parentGroup = findGroup(parentId);
      if (parentGroup !== group) groupParents.get(group).add(parentGroup);
    });
  });

  const generationCache = new Map();
  const getGroupGeneration = (group, stack = new Set()) => {
    if (generationCache.has(group)) return generationCache.get(group);
    if (stack.has(group)) return 0;
    const nextStack = new Set(stack);
    nextStack.add(group);
    const parents = [...(groupParents.get(group) || [])];
    const generation = parents.length ? Math.min(7, Math.min(...parents.map((parentGroup) => getGroupGeneration(parentGroup, nextStack) + 1))) : 0;
    generationCache.set(group, generation);
    return generation;
  };

  const membersByGeneration = new Map();
  groupMembers.forEach((members, group) => {
    const generation = getGroupGeneration(group);
    if (!membersByGeneration.has(generation)) membersByGeneration.set(generation, []);
    membersByGeneration.get(generation).push(...members);
  });

  const cardWidth = Math.max(190, Number(options.cardWidth) || 190);
  const cardHeight = Math.max(92, Number(options.cardHeight) || 92);
  const memberGap = Math.max(18, Number(options.memberGap) || 24);
  const blockGap = Math.max(48, Number(options.blockGap) || 64);
  const horizontalPadding = Math.max(260, Number(options.horizontalPadding) || 260);
  const verticalPadding = Math.max(180, Number(options.verticalPadding) || 180);
  const rowStep = Math.max(cardHeight + 110, Number(options.rowStep) || 230);
  const boardPadding = 55;

  const blockByGroup = new Map();
  groupMembers.forEach((members, group) => {
    blockByGroup.set(group, {
      id: `family-block-${group}`,
      groupId: group,
      memberIds: members.map((person) => person.id),
      members: [...members],
      parentGroupIds: [...(groupParents.get(group) || [])],
      width: blockWidth(members.length, cardWidth, memberGap),
      height: cardHeight,
    });
  });

  const generationIndexes = [...membersByGeneration.keys()].sort((first, second) => first - second);
  const generationBlocks = new Map();
  const rawGenerations = generationIndexes.map((generation) => {
    const members = orderGenerationMembers(membersByGeneration.get(generation) || []);
    const memberOrder = new Map(members.map((person, index) => [person.id, index]));
    const blocks = [...blockByGroup.values()]
      .filter((block) => getGroupGeneration(block.groupId) === generation)
      .map((block) => ({
        ...block,
        members: [...block.members].sort((first, second) => (memberOrder.get(first.id) ?? 0) - (memberOrder.get(second.id) ?? 0)),
        order: Math.min(...block.memberIds.map((id) => memberOrder.get(id) ?? Number.MAX_SAFE_INTEGER)),
      }))
      .sort((first, second) => first.order - second.order);
    generationBlocks.set(generation, blocks);
    return { index: generation, members, blocks };
  });

  const maxContentWidth = Math.max(1, ...rawGenerations.map((generation) => generation.blocks.reduce((total, block) => total + block.width, 0) + Math.max(0, generation.blocks.length - 1) * blockGap));
  const width = Math.max(1320, maxContentWidth + 160) + horizontalPadding * 2;
  const top = 78 + verticalPadding;
  const height = Math.max(850, 78 + (generationIndexes.length ? Math.max(...generationIndexes) + 1 : 1) * rowStep + 100) + verticalPadding * 2;
  const boardCenter = width / 2;
  const positions = {};
  const placedGroups = new Map();

  const generations = rawGenerations.map((generation) => {
    const blocks = generationBlocks.get(generation.index) || [];
    const desiredBlocks = blocks.map((block, order) => {
      const parentCenters = block.parentGroupIds.map((parentGroup) => placedGroups.get(parentGroup)?.centerX).filter((center) => Number.isFinite(center));
      const desiredCenter = parentCenters.length
        ? parentCenters.reduce((total, center) => total + center, 0) / parentCenters.length
        : boardCenter + (order - (blocks.length - 1) / 2) * (cardWidth + blockGap);
      return { ...block, desiredCenter, order };
    });
    const placedBlocks = placeGenerationBlocks(desiredBlocks, width, boardPadding, blockGap).map((block) => {
      const blockTop = top + generation.index * rowStep;
      const centerX = block.left + block.width / 2;
      const members = block.members.map((person, memberIndex) => {
        positions[person.id] = {
          left: block.left + memberIndex * (cardWidth + memberGap),
          top: blockTop,
          width: cardWidth,
          height: cardHeight,
          generation: generation.index,
          familyBlockId: block.id,
        };
        return person;
      });
      const placed = { ...block, members, top: blockTop, centerX };
      placedGroups.set(block.groupId, placed);
      return placed;
    });
    return { index: generation.index, members: generation.members, blocks: placedBlocks };
  });

  return {
    generations,
    familyBlocks: generations.flatMap((generation) => generation.blocks),
    positions,
    width,
    height,
    top,
    cardWidth,
    cardHeight,
    memberGap,
    blockGap,
    columnStep: cardWidth + blockGap,
    rowStep,
  };
}
