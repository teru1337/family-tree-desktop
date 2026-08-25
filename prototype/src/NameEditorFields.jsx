import { Plus, Trash } from "@phosphor-icons/react";
import { normalizeNameParts, composeName, SURNAME_HISTORY_REASONS } from "./person-names.js";

function PersonNameFields({ draft, onChange, errors = {}, suggestion = null }) {
  const parts = normalizeNameParts(draft?.nameParts);
  const updatePart = (field, value) => {
    const nameParts = { ...parts, [field]: value };
    const name = composeName(nameParts);
    onChange({ ...draft, name, shortName: name, nameParts, nameOrigin: { status: "manual", source: "manual", personIds: [] } });
  };
  return <div className="field-group field-full name-fields"><div className="field-group-heading"><span>ФИО <em>все части необязательны</em></span><small>Фамилия, имя и отчество хранятся отдельно; отображение собирается из заполненных частей.</small></div><div className="name-fields-grid">
    <label className={`field ${errors.familyName ? "has-error" : ""}`}><span>Фамилия</span><input autoFocus value={parts.familyName} onChange={(event) => updatePart("familyName", event.target.value)} aria-invalid={Boolean(errors.familyName)} />{errors.familyName && <small className="field-error">{errors.familyName}</small>}</label>
    <label className={`field ${errors.givenName ? "has-error" : ""}`}><span>Имя</span><input value={parts.givenName} onChange={(event) => updatePart("givenName", event.target.value)} aria-invalid={Boolean(errors.givenName)} />{errors.givenName && <small className="field-error">{errors.givenName}</small>}</label>
    <label className={`field ${errors.patronymic ? "has-error" : ""}`}><span>Отчество</span><input value={parts.patronymic} onChange={(event) => updatePart("patronymic", event.target.value)} aria-invalid={Boolean(errors.patronymic)} />{errors.patronymic && <small className="field-error">{errors.patronymic}</small>}</label>
  </div>{suggestion && <small className="field-hint name-suggestion-hint">Фамилия предложена по связи с родителями: {suggestion.label}. Её можно изменить.</small>}</div>;
}

function SurnameHistoryEditor({ value, error, onChange }) {
  const history = Array.isArray(value) ? value : [];
  const updateEntry = (index, field, nextValue) => onChange(history.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: nextValue } : item));
  const addEntry = () => onChange([...history, { id: `surname-history-${Date.now()}`, surname: "", from: "", to: "", reason: "unknown", source: "", note: "" }]);
  const removeEntry = (index) => onChange(history.filter((_, itemIndex) => itemIndex !== index));
  return <div className={`field-group field-full surname-history-editor ${error ? "has-error" : ""}`}><div className="field-group-heading"><span>История фамилии <em>необязательно</em></span><small>Сохраняйте прежнюю фамилию с периодом, причиной и источником. Это относится к людям любого пола.</small></div>{history.length > 0 && <div className="surname-history-list">{history.map((item, index) => <div className="surname-history-row" key={item.id || index}>
    <input value={item.surname || ""} onChange={(event) => updateEntry(index, "surname", event.target.value)} placeholder="Прежняя фамилия" aria-label={`Прежняя фамилия ${index + 1}`} />
    <div className="date-range-inputs"><input value={item.from || ""} onChange={(event) => updateEntry(index, "from", event.target.value)} placeholder="С" aria-label={`Начало периода ${index + 1}`} /><span>—</span><input value={item.to || ""} onChange={(event) => updateEntry(index, "to", event.target.value)} placeholder="По" aria-label={`Конец периода ${index + 1}`} /></div>
    <select value={item.reason || "unknown"} onChange={(event) => updateEntry(index, "reason", event.target.value)} aria-label={`Причина изменения фамилии ${index + 1}`}>{SURNAME_HISTORY_REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select>
    <input value={item.source || ""} onChange={(event) => updateEntry(index, "source", event.target.value)} placeholder="Источник" aria-label={`Источник фамилии ${index + 1}`} />
    <input value={item.note || ""} onChange={(event) => updateEntry(index, "note", event.target.value)} placeholder="Комментарий" aria-label={`Комментарий к фамилии ${index + 1}`} />
    <button type="button" className="custom-field-remove" onClick={() => removeEntry(index)} aria-label={`Удалить запись истории фамилии ${index + 1}`} title="Удалить запись"><Trash size={16} /></button>
  </div>)}</div>}{error && <small className="field-error">{error}</small>}<button type="button" className="custom-field-add" onClick={addEntry} disabled={history.length >= 20}><Plus size={15} /> Добавить прежнюю фамилию</button></div>;
}

export default function NameEditorFields({ kind, ...props }) {
  return kind === "history" ? <SurnameHistoryEditor {...props} /> : <PersonNameFields {...props} />;
}
