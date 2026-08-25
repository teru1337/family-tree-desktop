export const NAME_ORIGIN_STATUSES = Object.freeze(["unknown", "manual", "suggested", "inferred", "confirmed"]);
export const SURNAME_HISTORY_REASONS = Object.freeze([
  { value: "maiden", label: "Девичья фамилия" },
  { value: "marriage", label: "Брак" },
  { value: "divorce", label: "Развод" },
  { value: "adoption", label: "Усыновление" },
  { value: "personal", label: "Личная смена" },
  { value: "unknown", label: "Причина неизвестна" },
]);

const reasonValues = new Set(SURNAME_HISTORY_REASONS.map((item) => item.value));
const controlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const MAX_NAME_PART = 80;
const MAX_SURNAME_HISTORY = 20;

function clean(value, maxLength = MAX_NAME_PART) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function safeId(value, fallback) {
  const id = clean(value, 80).replace(/[^\p{L}\p{N}._-]+/gu, "-");
  return id || fallback;
}

export function normalizeNameParts(value) {
  return {
    familyName: clean(value?.familyName),
    givenName: clean(value?.givenName),
    patronymic: clean(value?.patronymic),
  };
}

export function hasNameParts(value) {
  const parts = normalizeNameParts(value);
  return Boolean(parts.familyName || parts.givenName || parts.patronymic);
}

export function composeName(value) {
  const parts = normalizeNameParts(value);
  return [parts.familyName, parts.givenName, parts.patronymic].filter(Boolean).join(" ");
}

function inferLegacyNameParts(value) {
  const tokens = clean(value, 240).split(" ").filter(Boolean);
  if (!tokens.length) return normalizeNameParts();
  if (tokens.length === 1) return { familyName: tokens[0], givenName: "", patronymic: "" };
  return {
    familyName: tokens[0],
    givenName: tokens[1],
    patronymic: tokens.slice(2).join(" "),
  };
}

export function normalizeNameOrigin(value, fallback = "unknown") {
  const status = NAME_ORIGIN_STATUSES.includes(value?.status) ? value.status : fallback;
  const source = clean(value?.source, 80) || (status === "manual" ? "manual" : "");
  const personIds = [...new Set((Array.isArray(value?.personIds) ? value.personIds : []).map((id) => clean(id, 120)).filter(Boolean))].slice(0, 8);
  return { status, source, personIds };
}

export function normalizeSurnameHistory(value, maidenName = "") {
  const entries = Array.isArray(value) ? value : [];
  const normalized = entries.map((item, index) => {
    const surname = clean(item?.surname || item?.name);
    const from = clean(item?.from, 40);
    const to = clean(item?.to, 40);
    const reason = reasonValues.has(item?.reason) ? item.reason : "unknown";
    const source = clean(item?.source, 300);
    const note = clean(item?.note, 500);
    if (!surname && !from && !to && !source && !note) return null;
    if (!surname) return null;
    return { id: safeId(item?.id, `surname-history-${index + 1}`), surname, from, to, reason, source, note };
  }).filter(Boolean).slice(0, MAX_SURNAME_HISTORY);
  const legacyMaidenName = clean(maidenName);
  if (legacyMaidenName && !normalized.some((item) => item.surname === legacyMaidenName && item.reason === "maiden")) {
    normalized.unshift({ id: "surname-history-maiden", surname: legacyMaidenName, from: "", to: "", reason: "maiden", source: "legacy-maidenName", note: "Перенесено из прежнего поля девичьей фамилии." });
  }
  return normalized.slice(0, MAX_SURNAME_HISTORY);
}

export function normalizePersonNames(person) {
  const legacyName = clean(person?.name || person?.shortName, 240);
  const rawParts = normalizeNameParts(person?.nameParts);
  const explicitParts = hasNameParts(rawParts) && (!legacyName || legacyName === composeName(rawParts));
  const nameParts = explicitParts ? normalizeNameParts(person.nameParts) : inferLegacyNameParts(legacyName);
  const composed = composeName(nameParts);
  const nameOrigin = normalizeNameOrigin(person?.nameOrigin, explicitParts ? "manual" : (legacyName ? "inferred" : "unknown"));
  const hasHistory = Array.isArray(person?.surnameHistory);
  const surnameHistory = hasHistory ? normalizeSurnameHistory(person.surnameHistory) : normalizeSurnameHistory(undefined, person?.maidenName);
  const maidenName = hasHistory ? (surnameHistory.find((item) => item.reason === "maiden")?.surname || "") : (clean(person?.maidenName) || "");
  return {
    ...person,
    name: explicitParts && composed ? composed : legacyName,
    shortName: explicitParts && composed ? composed : clean(person?.shortName || legacyName, 240),
    nameParts,
    nameOrigin,
    surnameHistory,
    maidenName,
  };
}

