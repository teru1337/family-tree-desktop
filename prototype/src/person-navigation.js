export const MAX_PERSON_NAVIGATION = 50;

function normalizeNavigation(state) {
  const entries = Array.isArray(state?.entries) ? state.entries.filter(Boolean).map(String) : [];
  const index = entries.length ? Math.max(0, Math.min(entries.length - 1, Number(state?.index) || 0)) : -1;
  return { entries, index };
}

export function createPersonNavigation(initialId = "") {
  const id = String(initialId || "");
  return id ? { entries: [id], index: 0 } : { entries: [], index: -1 };
}

export function visitPerson(state, personId, limit = MAX_PERSON_NAVIGATION) {
  const id = String(personId || "");
  const current = normalizeNavigation(state);
  if (!id || current.entries[current.index] === id) return current;
  const branch = current.entries.slice(0, current.index + 1);
  const entries = [...branch, id].slice(-Math.max(2, Number(limit) || MAX_PERSON_NAVIGATION));
  return { entries, index: entries.length - 1 };
}

export function movePersonNavigation(state, direction) {
  const current = normalizeNavigation(state);
  if (!current.entries.length) return current;
  const nextIndex = Math.max(0, Math.min(current.entries.length - 1, current.index + (direction < 0 ? -1 : 1)));
  return nextIndex === current.index ? current : { ...current, index: nextIndex };
}

export function currentPersonId(state) {
  const current = normalizeNavigation(state);
  return current.entries[current.index] || "";
}

export function canMovePersonNavigation(state, direction) {
  const current = normalizeNavigation(state);
  return direction < 0 ? current.index > 0 : current.index >= 0 && current.index < current.entries.length - 1;
}
