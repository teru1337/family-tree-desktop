function sentence(value, fallback) {
  const text = String(value || fallback).trim().replace(/[.!?]+$/u, "");
  return text || fallback;
}

export function explainUserError(error, { action = "Действие не выполнено", next = "повторите действие" } = {}) {
  const raw = String(error?.message || error || "").trim();
  let reason = raw || "причина не определена";
  let nextAction = next;

  if (/Unexpected token|JSON|позици|position/i.test(raw)) {
    reason = "выбранный файл повреждён или имеет неверный формат";
    nextAction = "выберите корректный файл .familytree или резервную копию";
  } else if (/более новой версии|не поддерживается|семейного дерева|списка людей|повторяющиеся идентификаторы|пуст|повреждён/i.test(raw)) {
    nextAction = "выберите другой файл .familytree или восстановите резервную копию";
  } else if (/сохранить данные|временн|хранилищ|свободное место|quota|storage/i.test(raw)) {
    nextAction = "проверьте свободное место и доступ к локальному хранилищу, затем повторите";
  }

  return `${sentence(action, "Действие не выполнено")}. Причина: ${sentence(reason, "причина не определена")}. Следующее действие: ${sentence(nextAction, "повторите действие")}.`;
}
