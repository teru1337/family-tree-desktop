export const MAX_CUSTOM_FIELDS = 12;
export const MAX_CUSTOM_FIELD_LABEL = 40;
export const MAX_CUSTOM_FIELD_VALUE = 240;
export const MAX_CARD_FIELD_LINES = 4;

export const CARD_FIELD_OPTIONS = Object.freeze([
  { value: "year", label: "Дата рождения", description: "Год или дата под именем" },
  { value: "place", label: "Место рождения", description: "Город, область или страна" },
  { value: "occupation", label: "Профессия", description: "Занятие или должность" },
  { value: "custom", label: "Дополнительные поля", description: "Ваши пары «название — значение»" },
]);

export const DEFAULT_CARD_FIELDS = Object.freeze(["year"]);

const allowedCardFields = new Set(CARD_FIELD_OPTIONS.map((option) => option.value));
const controlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function trimAndLimit(value, maxLength) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function uniqueFieldId(rawId, index, usedIds) {
  const baseId = trimAndLimit(rawId, 80).replace(/[^\p{L}\p{N}._-]+/gu, "-") || `custom-${index + 1}`;
  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
  usedIds.add(id);
  return id;
}

export function normalizeCustomFields(value) {
  if (!Array.isArray(value)) return [];
  const usedIds = new Set();
  return value.map((item, index) => {
    const label = trimAndLimit(item?.label, MAX_CUSTOM_FIELD_LABEL);
    const fieldValue = trimAndLimit(item?.value, MAX_CUSTOM_FIELD_VALUE);
    if (!label || !fieldValue || controlCharacters.test(label) || controlCharacters.test(fieldValue)) return null;
    return { id: uniqueFieldId(item?.id, index, usedIds), label, value: fieldValue };
  }).filter(Boolean).slice(0, MAX_CUSTOM_FIELDS);
}

export function sanitizeCardFields(value) {
  const selected = Array.isArray(value)
    ? [...new Set(value.map((item) => String(item)).filter((item) => allowedCardFields.has(item)))]
    : [];
  return (selected.length ? selected : [...DEFAULT_CARD_FIELDS]).slice(0, CARD_FIELD_OPTIONS.length);
}

export function validateCustomFields(value) {
  if (!Array.isArray(value)) return "Дополнительные поля должны быть списком.";
  if (value.length > MAX_CUSTOM_FIELDS) return `Можно добавить не больше ${MAX_CUSTOM_FIELDS} дополнительных полей.`;
  for (const item of value) {
    const label = String(item?.label ?? "").trim();
    const fieldValue = String(item?.value ?? "").trim();
    if (!label && !fieldValue) continue;
    if (!label || !fieldValue) return "Для каждого дополнительного поля заполните и название, и значение.";
    if (label.length > MAX_CUSTOM_FIELD_LABEL) return `Название дополнительного поля — не больше ${MAX_CUSTOM_FIELD_LABEL} знаков.`;
    if (fieldValue.length > MAX_CUSTOM_FIELD_VALUE) return `Значение дополнительного поля — не больше ${MAX_CUSTOM_FIELD_VALUE} знаков.`;
    if (controlCharacters.test(label) || controlCharacters.test(fieldValue)) return "Дополнительные поля содержат недопустимые символы.";
  }
  return "";
}

export function formatCardFieldLines(person, cardFields = DEFAULT_CARD_FIELDS) {
  const lines = [];
  sanitizeCardFields(cardFields).forEach((field) => {
    if (field === "year") lines.push(String(person?.year || "дата неизвестна").trim());
    if (field === "place" && String(person?.place || "").trim()) lines.push(`Место: ${String(person.place).trim()}`);
    if (field === "occupation" && String(person?.occupation || "").trim()) lines.push(`Профессия: ${String(person.occupation).trim()}`);
    if (field === "custom") normalizeCustomFields(person?.customFields).forEach(({ label, value }) => lines.push(`${label}: ${value}`));
  });
  return lines.slice(0, MAX_CARD_FIELD_LINES);
}
