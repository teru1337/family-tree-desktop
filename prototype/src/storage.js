import { normalizePersonDate, validateDateRecord } from "./dates.js";
import { inspectFamilyData } from "./data-quality.js";

export const PROJECT_FORMAT = "familytree";
export const PROJECT_VERSION = 4;
export const SUPPORTED_PROJECT_VERSIONS = [1, 2, 3, PROJECT_VERSION];

// Названия ключей сохраняем прежними, чтобы не потерять рабочие копии после обновления.
export const WORKING_COPY_KEY = "familytree-working-copy-v1";
export const BACKUPS_KEY = "familytree-backups-v1";
export const MAX_BACKUPS = 10;

const WORKING_COPY_TMP_KEY = `${WORKING_COPY_KEY}-tmp`;
const WORKING_COPY_PREVIOUS_KEY = `${WORKING_COPY_KEY}-previous`;
const BACKUPS_TMP_KEY = `${BACKUPS_KEY}-tmp`;
const BACKUPS_PREVIOUS_KEY = `${BACKUPS_KEY}-previous`;

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueIds(value) {
  return [...new Set(ensureArray(value).map((item) => String(item)).filter(Boolean))];
}

function storageAvailable() {
  return typeof window !== "undefined" && window.localStorage;
}

function removeStorageItem(key) {
  storageAvailable()?.removeItem?.(key);
}

function writeStorageItem(key, value) {
  try {
    storageAvailable()?.setItem(key, value);
  } catch {
    throw new Error("Не удалось сохранить данные на компьютере. Проверьте свободное место и доступ к хранилищу.");
  }
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

const parentLinkTypes = new Set(["biological", "adoptive", "step", "guardian", "unknown"]);
const partnershipTypes = new Set(["marriage", "partnership", "unknown"]);
const relationKinds = new Set(["parent", "partnership"]);

function normalizeParentLinks(person) {
  const childId = String(person?.id || "unknown-person");
  const links = [];
  const usedIds = new Set();
  ensureArray(person?.parentLinks).forEach((link, index) => {
    const personId = String(link?.personId || "");
    const type = parentLinkTypes.has(link?.type) ? link.type : "biological";
    if (!personId || links.some((item) => item.personId === personId && item.type === type)) return;
    let id = String(link?.id || `parent-link-${childId}-${personId}-${type}`);
    if (usedIds.has(id)) id = `${id}-${index + 1}`;
    usedIds.add(id);
    links.push({ id, personId, type });
  });
  const known = new Set(links.map((link) => link.personId));
  uniqueIds(person?.parentIds).forEach((personId) => {
    if (!known.has(personId)) {
      const id = `parent-link-${childId}-${personId}-biological`;
      links.push({ id, personId, type: "biological" });
    }
  });
  return links;
}

function normalizePartnership(record, index, peopleIds, usedIds = new Set()) {
  const personIds = uniqueIds(record?.personIds).filter((id) => peopleIds.has(id));
  if (personIds.length !== 2 || personIds[0] === personIds[1]) return null;
  let id = String(record?.id || `partnership-${index + 1}`);
  if (usedIds.has(id)) id = `${id}-${index + 1}`;
  usedIds.add(id);
  return {
    id,
    personIds,
    type: partnershipTypes.has(record?.type) ? record.type : "marriage",
    status: record?.status === "divorced" ? "divorced" : "active",
    startDate: typeof record?.startDate === "string" ? record.startDate : "",
    startDatePrecision: typeof record?.startDatePrecision === "string" ? record.startDatePrecision : "unknown",
    endDate: typeof record?.endDate === "string" ? record.endDate : "",
    endDatePrecision: typeof record?.endDatePrecision === "string" ? record.endDatePrecision : "unknown",
  };
}

function stripPersonRelations(person) {
  const { parentIds, parentLinks, partnerIds, childIds, ...profile } = person || {};
  return profile;
}

function stripPersonForStorage(person) {
  const { image, year, datePrecision, birthDateFrom, birthDateTo, ...profile } = stripPersonRelations(person);
  const normalized = normalizePersonDate({ ...profile, year, datePrecision, birthDateFrom, birthDateTo });
  const { year: compatibilityYear, datePrecision: compatibilityPrecision, birthDateFrom: compatibilityFrom, birthDateTo: compatibilityTo, ...storedProfile } = normalized;
  return { ...storedProfile, birthDate: normalized.birthDate };
}

function isEmbeddedImage(value) {
  return typeof value === "string" && /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(value);
}

function imageMimeType(dataUrl) {
  return String(dataUrl || "").match(/^data:(image\/[a-z0-9.+-]+);base64,/i)?.[1]?.toLowerCase() || "";
}

function estimateDataUrlBytes(dataUrl) {
  const encoded = String(dataUrl || "").split(",", 2)[1] || "";
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(encoded.length * 3 / 4) - padding);
}

