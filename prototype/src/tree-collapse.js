function addChild(childrenByParent, parentId, childId) {
  if (!parentId || !childId || parentId === childId) return;
  if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, new Set());
  childrenByParent.get(parentId).add(childId);
}

function partnerIdsFor(personId, partnerships) {
  const ids = new Set();
  partnerships.forEach((partnership) => {
    if (partnership?.status === "divorced" || !Array.isArray(partnership?.personIds) || !partnership.personIds.includes(personId)) return;
    partnership.personIds.forEach((id) => { if (id !== personId) ids.add(id); });
  });
  return ids;
}

export function getCollapsedDescendantIds(people = [], partnerships = [], collapsedIds = new Set()) {
  const sourcePeople = Array.isArray(people) ? people : [];
  const sourcePartnerships = Array.isArray(partnerships) ? partnerships : [];
  const peopleIds = new Set(sourcePeople.map((person) => String(person?.id || "")).filter(Boolean));
  const childrenByParent = new Map();
  sourcePeople.forEach((person) => {
    (Array.isArray(person?.childIds) ? person.childIds : []).forEach((childId) => addChild(childrenByParent, person.id, childId));
    (Array.isArray(person?.parentLinks) ? person.parentLinks : (Array.isArray(person?.parentIds) ? person.parentIds.map((personId) => ({ personId })) : [])).forEach((link) => addChild(childrenByParent, link?.personId, person.id));
  });
  const hidden = new Set();
  const roots = [...(collapsedIds instanceof Set ? collapsedIds : new Set(collapsedIds || []))].filter((id) => peopleIds.has(id));
  roots.forEach((rootId) => {
    const queue = [...childrenByParent.get(rootId) || []];
    partnerIdsFor(rootId, sourcePartnerships).forEach((partnerId) => (childrenByParent.get(partnerId) || []).forEach((childId) => queue.push(childId)));
    while (queue.length) {
      const id = queue.shift();
      if (!peopleIds.has(id) || id === rootId || hidden.has(id)) continue;
      hidden.add(id);
      (childrenByParent.get(id) || []).forEach((childId) => queue.push(childId));
      partnerIdsFor(id, sourcePartnerships).forEach((partnerId) => (childrenByParent.get(partnerId) || []).forEach((childId) => queue.push(childId)));
    }
  });
  return hidden;
}

export function hasDescendants(people = [], personId = "", partnerships = []) {
  const hidden = getCollapsedDescendantIds(people, partnerships, new Set([personId]));
  return hidden.size > 0;
}
