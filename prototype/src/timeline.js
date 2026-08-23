export const MAX_TIMELINE_EVENTS = 40;
export const MAX_EVENT_TITLE = 120;
export const MAX_EVENT_DATE = 80;
export const MAX_EVENT_PLACE = 160;
export const MAX_EVENT_DESCRIPTION = 1000;
export const MAX_EVENT_SOURCE = 300;

export const TIMELINE_EVENT_TYPES = Object.freeze([
  { value: "birth", label: "Рождение" },
  { value: "residence", label: "Место жительства" },
  { value: "education", label: "Образование" },
  { value: "work", label: "Работа" },
  { value: "military", label: "Военная служба" },
  { value: "marriage", label: "Семейное событие" },
  { value: "travel", label: "Переезд или поездка" },
  { value: "other", label: "Другое" },
]);

export const FACT_SOURCE_OPTIONS = Object.freeze([
  { value: "name", label: "ФИО" },
  { value: "birthDate", label: "Дата рождения" },
  { value: "place", label: "Место рождения" },
  { value: "occupation", label: "Профессия" },
  { value: "maidenName", label: "Девичья фамилия" },
  { value: "biography", label: "Биография" },
]);

const allowedEventTypes = new Set(TIMELINE_EVENT_TYPES.map((item) => item.value));
const allowedFactKeys = new Set(FACT_SOURCE_OPTIONS.map((item) => item.value));
const allowedDatePrecisions = new Set(["exact", "year", "approximate", "range", "unknown"]);
const controlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function cleanText(value, maxLength) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function uniqueId(rawId, index, usedIds) {
  const base = cleanText(rawId, 80).replace(/[^\p{L}\p{N}._-]+/gu, "-") || `event-${index + 1}`;
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) id = `${base}-${suffix++}`;
  usedIds.add(id);
  return id;
}

export function normalizeSourceValue(value, maxLength = MAX_EVENT_SOURCE) {
  const source = cleanText(value, maxLength);
  return controlCharacters.test(source) ? "" : source;
}

export function normalizeFactSources(value) {
  const entries = Array.isArray(value)
    ? value.map((item) => [item?.fact, item?.source])
    : value && typeof value === "object" ? Object.entries(value) : [];
  return Object.fromEntries(entries
    .map(([fact, source]) => [String(fact), normalizeSourceValue(source)])
    .filter(([fact, source]) => allowedFactKeys.has(fact) && source));
}

export function validateFactSources(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Источники отдельных сведений должны быть списком полей.";
  for (const [fact, source] of Object.entries(value)) {
    if (!allowedFactKeys.has(fact)) return "Выбран неизвестный тип сведения.";
    const text = String(source ?? "").trim();
    if (!text) return "Для каждого источника заполните текст или удалите пустую строку.";
    if (text.length > MAX_EVENT_SOURCE || controlCharacters.test(text)) return `Источник не должен быть длиннее ${MAX_EVENT_SOURCE} знаков.`;
  }
  return "";
}

export function normalizeTimelineEvents(value) {
  if (!Array.isArray(value)) return [];
  const usedIds = new Set();
  const normalized = value.map((item, index) => {
    const title = cleanText(item?.title, MAX_EVENT_TITLE);
    if (!title || controlCharacters.test(title)) return null;
    return {
      id: uniqueId(item?.id, index, usedIds),
      type: allowedEventTypes.has(item?.type) ? item.type : "other",
      title,
      date: cleanText(item?.date, MAX_EVENT_DATE),
      datePrecision: allowedDatePrecisions.has(item?.datePrecision) ? item.datePrecision : "unknown",
      place: cleanText(item?.place, MAX_EVENT_PLACE),
      description: cleanText(item?.description, MAX_EVENT_DESCRIPTION),
      source: normalizeSourceValue(item?.source),
    };
  }).filter(Boolean).slice(0, MAX_TIMELINE_EVENTS);
  return sortTimelineEvents(normalized);
}

export function validateTimelineEvents(value) {
  if (!Array.isArray(value)) return "Временная шкала должна быть списком событий.";
  if (value.length > MAX_TIMELINE_EVENTS) return `Можно добавить не больше ${MAX_TIMELINE_EVENTS} событий.`;
  for (const item of value) {
    const title = String(item?.title ?? "").trim();
    if (!title) return "Для каждого события укажите название.";
    if (title.length > MAX_EVENT_TITLE || String(item?.date ?? "").length > MAX_EVENT_DATE || String(item?.place ?? "").length > MAX_EVENT_PLACE || String(item?.description ?? "").length > MAX_EVENT_DESCRIPTION || String(item?.source ?? "").length > MAX_EVENT_SOURCE) return "Одно из событий временной шкалы слишком длинное.";
    if (item?.datePrecision && !allowedDatePrecisions.has(item.datePrecision)) return "Для события указана неизвестная точность даты.";
    if ([item?.title, item?.date, item?.place, item?.description, item?.source].some((part) => controlCharacters.test(String(part ?? "")))) return "Событие содержит недопустимые символы.";
  }
  return "";
}

export function timelineEventLabel(event) {
  return TIMELINE_EVENT_TYPES.find((item) => item.value === event?.type)?.label || "Событие";
}

export function sortTimelineEvents(events) {
  return [...(Array.isArray(events) ? events : [])].sort((left, right) => {
    const leftYear = Number(String(left?.date || "").match(/(?:^|\D)(1[0-9]{3}|20[0-9]{2})(?:\D|$)/)?.[1] || Infinity);
    const rightYear = Number(String(right?.date || "").match(/(?:^|\D)(1[0-9]{3}|20[0-9]{2})(?:\D|$)/)?.[1] || Infinity);
    return leftYear - rightYear || String(left?.title || "").localeCompare(String(right?.title || ""), "ru");
  });
}
