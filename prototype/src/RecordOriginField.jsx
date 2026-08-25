import { RECORD_ORIGIN_STATUSES } from "./change-log.js";

export function RecordOriginField({ value, onChange }) {
  return <label className="field"><span>Происхождение записи</span><select value={value?.status || "manual"} onChange={(event) => onChange({ status: event.target.value, source: value?.source || "" })}>{RECORD_ORIGIN_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><small className="field-hint">Помогает отличать введённые, импортированные и выведенные сведения.</small></label>;
}
