import { dateRecordBounds, inferDatePrecision, validateDateRecord } from "./dates.js";
import { validateNameParts, validateSurnameHistory } from "./person-names.js";
import { validateFactSources, validateTimelineEvents } from "./timeline.js";

const personNamePattern = /^[\p{L}\s.'’\-–—()]+$/u;
const placePattern = /^[\p{L}\p{N}\s.,'’\-–—()\/$№]+$/u;
const occupationPattern = /^[\p{L}\p{N}\s.,'’\-–—()/$№]+$/u;
const controlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function dateRecordFromDraft(draft, kind = "birth") {
  const isDeath = kind === "death";
  const value = isDeath ? draft?.deathYear : draft?.year;
  const precision = (isDeath ? draft?.deathDatePrecision : draft?.datePrecision) || inferDatePrecision(value);
  return {
    precision,
    text: precision === "range" ? "" : String(value || "").trim(),
    value: precision === "range" ? "" : String(value || "").trim(),
    from: String(draft?.[isDeath ? "deathDateFrom" : "birthDateFrom"] || "").trim(),
    to: String(draft?.[isDeath ? "deathDateTo" : "birthDateTo"] || "").trim(),
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
  const deathPlace = String(draft?.deathPlace || "").trim();
  const deathCause = String(draft?.deathCause || "").trim();
  const deathSource = String(draft?.deathSource || "").trim();
  const deathComment = String(draft?.deathComment || "").trim();
  if (name && (!personNamePattern.test(name) || name.length > 120)) errors.name = "ФИО укажите буквами, без цифр; максимум 120 знаков.";
  if (maidenName && (!personNamePattern.test(maidenName) || maidenName.length > 80)) errors.maidenName = "Фамилия должна содержать буквы и стандартные знаки препинания.";
  const birthDate = dateRecordFromDraft(draft);
  const dateReport = validateDateRecord(birthDate);
  if (!dateReport.valid) errors.year = dateReport.error;
  const hasDeathFacts = Boolean(draft?.deathYear || draft?.deathDateFrom || draft?.deathDateTo || deathPlace || deathCause || deathSource || deathComment);
  const deathDate = dateRecordFromDraft(draft, "death");
  const deathReport = validateDateRecord(deathDate);
  if (!deathReport.valid) errors.deathYear = deathReport.error;
  const birthBounds = dateRecordBounds(birthDate);
  const deathBounds = dateRecordBounds(deathDate);
  if (hasDeathFacts && birthBounds && deathBounds && deathBounds.to < birthBounds.from) errors.deathYear = "Дата смерти не может быть раньше даты рождения.";
  if (place && (!placePattern.test(place) || place.length > 160)) errors.place = "Укажите город, область или страну без необычных символов; максимум 160 знаков.";
  if (deathPlace && (!placePattern.test(deathPlace) || deathPlace.length > 160)) errors.deathPlace = "Место смерти содержит недопустимые символы или слишком длинное.";
  if (deathCause.length > 200 || controlCharacters.test(deathCause)) errors.deathCause = "Причина смерти слишком длинная или содержит недопустимые символы; максимум 200 знаков.";
  if (deathSource.length > 300 || controlCharacters.test(deathSource)) errors.deathSource = "Источник смерти слишком длинный или содержит недопустимые символы; максимум 300 знаков.";
  if (deathComment.length > 1000 || controlCharacters.test(deathComment)) errors.deathComment = "Комментарий о смерти слишком длинный или содержит недопустимые символы; максимум 1000 знаков.";
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
