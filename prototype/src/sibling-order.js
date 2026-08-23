function siblingIdsFor(person) {
  const links = Array.isArray(person?.siblingLinks) ? person.siblingLinks : [];
  if (links.length) return [...new Set(links.map((link) => String(link?.personId || "")).filter(Boolean))];
  return [...new Set((Array.isArray(person?.siblingIds) ? person.siblingIds : []).map((id) => String(id)).filter(Boolean))];
}

function birthYearFor(person) {
  const values = [person?.birthDate?.value, person?.birthDate?.text, person?.year];
  for (const value of values) {
    const match = String(value || "").match(/(?:^|\D)((?:1[5-9]\d{2})|(?:20\d{2}))(?:\D|$)/);
    if (match) return Number(match[1]);
  }
  return Number.POSITIVE_INFINITY;
}

function manualOrderFor(person) {
  const value = person?.siblingOrder;
  if (value === "" || value === null || value === undefined) return Number.POSITIVE_INFINITY;
  const order = Number(value);
  return Number.isInteger(order) && order > 0 ? order : Number.POSITIVE_INFINITY;
}

export function compareSiblingPeople(first, second, firstIndex = 0, secondIndex = 0) {
  const firstManual = manualOrderFor(first);
  const secondManual = manualOrderFor(second);
  if (firstManual !== secondManual) return firstManual - secondManual;
  const firstBirthYear = birthYearFor(first);
  const secondBirthYear = birthYearFor(second);
  if (firstBirthYear !== secondBirthYear) return firstBirthYear - secondBirthYear;
  const names = String(first?.name || first?.shortName || "").localeCompare(String(second?.name || second?.shortName || ""), "ru");
  return names || firstIndex - secondIndex;
}

export function orderSiblingMembers(members) {
  return [...(Array.isArray(members) ? members : [])]
    .map((person, index) => ({ person, index }))
    .sort((first, second) => compareSiblingPeople(first.person, second.person, first.index, second.index))
    .map(({ person }) => person);
}

export function getSiblingComponent(people, personId) {
  const byId = new Map((Array.isArray(people) ? people : []).map((person) => [person.id, person]));
  if (!byId.has(personId)) return [];
  const component = [];
  const queue = [personId];
  const visited = new Set();
  while (queue.length) {
    const currentId = queue.shift();
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    const person = byId.get(currentId);
    if (!person) continue;
    component.push(person);
    siblingIdsFor(person).forEach((siblingId) => {
      if (byId.has(siblingId) && !visited.has(siblingId)) queue.push(siblingId);
    });
  }
  return orderSiblingMembers(component);
}

export function reorderSiblingComponent(people, personId, direction) {
  const component = getSiblingComponent(people, personId);
  const currentIndex = component.findIndex((person) => person.id === personId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= component.length) return people;
  const reordered = [...component];
  [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
  const orderById = new Map(reordered.map((person, index) => [person.id, index + 1]));
  return (Array.isArray(people) ? people : []).map((person) => orderById.has(person.id) ? { ...person, siblingOrder: orderById.get(person.id) } : person);
}

export function orderGenerationMembers(members) {
  const source = Array.isArray(members) ? members : [];
  const byId = new Map(source.map((person) => [person.id, person]));
  const adjacency = new Map(source.map((person) => [person.id, new Set()]));
  source.forEach((person) => siblingIdsFor(person).forEach((siblingId) => {
    if (!byId.has(siblingId)) return;
    adjacency.get(person.id).add(siblingId);
    adjacency.get(siblingId).add(person.id);
  }));
  const originalIndex = new Map(source.map((person, index) => [person.id, index]));
  const visited = new Set();
  const components = [];
  source.forEach((person) => {
    if (visited.has(person.id)) return;
    const component = [];
    const queue = [person.id];
    while (queue.length) {
      const currentId = queue.shift();
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      component.push(byId.get(currentId));
      adjacency.get(currentId)?.forEach((siblingId) => {
        if (!visited.has(siblingId)) queue.push(siblingId);
      });
    }
    components.push(orderSiblingMembers(component));
  });
  return components
    .sort((first, second) => originalIndex.get(first[0].id) - originalIndex.get(second[0].id))
    .flat();
}
