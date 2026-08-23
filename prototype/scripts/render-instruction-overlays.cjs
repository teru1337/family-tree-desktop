const fs = require("node:fs/promises");
const path = require("node:path");

const outputRoot = path.resolve(__dirname, "..", "public", "instruction");
const sourceOffset = { x: 260, y: 110 };
const boxDefaults = { width: 240, height: 68 };

const steps = [
  {
    file: "01-menu.svg",
    source: "source-01-menu.jpg",
    aria: "Главное меню приложения с подписями функций",
    labels: [
      ["left", 18, 10, "1. Создать древо", "Начать новый проект", 469, 286, { laneX: 400 }],
      ["left", 18, 832, "2. Загрузить", "Открыть файл проекта", 469, 338, { laneX: 430 }],
      ["right", 1560, 10, "3. Настройки", "Параметры проекта", 795, 391, { laneX: 1538 }],
      ["right", 1560, 200, "4. Инструкция", "Помощь по шагам", 795, 443, { laneX: 1546 }],
      ["right", 1560, 832, "5. Выход", "Закрыть приложение", 795, 495, { laneX: 1554 }],
    ],
  },
  {
    file: "02-project.svg",
    source: "source-02-project.jpg",
    aria: "Рабочее окно приложения с подписями основных кнопок",
    labels: [
      ["top", 18, 10, "1. Добавить человека", "Открыть мастер записи", 252, 14, { laneY: 84 }],
      ["top", 270, 10, "2. Открыть проект", "Загрузить файл .familytree", 441, 14, { laneY: 92 }],
      ["top", 522, 10, "3. Сохранить проект", "Записать изменения", 604, 14, { laneY: 100 }],
      ["top", 774, 10, "4. Поиск", "Найти сведения в дереве", 861, 14, { laneY: 108 }],
      ["right", 1560, 832, "5. Мини-карта", "Быстро перейти к ветке", 979, 560, { laneX: 1540 }],
    ],
  },
  {
    file: "03-person.svg",
    source: "source-03-person.jpg",
    aria: "Мастер добавления человека с подписями шагов и связей",
    labels: [
      ["left", 18, 10, "1. Выберите связь", "Родитель, ребёнок или союз", 1013, 434, { laneX: 400 }],
      ["left", 18, 832, "2. Уточните ситуацию", "Неполные сведения допустимы", 1013, 504, { laneX: 430 }],
      ["right", 1560, 10, "3. Заполните известное", "Поля можно оставить пустыми", 1169, 261, { laneX: 1528 }],
      ["right", 1560, 200, "4. Проверьте запись", "Перед сохранением есть обзор", 1260, 275, { laneX: 1540 }],
      ["right", 1560, 832, "5. Фото и факты", "Фото, источники и события", 1084, 216, { laneX: 1552 }],
    ],
  },
  {
    file: "04-tree.svg",
    source: "source-04-tree.jpg",
    aria: "Полотно семейного дерева с подписями навигации",
    labels: [
      ["left", 18, 10, "1. Панорамирование", "Тяните пустое место ЛКМ", 16, 110, { laneX: 258 }],
      ["left", 18, 832, "2. Масштаб", "Плюс, минус и текущий процент", 16, 180, { laneX: 268 }],
      ["right", 1560, 10, "3. Вид дерева", "Всё дерево или ближайшая семья", 980, 96, { laneX: 1528 }],
      ["right", 1560, 200, "4. Мини-карта", "Нажмите на область просмотра", 979, 560, { laneX: 1540 }],
      ["right", 1560, 832, "5. Карточки", "Перемещайте людей внутри поколения", 804, 504, { laneX: 1552 }],
    ],
  },
  {
    file: "05-search.svg",
    source: "source-05-search.jpg",
    aria: "Поиск человека и правая панель с подписями возможностей",
    labels: [
      ["top", 18, 10, "1. Введите запрос", "Можно искать по семейным сведениям", 861, 14, { laneY: 92 }],
      ["top", 270, 10, "2. Фильтры", "Поколение, даты, место и связи", 1011, 14, { laneY: 104 }],
      ["right", 1560, 10, "3. Выберите результат", "Откройте карточку человека", 997, 120, { laneX: 1528 }],
      ["right", 1560, 200, "4. Показать на карте", "Центрировать найденного человека", 1260, 300, { laneX: 1540 }],
      ["right", 1560, 832, "5. Соседи и история", "Перейти к семье или назад", 1260, 265, { laneX: 1552 }],
    ],
  },
  {
    file: "06-relationships.svg",
    source: "source-06-relationships.jpg",
    aria: "Управление семейными связями с подписями функций",
    labels: [
      ["left", 18, 10, "1. Тип связи", "Родитель, ребёнок, брак", 1014, 270, { laneX: 400 }],
      ["left", 18, 832, "2. Выберите человека", "Связь получает отдельный ID", 1014, 329, { laneX: 430 }],
      ["right", 1560, 10, "3. Происхождение", "Биология, усыновление, опека", 1255, 468, { laneX: 1528 }],
      ["right", 1560, 200, "4. Удалить ошибку", "Сначала выберите существующую связь", 1255, 654, { laneX: 1540 }],
      ["right", 1560, 832, "5. Роли участников", "Кто кем приходится друг другу", 1260, 100, { laneX: 1552 }],
    ],
  },
  {
    file: "07-backups.svg",
    source: "source-07-backups.jpg",
    aria: "Резервные копии и восстановление проекта с подписями",
    labels: [
      ["left", 18, 10, "1. Текущий проект", "Путь и дата последнего сохранения", 367, 327, { laneX: 400 }],
      ["left", 18, 832, "2. Автокопия", "Локальная защита данных", 367, 453, { laneX: 430 }],
      ["right", 1560, 10, "3. Проверить копию", "Сначала просмотр содержимого", 887, 445, { laneX: 1528 }],
      ["right", 1560, 200, "4. Восстановить", "Вернуть проверенное состояние", 887, 470, { laneX: 1540 }],
      ["right", 1560, 832, "5. Архив материалов", "Перенести проект и фотографии", 916, 503, { laneX: 1552 }],
    ],
  },
  {
    file: "08-export-settings.svg",
    source: "source-08-export-settings.jpg",
    aria: "Экспорт дерева и настройки качества с подписями",
    labels: [
      ["left", 18, 10, "1. Формат", "PDF, PNG, TIFF или печать", 343, 225, { laneX: 400 }],
      ["left", 18, 832, "2. Качество", "Экран, печать или плакат", 343, 309, { laneX: 430 }],
      ["right", 1560, 10, "3. Размер карточек", "Настройте читаемость дерева", 922, 411, { laneX: 1528 }],
      ["right", 1560, 200, "4. Разметка", "Большой плакат или листы", 922, 545, { laneX: 1540 }],
      ["right", 1560, 832, "5. Настройки проекта", "Фото, крупный текст и поля карточки", 922, 615, { laneX: 1552 }],
    ],
  },
];

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character]);
}

