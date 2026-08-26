const BIOLOGICAL = "biological";

function birthOrderKey(person) {
  const value = String(person?.birthDate?.value || person?.birthDate?.text || person?.year || "").trim();
  const dayMonthYear = value.match(/(^|\D)(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:\D|$)/);
  if (dayMonthYear) return Number(`${dayMonthYear[4]}${dayMonthYear[3].padStart(2, "0")}${dayMonthYear[2].padStart(2, "0")}`);
  const yearMonthDay = value.match(/(^|\D)(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\D|$)/);
  if (yearMonthDay) return Number(`${yearMonthDay[2]}${yearMonthDay[3].padStart(2, "0")}${yearMonthDay[4].padStart(2, "0")}`);
  const year = value.match(/(?:^|\D)((?:1[5-9]\d{2})|(?:20\d{2}))(?:\D|$)/);
  return year ? Number(year[1]) * 10000 : Number.POSITIVE_INFINITY;
}

function compareOlderPeople(first, second) {
  const firstBirth = birthOrderKey(first);
  const secondBirth = birthOrderKey(second);
  if (firstBirth !== secondBirth) return firstBirth - secondBirth;
  const firstManual = Number.isInteger(Number(first?.siblingOrder)) && Number(first.siblingOrder) > 0 ? Number(first.siblingOrder) : Number.POSITIVE_INFINITY;
  const secondManual = Number.isInteger(Number(second?.siblingOrder)) && Number(second.siblingOrder) > 0 ? Number(second.siblingOrder) : Number.POSITIVE_INFINITY;
  if (firstManual !== secondManual) return firstManual - secondManual;
  return `${personLabel(first)}\u0000${first?.id || ""}`.localeCompare(`${personLabel(second)}\u0000${second?.id || ""}`, "ru");
}

function genderTerm(person, male, female, neutral = `${male}/${female}`) {
  if (person?.gender === "male") return male;
  if (person?.gender === "female") return female;
  return neutral;
}

export function personLabel(person) {
  if (person?.isUnknown) return "Неизвестный человек";
  return person?.name || "Человек без имени";
}

export function relationshipEdgeKey(edge = {}) {
  if (edge.kind === "parent") return `parent:${edge.parentId}:${edge.childId}:${edge.type || BIOLOGICAL}`;
  if (edge.kind === "partnership") return `partnership:${edge.id || (edge.personIds || []).slice().sort().join("|")}`;
  if (edge.kind === "sibling") return `sibling:${(edge.personIds || []).slice().sort().join("|")}:${edge.type || BIOLOGICAL}`;
  return "";
}

function parentLinksFor(person) {
  if (person?.parentLinks?.length) return person.parentLinks;
  return (person?.parentIds || []).map((personId) => ({ personId, type: BIOLOGICAL }));
}

function siblingLinksFor(person) {
  if (person?.siblingLinks?.length) return person.siblingLinks;
  return (person?.siblingIds || []).map((personId) => ({ personId, type: BIOLOGICAL }));
}

function addNode(graph, id) {
  if (id && !graph.has(id)) graph.set(id, []);
}

function addUndirectedEdge(graph, firstId, secondId, edge) {
  if (!firstId || !secondId || firstId === secondId) return;
  graph.get(firstId).push({ toId: secondId, edge });
  graph.get(secondId).push({ toId: firstId, edge });
}

function edgeKey(kind, firstId, secondId, type = "") {
  return `${kind}:${[firstId, secondId].sort().join("|")}:${type}`;
}

