import { normalizeProject, toPersistedProjectPayload } from "./storage.js";

export const FAMILY_ARCHIVE_FORMAT = "familyarchive";
export const FAMILY_ARCHIVE_VERSION = 1;

function countMaterials(payload) {
  const people = Array.isArray(payload?.people) ? payload.people : [];
  const photos = Array.isArray(payload?.photos) ? payload.photos : [];
  const relations = Array.isArray(payload?.relations) ? payload.relations : [];
  return {
    project: true,
    people: people.length,
    relations: relations.length,
    photos: photos.length,
    biographies: people.filter((person) => String(person?.biography || "").trim()).length,
    sources: people.filter((person) => String(person?.source || "").trim()).length + photos.filter((photo) => String(photo?.source || "").trim()).length,
  };
}

export function createFamilyArchive(payload) {
  const persisted = toPersistedProjectPayload(payload);
  const now = new Date().toISOString();
  return {
    manifest: {
      format: FAMILY_ARCHIVE_FORMAT,
      version: FAMILY_ARCHIVE_VERSION,
      createdAt: now,
      updatedAt: now,
      projectTitle: persisted.project.title,
      projectFileName: persisted.project.fileName,
    },
    contents: countMaterials(persisted),
    payload: persisted,
  };
}

export function serializeFamilyArchive(payload) {
  return JSON.stringify(createFamilyArchive(payload), null, 2);
}

export function verifyFamilyArchive(raw) {
  try {
    if (!raw || typeof raw !== "object") throw new Error("Архив пуст или повреждён.");
    if (raw.manifest?.format !== FAMILY_ARCHIVE_FORMAT) throw new Error("Это не архив семейных материалов.");
    const version = Number(raw.manifest?.version);
    if (version !== FAMILY_ARCHIVE_VERSION) throw new Error(`Версия архива не поддерживается (${version || "не указана"}).`);
    const payload = normalizeProject(raw.payload);
    const contents = countMaterials(payload);
    const declaredContents = raw.contents && typeof raw.contents === "object" ? raw.contents : {};
    const warnings = [...(payload.validationWarnings || [])];
    ["people", "relations", "photos", "biographies", "sources"].forEach((field) => {
      if (declaredContents[field] !== undefined && Number(declaredContents[field]) !== contents[field]) {
        warnings.push(`Состав архива содержит устаревшее число материалов в разделе «${field}».`);
      }
    });
    return { valid: true, payload, contents, warnings: [...new Set(warnings)] };
  } catch (error) {
    return {
      valid: false,
      contents: { project: false, people: 0, relations: 0, photos: 0, biographies: 0, sources: 0 },
      warnings: [],
      error: String(error?.message || "Архив не прошёл проверку целостности."),
    };
  }
}
