export const DATE_PRECISIONS = Object.freeze(["exact", "year", "approximate", "range", "unknown"]);

const datePrecisionSet = new Set(DATE_PRECISIONS);

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function stripApproximationPrefix(value) {
  return cleanText(value)
    .replace(/^(около|примерно|до|после)\s+/i, "")
    .replace(/-е(?:\s+годы)?$/i, "")
    .trim();
}

export function normalizeDatePrecision(value, fallback = "unknown") {
  return datePrecisionSet.has(value) ? value : (datePrecisionSet.has(fallback) ? fallback : "unknown");
}

export function inferDatePrecision(value, explicitPrecision = "") {
  if (datePrecisionSet.has(explicitPrecision)) return explicitPrecision;
  const input = cleanText(value);
  if (!input) return "unknown";
  if (/^(около|примерно)\s+/i.test(input)) return "approximate";
  if (/\s*[–—]\s*|\s+по\s+/i.test(input)) return "range";
  if (/^\d{4}$/.test(stripApproximationPrefix(input))) return "year";
  return "exact";
}

export function parseDatePart(value) {
  const input = stripApproximationPrefix(value);
  if (!input) return { valid: false, empty: true, value: "", display: "", sortValue: "" };

  const yearOnly = /^(\d{4})$/.exec(input);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    if (year < 1000 || year > new Date().getFullYear() + 1) return { valid: false, error: "Год должен быть в диапазоне от 1000 до текущего года + 1." };
    return { valid: true, kind: "year", value: String(year), display: String(year), sortValue: `${year}-01-01` };
  }

  const dateParts = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(input) || /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!dateParts) return { valid: false, error: "Введите год 1926 или дату 12.05.1926 цифрами." };

  const isIso = /^\d{4}-/.test(input);
  const day = Number(isIso ? dateParts[3] : dateParts[1]);
  const month = Number(isIso ? dateParts[2] : dateParts[2]);
  const year = Number(isIso ? dateParts[1] : dateParts[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1000 || year > new Date().getFullYear() + 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { valid: false, error: "Проверьте день, месяц и год в дате." };
  }
  const paddedDay = String(day).padStart(2, "0");
  const paddedMonth = String(month).padStart(2, "0");
  return { valid: true, kind: "exact", value: `${year}-${paddedMonth}-${paddedDay}`, display: `${paddedDay}.${paddedMonth}.${year}`, sortValue: `${year}-${paddedMonth}-${paddedDay}` };
}

export function formatDatePart(value) {
  const parsed = parseDatePart(value);
  return parsed.valid ? parsed.display : cleanText(value);
}

function getDateInput(record, legacyValue = "", legacyPrecision = "") {
  if (record && typeof record === "object") {
    const fallback = cleanText(legacyValue);
    const sourceText = cleanText(record.text || record.value || fallback);
    return {
      precision: datePrecisionSet.has(record.precision) ? record.precision : inferDatePrecision(sourceText, legacyPrecision || "unknown"),
      text: cleanText(record.text || ""),
      value: cleanText(record.value || fallback),
      from: cleanText(record.from || record.start || ""),
      to: cleanText(record.to || record.end || ""),
    };
  }
  const text = cleanText(legacyValue);
  return { precision: inferDatePrecision(text), text, value: text, from: "", to: "" };
}

export function normalizeDateRecord(record, legacyValue = "", legacyPrecision = "") {
  const input = getDateInput(record, legacyValue, legacyPrecision);
  const precision = normalizeDatePrecision(input.precision, legacyPrecision || inferDatePrecision(input.text || input.value));
  if (!input.text && !input.value && !input.from && !input.to) {
    return { precision: "unknown", text: "", value: "", from: "", to: "" };
  }
  if (precision === "unknown") {
    return { precision, text: input.text, value: "", from: "", to: "" };
  }

  if (precision === "range") {
    const from = parseDatePart(input.from);
    const to = parseDatePart(input.to);
    const text = input.text || (from.valid && to.valid ? `${from.display} – ${to.display}` : "");
    return { precision, text, value: "", from: from.valid ? from.value : input.from, to: to.valid ? to.value : input.to };
  }

  const parsed = parseDatePart(input.value || input.text);
  const display = parsed.valid ? parsed.display : input.text || input.value;
  const text = input.text || (precision === "approximate" && display ? `примерно ${display}` : display);
  return { precision, text, value: parsed.valid ? parsed.value : input.value, from: "", to: "" };
}