function photoChecksum(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizePhoto(record, index, peopleIds, usedIds = new Set()) {
  const personId = String(record?.personId || "");
  if (!personId || !peopleIds.has(personId)) return null;
  const dataUrl = isEmbeddedImage(record?.dataUrl) ? record.dataUrl : "";
  const source = typeof record?.source === "string" ? record.source.trim() : "";
  if (!dataUrl && !source) return null;
  let id = String(record?.id || `photo-${personId}-${index + 1}`);
  if (usedIds.has(id)) {
    let suffix = 1;
    const baseId = id;
    id = `${baseId}-${suffix}`;
    while (usedIds.has(id)) id = `${baseId}-${++suffix}`;
  }
  usedIds.add(id);
  const mimeType = dataUrl ? imageMimeType(dataUrl) : (typeof record?.mimeType === "string" ? record.mimeType : "");
  return {
    id,
    personId,
    fileName: typeof record?.fileName === "string" ? record.fileName : "",
    mimeType,
    dataUrl,
    source: dataUrl ? "" : source,
    bytes: dataUrl ? estimateDataUrlBytes(dataUrl) : Math.max(0, Number(record?.bytes) || 0),
    checksum: dataUrl ? String(record?.checksum || photoChecksum(dataUrl)) : "",
    primary: record?.primary !== false,
  };
}

function normalizePhotos(records, people, peopleIds) {
  const source = ensureArray(records).slice();
  const explicitPersonIds = new Set(source.map((record) => String(record?.personId || "")).filter(Boolean));
  ensureArray(people).forEach((person) => {
    if (person?.image && !explicitPersonIds.has(String(person.id))) {
      source.push({ id: `photo-${person.id}`, personId: person.id, dataUrl: isEmbeddedImage(person.image) ? person.image : "", source: isEmbeddedImage(person.image) ? "" : person.image, primary: true });
    }
  });
  const usedIds = new Set();
  return source.map((record, index) => normalizePhoto(record, index, peopleIds, usedIds)).filter(Boolean);
}

function attachPhotos(people, photos) {
  const byPerson = new Map();
  photos.forEach((photo) => {
    if (!byPerson.has(photo.personId)) byPerson.set(photo.personId, []);
    byPerson.get(photo.personId).push(photo);
  });
  return people.map((person) => {
    const personPhotos = byPerson.get(person.id) || [];
    const photo = [...personPhotos].sort((left, right) => Number(right.primary) - Number(left.primary) || Number(Boolean(right.dataUrl)) - Number(Boolean(left.dataUrl)))[0];
    return { ...person, image: photo ? (photo.dataUrl || photo.source) : (person.image || "") };
  });
}

function relationSemanticKey(relation) {
  if (relation?.kind === "parent") return `parent::${relation.parentId}::${relation.childId}::${relation.type}`;
  if (relation?.kind === "partnership") return `partnership::${[...(relation.personIds || [])].sort().join("::")}::${relation.id || ""}`;
  return "";
}

function deriveRelationsFromLegacy(people, legacyPartnerships = []) {
  const peopleIds = new Set(ensureArray(people).map((person) => String(person?.id || "")).filter(Boolean));
  const relations = [];
  const seenParentRelations = new Set();
  const seenParentPairs = new Set();
  const partnershipPairs = new Set();
  const addParent = (parentId, childId, type, id) => {
    if (!peopleIds.has(parentId) || !peopleIds.has(childId) || parentId === childId) return;
    const relation = { id: String(id || `parent-link-${childId}-${parentId}-${type}`), kind: "parent", parentId, childId, type: parentLinkTypes.has(type) ? type : "biological" };
    const semanticKey = relationSemanticKey(relation);
    if (seenParentRelations.has(semanticKey)) return;
    seenParentRelations.add(semanticKey);
    seenParentPairs.add(`${parentId}::${childId}`);
    relations.push(relation);
  };
  ensureArray(people).forEach((person) => {
    const childId = String(person?.id || "");
    normalizeParentLinks(person).forEach((link) => addParent(String(link.personId), childId, link.type, link.id));
  });
  ensureArray(people).forEach((person) => {
    const parentId = String(person?.id || "");
    uniqueIds(person?.childIds).forEach((childId) => {
      if (!seenParentPairs.has(`${parentId}::${childId}`)) addParent(parentId, childId, "biological");
    });
  });

  const addPartnership = (partnership, index) => {
    const peopleIdsSet = peopleIds;
    const normalized = normalizePartnership(partnership, index, peopleIdsSet, new Set(relations.filter((relation) => relation.kind === "partnership").map((relation) => relation.id)));
    if (!normalized) return;
    partnershipPairs.add([...normalized.personIds].sort().join("::"));
    relations.push({ ...normalized, kind: "partnership" });
  };
  ensureArray(legacyPartnerships).forEach(addPartnership);
  ensureArray(people).forEach((person) => uniqueIds(person?.partnerIds).forEach((partnerId) => {
    if (!peopleIds.has(partnerId) || partnerId === person.id) return;
    const pairKey = [person.id, partnerId].sort().join("::");
    if (partnershipPairs.has(pairKey)) return;
    partnershipPairs.add(pairKey);
    relations.push({ id: `partnership-${pairKey}`, kind: "partnership", personIds: [person.id, partnerId], type: "marriage", status: "active", startDate: "", startDatePrecision: "unknown", endDate: "", endDatePrecision: "unknown" });
  }));
  return relations;
}

function normalizeRelation(record, index, peopleIds, usedIds = new Set(), semanticKeys = new Set()) {
  const kind = relationKinds.has(record?.kind) ? record.kind : Array.isArray(record?.personIds) ? "partnership" : "parent";
  if (kind === "parent") {
    const parentId = String(record?.parentId || record?.fromId || "");
    const childId = String(record?.childId || record?.toId || "");
    if (!parentId || !childId || parentId === childId || !peopleIds.has(parentId) || !peopleIds.has(childId)) return null;
    const type = parentLinkTypes.has(record?.type) ? record.type : "biological";
    const semanticKey = `parent::${parentId}::${childId}::${type}`;
    if (semanticKeys.has(semanticKey)) return null;
    semanticKeys.add(semanticKey);
    let id = String(record?.id || `parent-link-${childId}-${parentId}-${type}`);
    if (usedIds.has(id)) {
      let suffix = 1;
      const baseId = id;
      id = `${baseId}-${childId}-${suffix}`;
      while (usedIds.has(id)) id = `${baseId}-${childId}-${++suffix}`;
    }
    usedIds.add(id);
    return { id, kind: "parent", parentId, childId, type };
  }
  const partnership = normalizePartnership(record, index, peopleIds, usedIds);
  return partnership ? { ...partnership, kind: "partnership" } : null;
}

function normalizeRelations(records, peopleIds) {
  const usedIds = new Set();
  const semanticKeys = new Set();
  return ensureArray(records).map((record, index) => normalizeRelation(record, index, peopleIds, usedIds, semanticKeys)).filter(Boolean);
}

function attachLegacyRelations(people, relations) {
  const prepared = ensureArray(people).map((person) => ({ ...stripPersonRelations(person), parentIds: [], parentLinks: [], partnerIds: [], childIds: [] }));
  const byId = new Map(prepared.map((person) => [person.id, person]));
  relations.forEach((relation) => {
    if (relation.kind === "parent") {
      const parent = byId.get(relation.parentId);
      const child = byId.get(relation.childId);
      if (!parent || !child) return;
      child.parentLinks.push({ id: relation.id, personId: relation.parentId, type: relation.type });
      if (relation.type === "biological") child.parentIds.push(relation.parentId);
      parent.childIds.push(relation.childId);
    }
    if (relation.kind === "partnership") {
      relation.personIds.forEach((personId, index, personIds) => {
        const person = byId.get(personId);
        const partnerId = personIds[index === 0 ? 1 : 0];
        if (person && partnerId) person.partnerIds.push(partnerId);
      });
    }
  });
  return prepared.map((person) => ({ ...person, parentIds: uniqueIds(person.parentIds), parentLinks: person.parentLinks, partnerIds: uniqueIds(person.partnerIds), childIds: uniqueIds(person.childIds) }));
}

function relationToPartnership(relation) {
  const { kind, ...partnership } = relation;
  return partnership;
}

function migrateProject(raw) {
  if (!raw || typeof raw !== "object") return { payload: raw, migratedFrom: null };
  const version = Number(raw.manifest?.version);
  if (version === 1 || version === 2 || version === 3) {
    const migratedRelations = Array.isArray(raw.relations) ? raw.relations : deriveRelationsFromLegacy(raw.people, raw.partnerships);
    return {
      payload: {
        ...cloneValue(raw),
        people: ensureArray(raw.people).map(stripPersonRelations),
        relations: migratedRelations,
        manifest: {
          ...raw.manifest,
          version: PROJECT_VERSION,
          schemaVersion: PROJECT_VERSION,
          migratedFrom: version,
          migratedAt: new Date().toISOString(),
        },
      },
      migratedFrom: version,
    };
  }
  return { payload: raw, migratedFrom: null };
}

function formatValidationError(report) {
  return report.errors[0] || "Файл проекта не прошёл проверку.";
}

export function validateProject(raw) {
  const errors = [];
  const warnings = [];
  const manifest = raw?.manifest;
  const version = Number(manifest?.version);

  if (!raw || typeof raw !== "object") {
    return { valid: false, errors: ["Файл проекта пуст или повреждён."], warnings, version: null };
  }
  if (manifest?.format !== PROJECT_FORMAT) errors.push("Это не файл семейного дерева.");
  if (!Number.isInteger(version) || !SUPPORTED_PROJECT_VERSIONS.includes(version)) {
    errors.push(version > PROJECT_VERSION ? `Файл создан в более новой версии (${version}). Обновите приложение.` : "Версия файла не поддерживается этим приложением.");
  }
  if (!Array.isArray(raw.people)) {
    errors.push("В файле нет списка людей.");
    return { valid: false, errors, warnings, version };
  }

  const peopleIds = new Set();
  raw.people.forEach((person, index) => {
    const id = String(person?.id || "");
    if (!id) warnings.push(`У человека №${index + 1} отсутствует идентификатор; он будет создан автоматически.`);
    if (id && peopleIds.has(id)) errors.push(`В файле обнаружены повторяющиеся идентификаторы людей: ${id}.`);
    if (id) peopleIds.add(id);
  });

  raw.people.forEach((person) => {
    const personId = String(person?.id || "человека");
    [...uniqueIds(person?.parentIds), ...uniqueIds(person?.partnerIds), ...uniqueIds(person?.childIds)].forEach((referenceId) => {
      if (!peopleIds.has(referenceId)) warnings.push(`У записи ${personId} есть ссылка на отсутствующего человека: ${referenceId}.`);
    });
    ensureArray(person?.parentLinks).forEach((link) => {
      if (!link?.personId) warnings.push(`У записи ${personId} есть связь без идентификатора человека.`);
      else if (!peopleIds.has(String(link.personId))) warnings.push(`У записи ${personId} есть связь с отсутствующим человеком: ${link.personId}.`);
    });
    const dateReport = validateDateRecord(person?.birthDate, person?.year, person?.datePrecision);
    if (!dateReport.valid && (person?.birthDate !== undefined || person?.year || person?.datePrecision)) {
      warnings.push(`Дата рождения записи ${personId} заполнена неправильно: ${dateReport.error}`);
    }
  });

  // В старых файлах фотография могла находиться прямо в записи человека.
  // Проверяем её только если для этой записи нет канонической строки photos,
  // чтобы не дублировать предупреждения в переходном представлении интерфейса.
  const photoPersonIds = new Set(ensureArray(raw.photos).map((photo) => String(photo?.personId || "")).filter(Boolean));
  raw.people.forEach((person) => {
    const personId = String(person?.id || "человека");
    const image = typeof person?.image === "string" ? person.image.trim() : "";
    if (!image || photoPersonIds.has(personId)) return;
    if (image.startsWith("data:") && !isEmbeddedImage(image)) warnings.push(`Фотография человека ${personId} имеет повреждённый встроенный формат.`);
    else if (!isEmbeddedImage(image)) warnings.push(`Фотография человека ${personId} хранится по внешнему пути и может быть недоступна на другом компьютере.`);
  });

  if (version >= 3 && !Array.isArray(raw.relations)) errors.push("В файле отсутствует единая таблица связей.");
  const relationIds = new Set();
  ensureArray(raw.relations).forEach((relation, index) => {
    const id = String(relation?.id || "");
    if (!id) warnings.push(`У связи №${index + 1} отсутствует идентификатор; он будет создан автоматически.`);
    if (id && relationIds.has(id)) warnings.push(`В файле повторяется идентификатор связи: ${id}.`);
    if (id) relationIds.add(id);
    if (relation?.kind === "parent") {
      const parentId = String(relation.parentId || "");
      const childId = String(relation.childId || "");
      if (!parentId || !childId || parentId === childId || !peopleIds.has(parentId) || !peopleIds.has(childId)) warnings.push(`Родительская связь №${index + 1} неполная и будет пропущена.`);
    } else if (relation?.kind === "partnership") {
      const personIds = uniqueIds(relation.personIds);
      if (personIds.length !== 2 || personIds[0] === personIds[1] || personIds.some((id) => !peopleIds.has(id))) warnings.push(`Партнёрская связь №${index + 1} неполная и будет пропущена.`);
    } else warnings.push(`Связь №${index + 1} имеет неизвестный тип и будет пропущена.`);
  });

  if (raw.partnerships !== undefined && !Array.isArray(raw.partnerships)) errors.push("Раздел связей супругов повреждён.");
  ensureArray(raw.partnerships).forEach((partnership, index) => {
    const personIds = uniqueIds(partnership?.personIds);
    if (personIds.length !== 2 || personIds.some((id) => !peopleIds.has(id))) warnings.push(`Связь супругов №${index + 1} неполная и будет пропущена.`);
  });

  if (raw.photos !== undefined && !Array.isArray(raw.photos)) errors.push("Раздел фотографий повреждён.");
  const photoIds = new Set();
  ensureArray(raw.photos).forEach((photo, index) => {
    const photoId = String(photo?.id || "");
    const personId = String(photo?.personId || "");
    if (photoId && photoIds.has(photoId)) warnings.push(`В файле повторяется идентификатор фотографии: ${photoId}.`);
    if (photoId) photoIds.add(photoId);
    if (!personId || !peopleIds.has(personId)) warnings.push(`Фотография №${index + 1} связана с отсутствующим человеком.`);
    const dataUrl = typeof photo?.dataUrl === "string" ? photo.dataUrl : "";
    const source = typeof photo?.source === "string" ? photo.source.trim() : "";
    if (!dataUrl && !source) warnings.push(`Фотография №${index + 1} не содержит изображения.`);
    if (dataUrl && !isEmbeddedImage(dataUrl)) warnings.push(`Фотография №${index + 1} имеет повреждённый встроенный формат.`);
    if (dataUrl && photo?.checksum && photo.checksum !== photoChecksum(dataUrl)) warnings.push(`Фотография ${photoId || `№${index + 1}`} не прошла проверку целостности.`);
    if (!dataUrl && source) warnings.push(`Фотография ${photoId || `№${index + 1}`} хранится по внешнему пути и может быть недоступна на другом компьютере.`);
  });

  const qualityRelations = Array.isArray(raw.relations) ? raw.relations : deriveRelationsFromLegacy(raw.people, raw.partnerships);
  warnings.push(...inspectFamilyData(raw.people, qualityRelations).warnings);

  return { valid: errors.length === 0, errors, warnings: [...new Set(warnings)], version };
}

export function createProjectPayload(people, project = {}, relationships = project.relationships || project.relations || project.partnerships || []) {
  const now = new Date().toISOString();
  const normalizedPeopleInput = ensureArray(people);
  const normalizedPeople = normalizedPeopleInput.map((person) => normalizePersonDate({
    ...person,
    id: String(person?.id || `person-${Math.random().toString(16).slice(2)}`),
    gender: person?.gender === "male" || person?.gender === "female" ? person.gender : "",
  }));
  const normalizedPeopleIds = new Set(normalizedPeople.map((person) => person.id));
  const sourceRelations = ensureArray(relationships).some((relation) => relation?.kind) ? relationships : deriveRelationsFromLegacy(normalizedPeople, relationships);
  const relations = normalizeRelations(sourceRelations, normalizedPeopleIds);
  const photos = normalizePhotos(project.photos, normalizedPeople, normalizedPeopleIds);
  const peopleWithCompatibility = attachLegacyRelations(normalizedPeople, relations);
  const peopleWithPhotos = attachPhotos(peopleWithCompatibility, photos);
  return {
    manifest: {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      schemaVersion: PROJECT_VERSION,
      createdAt: project.createdAt || now,
      updatedAt: now,
    },
    project: {
      id: project.id || "local-family-tree",
      title: project.title || "Моё семейное древо",
      fileName: project.fileName || "семейное-древо.familytree",
      settings: project.settings && typeof project.settings === "object" ? { ...project.settings } : {},
    },
    people: peopleWithPhotos,
    relations,
    partnerships: relations.filter((relation) => relation.kind === "partnership").map(relationToPartnership),
    photos,
  };
}

export function serializeProject(payload) {
  return JSON.stringify(toPersistedPayload(normalizeProject(payload)), null, 2);
}

export function normalizeProject(raw) {
  const { payload: migrated, migratedFrom } = migrateProject(raw);
  const report = validateProject(migrated);
  if (!report.valid) throw new Error(formatValidationError(report));

  const seenIds = new Set();
  const people = migrated.people.map((person, index) => {
    const id = String(person?.id || `imported-${index + 1}`);
    if (seenIds.has(id)) throw new Error("В файле обнаружены повторяющиеся идентификаторы людей.");
    seenIds.add(id);
    return normalizePersonDate({
      ...person,
      id,
      name: typeof person?.name === "string" ? person.name : "",
      shortName: typeof person?.shortName === "string" ? person.shortName : (typeof person?.name === "string" ? person.name : ""),
      gender: person?.gender === "male" || person?.gender === "female" ? person.gender : "",
    });
  });

  const peopleIds = new Set(people.map((person) => person.id));
  const sourceRelations = Array.isArray(migrated.relations) ? migrated.relations : deriveRelationsFromLegacy(people, migrated.partnerships);
  const relations = normalizeRelations(sourceRelations, peopleIds);
  const photos = normalizePhotos(migrated.photos, people, peopleIds);
  const compatibilityPeople = attachLegacyRelations(people, relations);
  const peopleWithPhotos = attachPhotos(compatibilityPeople, photos);
  const partnerships = relations.filter((relation) => relation.kind === "partnership").map(relationToPartnership);
  const validationWarnings = [...report.warnings];
  if (migratedFrom) validationWarnings.unshift(`Формат проекта обновлён с версии ${migratedFrom} до версии ${PROJECT_VERSION}.`);

  return {
    manifest: { ...migrated.manifest, version: PROJECT_VERSION, schemaVersion: PROJECT_VERSION },
    project: {
      id: migrated.project?.id || "local-family-tree",
      title: migrated.project?.title || "Моё семейное древо",
      fileName: migrated.project?.fileName || "семейное-древо.familytree",
      settings: migrated.project?.settings && typeof migrated.project.settings === "object" ? { ...migrated.project.settings } : {},
      createdAt: migrated.manifest.createdAt,
      updatedAt: migrated.manifest.updatedAt,
    },
    people: peopleWithPhotos,
    relations,
    partnerships,
    photos,
    validationWarnings: [...new Set(validationWarnings)],
  };
}

function toPersistedPayload(normalized) {
  return {
    manifest: { ...normalized.manifest, version: PROJECT_VERSION, schemaVersion: PROJECT_VERSION },
    project: { ...normalized.project },
    people: ensureArray(normalized.people).map(stripPersonForStorage),
    relations: ensureArray(normalized.relations).map((relation) => ({ ...relation })),
    photos: ensureArray(normalized.photos).map((photo) => ({ ...photo })),
  };
}

export function toPersistedProjectPayload(payload) {
  return toPersistedPayload(normalizeProject(payload));
}

function readAtomicValue(mainKey, temporaryKey, previousKey) {
  const storage = storageAvailable();
  if (!storage) return { value: null, source: "none" };
  const candidates = [
    [storage.getItem(mainKey), "main"],
    [storage.getItem(temporaryKey), "temporary"],
    [storage.getItem(previousKey), "previous"],
  ];
  for (const [raw, source] of candidates) {
    if (!raw) continue;
    const value = safeParse(raw, null);
    if (value !== null) return { value, source, raw };
  }
  return { value: null, source: "none" };
}

function writeAtomicValue(mainKey, temporaryKey, previousKey, value) {
  const storage = storageAvailable();
  if (!storage) return;
  const serialized = JSON.stringify(value);
  const current = storage.getItem(mainKey);
  if (current && previousKey) writeStorageItem(previousKey, current);
  writeStorageItem(temporaryKey, serialized);
  const verification = safeParse(storage.getItem(temporaryKey), null);
  if (verification === null) throw new Error("Не удалось проверить временную копию сохранения.");
  writeStorageItem(mainKey, serialized);
  removeStorageItem(temporaryKey);
}

function readWorkingCopyCandidate(raw) {
  if (!raw) return null;
  const value = safeParse(raw, null);
  const payload = value?.payload || (value?.manifest ? value : null);
  if (!payload) return null;
  try {
    return { ...normalizeProject(payload), savedAt: value?.savedAt || payload.manifest.updatedAt };
  } catch {
    return null;
  }
}

export function readWorkingCopy() {
  if (!storageAvailable()) return null;
  const storage = window.localStorage;
  const candidates = [
    [storage.getItem(WORKING_COPY_KEY), "main"],
    [storage.getItem(WORKING_COPY_TMP_KEY), "temporary"],
    [storage.getItem(WORKING_COPY_PREVIOUS_KEY), "previous"],
  ];
  for (const [raw, source] of candidates) {
    const result = readWorkingCopyCandidate(raw);
    if (!result) continue;
    if (source !== "main") {
      try { writeStorageItem(WORKING_COPY_KEY, raw); } catch { /* рабочая копия всё равно доступна для восстановления */ }
      return { ...result, recoveredFrom: source };
    }
    return result;
  }
  return null;
}

export function writeWorkingCopy(payload) {
  if (!storageAvailable()) return payload;
  const normalized = normalizeProject(payload);
  const envelope = { storageVersion: PROJECT_VERSION, savedAt: new Date().toISOString(), payload: toPersistedPayload(normalized) };
  writeAtomicValue(WORKING_COPY_KEY, WORKING_COPY_TMP_KEY, WORKING_COPY_PREVIOUS_KEY, envelope);
  return normalized;
}

function normalizeBackupRecord(record, index) {
  if (!record?.payload) return null;
  try {
    const payload = normalizeProject(record.payload);
    return {
      ...record,
      id: String(record.id || `backup-imported-${index + 1}`),
      createdAt: record.createdAt || payload.manifest.updatedAt,
      reason: record.reason || "auto",
      peopleCount: payload.people.length,
      payload,
    };
  } catch {
    return null;
  }
}

export function readBackups() {
  if (!storageAvailable()) return [];
  const { value } = readAtomicValue(BACKUPS_KEY, BACKUPS_TMP_KEY, BACKUPS_PREVIOUS_KEY);
  if (!Array.isArray(value)) return [];
  return value.map(normalizeBackupRecord).filter(Boolean).slice(0, MAX_BACKUPS);
}

export function addBackup(payload, reason = "auto") {
  if (!storageAvailable()) return null;
  try {
    const normalized = normalizeProject(payload);
    const record = {
      id: `backup-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      reason,
      peopleCount: normalized.people.length,
      payload: toPersistedPayload(normalized),
    };
    const next = [record, ...readBackups()].slice(0, MAX_BACKUPS);
    writeAtomicValue(BACKUPS_KEY, BACKUPS_TMP_KEY, BACKUPS_PREVIOUS_KEY, next);
    return record;
  } catch {
    return null;
  }
}

export function removeBackup(id) {
  if (!storageAvailable()) return;
  try {
    writeAtomicValue(BACKUPS_KEY, BACKUPS_TMP_KEY, BACKUPS_PREVIOUS_KEY, readBackups().filter((backup) => backup.id !== id));
  } catch {
    // Ошибка удаления резервной копии не должна ломать работу дерева.
  }
}
