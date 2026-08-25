export const SHORTCUT_COMMANDS = Object.freeze([
  { id: "save", label: "Сохранить проект", description: "Записать изменения в текущее место", defaultShortcut: "Ctrl+S" },
  { id: "open", label: "Открыть проект", description: "Выбрать сохранённый файл .familytree", defaultShortcut: "Ctrl+O" },
  { id: "saveCopy", label: "Сохранить копию", description: "Подготовить отдельную копию проекта", defaultShortcut: "Ctrl+Shift+S" },
  { id: "undo", label: "Отменить действие", description: "Вернуть последнее изменение", defaultShortcut: "Ctrl+Z" },
  { id: "redo", label: "Повторить действие", description: "Повторить отменённое изменение", defaultShortcut: "Ctrl+Y" },
  { id: "search", label: "Поиск", description: "Перейти к поиску по семейным сведениям", defaultShortcut: "Ctrl+F" },
  { id: "zoomIn", label: "Увеличить масштаб", description: "Увеличить масштаб полотна", defaultShortcut: "+" },
  { id: "zoomOut", label: "Уменьшить масштаб", description: "Уменьшить масштаб полотна", defaultShortcut: "-" },
  { id: "panUp", label: "Переместить вверх", description: "Сдвинуть полотно вверх", defaultShortcut: "ArrowUp" },
  { id: "panDown", label: "Переместить вниз", description: "Сдвинуть полотно вниз", defaultShortcut: "ArrowDown" },
  { id: "panLeft", label: "Переместить влево", description: "Сдвинуть полотно влево", defaultShortcut: "ArrowLeft" },
  { id: "panRight", label: "Переместить вправо", description: "Сдвинуть полотно вправо", defaultShortcut: "ArrowRight" },
  { id: "center", label: "По центру", description: "Показать выбранного человека по центру", defaultShortcut: "Home" },
  { id: "showAll", label: "Показать всё дерево", description: "Разместить всё дерево в области просмотра", defaultShortcut: "Shift+Home" },
  { id: "toggleBranch", label: "Переключить родственную ветвь", description: "Переключить всё дерево и ветвь выбранного человека", defaultShortcut: "Ctrl+B" },
]);

export const DEFAULT_SHORTCUTS = Object.freeze(Object.fromEntries(SHORTCUT_COMMANDS.map((command) => [command.id, command.defaultShortcut])));

const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift", "Win"];
const MODIFIERS = new Set(MODIFIER_ORDER);
const KEY_ALIASES = Object.freeze({
  control: "Ctrl",
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  meta: "Win",
  command: "Win",
  win: "Win",
  windows: "Win",
  esc: "Escape",
  escape: "Escape",
  enter: "Enter",
  return: "Enter",
  space: "Space",
  " ": "Space",
  plus: "+",
  equals: "+",
  equal: "+",
  underscore: "-",
});

function normalizeKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const alias = KEY_ALIASES[raw.toLowerCase()];
  if (alias) return alias;
  if (/^arrow(up|down|left|right)$/i.test(raw)) return `Arrow${raw.slice(5).toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}`;
  if (raw.length === 1) return raw.toUpperCase();
  return raw[0].toUpperCase() + raw.slice(1);
}

export function normalizeShortcut(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw === "+" || raw === "-") return raw;
  const parts = raw.split("+").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return "";
  const modifiers = new Set();
  let key = "";
  parts.forEach((part) => {
    const normalized = normalizeKey(part);
    if (MODIFIERS.has(normalized)) modifiers.add(normalized);
    else if (!key) key = normalized;
  });
  if (!key || MODIFIERS.has(key)) return "";
  return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), key].join("+");
}

export function sanitizeShortcutMap(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(SHORTCUT_COMMANDS.map((command) => [command.id, normalizeShortcut(source[command.id]) || command.defaultShortcut]));
}

export function shortcutFromKeyboardEvent(event) {
  if (!event || ["Control", "Alt", "Shift", "Meta"].includes(event.key)) return "";
  let key = normalizeKey(event.key);
  if (key === "=") key = "+";
  if (key === "_") key = "-";
  if (!key || ["Escape", "Backspace", "Delete", "Tab"].includes(key)) return "";
  const modifiers = [];
  if (event.ctrlKey) modifiers.push("Ctrl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey && key !== "+" && key !== "-") modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Win");
  return normalizeShortcut([...modifiers, key].join("+"));
}

export function shortcutCommandId(shortcuts, event) {
  const pressed = shortcutFromKeyboardEvent(event);
  if (!pressed) return "";
  return SHORTCUT_COMMANDS.find((command) => normalizeShortcut(shortcuts?.[command.id]) === pressed)?.id || "";
}

export function validateShortcutMap(value) {
  const shortcuts = sanitizeShortcutMap(value);
  const grouped = new Map();
  SHORTCUT_COMMANDS.forEach((command) => {
    const shortcut = shortcuts[command.id];
    if (!grouped.has(shortcut)) grouped.set(shortcut, []);
    grouped.get(shortcut).push(command.id);
  });
  const conflicts = [...grouped.entries()]
    .filter(([, commandIds]) => commandIds.length > 1)
    .map(([shortcut, commandIds]) => ({ shortcut, commandIds }));
  const unsupported = SHORTCUT_COMMANDS
    .filter((command) => /(^|\+)Win(?:\+|$)/.test(shortcuts[command.id]))
    .map((command) => ({ commandId: command.id, shortcut: shortcuts[command.id], message: "Сочетания с клавишей Windows не перехватываются приложением." }));
  const warnings = SHORTCUT_COMMANDS
    .filter((command) => ["Alt+Tab", "Alt+F4", "Ctrl+Alt+Delete", "Ctrl+Escape"].includes(shortcuts[command.id]))
    .map((command) => ({ commandId: command.id, shortcut: shortcuts[command.id], message: "Это системное сочетание может иметь приоритет Windows." }));
  return { shortcuts, valid: conflicts.length === 0 && unsupported.length === 0, conflicts, unsupported, warnings };
}

export function shortcutDisplayName(shortcut) {
  return normalizeShortcut(shortcut).replaceAll("+", " + ");
}
