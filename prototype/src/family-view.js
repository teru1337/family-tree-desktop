export function getNearbyFamilyIds(people = [], partnerships = [], selectedId = "") {
  const person = (Array.isArray(people) ? people : []).find((item) => item?.id === selectedId);
  if (!person) return new Set();
  const ids = new Set([person.id]);
  const add = (id) => {
    if (id && people.some((item) => item?.id === id)) ids.add(id);
  };
  (Array.isArray(person.parentIds) ? person.parentIds : []).forEach(add);
  (Array.isArray(person.parentLinks) ? person.parentLinks : []).forEach((link) => add(link?.personId));
  (Array.isArray(person.childIds) ? person.childIds : []).forEach(add);
  (Array.isArray(person.siblingIds) ? person.siblingIds : []).forEach(add);
  (Array.isArray(person.siblingLinks) ? person.siblingLinks : []).forEach((link) => add(link?.personId));
  (Array.isArray(partnerships) ? partnerships : []).forEach((partnership) => {
    if (!Array.isArray(partnership?.personIds) || !partnership.personIds.includes(person.id)) return;
    partnership.personIds.forEach(add);
  });
  return ids;
}