export function createRelationshipGraph(people = [], partnerships = []) {
  const safePeople = Array.isArray(people) ? people : [];
  const byId = new Map(safePeople.filter((person) => person?.id).map((person) => [person.id, person]));
  const graph = new Map([...byId.keys()].map((id) => [id, []]));
  const seen = new Set();

  const addParentEdge = (parentId, childId, type = BIOLOGICAL, id = "") => {
    if (!byId.has(parentId) || !byId.has(childId)) return;
    const key = edgeKey("parent", parentId, childId, `${type}:${id || ""}`);
    if (seen.has(key)) return;
    seen.add(key);
    addUndirectedEdge(graph, parentId, childId, { kind: "parent", parentId, childId, type, id });
  };

  safePeople.forEach((child) => {
    parentLinksFor(child).forEach((link) => addParentEdge(link.personId, child.id, link.type || BIOLOGICAL, link.id || ""));
  });
  safePeople.forEach((parent) => {
    (parent.childIds || []).forEach((childId) => {
      const child = byId.get(childId);
      const link = parentLinksFor(child).find((item) => item.personId === parent.id);
      addParentEdge(parent.id, childId, link?.type || BIOLOGICAL, link?.id || "");
    });
  });

  safePeople.forEach((person) => {
    siblingLinksFor(person).forEach((link) => {
      const sibling = byId.get(link.personId);
      if (!sibling) return;
      const type = link.type || BIOLOGICAL;
      const key = edgeKey("sibling", person.id, sibling.id, type);
      if (seen.has(key)) return;
      seen.add(key);
      addUndirectedEdge(graph, person.id, sibling.id, { kind: "sibling", personIds: [person.id, sibling.id], type, id: link.id || "" });
    });
  });

  (Array.isArray(partnerships) ? partnerships : []).forEach((partnership) => {
    const personIds = [...new Set((partnership?.personIds || []).filter((id) => byId.has(id)))];
    for (let firstIndex = 0; firstIndex < personIds.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < personIds.length; secondIndex += 1) {
        const firstId = personIds[firstIndex];
        const secondId = personIds[secondIndex];
        const type = partnership.type || "partnership";
        const key = edgeKey("partnership", firstId, secondId, `${type}:${partnership.id || ""}`);
        if (seen.has(key)) continue;
        seen.add(key);
        addUndirectedEdge(graph, firstId, secondId, { kind: "partnership", personIds: [firstId, secondId], type, status: partnership.status || "active", id: partnership.id || "" });
      }
    }
  });

  return { byId, graph };
}

function findPath(graph, sourceId, targetId) {
  if (sourceId === targetId) return { ids: [sourceId], edges: [] };
  const queue = [sourceId];
  const previous = new Map([[sourceId, null]]);
  while (queue.length) {
    const currentId = queue.shift();
    for (const entry of graph.get(currentId) || []) {
      if (previous.has(entry.toId)) continue;
      previous.set(entry.toId, { fromId: currentId, edge: entry.edge });
      if (entry.toId === targetId) {
        const ids = [targetId];
        const edges = [];
        let cursor = targetId;
        while (previous.get(cursor)) {
          const step = previous.get(cursor);
          edges.unshift(step.edge);
          ids.unshift(step.fromId);
          cursor = step.fromId;
        }
        return { ids, edges };
      }
      queue.push(entry.toId);
    }
  }
  return null;
}

function pathGenerationDelta(path, edges) {
  return edges.reduce((total, edge, index) => {
    if (edge.kind !== "parent") return total;
    const from = path[index];
    return total + (edge.parentId === from.id ? 1 : -1);
  }, 0);
}

export function orientRelationshipPath(source, target, path, edges) {
  if (!path?.length || path.length < 2) return { path: path || [], edges: edges || [], reversed: false };
  const delta = pathGenerationDelta(path, edges);
  const reverse = delta < 0 || (delta === 0 && compareOlderPeople(target, source) < 0);
  if (!reverse) return { path, edges, reversed: false };
  return { path: [...path].reverse(), edges: [...edges].reverse(), reversed: true };
}

function findParentPath(graph, sourceId, targetId, biologicalOnly = false) {
  if (sourceId === targetId) return { ids: [sourceId], edges: [] };
  const queue = [sourceId];
  const previous = new Map([[sourceId, null]]);
  while (queue.length) {
    const currentId = queue.shift();
    for (const entry of graph.get(currentId) || []) {
      const edge = entry.edge;
      if (edge.kind !== "parent" || edge.childId !== currentId || (biologicalOnly && edge.type !== BIOLOGICAL)) continue;
      if (previous.has(entry.toId)) continue;
      previous.set(entry.toId, { fromId: currentId, edge });
      if (entry.toId === targetId) {
        const ids = [targetId];
        const edges = [];
        let cursor = targetId;
        while (previous.get(cursor)) {
          const step = previous.get(cursor);
          edges.unshift(step.edge);
          ids.unshift(step.fromId);
          cursor = step.fromId;
        }
        return { ids, edges };
      }
      queue.push(entry.toId);
    }
  }
  return null;
}