function getPath(side, x, y, width, height, targetX, targetY, route = {}) {
  const target = { x: sourceOffset.x + targetX, y: sourceOffset.y + targetY };
  if (side === "left") {
    const startX = x + width;
    const startY = y + height / 2;
    const midX = Number.isFinite(route.laneX)
      ? route.laneX
      : target.x - startX <= 40
        ? target.x - 18
        : startX + Math.max(24, (target.x - startX) * 0.32);
    return `M${startX} ${startY}H${midX}V${target.y}H${target.x}`;
  }
  if (side === "right") {
    const startX = x;
    const startY = y + height / 2;
    const midX = Number.isFinite(route.laneX) ? route.laneX : startX - Math.max(24, (startX - target.x) * 0.32);
    return `M${startX} ${startY}H${midX}V${target.y}H${target.x}`;
  }
  if (side === "top") {
    const startX = x + width / 2;
    const startY = y + height;
    const midY = Number.isFinite(route.laneY) ? route.laneY : startY + Math.max(20, (target.y - startY) * 0.28);
    return `M${startX} ${startY}V${midY}H${target.x}V${target.y}`;
  }
  const startX = x + width / 2;
  const startY = y;
  const midY = Number.isFinite(route.laneY) ? route.laneY : startY - Math.max(20, (startY - target.y) * 0.28);
  return `M${startX} ${startY}V${midY}H${target.x}V${target.y}`;
}

function renderStep(step) {
  const lines = step.labels.map(([side, x, y, title, note, targetX, targetY, route]) => {
    const path = getPath(side, x, y, boxDefaults.width, boxDefaults.height, targetX, targetY, route);
    return `<path class="line" d="${path}"/>`;
  }).join("");
  const labels = step.labels.map(([, x, y, title, note]) => `<g><rect x="${x}" y="${y}" width="${boxDefaults.width}" height="${boxDefaults.height}" rx="10" fill="#f4f8f0" stroke="#b7c8aa"/><text x="${x + 14}" y="${y + 25}" class="label"><tspan x="${x + 14}">${escapeXml(title)}</tspan><tspan x="${x + 14}" dy="20" class="note">${escapeXml(note)}</tspan></text></g>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1000" viewBox="0 0 1800 1000" data-source="${step.source}" data-captured-from="electron-desktop" role="img" aria-label="${escapeXml(step.aria)}"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0 10 5 0 10Z" fill="#6e8d52"/></marker><style>.label{font:700 17px Arial,sans-serif;fill:#4e5947}.note{font:400 14.5px Arial,sans-serif;fill:#6f7769}.line{fill:none;stroke:#6e8d52;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;marker-end:url(#arrow)}</style></defs>${lines}${labels}</svg>\n`;
}

if (require.main === module) {
  (async () => {
    await Promise.all(steps.map((step) => fs.writeFile(path.join(outputRoot, step.file), renderStep(step), "utf8")));
    console.log(`Instruction overlays ready: ${steps.length} SVG files`);
  })().catch((error) => {
    console.error("Не удалось подготовить оверлеи инструкции:", error);
    process.exitCode = 1;
  });
}

module.exports = { steps, boxDefaults, sourceOffset, escapeXml, getPath };
