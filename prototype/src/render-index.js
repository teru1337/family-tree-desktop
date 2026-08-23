function parentLinksFor(person) {
  return person?.parentLinks?.length
    ? person.parentLinks
    : (person?.parentIds || []).map((parentId) => ({ personId: parentId, type: "biological" }));
}

function siblingLinksFor(person) {
  return person?.siblingLinks?.length
    ? person.siblingLinks
    : (person?.siblingIds || []).map((personId) => ({ personId, type: "biological" }));
}

export function createRenderIndex(people, partnerships, byId = new Map(people.map((person) => [person.id, person]))) {
  const parentEdges = [];
  const siblingEdges = [];
  people.forEach((child) => {
    parentLinksFor(child).forEach((link) => {
      const parent = byId.get(link.personId);
      if (parent) parentEdges.push({ parent, child, type: link.type || "biological" });
    });
    siblingLinksFor(child).forEach((link) => {
      const sibling = byId.get(link.personId);
      if (sibling) siblingEdges.push({ first: child, second: sibling, type: link.type || "biological" });
    });
  });
  const partnershipEdges = partnerships.flatMap((partnership) => {
    const first = byId.get(partnership.personIds?.[0]);
    const second = byId.get(partnership.personIds?.[1]);
    return first && second ? [{ partnership, first, second }] : [];
  });
  return { byId, parentEdges, siblingEdges, partnershipEdges };
}

export function visibleEdges(edges, visibleIds) {
  if (!visibleIds) return edges;
  return edges.filter(({ parent, child, first, second }) => visibleIds.has(parent?.id || first?.id) || visibleIds.has(child?.id || second?.id));
}
