import { normalizePersonDate, parseDatePart } from "./dates.js";

const MIN_PARENT_AGE = 12;
const MIN_PARTNERSHIP_AGE = 12;

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizedKey(value) {
  return cleanText(value)
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function personLabel(person) {
  return cleanText(person?.name) || "Человек без имени";
}

function yearFromValue(value) {
  const parsed = parseDatePart(value);
  if (parsed.valid) return Number(String(parsed.value).slice(0, 4));
  const year = /(?:^|\D)(\d{4})(?:\D|$)/.exec(cleanText(value));
  return year ? Number(year[1]) : null;
}

function birthYearBounds(person) {
  const normalized = normalizePersonDate(person || {});
  const birthDate = normalized.birthDate || {};
  if (birthDate.precision === "range") {
    const from = yearFromValue(birthDate.from);
    const to = yearFromValue(birthDate.to);
    if (from !== null && to !== null) return { min: Math.min(from, to), max: Math.max(from, to) };
    return null;
  }
  const year = yearFromValue(birthDate.value || birthDate.text || normalized.year);
  return year === null ? null : { min: year, max: year };
}

function sameBirthYear(left, right) {
  const leftBounds = birthYearBounds(left);
  const rightBounds = birthYearBounds(right);
  return Boolean(leftBounds && rightBounds && leftBounds.min <= rightBounds.max && rightBounds.min <= leftBounds.max);
}

function relationYear(value) {
  return yearFromValue(value);
}

function addWarning(warnings, warning) {
  if (warning && !warnings.includes(warning)) warnings.push(warning);
}

function inspectDuplicates(people, warnings) {
  const byName = new Map();
  people.forEach((person) => {
    const nameKey = normalizedKey(person?.name);
    if (!nameKey || nameKey === "человекбезимени") return;
    const sameNamePeople = byName.get(nameKey) || [];
    sameNamePeople.forEach((other) => {
      const samePlace = normalizedKey(person?.place) && normalizedKey(person?.place) === normalizedKey(other?.place);
      const hasNoSupportingData = !birthYearBounds(person) && !birthYearBounds(other) && !normalizedKey(person?.place) && !normalizedKey(other?.place);
      if (!sameBirthYear(person, other) && !samePlace && !hasNoSupportingData) return;
      const facts = [sameBirthYear(person, other) ? "дату рождения" : "", samePlace ? "место рождения" : ""].filter(Boolean).join(" и ") || "ФИО";
      addWarning(warnings, `Возможный дубликат: «${personLabel(other)}» (ID ${other.id}) и «${personLabel(person)}» (ID ${person.id}). Совпадают ${facts}; проверьте, не одна ли это запись.`);
    });
    sameNamePeople.push(person);
    byName.set(nameKey, sameNamePeople);
  });
}

function inspectParentRelations(peopleById, relations, warnings) {
  const parentGraph = new Map();
  relations.filter((relation) => relation?.kind === "parent").forEach((relation) => {
    const parent = peopleById.get(String(relation.parentId || ""));
    const child = peopleById.get(String(relation.childId || ""));
    if (!parent || !child) return;
    const parentId = String(parent.id);
    const childId = String(child.id);
    const children = parentGraph.get(parentId) || [];
    children.push(childId);
    parentGraph.set(parentId, children);

    const parentYears = birthYearBounds(parent);
    const childYears = birthYearBounds(child);
    if (!parentYears || !childYears) return;
    if (childYears.max < parentYears.min) {
      addWarning(warnings, `Невозможная дата: «${personLabel(child)}» родился раньше родителя «${personLabel(parent)}». Проверьте даты или тип связи.`);
    } else if (childYears.max - parentYears.min < MIN_PARENT_AGE) {
      addWarning(warnings, `Проверьте возраст: «${personLabel(parent)}» мог быть младше ${MIN_PARENT_AGE} лет при рождении «${personLabel(child)}».`);
    }
  });

  const visited = new Set();
  const active = new Set();
  const visit = (personId, path) => {
    if (active.has(personId)) {
      const cycleStart = path.indexOf(personId);
      const cycle = path.slice(cycleStart).sort().join("|");
      addWarning(warnings, `Невозможная связь: родительские записи образуют цикл (${cycle}). Проверьте связи.`);
      return;
    }
    if (visited.has(personId)) return;
    active.add(personId);
    (parentGraph.get(personId) || []).forEach((childId) => visit(childId, [...path, childId]));
    active.delete(personId);
    visited.add(personId);
  };
  peopleById.forEach((_, personId) => visit(personId, [personId]));
}

function inspectPartnerships(peopleById, relations, warnings) {
  relations.filter((relation) => relation?.kind === "partnership").forEach((relation) => {
    const personIds = Array.isArray(relation.personIds) ? relation.personIds.map(String) : [];
    const people = personIds.map((id) => peopleById.get(id)).filter(Boolean);
    const startYear = relationYear(relation.startDate);
    const endYear = relationYear(relation.endDate);
    if (startYear !== null && endYear !== null && endYear < startYear) {
      addWarning(warnings, `Невозможная дата связи: развод или окончание отношений (${endYear}) указано раньше начала (${startYear}).`);
    }
    if (startYear === null) return;
    people.forEach((person) => {
      const birthYears = birthYearBounds(person);
      if (!birthYears) return;
      if (startYear < birthYears.min) {
        addWarning(warnings, `Невозможная дата связи: отношения «${personLabel(person)}» начинаются до его рождения.`);
      } else if (startYear - birthYears.min < MIN_PARTNERSHIP_AGE) {
        addWarning(warnings, `Проверьте возраст: «${personLabel(person)}» мог быть младше ${MIN_PARTNERSHIP_AGE} лет на начало отношений.`);
      }
    });
  });
}

export function inspectFamilyData(peopleInput, relationsInput = []) {
  const people = Array.isArray(peopleInput) ? peopleInput : [];
  const relations = Array.isArray(relationsInput) ? relationsInput : [];
  const peopleById = new Map(people.map((person) => [String(person?.id || ""), person]).filter(([id]) => id));
  const warnings = [];
  inspectDuplicates(people, warnings);
  inspectParentRelations(peopleById, relations, warnings);
  inspectPartnerships(peopleById, relations, warnings);
  return { warnings };
}
