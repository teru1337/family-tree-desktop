import { orderGenerationMembers } from "./sibling-order.js";

function getParentIds(person) {
  const links = Array.isArray(person.parentLinks) ? person.parentLinks.map((link) => link.personId) : [];
  return [...new Set([...(links.length ? links : person.parentIds || [])])];
}

export function buildTreeLayout(people, partnerships = [], options = {}) {
  const byId = new Map(people.map((person) => [person.id, person]));
  const groupParent = new Map(people.map((person) => [person.id, person.id]));
  const findGroup = (id) => {
    let root = groupParent.get(id) || id;
    while (groupParent.get(root) !== root) root = groupParent.get(root);
    let current = id;
    while (groupParent.get(current) !== current) { const next = groupParent.get(current); groupParent.set(current, root); current = next; }
    return root;
  };
  const unionGroups = (firstId, secondId) => { const first = findGroup(firstId); const second = findGroup(secondId); if (first !== second) groupParent.set(second, first); };
  partnerships.forEach((partnership) => { const [firstId, secondId] = partnership.personIds || []; if (byId.has(firstId) && byId.has(secondId)) unionGroups(firstId, secondId); });
  const groupParents = new Map();
  people.forEach((person) => {
    const group = findGroup(person.id);
    if (!groupParents.has(group)) groupParents.set(group, new Set());
    getParentIds(person).filter((parentId) => byId.has(parentId)).forEach((parentId) => { const parentGroup = findGroup(parentId); if (parentGroup !== group) groupParents.get(group).add(parentGroup); });
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
  const groups = [];
  people.forEach((person) => {
    const generation = getGroupGeneration(findGroup(person.id));
    if (!groups[generation]) groups[generation] = [];
    groups[generation].push(person);
  });
  const generations = groups.map((members, index) => ({ index, members: orderGenerationMembers(members || []) })).filter((group) => group.members.length);
  const cardWidth = Math.max(190, Number(options.cardWidth) || 190);
  const cardHeight = Math.max(92, Number(options.cardHeight) || 92);
  const columnStep = Math.max(cardWidth + 70, Number(options.columnStep) || 280);
  const horizontalPadding = Math.max(260, Number(options.horizontalPadding) || 260);
  const verticalPadding = Math.max(180, Number(options.verticalPadding) || 180);
  const maxMembers = Math.max(1, ...generations.map((group) => group.members.length));
  const width = Math.max(1320, maxMembers * columnStep + 160) + horizontalPadding * 2;
  const top = 78 + verticalPadding;
  const rowStep = Math.max(cardHeight + 110, Number(options.rowStep) || 230);
  const height = Math.max(850, 78 + generations.length * rowStep + 100) + verticalPadding * 2;
  const positions = Object.fromEntries(generations.flatMap((group) => {
    const groupWidth = (group.members.length - 1) * columnStep + cardWidth;
    const startX = Math.max(55, (width - groupWidth) / 2);
    return group.members.map((person, index) => [person.id, { left: startX + index * columnStep, top: top + group.index * rowStep, width: cardWidth, height: cardHeight, generation: group.index }]);
  }));
  return { generations, positions, width, height, top, cardWidth, cardHeight, columnStep, rowStep };
}
