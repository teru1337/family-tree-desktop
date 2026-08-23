export const DEFAULT_SEARCH_FILTERS = Object.freeze({ generation: "all", relation: "all", yearFrom: "", yearTo: "", place: "" });

function personLabel(person) {
  if (person?.isUnknown) return "Неизвестный человек";
  return person?.name || "Человек без имени";
}

export function birthYearBounds(person) {
  const record = person?.birthDate || {};
  const values = [record.from, record.to, record.value, record.text, person?.year]
    .flatMap((value) => String(value || "").match(/\b(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b/g) || [])
    .map(Number)
    .filter((value) => Number.isInteger(value));
  if (!values.length) return null;
  return { from: Math.min(...values), to: Math.max(...values) };
}

export function matchesRelationFilter(person, partnerships, relation) {
  if (relation === "all") return true;
  if (relation === "parent") return (person.parentLinks || []).length > 0 || (person.parentIds || []).length > 0;
  if (relation === "child") return (person.childIds || []).length > 0;
  if (relation === "partner") return (person.partnerIds || []).length > 0 || partnerships.some((partnership) => partnership.personIds.includes(person.id));
  if (relation === "sibling") return (person.siblingLinks || []).length > 0 || (person.siblingIds || []).length > 0;
  if (["biological", "adoptive", "guardian", "step", "unknown"].includes(relation)) {
    return (person.parentLinks || []).some((link) => relation === "step" ? link.type === "step" : link.type === relation) || (person.siblingLinks || []).some((link) => relation === "step" ? link.type === "step" : link.type === relation);
  }
  return true;
}

export function filterPeople(people, partnerships, positions, query, filters = DEFAULT_SEARCH_FILTERS, limit = 12) {
  const value = String(query || "").trim().toLocaleLowerCase("ru");
  const yearFrom = Number(filters.yearFrom) || null;
  const yearTo = Number(filters.yearTo) || null;
  return people.filter((person) => {
    const textMatches = !value || `${personLabel(person)} ${person.place || ""} ${person.year || ""}`.toLocaleLowerCase("ru").includes(value);
    const generationMatches = filters.generation === "all" || String(positions[person.id]?.generation) === filters.generation;
    const relationMatches = matchesRelationFilter(person, partnerships, filters.relation);
    const years = birthYearBounds(person);
    const dateMatches = (!yearFrom || (years && years.to >= yearFrom)) && (!yearTo || (years && years.from <= yearTo));
    const placeValue = String(filters.place || "").trim().toLocaleLowerCase("ru");
    const placeMatches = !placeValue || String(person.place || "").toLocaleLowerCase("ru").includes(placeValue);
    return textMatches && generationMatches && relationMatches && dateMatches && placeMatches;
  }).slice(0, limit);
}
