export const PROJECT_FORMAT = "familytree";
export const PROJECT_VERSION = 2;
export const SUPPORTED_PROJECT_VERSIONS = [1, PROJECT_VERSION];

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

const parentLinkTypes = new Set(["biological", "adoptive", "step"]);

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

function assignUniqueParentLinkIds(people) {
  const usedIds = new Set();
  return people.map((person) => ({
    ...person,
    parentLinks: person.parentLinks.map((link, index) => {
      let id = link.id;
      if (usedIds.has(id)) id = `${id}-${person.id}-${index + 1}`;
      usedIds.add(id);
      return { ...link, id };
    }),
  }));
}

function normalizePartnership(record, index, peopleIds, usedIds = new Set()) {
  const personIds = uniqueIds(record?.personIds).filter((id) => peopleIds.has(id));
  if (personIds.length !== 2) return null;
  let id = String(record?.id || `partnership-${index + 1}`);
  if (usedIds.has(id)) id = `${id}-${index + 1}`;
  usedIds.add(id);
  return {
    ...record,
    id,
    personIds,
    type: record?.type === "partnership" ? "partnership" : "marriage",
    status: record?.status === "divorced" ? "divorced" : "active",
    startDate: typeof record?.startDate === "string" ? record.startDate : "",
    startDatePrecision: typeof record?.startDatePrecision === "string" ? record.startDatePrecision : "unknown",
    endDate: typeof record?.endDate === "string" ? record.endDate : "",
    endDatePrecision: typeof record?.endDatePrecision === "string" ? record.endDatePrecision : "unknown",
  };
}

function derivePartnerships(people) {
  const peopleIds = new Set(people.map((person) => person.id));
  const seen = new Set();
  return people.flatMap((person) => uniqueIds(person.partnerIds).map((partnerId) => {
    if (!peopleIds.has(partnerId) || partnerId === person.id) return null;
    const key = [person.id, partnerId].sort().join("::");
    if (seen.has(key)) return null;
    seen.add(key);
    return { id: `partnership-${key}`, personIds: [person.id, partnerId], type: "marriage", status: "active", startDate: "", startDatePrecision: "unknown", endDate: "", endDatePrecision: "unknown" };
  }).filter(Boolean));
}

function migrateProject(raw) {
  if (!raw || typeof raw !== "object") return { payload: raw, migratedFrom: null };
  const version = Number(raw.manifest?.version);
  if (version === 1) {
    return {
      payload: {
        ...cloneValue(raw),
        manifest: {
          ...raw.manifest,
          version: PROJECT_VERSION,
          schemaVersion: PROJECT_VERSION,
          migratedFrom: 1,
          migratedAt: new Date().toISOString(),
        },
      },
      migratedFrom: 1,
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
  });

  if (raw.partnerships !== undefined && !Array.isArray(raw.partnerships)) errors.push("Раздел связей супругов повреждён.");
  ensureArray(raw.partnerships).forEach((partnership, index) => {
    const personIds = uniqueIds(partnership?.personIds);
    if (personIds.length !== 2 || personIds.some((id) => !peopleIds.has(id))) warnings.push(`Связь супругов №${index + 1} неполная и будет пропущена.`);
  });

  return { valid: errors.length === 0, errors, warnings: [...new Set(warnings)], version };
}

export function createProjectPayload(people, project = {}, partnerships = project.partnerships || []) {
  const now = new Date().toISOString();
  const normalizedPeopleInput = ensureArray(people);
  const usedPartnershipIds = new Set();
  const normalizedPeople = assignUniqueParentLinkIds(normalizedPeopleInput.map((person) => ({
    ...person,
    id: String(person?.id || `person-${Math.random().toString(16).slice(2)}`),
    gender: person?.gender === "male" || person?.gender === "female" ? person.gender : "",
    parentIds: ensureArray(person.parentIds),
    partnerIds: ensureArray(person.partnerIds),
    childIds: ensureArray(person.childIds),
    parentLinks: normalizeParentLinks(person),
  })));
  const normalizedPeopleIds = new Set(normalizedPeople.map((person) => person.id));
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
    people: normalizedPeople,
    partnerships: ensureArray(partnerships).map((partnership, index) => normalizePartnership(partnership, index, normalizedPeopleIds, usedPartnershipIds)).filter(Boolean),
  };
}

export function serializeProject(payload) {
  return JSON.stringify(payload, null, 2);
}

export function normalizeProject(raw) {
  const { payload: migrated, migratedFrom } = migrateProject(raw);
  const report = validateProject(migrated);
  if (!report.valid) throw new Error(formatValidationError(report));

  const seenIds = new Set();
  const people = assignUniqueParentLinkIds(migrated.people.map((person, index) => {
    const id = String(person?.id || `imported-${index + 1}`);
    if (seenIds.has(id)) throw new Error("В файле обнаружены повторяющиеся идентификаторы людей.");
    seenIds.add(id);
    return {
      ...person,
      id,
      name: typeof person?.name === "string" ? person.name : "",
      shortName: typeof person?.shortName === "string" ? person.shortName : (typeof person?.name === "string" ? person.name : ""),
      gender: person?.gender === "male" || person?.gender === "female" ? person.gender : "",
      parentIds: ensureArray(person?.parentIds),
      partnerIds: ensureArray(person?.partnerIds),
      childIds: ensureArray(person?.childIds),
      parentLinks: normalizeParentLinks(person),
    };
  }));

  const peopleIds = new Set(people.map((person) => person.id));
  const usedPartnershipIds = new Set();
  const importedPartnerships = ensureArray(migrated.partnerships).map((partnership, index) => normalizePartnership(partnership, index, peopleIds, usedPartnershipIds)).filter(Boolean);
  const partnerships = importedPartnerships.length ? importedPartnerships : derivePartnerships(people);
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
    people,
    partnerships,
    validationWarnings: [...new Set(validationWarnings)],
  };
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
  const envelope = { storageVersion: PROJECT_VERSION, savedAt: new Date().toISOString(), payload: normalized };
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
      payload: normalized,
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
