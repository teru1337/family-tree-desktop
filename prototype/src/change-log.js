export const RECORD_ORIGIN_STATUSES = Object.freeze([
  { value: "manual", label: "Введено вручную" },
  { value: "imported", label: "Импортировано" },
  { value: "inferred", label: "Выведено приложением" },
]);

const originValues = new Set(RECORD_ORIGIN_STATUSES.map((item) => item.value));
const MAX_LOG_ENTRIES = 100;
const MAX_SUMMARY_LENGTH = 240;

function clean(value, maxLength = 120) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function normalizeRecordOrigin(value, fallback = "manual") {
  const status = originValues.has(value?.status) ? value.status : (originValues.has(fallback) ? fallback : "manual");
  return { status, source: clean(value?.source, 160) };
}

export function recordOriginLabel(value) {
  return RECORD_ORIGIN_STATUSES.find((item) => item.value === value?.status)?.label || "Введено вручную";
}

export function normalizeChangeLog(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    const id = clean(entry?.id, 100) || `change-${index + 1}`;
    const timestamp = clean(entry?.timestamp, 40);
    const summary = clean(entry?.summary, MAX_SUMMARY_LENGTH);
    if (!summary) return null;
    return {
      id,
      timestamp,
      kind: clean(entry?.kind, 40) || "update",
      entityType: clean(entry?.entityType, 40) || "project",
      entityId: clean(entry?.entityId, 120),
      summary,
      personIds: [...new Set((Array.isArray(entry?.personIds) ? entry.personIds : []).map((id) => clean(id, 120)).filter(Boolean))].slice(0, 8),
    };
  }).filter(Boolean).slice(-MAX_LOG_ENTRIES);
}

export function appendChangeLog(log, entry, now = new Date().toISOString()) {
  const normalized = normalizeChangeLog(log);
  const summary = clean(entry?.summary, MAX_SUMMARY_LENGTH);
  if (!summary) return normalized;
  const id = clean(entry?.id, 100) || `change-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return normalizeChangeLog([...normalized, { ...entry, id, timestamp: clean(entry?.timestamp, 40) || now, summary }]);
}

export function changeLogForPerson(log, personId) {
  const id = clean(personId, 120);
  return normalizeChangeLog(log).filter((entry) => !id || entry.entityId === id || entry.personIds.includes(id));
}
