-- Логическая схема локального хранилища семейного дерева v1.
-- Реализация приложения может добавить индексы и служебные таблицы,
-- но не должна менять смысл этих сущностей без увеличения версии схемы.

PRAGMA foreign_keys = ON;

CREATE TABLE project_metadata (
    project_id TEXT PRIMARY KEY,
    title TEXT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE persons (
    person_id TEXT PRIMARY KEY,
    gender TEXT NULL CHECK (gender IS NULL OR gender IN ('male', 'female', 'unknown')),
    occupation TEXT NULL,
    biography TEXT NULL,
    note TEXT NULL,
    is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE person_names (
    name_id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
    name_type TEXT NOT NULL CHECK (name_type IN ('primary', 'maiden', 'alternate')),
    family_name TEXT NULL,
    given_name TEXT NULL,
    patronymic TEXT NULL,
    display_text TEXT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    note TEXT NULL
);

CREATE UNIQUE INDEX one_primary_name_per_person
    ON person_names(person_id)
    WHERE is_primary = 1;

CREATE TABLE date_values (
    date_id TEXT PRIMARY KEY,
    date_kind TEXT NOT NULL CHECK (
        date_kind IN ('exact', 'month', 'year', 'approximate', 'before', 'after', 'range', 'unknown')
    ),
    date_from TEXT NULL,
    date_to TEXT NULL,
    original_text TEXT NULL,
    calendar TEXT NOT NULL DEFAULT 'gregorian' CHECK (
        calendar IN ('gregorian', 'julian', 'unknown')
    )
);

CREATE TABLE person_events (
    event_id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('birth', 'death', 'other')),
    date_id TEXT NULL REFERENCES date_values(date_id) ON DELETE SET NULL,
    place_text TEXT NULL,
    locality TEXT NULL,
    region TEXT NULL,
    country TEXT NULL,
    note TEXT NULL
);

CREATE UNIQUE INDEX one_birth_event_per_person
    ON person_events(person_id)
    WHERE event_type = 'birth';

CREATE TABLE parent_links (
    parent_link_id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
    child_id TEXT NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
    link_type TEXT NOT NULL CHECK (
        link_type IN ('biological', 'adoptive', 'step', 'guardian', 'unknown')
    ),
    note TEXT NULL,
    CHECK (parent_id <> child_id)
);

CREATE UNIQUE INDEX unique_parent_link
    ON parent_links(parent_id, child_id, link_type);

CREATE INDEX parent_links_by_child
    ON parent_links(child_id, link_type);

CREATE TABLE partnerships (
    partnership_id TEXT PRIMARY KEY,
    person_a_id TEXT NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
    person_b_id TEXT NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
    partnership_type TEXT NOT NULL CHECK (
        partnership_type IN ('marriage', 'partnership', 'unknown')
    ),
    start_date_id TEXT NULL REFERENCES date_values(date_id) ON DELETE SET NULL,
    end_date_id TEXT NULL REFERENCES date_values(date_id) ON DELETE SET NULL,
    end_reason TEXT NULL CHECK (
        end_reason IS NULL OR end_reason IN ('divorce', 'separation', 'widowhood', 'unknown')
    ),
    note TEXT NULL,
    CHECK (person_a_id <> person_b_id),
    CHECK (person_a_id < person_b_id)
);

CREATE UNIQUE INDEX unique_partnership
    ON partnerships(person_a_id, person_b_id, partnership_type, start_date_id);

-- Направленный индекс связей для панели человека: одна связь видна с обеих сторон.
CREATE VIEW relationship_index AS
SELECT
    parent_link_id AS relationship_id,
    parent_id AS person_id,
    child_id AS related_person_id,
    'parent-child' AS relationship_kind,
    link_type AS relationship_type
FROM parent_links
UNION ALL
SELECT
    parent_link_id AS relationship_id,
    child_id AS person_id,
    parent_id AS related_person_id,
    'parent-child' AS relationship_kind,
    link_type AS relationship_type
FROM parent_links
UNION ALL
SELECT
    partnership_id AS relationship_id,
    person_a_id AS person_id,
    person_b_id AS related_person_id,
    'partnership' AS relationship_kind,
    partnership_type AS relationship_type
FROM partnerships
UNION ALL
SELECT
    partnership_id AS relationship_id,
    person_b_id AS person_id,
    person_a_id AS related_person_id,
    'partnership' AS relationship_kind,
    partnership_type AS relationship_type
FROM partnerships;

CREATE TABLE photos (
    photo_id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
    relative_path TEXT NOT NULL,
    original_file_name TEXT NULL,
    mime_type TEXT NULL,
    caption TEXT NULL,
    date_id TEXT NULL REFERENCES date_values(date_id) ON DELETE SET NULL,
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX one_primary_photo_per_person
    ON photos(person_id)
    WHERE is_primary = 1;

CREATE TABLE app_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NULL
);
