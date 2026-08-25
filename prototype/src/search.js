export const DEFAULT_SEARCH_FILTERS = Object.freeze({ generation: "all", relation: "all", yearFrom: "", yearTo: "", place: "", occupation: "", biography: "", source: "", photo: "all" });

function personLabel(person) {
  if (person?.isUnknown) return "Неизвестный человек";
  return person?.name || "Человек без имени";
}

function normalizedText(value) {
  return String(value ?? "").toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function valuesFromPerson(person, partnerships) {
  const factSources = Object.entries(person?.factSources || {}).flat();
  const timelineValues = (Array.isArray(person?.timelineEvents) ? person.timelineEvents : []).flatMap((event) => [event?.title, event?.date, event?.place, event?.description, event?.source]);
  const customValues = (Array.isArray(person?.customFields) ? person.customFields : []).flatMap((field) => [field?.label, field?.value]);
  const relationSources = [
    ...(Array.isArray(person?.parentLinks) ? person.parentLinks : []).map((link) => link?.source),
    ...(Array.isArray(person?.siblingLinks) ? person.siblingLinks : []).map((link) => link?.source),
    ...(Array.isArray(partnerships) ? partnerships : []).filter((partnership) => partnership?.personIds?.includes(person?.id)).map((partnership) => partnership?.source),
  ];
  const surnameHistory = (Array.isArray(person?.surnameHistory) ? person.surnameHistory : []).flatMap((item) => [item?.surname, item?.reason, item?.source, item?.note]);
  const nameParts = [person?.nameParts?.familyName, person?.nameParts?.givenName, person?.nameParts?.patronymic];
  const placeDetails = [person?.placeDetails?.locality, person?.placeDetails?.region, person?.placeDetails?.country];
  return [personLabel(person), person?.shortName, ...nameParts, person?.maidenName, ...surnameHistory, person?.year, person?.place, ...placeDetails, person?.occupation, person?.biography, person?.source, ...factSources, ...timelineValues, ...customValues, ...relationSources].filter(Boolean).map(normalizedText);
}

function personSourceText(person, partnerships) {
  return [person?.source, ...Object.values(person?.factSources || {}), ...(Array.isArray(person?.timelineEvents) ? person.timelineEvents.map((event) => event?.source) : []), ...(Array.isArray(person?.parentLinks) ? person.parentLinks.map((link) => link?.source) : []), ...(Array.isArray(person?.siblingLinks) ? person.siblingLinks.map((link) => link?.source) : []), ...(Array.isArray(partnerships) ? partnerships : []).filter((partnership) => partnership?.personIds?.includes(person?.id)).map((partnership) => partnership?.source)].filter(Boolean).map(normalizedText).join(" ");
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
  const value = normalizedText(query);
  const yearFrom = Number(filters.yearFrom) || null;
  const yearTo = Number(filters.yearTo) || null;
  const placeValue = normalizedText(filters.place);
  const occupationValue = normalizedText(filters.occupation);
  const biographyValue = normalizedText(filters.biography);
  const sourceValue = normalizedText(filters.source);
  const photoValue = filters.photo || "all";
  return people.filter((person) => {
    const personText = valuesFromPerson(person, partnerships).join(" ");
    const textMatches = !value || personText.includes(value);
    const generationMatches = filters.generation === "all" || String(positions[person.id]?.generation) === filters.generation;
    const relationMatches = matchesRelationFilter(person, partnerships, filters.relation);
    const years = birthYearBounds(person);
    const dateMatches = (!yearFrom || (years && years.to >= yearFrom)) && (!yearTo || (years && years.from <= yearTo));
    const placeMatches = !placeValue || [person?.place, person?.placeDetails?.locality, person?.placeDetails?.region, person?.placeDetails?.country].filter(Boolean).map(normalizedText).join(" ").includes(placeValue);
    const occupationMatches = !occupationValue || normalizedText(person.occupation).includes(occupationValue);
    const biographyMatches = !biographyValue || normalizedText(person.biography).includes(biographyValue);
    const sourceMatches = !sourceValue || personSourceText(person, partnerships).includes(sourceValue);
    const hasPhoto = Boolean(String(person?.image || "").trim());
    const photoMatches = photoValue === "all" || (photoValue === "with" ? hasPhoto : !hasPhoto);
    return textMatches && generationMatches && relationMatches && dateMatches && placeMatches && occupationMatches && biographyMatches && sourceMatches && photoMatches;
  }).slice(0, limit);
}
