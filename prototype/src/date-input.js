const DATE_MASK_DIGITS = 8;

export function dateMaskDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, DATE_MASK_DIGITS);
}

export function formatDateMask(value) {
  const digits = dateMaskDigits(value);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

export function dateMaskCaretForDigits(value, digitCount) {
  const digits = dateMaskDigits(value);
  const count = Math.max(0, Math.min(digits.length, Number(digitCount) || 0));
  if (count <= 2) return count;
  if (count <= 4) return count + 1;
  return count + 2;
}

export function dateMaskCaretFromSelection(value, selectionStart) {
  const raw = String(value || "");
  const position = Math.max(0, Math.min(raw.length, Number(selectionStart) || 0));
  return dateMaskCaretForDigits(raw, raw.slice(0, position).replace(/\D/g, "").length);
}
