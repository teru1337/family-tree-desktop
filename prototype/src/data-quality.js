import { dateRecordBounds, normalizePersonDate, parseDatePart } from "./dates.js";

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

function deathDateBounds(person) {
  const normalized = normalizePersonDate(person || {});
  return normalized.deathDate ? dateRecordBounds(normalized.deathDate) : null;
}

function sameBirthYear(left, right) {
  const leftBounds = birthYearBounds(left);
  const rightBounds = birthYearBounds(right);
  return Boolean(leftBounds && rightBounds && leftBounds.min <= rightBounds.max && rightBounds.min <= leftBounds.max);
}

function birthYearsText(person) {
  const bounds = birthYearBounds(person);
  if (!bounds) return "дата неизвестна";
  return bounds.min === bounds.max ? String(bounds.min) : `${bounds.min}–${bounds.max}`;
}

function relationYear(value) {
  return yearFromValue(value);
}

function addWarning(warnings, warning) {
  if (warning && !warnings.includes(warning)) warnings.push(warning);
}

function addError(errors, error) {
  if (error && !errors.includes(error)) errors.push(error);
}

function inspectDuplicates(people, warnings) {
  const byName = new Map();
  people.forEach((person) => {
    const nameKey = normalizedKey(person?.name);
    if (!nameKey || nameKey === "человекбезимени") return;
    const sameNamePeople = byName.get(nameKey) || [];
    sameNamePeople.forEach((other) => {
      const personPlace = normalizedKey(person?.place);
      const otherPlace = normalizedKey(other?.place);
      const samePlace = personPlace && personPlace === otherPlace;
      const differentPlaces = personPlace && otherPlace && personPlace !== otherPlace;
      const personYears = birthYearBounds(person);
      const otherYears = birthYearBounds(other);
      const differentBirthYears = personYears && otherYears && !sameBirthYear(person, other);
      const contradictoryFacts = [
        differentBirthYears ? `разные годы рождения (${birthYearsText(other)} и ${birthYearsText(person)})` : "",
        differentPlaces ? `разные места рождения («${cleanText(other.place)}» и «${cleanText(person.place)}»)` : "",
      ].filter(Boolean);
      if (contradictoryFacts.length > 0) {
        addWarning(warnings, `Противоречие данных: у записей «${personLabel(other)}» и «${personLabel(person)}» совпадает ФИО, но указаны ${contradictoryFacts.join(" и ")}. Проверьте, не дублируются ли записи.`);
      }
      const hasNoSupportingData = !birthYearBounds(person) && !birthYearBounds(other) && !normalizedKey(person?.place) && !normalizedKey(other?.place);
      if (!sameBirthYear(person, other) && !samePlace && !hasNoSupportingData) return;
      const facts = [sameBirthYear(person, other) ? "дату рождения" : "", samePlace ? "место рождения" : ""].filter(Boolean).join(" и ") || "ФИО";
      addWarning(warnings, `Возможный дубликат: «${personLabel(other)}» и «${personLabel(person)}». Совпадают ${facts}; проверьте, не одна ли это запись.`);
    });
    sameNamePeople.push(person);
    byName.set(nameKey, sameNamePeople);
  });
}

function inspectTimelineEvents(people, warnings) {
  people.forEach((person) => {
    const events = Array.isArray(person?.timelineEvents) ? person.timelineEvents : [];
    const birthYears = birthYearBounds(person);
    const deathBounds = deathDateBounds(person);
    const seenEvents = new Set();
    events.forEach((event) => {
      const eventYear = relationYear(event?.date);
      if (eventYear !== null && birthYears && eventYear < birthYears.min) {
        addWarning(warnings, `Противоречие дат: событие «${cleanText(event?.title) || "Без названия"}» у «${personLabel(person)}» указано раньше рождения (${eventYear} раньше ${birthYearsText(person)}).`);
      }
      if (eventYear !== null && deathBounds && eventYear > Number(deathBounds.to.slice(0, 4))) {
        addWarning(warnings, `Противоречие дат: событие «${cleanText(event?.title) || "Без названия"}» у «${personLabel(person)}» указано после смерти (${eventYear} позже ${deathBounds.to.slice(0, 4)}).`);
      }
      const eventKey = `${normalizedKey(event?.title)}::${eventYear ?? cleanText(event?.date)}`;
      if (normalizedKey(event?.title) && seenEvents.has(eventKey)) {
        addWarning(warnings, `Возможный дубликат события: у «${personLabel(person)}» повторяется «${cleanText(event?.title)}» за ${eventYear ?? "ту же дату"}.`);
      }
      if (normalizedKey(event?.title)) seenEvents.add(eventKey);
    });
  });
}

