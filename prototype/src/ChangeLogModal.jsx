function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Дата неизвестна";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function ChangeLogModal({ entries = [], onClose }) {
  const ordered = [...entries].reverse();
  return <div className="backup-modal-backdrop" role="presentation" onClick={onClose}><section className="backup-modal change-log-modal" role="dialog" aria-modal="true" aria-labelledby="change-log-title" onClick={(event) => event.stopPropagation()}><div className="backup-modal-header"><div><span className="eyebrow">Журнал проекта</span><h2 id="change-log-title">История изменений</h2><p>Последние изменения людей и связей сохраняются вместе с проектом. Отмена действия по-прежнему выполняется отдельной кнопкой или Ctrl+Z.</p></div><button type="button" className="icon-button backup-close" onClick={onClose} aria-label="Закрыть историю изменений">×</button></div>{ordered.length ? <div className="change-log-list" aria-label="Список изменений">{ordered.map((entry) => <article className="change-log-item" key={entry.id}><time dateTime={entry.timestamp}>{formatTimestamp(entry.timestamp)}</time><strong>{entry.summary}</strong><small>{entry.entityType === "relation" ? "Связь" : entry.entityType === "person" ? "Человек" : "Проект"}</small></article>)}</div> : <div className="quality-empty"><strong>Изменений пока нет</strong><span>Они появятся после добавления или редактирования людей и связей.</span></div>}<div className="confirm-actions"><button type="button" className="button button-primary" onClick={onClose}>Понятно</button></div></section></div>;
}