function ancestorMap(graph, sourceId) {
  const result = new Map([[sourceId, { depth: 0, edges: [] }]]);
  const queue = [sourceId];
  while (queue.length) {
    const currentId = queue.shift();
    const current = result.get(currentId);
    for (const entry of graph.get(currentId) || []) {
      const edge = entry.edge;
      if (edge.kind !== "parent" || edge.childId !== currentId || edge.type !== BIOLOGICAL || result.has(entry.toId)) continue;
      result.set(entry.toId, { depth: current.depth + 1, edges: [...current.edges, edge] });
      queue.push(entry.toId);
    }
  }
  return result;
}

function parentRole(person, type = BIOLOGICAL) {
  if (type === "step") return genderTerm(person, "отчим", "мачеха", "отчим или мачеха");
  if (type === "adoptive") return genderTerm(person, "усыновитель", "усыновительница", "усыновитель");
  if (type === "guardian") return "опекун";
  if (type === "unknown") return "родитель или взрослый родственник";
  return genderTerm(person, "отец", "мать", "родитель");
}

function childRole(person, type = BIOLOGICAL) {
  if (type === "step") return genderTerm(person, "пасынок", "падчерица", "пасынок или падчерица");
  if (type === "adoptive") return genderTerm(person, "усыновлённый ребёнок", "удочерённая дочь", "усыновлённый ребёнок");
  if (type === "guardian") return genderTerm(person, "подопечный", "подопечная", "подопечный или подопечная");
  if (type === "unknown") return "ребёнок или подопечный";
  return genderTerm(person, "сын", "дочь", "ребёнок");
}

function siblingRole(person, type = BIOLOGICAL) {
  const role = genderTerm(person, "брат", "сестра", "брат или сестра");
  if (type === "half") return `неполнородный ${role}`;
  if (type === "step") return `сводный ${role}`;
  if (type === "unknown") return `брат или сестра (тип не указан)`;
  return `родной ${role}`;
}

function partnerRole(person, type = "partnership") {
  if (type === "partnership") return "партнёр";
  if (type === "engagement") return genderTerm(person, "жених", "невеста", "жених или невеста");
  return genderTerm(person, "супруг", "супруга", "супруг или супруга");
}

function lineageLabel(firstParent, suffix = "") {
  if (firstParent?.gender === "female") return `${suffix} по материнской линии`;
  if (firstParent?.gender === "male") return `${suffix} по отцовской линии`;
  return suffix;
}

function ancestorRole(person, depth, firstParent) {
  if (depth === 1) return parentRole(person);
  if (depth === 2) return lineageLabel(firstParent, genderTerm(person, "дедушка", "бабушка", "дедушка или бабушка"));
  const prefix = "пра".repeat(Math.max(1, depth - 2));
  return lineageLabel(firstParent, `${prefix}${genderTerm(person, "дедушка", "бабушка", "дедушка или бабушка")}`);
}

function descendantRole(person, depth) {
  if (depth === 1) return childRole(person);
  if (depth === 2) return genderTerm(person, "внук", "внучка", "внук или внучка");
  const prefix = "пра".repeat(Math.max(1, depth - 2));
  return `${prefix}${genderTerm(person, "внук", "внучка", "внук или внучка")}`;
}

function cousinRole(person, degree) {
  const prefix = degree === 1 ? "двоюродн" : `${degree + 1}-юродн`;
  if (person?.gender === "male") return `${prefix}ый брат`;
  if (person?.gender === "female") return `${prefix}ая сестра`;
  return `${prefix}ый брат или сестра`;
}

function auntOrUncleRole(person) {
  return genderTerm(person, "дядя", "тётя", "дядя или тётя");
}

function nephewOrNieceRole(person) {
  return genderTerm(person, "племянник", "племянница", "племянник или племянница");
}

function directRelationshipRole(source, target, edge) {
  if (edge.kind === "parent") {
    return edge.parentId === source.id ? childRole(target, edge.type) : parentRole(target, edge.type);
  }
  if (edge.kind === "sibling") return siblingRole(target, edge.type);
  if (edge.kind === "partnership") return partnerRole(target, edge.type);
  return "связанный человек";
}

