import { createProjectPayload, normalizeProject, validateRelationGraph } from "./storage.js";

function pairKey(personIds) {
  return Array.isArray(personIds) ? [...personIds].sort().join("::") : "";
}

function sameRelation(left, right) {
  if (!left || !right || left.kind !== right.kind) return false;
  if (left.kind === "parent") return left.parentId === right.parentId && left.childId === right.childId && left.type === right.type;
  if (left.kind === "sibling") return pairKey(left.personIds) === pairKey(right.personIds) && left.type === right.type;
  return pairKey(left.personIds) === pairKey(right.personIds) && left.status === "active" && right.status === "active";
}

function normalizeRuntimeGraph(people, partnerships) {
  const base = createProjectPayload(people, { id: "relation-operation" }, partnerships);
  const report = validateRelationGraph(base.people, base.relations);
  if (!report.valid) throw new Error(report.errors[0] || "Связи проекта не прошли проверку.");
  const normalized = normalizeProject(base);
  return { people: normalized.people, partnerships: normalized.partnerships, relations: normalized.relations };
}

/**
 * Выполняет одну транзакцию над графом и возвращает согласованные runtime-данные.
 * До успешной проверки исходные массивы не изменяются.
 */
export function applyRelationOperation(people, partnerships, operation) {
  const base = createProjectPayload(people, { id: "relation-operation" }, partnerships);
  let nextPeople = people;
  let relations = [...base.relations];
  const type = operation?.type || "";

  if (type === "remove-person") {
    const personId = String(operation.personId || "");
    nextPeople = people.filter((person) => person.id !== personId);
    relations = relations.filter((relation) => {
      const ids = relation.kind === "parent" ? [relation.parentId, relation.childId] : relation.personIds;
      return !ids.includes(personId);
    });
  } else if (type === "remove") {
    relations = relations.filter((relation) => relation.id !== operation.relationId);
  } else if (type === "update") {
    let updated = false;
    relations = relations.map((relation) => {
      if (relation.id !== operation.relationId) return relation;
      updated = true;
      return { ...operation.relation, id: relation.id };
    });
    if (!updated) throw new Error("Изменяемая связь не найдена.");
  } else if (type === "upsert") {
    const relation = { ...operation.relation };
    const existingIndex = relations.findIndex((item) => sameRelation(item, relation));
    if (existingIndex < 0) relations.push(relation);
    else relations = relations.map((item, index) => index === existingIndex ? { ...relation, id: item.id } : item);
  } else if (type !== "normalize") {
    throw new Error("Неизвестная операция над связью.");
  }

  const report = validateRelationGraph(nextPeople, relations);
  if (!report.valid) throw new Error(report.errors[0] || "Связи проекта не прошли проверку.");
  const normalized = normalizeProject({ ...base, people: nextPeople, relations });
  return { people: normalized.people, partnerships: normalized.partnerships, relations: normalized.relations };
}

export function normalizeRelationState(people, partnerships) {
  return normalizeRuntimeGraph(people, partnerships);
}