export function validateDateRecord(record, legacyValue = "", legacyPrecision = "") {
  const input = getDateInput(record, legacyValue, legacyPrecision);
  const precision = normalizeDatePrecision(input.precision, legacyPrecision || inferDatePrecision(input.text || input.value));
  if (!input.text && !input.value && !input.from && !input.to) {
    return { valid: true, error: "", normalized: normalizeDateRecord(record, legacyValue, legacyPrecision) };
  }
  if (precision === "unknown") {
    return { valid: !input.text && !input.value && !input.from && !input.to, error: "Для неизвестной даты оставьте поле пустым.", normalized: normalizeDateRecord(record, legacyValue, legacyPrecision) };
  }

  if (precision === "range") {
    const from = parseDatePart(input.from);
    const to = parseDatePart(input.to);
    if (!from.valid || !to.valid) return { valid: false, error: "Для диапазона укажите начальную и конечную дату: например 1940 и 1945.", normalized: normalizeDateRecord(record, legacyValue, legacyPrecision) };
    if (from.sortValue > to.sortValue) return { valid: false, error: "Начало диапазона не может быть позже его окончания.", normalized: normalizeDateRecord(record, legacyValue, legacyPrecision) };
    return { valid: true, error: "", normalized: normalizeDateRecord(record, legacyValue, legacyPrecision) };
  }

  const parsed = parseDatePart(input.value || input.text);
  if (!parsed.valid) return { valid: false, error: parsed.error || "Проверьте дату.", normalized: normalizeDateRecord(record, legacyValue, legacyPrecision) };
  if (precision === "exact" && parsed.kind !== "exact") return { valid: false, error: "Для точной даты укажите день и месяц, например 12.05.1926.", normalized: normalizeDateRecord(record, legacyValue, legacyPrecision) };
  if (precision === "year" && parsed.kind !== "year") return { valid: false, error: "Для точности «Только год» укажите четыре цифры, например 1926.", normalized: normalizeDateRecord(record, legacyValue, legacyPrecision) };
  return { valid: true, error: "", normalized: normalizeDateRecord(record, legacyValue, legacyPrecision) };
}

export function formatDateRecord(record, fallback = "") {
  const normalized = normalizeDateRecord(record, fallback);
  if (normalized.precision === "range") {
    const from = formatDatePart(normalized.from);
    const to = formatDatePart(normalized.to);
    return from && to ? `${from} – ${to}` : normalized.text;
  }
  if (normalized.precision === "approximate") {
    return normalized.text || (normalized.value ? `примерно ${formatDatePart(normalized.value)}` : "");
  }
  return normalized.text || formatDatePart(normalized.value);
}

export function normalizePersonDate(person) {
  const legacyPrecision = inferDatePrecision(person?.year, person?.datePrecision);
  const record = normalizeDateRecord({
    ...(person?.birthDate && typeof person.birthDate === "object" ? person.birthDate : {}),
    from: person?.birthDate?.from || person?.birthDateFrom || "",
    to: person?.birthDate?.to || person?.birthDateTo || "",
  }, person?.year, legacyPrecision);
  const display = formatDateRecord(record, person?.year);
  return {
    ...person,
    birthDate: record,
    year: display,
    datePrecision: record.precision,
    birthDateFrom: record.precision === "range" ? formatDatePart(record.from) : "",
    birthDateTo: record.precision === "range" ? formatDatePart(record.to) : "",
  };
}