function describeBloodRelationship(source, target, graph, byId) {
  const sourceToTarget = findParentPath(graph, source.id, target.id, true);
  if (sourceToTarget) {
    const firstParent = byId.get(sourceToTarget.edges[0]?.parentId);
    return ancestorRole(target, sourceToTarget.edges.length, firstParent);
  }
  const targetToSource = findParentPath(graph, target.id, source.id, true);
  if (targetToSource) {
    return descendantRole(target, targetToSource.edges.length);
  }

  const sourceAncestors = ancestorMap(graph, source.id);
  const targetAncestors = ancestorMap(graph, target.id);
  const common = [...sourceAncestors.entries()]
    .filter(([id]) => targetAncestors.has(id) && id !== source.id && id !== target.id)
    .map(([id, sourceInfo]) => ({ id, sourceInfo, targetInfo: targetAncestors.get(id) }))
    .sort((first, second) => first.sourceInfo.depth + first.targetInfo.depth - (second.sourceInfo.depth + second.targetInfo.depth))[0];
  if (!common) return "родственная связь через общий предок";
  const { sourceInfo, targetInfo } = common;
  const sourceDepth = sourceInfo.depth;
  const targetDepth = targetInfo.depth;
  if (sourceDepth === 1 && targetDepth === 1) return siblingRole(target);
  if (sourceDepth === 1 && targetDepth > 1) return nephewOrNieceRole(target);
  if (sourceDepth > 1 && targetDepth === 1) return auntOrUncleRole(target);
  const degree = Math.min(sourceDepth, targetDepth) - 1;
  const cousin = cousinRole(target, degree);
  return sourceDepth === targetDepth ? cousin : `${cousin}, разница ${Math.abs(sourceDepth - targetDepth)} ${Math.abs(sourceDepth - targetDepth) === 1 ? "поколение" : "поколения"}`;
}

export function describeRelationship(source, target, path, graph, byId) {
  if (source.id === target.id) return "Это один и тот же человек";
  if (!path?.edges?.length) return "Связь не найдена";
  if (path.edges.length === 1) return directRelationshipRole(source, target, path.edges[0]);
  if (path.edges.every((edge) => edge.kind === "parent" && edge.type === BIOLOGICAL)) return describeBloodRelationship(source, target, graph, byId);
  if (path.edges.every((edge) => edge.kind === "parent")) return "родственник через несколько поколений";
  if (path.edges.some((edge) => edge.kind === "partnership")) return "связь через супруга или партнёра";
  return "связанный родственник";
}

export function formatRelationshipStep(from, to, edge) {
  if (edge.kind === "parent") {
    const label = edge.type === "biological" ? "родственная связь" : edge.type === "adoptive" ? "усыновление" : edge.type === "step" ? "степ-родство" : edge.type === "guardian" ? "опекунство" : "родительская связь";
    return edge.parentId === from.id ? `${label}: родитель → ребёнок` : `${label}: ребёнок → родитель`;
  }
  if (edge.kind === "sibling") return edge.type === "half" ? "неполнородные брат/сестра" : edge.type === "step" ? "сводные брат/сестра" : "брат/сестра";
  if (edge.kind === "partnership") return edge.type === "marriage" ? (edge.status === "divorced" ? "бывший брак" : "брак") : edge.type === "engagement" ? "помолвка" : "партнёрство";
  return "связь";
}

export function calculateRelationship(people, partnerships, sourceId, targetId) {
  const { byId, graph } = createRelationshipGraph(people, partnerships);
  const source = byId.get(sourceId);
  const target = byId.get(targetId);
  if (!source || !target) return { status: "missing", source, target, path: [], edges: [], displayPath: [], displayEdges: [], steps: [], displaySteps: [], label: "Выберите двух людей" };
  if (source.id === target.id) return { status: "same", source, target, path: [source], edges: [], displayPath: [source], displayEdges: [], steps: [], displaySteps: [], label: "Это один и тот же человек" };
  const found = findPath(graph, source.id, target.id);
  if (!found) return { status: "unrelated", source, target, path: [], edges: [], displayPath: [], displayEdges: [], steps: [], displaySteps: [], label: "Связь между людьми не найдена" };
  const path = found.ids.map((id) => byId.get(id)).filter(Boolean);
  const steps = found.edges.map((edge, index) => ({ from: path[index], to: path[index + 1], edge, label: formatRelationshipStep(path[index], path[index + 1], edge) }));
  const oriented = orientRelationshipPath(source, target, path, found.edges);
  const displaySteps = oriented.edges.map((edge, index) => ({ from: oriented.path[index], to: oriented.path[index + 1], edge, label: formatRelationshipStep(oriented.path[index], oriented.path[index + 1], edge) }));
  return { status: "found", source, target, path, edges: found.edges, steps, displayPath: oriented.path, displayEdges: oriented.edges, displaySteps, label: describeRelationship(source, target, found, graph, byId) };
}
