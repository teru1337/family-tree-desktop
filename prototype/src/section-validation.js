import { inferDatePrecision, validateDateRecord } from "./dates.js";
import { validateNameParts, validateSurnameHistory } from "./person-names.js";
import { validateFactSources, validateTimelineEvents } from "./timeline.js";

const personNamePattern = /^[\p{L}\s.'’\-–—()]+$/u;
const placePattern = /^[\p{L}\p{N}\s.,'’\-–—()\/$№]+$/u;
const occupationPattern = /^[\p{L}\p{N}\s.,'’\-–—()/$№]+$/u;
const controlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function dateRecordFromDraft(draft) {
  const precision = draft?.datePrecision || inferDatePrecision(draft?.year);
  return {
    precision,
    text: precision === "range" ? "" : String(draft?.year || "").trim(),
    value: precision === "range" ? "" : String(draft?.year || "").trim(),
    from: String(draft?.birthDateFrom || "").trim(),
    to: String(draft?.birthDateTo || "").trim(),
  };
}

export function validateBasicPersonSection(draft) {
  const errors = {};
  const namePartsError = validateNameParts(draft?.nameParts);
  if (namePartsError) errors[namePartsError.field] = namePartsError.error;
  const surnameHistoryError = validateSurnameHistory(draft?.surnameHistory || []);
  if (surnameHistoryError) errors.surnameHistory = surnameHistoryError;
  const name = String(draft?.name || "").trim();
  const maidenName = String(draft?.maidenName || "").trim();
  const place = String(draft?.place || "").trim();
  const occupation = String(draft?.occupation || "").trim();
  const biography = String(draft?.biography || "").trim();
  const source = String(draft?.source || "").trim();
  if (name && (!personNamePattern.test(name) || name.length > 120)) errors.name = "ФИО укажите буквами, без цифр; максимум 120 знаков.";
  if (maidenName && (!personNamePattern.test(maidenName) || maidenName.length > 80)) errors.maidenName = "Фамилия должна содержать буквы и стандартные знаки препинания.";
  const dateReport = validateDateRecord(dateRecordFromDraft(draft));
  if (!dateReport.valid) errors.year = dateReport.error;
  if (place && (!placePattern.test(place) || place.length > 160)) errors.place = "Укажите город, область или страну без необычных символов; максимум 160 знаков.";
  if (occupation && (!occupationPattern.test(occupation) || occupation.length > 100)) errors.occupation = "Профессия содержит недопустимые символы или слишком длинная.";
  if (biography.length > 2000 || controlCharacters.test(biography)) errors.biography = "Биография слишком длинная или содержит недопустимые символы.";
  if (source.length > 300 || controlCharacters.test(source)) errors.source = "Источник слишком длинный или содержит недопустимые символы; максимум 300 знаков.";
  return errors;
}

export function validateTimelineSection(events) {
  const error = validateTimelineEvents(events);
  return error ? { timelineEvents: error } : {};
}

export function validateFactSourcesSection(sources) {
  const error = validateFactSources(sources);
  return error ? { factSources: error } : {};
}