function personSurname(person) {
  const structured = cleanText(person?.nameParts?.familyName);
  if (structured) return structured;
  return cleanText(person?.name).split(" ")[0] || "";
}

function surnameValues(person) {
  const values = new Set();
  const current = personSurname(person);
  if (current) values.add(normalizedKey(current));
  (Array.isArray(person?.surnameHistory) ? person.surnameHistory : []).forEach((entry) => {
    const surname = cleanText(entry?.surname || entry?.name);
    if (surname) values.add(normalizedKey(surname));
  });
  const maidenName = cleanText(person?.maidenName);
  if (maidenName) values.add(normalizedKey(maidenName));
  return values;
}

function inspectSurnameConsistency(people, warnings) {
  people.forEach((person) => {
    const entries = Array.isArray(person?.surnameHistory) ? person.surnameHistory : [];
    const birth = birthYearBounds(person);
    const death = deathDateBounds(person);
    const seen = new Map();
    entries.forEach((entry) => {
      const surname = cleanText(entry?.surname || entry?.name);
      if (!surname) return;
      const from = yearFromValue(entry?.from);
      const to = yearFromValue(entry?.to);
      if (from !== null && to !== null && to < from) {
        addWarning(warnings, `Противоречие фамилии: у «${personLabel(person)}» период фамилии «${surname}» заканчивается раньше начала (${to} раньше ${from}).`);
      }
      if (birth && from !== null && from < birth.min && entry?.reason !== "maiden") {
        addWarning(warnings, `Противоречие фамилии: у «${personLabel(person)}» смена на «${surname}» указана до рождения (${from} раньше ${birthYearsText(person)}).`);
      }
      if (death && from !== null && from > Number(death.to.slice(0, 4))) {
        addWarning(warnings, `Противоречие фамилии: у «${personLabel(person)}» смена на «${surname}» указана после смерти (${from} позже ${death.to.slice(0, 4)}).`);
      }
      const key = `${normalizedKey(surname)}::${cleanText(entry?.reason) || "unknown"}`;
      const previous = seen.get(key);
      if (previous && (!from || !previous.to || from <= previous.to) && (!to || !previous.from || to >= previous.from)) {
        addWarning(warnings, `Возможное дублирование истории фамилии: у «${personLabel(person)}» повторяется «${surname}» с одной причиной. Проверьте периоды.`);
      }
      seen.set(key, { from, to });
    });
  });
}

function inspectParentSurnames(peopleById, relations, warnings) {
  const parentsByChild = new Map();
  relations.filter((relation) => relation?.kind === "parent" && (relation.type || "biological") === "biological").forEach((relation) => {
    const parentId = String(relation.parentId || "");
    const childId = String(relation.childId || "");
    if (!parentId || !childId) return;
    const parents = parentsByChild.get(childId) || [];
    parents.push(parentId);
    parentsByChild.set(childId, parents);
  });
  parentsByChild.forEach((parentIds, childId) => {
    const child = peopleById.get(childId);
    const childSurname = normalizedKey(personSurname(child));
    if (!child || !childSurname || !parentIds.length) return;
    const parentSurnames = parentIds.map((id) => personSurname(peopleById.get(id))).filter(Boolean).map(normalizedKey);
    if (!parentSurnames.length || parentSurnames.includes(childSurname)) return;
    const childHistory = surnameValues(child);
    if (parentSurnames.some((surname) => childHistory.has(surname))) return;
    addWarning(warnings, `Проверьте фамилию: у ребёнка «${personLabel(child)}» (${personSurname(child)}) нет совпадения с фамилиями указанных биологических родителей. Возможно, нужно добавить историю смены фамилии.`);
  });
}

