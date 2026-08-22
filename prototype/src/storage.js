export const PROJECT_FORMAT = "familytree";
export const PROJECT_VERSION = 1;
export const WORKING_COPY_KEY = "familytree-working-copy-v1";
export const BACKUPS_KEY = "familytree-backups-v1";
export const MAX_BACKUPS = 10;

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

export function createProjectPayload(people, project = {}, partnerships = project.partnerships || []) {
  const now = new Date().toISOString();
  const peopleIds = new Set(people.map((person) => person.id));
  const usedPartnershipIds = new Set();
  const normalizedPeople = assignUniqueParentLinkIds(people.map((person) => ({
    ...person,
    gender: person?.gender === "male" || person?.gender === "female" ? person.gender : "",
    parentIds: ensureArray(person.parentIds),
    partnerIds: ensureArray(person.partnerIds),
    childIds: ensureArray(person.childIds),
    parentLinks: normalizeParentLinks(person),
  })));
  return {
    manifest: {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
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
    partnerships: partnerships.map((partnership, index) => normalizePartnership(partnership, index, peopleIds, usedPartnershipIds)).filter(Boolean),
  };
}

export function serializeProject(payload) {
  return JSON.stringify(payload, null, 2);
}

export function normalizeProject(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Файл проекта пуст или повреждён.");
  if (raw.manifest?.format !== PROJECT_FORMAT) throw new Error("Это не файл семейного дерева.");
  if (Number(raw.manifest.version) !== PROJECT_VERSION) throw new Error("Версия файла не поддерживается этим прототипом.");
  if (!Array.isArray(raw.people)) throw new Error("В файле нет списка людей.");

  const seenIds = new Set();
  const people = assignUniqueParentLinkIds(raw.people.map((person, index) => {
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
  const importedPartnerships = ensureArray(raw.partnerships).map((partnership, index) => normalizePartnership(partnership, index, peopleIds, usedPartnershipIds)).filter(Boolean);
  const partnerships = importedPartnerships.length ? importedPartnerships : derivePartnerships(people);

  return {
    manifest: raw.manifest,
    project: {
      id: raw.project?.id || "local-family-tree",
      title: raw.project?.title || "Моё семейное древо",
      fileName: raw.project?.fileName || "семейное-древо.familytree",
      settings: raw.project?.settings && typeof raw.project.settings === "object" ? { ...raw.project.settings } : {},
      createdAt: raw.manifest.createdAt,
      updatedAt: raw.manifest.updatedAt,
    },
    people,
    partnerships,
  };
}

export function readWorkingCopy() {
  if (typeof window === "undefined") return null;
  const value = safeParse(window.localStorage.getItem(WORKING_COPY_KEY), null);
  if (!value?.payload) return null;
  try {
    return { ...normalizeProject(value.payload), savedAt: value.savedAt || value.payload.manifest.updatedAt };
  } catch {
    return null;
  }
}

export function writeWorkingCopy(payload) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKING_COPY_KEY, JSON.stringify({ savedAt: new Date().toISOString(), payload }));
}

export function readBackups() {
  if (typeof window === "undefined") return [];
  const value = safeParse(window.localStorage.getItem(BACKUPS_KEY), []);
  return Array.isArray(value) ? value : [];
}

export function addBackup(payload, reason = "auto") {
  if (typeof window === "undefined") return null;
  const record = {
    id: `backup-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    reason,
    peopleCount: payload.people.length,
    payload,
  };
  const next = [record, ...readBackups()].slice(0, MAX_BACKUPS);
  window.localStorage.setItem(BACKUPS_KEY, JSON.stringify(next));
  return record;
}

export function removeBackup(id) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BACKUPS_KEY, JSON.stringify(readBackups().filter((backup) => backup.id !== id)));
}
