function addChild(childrenByParent, parentId, childId) {
  if (!parentId || !childId || parentId === childId) return;
  if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, new Set());
  childrenByParent.get(parentId).add(childId);
}

export function createCollapseIndex(people = [], partnerships = []) {
  const sourcePeople = Array.isArray(people) ? people : [];
  const sourcePartnerships = Array.isArray(partnerships) ? partnerships : [];
  const peopleIds = new Set(sourcePeople.map((person) => String(person?.id || "")).filter(Boolean));
  const childrenByParent = new Map();
  const partnersByPerson = new Map();
  sourcePeople.forEach((person) => {
    (Array.isArray(person?.childIds) ? person.childIds : []).forEach((childId) => addChild(childrenByParent, person.id, childId));
    (Array.isArray(person?.parentLinks) ? person.parentLinks : (Array.isArray(person?.parentIds) ? person.parentIds.map((personId) => ({ personId })) : [])).forEach((link) => addChild(childrenByParent, link?.personId, person.id));
  });
  sourcePartnerships.forEach((partnership) => {
    if (partnership?.status === "divorced" || !Array.isArray(partnership?.personIds) || partnership.personIds.length < 2) return;
    const [firstId, secondId] = partnership.personIds;
    if (!peopleIds.has(firstId) || !peopleIds.has(secondId)) return;
    if (!partnersByPerson.has(firstId)) partnersByPerson.set(firstId, new Set());
    if (!partnersByPerson.has(secondId)) partnersByPerson.set(secondId, new Set());
    partnersByPerson.get(firstId).add(secondId);
    partnersByPerson.get(secondId).add(firstId);
  });
  return { peopleIds, childrenByParent, partnersByPerson };
}

export function getCollapsedDescendantIds(people = [], partnerships = [], collapsedIds = new Set(), providedIndex = null) {
  const index = providedIndex || createCollapseIndex(people, partnerships);
  const { peopleIds, childrenByParent, partnersByPerson } = index;
  const hidden = new Set();
  const roots = [...(collapsedIds instanceof Set ? collapsedIds : new Set(collapsedIds || []))].filter((id) => peopleIds.has(id));
  roots.forEach((rootId) => {
    const queue = [...childrenByParent.get(rootId) || []];
    (partnersByPerson.get(rootId) || []).forEach((partnerId) => (childrenByParent.get(partnerId) || []).forEach((childId) => queue.push(childId)));
    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const id = queue[queueIndex];
      if (!peopleIds.has(id) || id === rootId || hidden.has(id)) continue;
      hidden.add(id);
      (childrenByParent.get(id) || []).forEach((childId) => queue.push(childId));
      (partnersByPerson.get(id) || []).forEach((partnerId) => (childrenByParent.get(partnerId) || []).forEach((childId) => queue.push(childId)));
    }
  });
  return hidden;
}

export function getCollapsibleIds(people = [], partnerships = [], providedIndex = null) {
  const index = providedIndex || createCollapseIndex(people, partnerships);
  const { peopleIds, childrenByParent, partnersByPerson } = index;
  return new Set([...peopleIds].filter((personId) => {
    if ((childrenByParent.get(personId) || []).size > 0) return true;
    return [...(partnersByPerson.get(personId) || [])].some((partnerId) => (childrenByParent.get(partnerId) || []).size > 0);
  }));
}

export function hasDescendants(people = [], personId = "", partnerships = []) {
  return getCollapsibleIds(people, partnerships).has(personId);
}