function inspectDeathDates(people, warnings) {
  people.forEach((person) => {
    const normalized = normalizePersonDate(person || {});
    const birth = dateRecordBounds(normalized.birthDate);
    const death = deathDateBounds(normalized);
    if (!death) return;
    if (birth && death.to < birth.from) {
      addWarning(warnings, `Невозможная дата: смерть «${personLabel(person)}» указана раньше рождения. Проверьте даты.`);
    }
  });
}

function inspectRelationConsistency(peopleById, relations, warnings, errors) {
  const parentRelations = new Map();
  const activePartnerships = new Map();
  const relationIds = new Map();
  const exactPartnerships = new Set();
  relations.forEach((relation, index) => {
    const relationId = cleanText(relation?.id);
    if (relationId) {
      if (relationIds.has(relationId)) addError(errors, `У связей №${relationIds.get(relationId)} и текущей связи совпадает технический ключ. Исправьте дублирующую запись.`);
      else relationIds.set(relationId, index + 1);
    }
    if (relation?.kind === "parent") {
      const parentId = String(relation.parentId || relation.fromId || "");
      const childId = String(relation.childId || relation.toId || "");
      if (!parentId || !childId) {
        addError(errors, "Родительская связь неполная: нужны родитель и ребёнок.");
        return;
      }
      if (parentId === childId) {
        const person = peopleById.get(parentId);
        addWarning(warnings, `Невозможная связь: «${personLabel(person)}» указан одновременно родителем и ребёнком самого себя.`);
        addError(errors, "Родительская связь невозможна: человек не может быть родителем самого себя.");
        return;
      }
      const missingIds = [parentId, childId].filter((id) => !peopleById.has(id));
      if (missingIds.length) {
        addError(errors, "Родительская связь ссылается на отсутствующего человека. Проверьте участников связи.");
        return;
      }
      const type = cleanText(relation.type) || "unknown";
      const key = `${parentId}::${childId}::${type}`;
      if (parentRelations.has(key)) {
        const parent = peopleById.get(parentId);
        const child = peopleById.get(childId);
        addWarning(warnings, `Возможный дубликат связи: между «${personLabel(parent)}» и «${personLabel(child)}» повторяется один и тот же тип родства. Проверьте записи связей.`);
        addError(errors, "Каноническая родительская связь дублирует уже существующую связь.");
      } else {
        parentRelations.set(key, relation.id || key);
      }
      return;
    }
    if (relation?.kind !== "partnership" && relation?.kind !== "sibling") {
      addError(errors, "Связь имеет неизвестный тип и не может быть сохранена.");
      return;
    }
    const personIds = Array.isArray(relation.personIds) ? relation.personIds.map(String) : [];
    if (personIds.length !== 2 || personIds[0] === personIds[1]) {
      addError(errors, `${relation.kind === "sibling" ? "Связь братьев и сестёр" : "Партнёрская связь"} должна соединять ровно двух разных людей.`);
      return;
    }
    const missingIds = personIds.filter((id) => !peopleById.has(id));
    if (missingIds.length) {
      addError(errors, "Связь ссылается на отсутствующего человека. Проверьте участников связи.");
      return;
    }
    if (relation.kind === "sibling") {
      const key = `${[...personIds].sort().join("::")}::${cleanText(relation.type) || "biological"}`;
      if (exactPartnerships.has(`sibling::${key}`)) addError(errors, "Каноническая связь братьев и сестёр дублирует уже существующую связь.");
      exactPartnerships.add(`sibling::${key}`);
      return;
    }
    const exactKey = `${[...personIds].sort().join("::")}::${cleanText(relation.type) || "marriage"}::${relation.status || "active"}::${relation.startDate || ""}::${relation.startDatePrecision || "unknown"}::${relation.endDate || ""}::${relation.endDatePrecision || "unknown"}`;
    if (exactPartnerships.has(exactKey)) addError(errors, "Каноническая партнёрская связь дублирует уже существующую связь.");
    exactPartnerships.add(exactKey);
    if (relation.status === "divorced") return;
    const pairKey = [...personIds].sort().join("::");
    if (activePartnerships.has(pairKey)) {
      const first = peopleById.get(personIds[0]);
      const second = peopleById.get(personIds[1]);
      addWarning(warnings, `Возможный дубликат связи: у «${personLabel(first)}» и «${personLabel(second)}» несколько активных записей о браке или партнёрстве. Проверьте даты и записи связей.`);
      addError(errors, "Канонические активные партнёрские связи одной пары противоречат друг другу: завершите предыдущую связь или оставьте одну активную запись.");
    } else {
      activePartnerships.set(pairKey, relation.id || pairKey);
    }
  });
}

