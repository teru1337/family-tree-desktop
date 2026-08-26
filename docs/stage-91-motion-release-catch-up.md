# Публикация motion/design-этапов M3–M9

Дата: 26.08.2026  
Статус: **опубликовано**.

После восстановления GitHub-аутентификации локальная цепочка этапов была
отправлена в `origin/main` до коммита `2233133`. Для сохранения совместимости
с существующим Windows release workflow каждый этап получил отдельный тег и
релиз с соответствующей версией приложения:

| Этап | Реализация | Релиз | Проверка |
| --- | --- | --- | --- |
| M3 | `bce9581` | `v0.3.9` | workflow success; `.exe`, `.blockmap`, `latest.yml` |
| M4 | `3d33fac` | `v0.3.10` | workflow success; `.exe`, `.blockmap`, `latest.yml` |
| M5 | `801490d` | `v0.3.11` | workflow success; `.exe`, `.blockmap`, `latest.yml` |
| M6 | `4121324` | `v0.3.12` | workflow success; `.exe`, `.blockmap`, `latest.yml` |
| M7 | `ae9f039` | `v0.3.13` | workflow success; `.exe`, `.blockmap`, `latest.yml` |
| M8 | `3750df4` | `v0.3.14` | workflow success; `.exe`, `.blockmap`, `latest.yml` |
| M9 | `2233133` | `v0.3.15` | workflow success; `.exe`, `.blockmap`, `latest.yml` |

Версионные snapshot-коммиты для M3–M8 изменяют только `prototype/package.json`
и `prototype/package-lock.json`, чтобы тег workflow собирал установщик с той
же версией, что и GitHub Release. Основная ветка остаётся линейной; `main`
закреплён на `0.3.15`.

Проверены свойства каждого GitHub Release: тег совпадает с версией, релиз не
является draft или prerelease, Windows workflow завершён успешно, а три
обязательных updater-артефакта загружены.
