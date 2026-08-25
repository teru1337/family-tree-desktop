function parentLinksFor(person) {
  return Array.isArray(person?.parentLinks) && person.parentLinks.length
    ? person.parentLinks
    : (Array.isArray(person?.parentIds) ? person.parentIds : []).map((personId) => ({ personId, type: "biological" }));
}

function siblingLinksFor(person) {
  return Array.isArray(person?.siblingLinks) && person.siblingLinks.length
    ? person.siblingLinks
    : (Array.isArray(person?.siblingIds) ? person.siblingIds : []).map((personId) => ({ personId, type: "biological" }));
}

function isBloodParentLink(link) {
  return !link?.type || link.type === "biological";
}

function isBloodSiblingLink(link) {
  return !link?.type || link.type === "biological" || link.type === "half";
}

function addUndirected(adjacency, firstId, secondId) {
  if (!firstId || !secondId || firstId === secondId || !adjacency.has(firstId) || !adjacency.has(secondId)) return;
  adjacency.get(firstId).add(secondId);
  adjacency.get(secondId).add(firstId);
}

function directRelativeIds(person, peopleById) {
  const ids = new Set();
  parentLinksFor(person).forEach((link) => { if (peopleById.has(link.personId)) ids.add(link.personId); });
  (Array.isArray(person?.childIds) ? person.childIds : []).forEach((id) => { if (peopleById.has(id)) ids.add(id); });
  siblingLinksFor(person).forEach((link) => { if (peopleById.has(link.personId)) ids.add(link.personId); });
  peopleById.forEach((candidate) => {
    if (parentLinksFor(candidate).some((link) => link.personId === person?.id)) ids.add(candidate.id);
    if (siblingLinksFor(candidate).some((link) => link.personId === person?.id)) ids.add(candidate.id);
  });
  return ids;
}

export function getFamilyView(people = [], partnerships = [], selectedId = "", depth = "all") {
  const sourcePeople = Array.isArray(people) ? people : [];
  const byId = new Map(sourcePeople.map((person) => [person.id, person]));
  if (!byId.has(selectedId)) return { bloodIds: new Set(), contextIds: new Set(), visibleIds: new Set() };
  const adjacency = new Map(sourcePeople.map((person) => [person.id, new Set()]));
  const childrenByParent = new Map();
  sourcePeople.forEach((child) => {
    parentLinksFor(child).forEach((link) => {
      if (!byId.has(link.personId)) return;
      if (!childrenByParent.has(link.personId)) childrenByParent.set(link.personId, []);
      childrenByParent.get(link.personId).push({ childId: child.id, link });
      if (isBloodParentLink(link)) addUndirected(adjacency, link.personId, child.id);
    });
    siblingLinksFor(child).forEach((link) => {
      if (isBloodSiblingLink(link)) addUndirected(adjacency, child.id, link.personId);
    });
  });
  sourcePeople.forEach((parent) => {
    (Array.isArray(parent?.childIds) ? parent.childIds : []).forEach((childId) => {
      if (!byId.has(childId)) return;
      const link = parentLinksFor(byId.get(childId)).find((item) => item.personId === parent.id);
      if (!link || isBloodParentLink(link)) addUndirected(adjacency, parent.id, childId);
    });
  });
  childrenByParent.forEach((children) => {
    const bloodChildren = children.filter(({ link }) => isBloodParentLink(link)).map(({ childId }) => childId);
    bloodChildren.forEach((firstId, index) => bloodChildren.slice(index + 1).forEach((secondId) => addUndirected(adjacency, firstId, secondId)));
  });

  const parsedDepth = depth === "all" || depth === "" || depth === null || depth === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Number(depth) || 0);
  const bloodIds = new Set([selectedId]);
  const queue = [{ id: selectedId, distance: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (current.distance >= parsedDepth) continue;
    adjacency.get(current.id)?.forEach((nextId) => {
      if (bloodIds.has(nextId)) return;
      bloodIds.add(nextId);
      queue.push({ id: nextId, distance: current.distance + 1 });
    });
  }

  const contextIds = new Set();
  const addContext = (id) => { if (byId.has(id) && !bloodIds.has(id)) contextIds.add(id); };
  bloodIds.forEach((id) => {
    const person = byId.get(id);
    directRelativeIds(person, byId).forEach((relativeId) => addContext(relativeId));
    const partnerIds = new Set(Array.isArray(person?.partnerIds) ? person.partnerIds : []);
    (Array.isArray(partnerships) ? partnerships : []).forEach((partnership) => {
      if (Array.isArray(partnership?.personIds) && partnership.personIds.includes(id)) partnership.personIds.forEach((partnerId) => partnerIds.add(partnerId));
    });
    partnerIds.forEach((partnerId) => {
      addContext(partnerId);
      directRelativeIds(byId.get(partnerId), byId).forEach((relativeId) => addContext(relativeId));
    });
  });
  return { bloodIds, contextIds, visibleIds: new Set([...bloodIds, ...contextIds]) };
}

export function getFamilyBranchIds(people = [], partnerships = [], selectedId = "", depth = "all") {
  return getFamilyView(people, partnerships, selectedId, depth).bloodIds;
}

export function getNearbyFamilyIds(people = [], partnerships = [], selectedId = "") {
  return getFamilyView(people, partnerships, selectedId, 1).visibleIds;
}