function inspectParentRelations(peopleById, relations, warnings, errors) {
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
      addError(errors, `Родительские связи образуют цикл: ${path.slice(cycleStart).join(" → ")}.`);
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

function inspectKinshipConflicts(peopleById, relations, warnings) {
  const parentGraph = new Map();
  const parentPairs = new Set();
  const siblingPairs = new Set();
  const biologicalParentsByChild = new Map();
  const addPair = (left, right) => [left, right].sort().join("::");
  relations.forEach((relation) => {
    if (relation?.kind === "parent") {
      const parentId = String(relation.parentId || "");
      const childId = String(relation.childId || "");
      if (!parentId || !childId) return;
      parentPairs.add(`${parentId}::${childId}`);
      const children = parentGraph.get(parentId) || [];
      children.push(childId);
      parentGraph.set(parentId, children);
      if ((relation.type || "biological") === "biological") {
        const parents = biologicalParentsByChild.get(childId) || [];
        parents.push(parentId);
        biologicalParentsByChild.set(childId, parents);
      }
      return;
    }
    if (relation?.kind === "sibling" && Array.isArray(relation.personIds) && relation.personIds.length === 2) {
      siblingPairs.add(addPair(String(relation.personIds[0]), String(relation.personIds[1])));
    }
  });
  parentGraph.forEach((children) => {
    [...new Set(children)].forEach((left, index, uniqueChildren) => uniqueChildren.slice(index + 1).forEach((right) => siblingPairs.add(addPair(left, right))));
  });
  biologicalParentsByChild.forEach((parentIds, childId) => {
    if (new Set(parentIds).size > 2) {
      addWarning(warnings, `Проверьте родство: у «${personLabel(peopleById.get(childId))}» указано больше двух биологических родителей.`);
    }
  });
  relations.forEach((relation) => {
    if (relation?.kind === "sibling" && Array.isArray(relation.personIds) && relation.personIds.length === 2) {
      const left = String(relation.personIds[0]);
      const right = String(relation.personIds[1]);
      if (parentPairs.has(`${left}::${right}`) || parentPairs.has(`${right}::${left}`)) {
        addWarning(warnings, `Противоречие родства: «${personLabel(peopleById.get(left))}» и «${personLabel(peopleById.get(right))}» одновременно указаны как родитель и брат или сестра.`);
      }
    }
    if (relation?.kind !== "partnership" || !Array.isArray(relation.personIds) || relation.personIds.length !== 2) return;
    const left = String(relation.personIds[0]);
    const right = String(relation.personIds[1]);
    const pair = addPair(left, right);
    if (siblingPairs.has(pair)) {
      addWarning(warnings, `Проверьте родство: у «${personLabel(peopleById.get(left))}» и «${personLabel(peopleById.get(right))}» одновременно указаны партнёрская и братская или сестринская связь.`);
    }
    const reaches = (start, target) => {
      const visited = new Set();
      const queue = [start];
      while (queue.length) {
        const current = queue.shift();
        if (current === target) return true;
        if (visited.has(current)) continue;
        visited.add(current);
        (parentGraph.get(current) || []).forEach((childId) => queue.push(childId));
      }
      return false;
    };
    if (reaches(left, right) || reaches(right, left)) {
      addWarning(warnings, `Проверьте родство: партнёрская связь соединяет «${personLabel(peopleById.get(left))}» и «${personLabel(peopleById.get(right))}», связанных по линии родитель–ребёнок.`);
    }
  });
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
  const errors = [];
  inspectDuplicates(people, warnings);
  inspectTimelineEvents(people, warnings);
  inspectDeathDates(people, warnings);
  inspectSurnameConsistency(people, warnings);
  inspectRelationConsistency(peopleById, relations, warnings, errors);
  inspectParentRelations(peopleById, relations, warnings, errors);
  inspectParentSurnames(peopleById, relations, warnings);
  inspectKinshipConflicts(peopleById, relations, warnings);
  inspectPartnerships(peopleById, relations, warnings);
  return { errors, warnings };
}