export function currentSurname(person) {
  return normalizeNameParts(person?.nameParts).familyName;
}

export function formerSurnames(person) {
  const current = currentSurname(person);
  const result = [];
  const history = Array.isArray(person?.surnameHistory) ? normalizeSurnameHistory(person.surnameHistory) : normalizeSurnameHistory(undefined, person?.maidenName);
  history.forEach((item) => {
    if (item.surname && item.surname !== current && !result.includes(item.surname)) result.push(item.surname);
  });
  return result;
}

export function formatPersonName(person, { showFormerSurnames = false } = {}) {
  if (person?.isUnknown) return "Неизвестный человек";
  const name = composeName(person?.nameParts) || clean(person?.shortName || person?.name, 240) || "Человек без имени";
  const former = showFormerSurnames ? formerSurnames(person) : [];
  return former.length ? `${name} (${former.join(", ")})` : name;
}

export function validateNameParts(value) {
  const parts = normalizeNameParts(value);
  for (const [key, part] of Object.entries(parts)) {
    if (controlCharacters.test(part)) return { field: key, error: "Имя содержит недопустимые управляющие символы." };
    if (part.length > MAX_NAME_PART) return { field: key, error: "Каждая часть имени — не больше 80 знаков." };
  }
  return null;
}

export function validateSurnameHistory(value) {
  if (!Array.isArray(value)) return "История фамилии должна быть списком записей.";
  if (value.length > MAX_SURNAME_HISTORY) return `В истории фамилии может быть не больше ${MAX_SURNAME_HISTORY} записей.`;
  for (const item of value) {
    const surname = clean(item?.surname);
    const fields = [item?.surname, item?.from, item?.to, item?.source, item?.note];
    if (!surname && fields.some((field) => clean(field))) return "Для записи истории укажите фамилию или удалите пустую строку.";
    if (fields.some((field) => controlCharacters.test(String(field ?? "")))) return "История фамилии содержит недопустимые управляющие символы.";
    if (surname.length > MAX_NAME_PART || clean(item?.source, 300).length > 300 || clean(item?.note, 500).length > 500) return "Запись истории фамилии слишком длинная.";
    if (!reasonValues.has(item?.reason || "unknown")) return "Укажите допустимую причину изменения фамилии.";
  }
  return "";
}

function activePartnerIds(personId, people, partnerships) {
  const ids = new Set();
  const person = people.find((item) => item.id === personId);
  (person?.partnerIds || []).forEach((id) => ids.add(id));
  (Array.isArray(partnerships) ? partnerships : []).forEach((partnership) => {
    if (partnership?.status === "divorced" || !partnership?.personIds?.includes(personId)) return;
    partnership.personIds.filter((id) => id !== personId).forEach((id) => ids.add(id));
  });
  return [...ids];
}

export function surnameSuggestionsForChild({ people = [], partnerships = [], parentId = "" } = {}) {
  const parentIds = [parentId, ...activePartnerIds(parentId, people, partnerships)];
  const candidates = [];
  parentIds.forEach((personId) => {
    const person = people.find((item) => item.id === personId);
    const surname = currentSurname(person);
    if (!surname || candidates.some((item) => item.surname === surname)) return;
    candidates.push({ surname, personIds: [personId], label: `${surname} — ${formatPersonName(person)}` });
  });
  if (candidates.length === 2) {
    const combined = candidates.map((item) => item.surname).join("-");
    candidates.unshift({ surname: combined, personIds: candidates.flatMap((item) => item.personIds), label: `${combined} — двойная фамилия родителей` });
  }
  return candidates;
}

export function applySuggestedChildSurname(draft, suggestion) {
  if (!suggestion?.surname) return draft;
  const nameParts = { ...normalizeNameParts(draft?.nameParts), familyName: suggestion.surname };
  const name = composeName(nameParts);
  return {
    ...draft,
    name: name || draft?.name || "",
    shortName: name || draft?.shortName || "",
    nameParts,
    nameOrigin: { status: "suggested", source: "parents", personIds: suggestion.personIds || [] },
  };
}
