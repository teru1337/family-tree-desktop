# Stage 81 M0 — motion-система и визуальная база

Дата: 26.08.2026  
Статус: завершён.

## Что сделано

- В `prototype/src/styles.css` добавлен единый набор motion-токенов для
  micro/fast/standard/emphasis/entrance/scene-переходов, easing, opacity/scale и
  фоновых циклов.
- Базовые переходы кнопок, полотна, карточек, инспектора и связей переведены на
  эти токены без изменения данных, геометрии или формата `.familytree`.
- В `prototype/src/motion.js` добавлены контракт определения
  `prefers-reduced-motion` и безопасного повторного запуска CSS-класса для
  следующих этапов M1–M6.
- Добавлен regression-тест на токены, reduced motion, фокус и повторный запуск.

## Визуальная база и Pixso MCP

Pixso MCP проверен через локальный Streamable HTTP endpoint
`http://127.0.0.1:3667/mcp`: handshake и `tools/list` прошли успешно. В текущем
файле Pixso найден лист «Страница 1», но верхнеуровневых frame-узлов нет, поэтому
внешний макет не создавался и не изменялся. Это намеренно: для M0 не загружаются
реальные семейные данные, а внешний файл без выбранного пользователем target-frame
не становится источником истины.

Для следующих визуальных этапов reference board должен содержать обезличенные
состояния `current`, `enter`, `move`, `collapse`, `highlight`, `reduced-motion`
и `background`. До его появления источником размеров остаются текущие DOM/CSS
компоненты приложения и production-сборка.

Методические источники: [Taste Skill](https://github.com/Leonxlnx/taste-skill),
[OpenDesign](https://github.com/nexu-io/open-design),
[HyperFrames](https://github.com/heygen-com/hyperframes).

## Критерии проверки M0

- токены не меняют persistence и не добавляют runtime-зависимостей;
- decorative background отключается при `prefers-reduced-motion`, а результат
  открытия меню и клавиатурный фокус сохраняются;
- повторный запуск класса очищает предыдущий animation state перед добавлением;
- `npm test`, `npm run build:renderer` и визуальная проверка Windows-сборки
  обязательны до commit/push.

## Фактическая проверка

- `npm test`: 200/200 passed.
- `npm run build:renderer`: passed; основной renderer bundle — 494 958 из
  500 000 байт.
- Установленная Windows-сборка `0.3.5.0` открыта через
  `C:\Program Files\family-tree-desktop\FamilyTreeCircle\FamilyTreeCircle.exe`
  в разрешении 1920×1080. Стартовое меню, карточки, ветви, листья, частицы и
  кнопки отображаются без обрезания и перекрытий; пустое дерево остаётся
  читаемым.

## Остаточный риск

В Pixso пока нет выбранного reference board. Его нужно создать или открыть перед
M1, когда будут фиксироваться промежуточные состояния карточек и линий; этот
внешний шаг должен использовать только демонстрационные данные.
