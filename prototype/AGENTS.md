# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Согласованная дорожная карта продукта

Подробная рабочая спецификация находится в `../docs/remaining-roadmap.md`.
Считать её источником истины для следующих изменений. Не менять принятые решения
молча и не возвращать правило «ФИО ровно из трёх слов»: использовать
структурированные части имени, историю фамилий, происхождение предположительных
данных и поэтапную реализацию от целостности `.familytree` и графа связей к UI,
визуализации и геолокации. Любая новая функция должна сохранять старые файлы,
иметь миграционный сценарий при изменении формата и сопровождаться тестами.

## Motion и визуальное прототипирование

Для задач анимации, интерактивных SVG, Figma/Pixso-референсов и MP4-интро
использовать `../docs/animation-design-agent-workflow.md`. Сначала фиксировать
визуальные состояния и motion-правила, затем менять `src/`; не переносить в
renderer тяжёлые зависимости из внешних skill-репозиториев без проверки
bundle-бюджета. Taste Skill использовать для visual preflight, OpenDesign — для
прототипа и handoff, HyperFrames — только для отдельного видеорендера.
