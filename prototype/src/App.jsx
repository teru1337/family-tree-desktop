import { useEffect, useMemo, useRef, useState } from "react";
import {
  Briefcase,
  Camera,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  CheckCircle,
  Copy,
  Crosshair,
  DotsThree,
  DownloadSimple,
  Export,
  FloppyDisk,
  FolderOpen,
  Info,
  ClockCounterClockwise,
  Link,
  List,
  MagnifyingGlass,
  MapPin,
  Minus,
  Note,
  PencilSimple,
  Plus,
  Printer,
  Square,
  TreeStructure,
  Trash,
  User,
  UserPlus,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import {
  addBackup,
  createProjectPayload,
  normalizeProject,
  readBackups,
  readWorkingCopy,
  serializeProject,
  writeWorkingCopy,
} from "./storage.js";
import {
  EXPORT_QUALITY,
  PAPER_SIZES,
  buildPdfFromCanvas,
  canvasToBlob,
  canvasToTiff,
  downloadBlob,
  renderTreeImage,
} from "./exporters.js";

const avatar = {
  elder: "/assets/portrait-elder.png",
  man: "/assets/portrait-man.png",
  woman: "/assets/portrait-woman.png",
  youngMan: "/assets/portrait-young-man.png",
  youngWoman: "/assets/portrait-young-woman.png",
};

const initialPeople = [
  { id: "petr", name: "Пётр Николаевич Петров", shortName: "Пётр Николаевич\nПетров", year: "1938", place: "г. Ярославль", image: avatar.elder, parentIds: [], partnerIds: ["maria"], childIds: ["ivan"], occupation: "Инженер", biography: "Работал на машиностроительном заводе в Ярославле.", maidenName: "" },
  { id: "maria", name: "Мария Ивановна Петрова (Смирнова)", shortName: "Мария Ивановна\nПетрова (Смирнова)", year: "1940", place: "г. Ярославль", image: avatar.woman, parentIds: [], partnerIds: ["petr"], childIds: ["ivan"], occupation: "Учитель", biography: "Преподавала литературу и собирала семейные истории.", maidenName: "Смирнова" },
  { id: "nikolai", name: "Николай Васильевич Соколов", shortName: "Николай Васильевич\nСоколов", year: "1936", place: "г. Кострома", image: avatar.elder, parentIds: [], partnerIds: ["lidia"], childIds: ["alexey"], occupation: "", biography: "", maidenName: "" },
  { id: "lidia", name: "Лидия Андреевна Соколова (Кузнецова)", shortName: "Лидия Андреевна\nСоколова (Кузнецова)", year: "1938", place: "", image: avatar.woman, parentIds: [], partnerIds: ["nikolai"], childIds: ["alexey"], occupation: "", biography: "", maidenName: "Кузнецова" },
  { id: "ivan", name: "Иван Петров", shortName: "Иван Петров", year: "1963", place: "г. Ярославль, РСФСР", image: avatar.man, parentIds: ["petr", "maria"], partnerIds: ["elena"], childIds: ["dmitry", "anna", "maxim"], occupation: "Инженер", biography: "Сохранял семейные фотографии и записывал воспоминания родственников.", maidenName: "" },
  { id: "elena", name: "Елена Петрова (Соколова)", shortName: "Елена Петрова\n(Соколова)", year: "1966", place: "г. Ярославль", image: avatar.woman, parentIds: ["alexey", "tatiana"], partnerIds: ["ivan"], childIds: ["dmitry", "anna", "maxim"], occupation: "Врач", biography: "", maidenName: "Соколова" },
  { id: "alexey", name: "Алексей Соколов", shortName: "Алексей Соколов", year: "1961", place: "г. Кострома", image: avatar.man, parentIds: ["nikolai", "lidia"], partnerIds: ["tatiana"], childIds: ["elena"], occupation: "", biography: "", maidenName: "" },
  { id: "tatiana", name: "Татьяна Соколова (Новикова)", shortName: "Татьяна Соколова\n(Новикова)", year: "1964", place: "", image: avatar.woman, parentIds: [], partnerIds: ["alexey"], childIds: ["elena"], occupation: "", biography: "", maidenName: "Новикова" },
  { id: "dmitry", name: "Дмитрий Петров", shortName: "Дмитрий Петров", year: "1988", place: "г. Ярославль", image: avatar.youngMan, parentIds: ["ivan", "elena"], partnerIds: [], childIds: ["eva"], occupation: "", biography: "", maidenName: "" },
  { id: "anna", name: "Анна Петрова", shortName: "Анна Петрова", year: "1991", place: "г. Ярославль", image: avatar.youngWoman, parentIds: ["ivan", "elena"], partnerIds: [], childIds: [], occupation: "", biography: "", maidenName: "" },
  { id: "maxim", name: "Максим Петров", shortName: "Максим Петров", year: "1995", place: "", image: avatar.youngMan, parentIds: ["ivan", "elena"], partnerIds: [], childIds: [], occupation: "", biography: "", maidenName: "" },
  { id: "sofia", name: "София Соколова", shortName: "София Соколова", year: "1990", place: "г. Кострома", image: avatar.youngWoman, parentIds: ["alexey", "tatiana"], partnerIds: [], childIds: [], occupation: "", biography: "", maidenName: "" },
  { id: "ilya", name: "Илья Соколов", shortName: "Илья Соколов", year: "1993", place: "", image: avatar.youngMan, parentIds: ["alexey", "tatiana"], partnerIds: [], childIds: [], occupation: "", biography: "", maidenName: "" },
  { id: "eva", name: "Ева Петрова", shortName: "Ева Петрова", year: "2016", place: "г. Ярославль", image: avatar.youngWoman, parentIds: ["dmitry"], partnerIds: [], childIds: [], occupation: "", biography: "", maidenName: "" },
];

const blankPerson = { id: "", name: "", shortName: "", year: "", place: "", image: "", gender: "", parentIds: [], parentLinks: [], partnerIds: [], childIds: [], occupation: "", biography: "", maidenName: "" };
const defaultProjectSettings = { autoSave: true, treeStyle: "classic", showPhotos: true };

const initialPartnerships = [
  { id: "partnership-petr-maria", personIds: ["petr", "maria"], type: "marriage", status: "active", startDate: "1987", startDatePrecision: "year", endDate: "", endDatePrecision: "unknown" },
  { id: "partnership-nikolai-lidia", personIds: ["nikolai", "lidia"], type: "marriage", status: "active", startDate: "1988", startDatePrecision: "year", endDate: "", endDatePrecision: "unknown" },
  { id: "partnership-ivan-elena", personIds: ["ivan", "elena"], type: "marriage", status: "active", startDate: "", startDatePrecision: "unknown", endDate: "", endDatePrecision: "unknown" },
  { id: "partnership-alexey-tatiana", personIds: ["alexey", "tatiana"], type: "marriage", status: "active", startDate: "", startDatePrecision: "unknown", endDate: "", endDatePrecision: "unknown" },
];

const relationLabel = { parent: "родителя", child: "ребёнка", partner: "супруга или партнёра" };
const relationTypeLabel = { biological: "Биологическая связь", adoptive: "Усыновление", step: "Степ-родство" };
const partnershipTypeLabel = { marriage: "Брак", partnership: "Партнёрство" };

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `person-${Date.now()}`;
}

function validateDateValue(value, precision = "exact") {
  const input = String(value || "").trim();
  if (!input) return "";
  const currentYear = new Date().getFullYear();
  const normalized = input.replace(/^(около|примерно|до|после)\s+/i, "").replace(/-е(?:\s+годы)?$/i, "");
  const yearOnly = /^(\d{4})$/.exec(normalized);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    if (year < 1000 || year > currentYear + 1) return `Год должен быть в диапазоне от 1000 до ${currentYear + 1}.`;
    if (precision === "exact") return "Для точной даты укажите день и месяц, например 12.05.1926.";
    return "";
  }
  const dateParts = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(normalized);
  if (!dateParts) return "Введите год 1926 или дату 12.05.1926 цифрами.";
  const day = Number(dateParts[1]);
  const month = Number(dateParts[2]);
  const year = Number(dateParts[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1000 || year > currentYear + 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "Проверьте день, месяц и год в дате.";
  if (precision === "year") return "Для точности «Только год» укажите только четыре цифры, например 1926.";
  return "";
}

function validatePersonDraft(draft, { isNew = false, relationshipMode = "", connectionTargetId = "" } = {}) {
  const errors = {};
  const name = String(draft?.name || "").trim();
  const maidenName = String(draft?.maidenName || "").trim();
  const place = String(draft?.place || "").trim();
  const occupation = String(draft?.occupation || "").trim();
  const biography = String(draft?.biography || "").trim();
  const personNamePattern = /^[\p{L}\s.'’\-–—()]+$/u;
  const placePattern = /^[\p{L}\p{N}\s.,'’\-–—()\/$№]+$/u;
  const occupationPattern = /^[\p{L}\p{N}\s.,'’\-–—()/$№]+$/u;
  if (name && (!personNamePattern.test(name) || name.length > 120)) errors.name = "ФИО укажите буквами, без цифр; максимум 120 знаков.";
  if (maidenName && (!personNamePattern.test(maidenName) || maidenName.length > 80)) errors.maidenName = "Фамилия должна содержать буквы и стандартные знаки препинания.";
  const dateError = validateDateValue(draft?.year, draft?.datePrecision || (draft?.year && draft.year.length === 4 ? "year" : "exact"));
  if (dateError) errors.year = dateError;
  if (place && (!placePattern.test(place) || place.length > 160)) errors.place = "Укажите город, область или страну без необычных символов; максимум 160 знаков.";
  if (occupation && (!occupationPattern.test(occupation) || occupation.length > 100)) errors.occupation = "Профессия содержит недопустимые символы или слишком длинная.";
  if (biography.length > 2000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(biography)) errors.biography = "Биография слишком длинная или содержит недопустимые символы.";
  if (isNew && relationshipMode && !connectionTargetId) errors.connectionTargetId = "Выберите человека, с которым нужно установить связь.";
  return errors;
}

function addUniqueId(ids, id) {
  return [...new Set([...(Array.isArray(ids) ? ids : []), id])];
}

function makeParentLinkId(childId, parentId, type) {
  return `parent-link-${childId}-${parentId}-${type}`;
}

function addParentLink(links, personId, type, childId = "unknown-person") {
  const current = Array.isArray(links) ? links : [];
  if (current.some((link) => link.personId === personId && link.type === type)) return current;
  return [...current, { id: makeParentLinkId(childId, personId, type), personId, type }];
}

function roleByGender(person, male, female, unknown) {
  if (person?.gender === "male") return male;
  if (person?.gender === "female") return female;
  return unknown;
}

function parentRelationshipRoles(type, parent, child) {
  if (type === "step") return { currentRole: roleByGender(parent, "Отчим", "Мачеха", "Отчим/мачеха"), inverseRole: roleByGender(child, "Пасынок", "Падчерица", "Пасынок/падчерица") };
  if (type === "adoptive") return { currentRole: "Усыновитель", inverseRole: "Усыновлённый ребёнок" };
  return { currentRole: "Биологический родитель", inverseRole: "Биологический ребёнок" };
}

function childRelationshipRoles(type, parent, child) {
  const roles = parentRelationshipRoles(type, parent, child);
  return { currentRole: roles.inverseRole, inverseRole: roles.currentRole };
}

function partnerRole(person, partnership) {
  if (partnership?.type === "partnership") return "Партнёр";
  return roleByGender(person, "Супруг", "Супруга", "Супруг/супруга");
}

function familyStatusLabel(partnerships) {
  if (partnerships.some((partnership) => partnership.status === "active" && partnership.type === "marriage")) return "В браке";
  if (partnerships.some((partnership) => partnership.status === "active" && partnership.type === "partnership")) return "В партнёрстве";
  if (partnerships.some((partnership) => partnership.status === "divorced")) return "Разведён(а)";
  return "Не указан";
}

function IconButton({ label, children, onClick, className = "" }) {
  return <button className={`icon-button ${className}`} type="button" title={label} aria-label={label} onClick={onClick}>{children}</button>;
}

function PersonAvatar({ person, large = false, showPhoto = true }) {
  return showPhoto && person?.image ? <img className={`person-avatar ${large ? "person-avatar-large" : ""}`} src={person.image} alt="" /> : <span className={`person-avatar person-avatar-empty ${large ? "person-avatar-large" : ""}`}><User size={large ? 32 : 20} weight="regular" /></span>;
}

function TreeNode({ person, position, selected, onSelect, showPhotos, dragging, onDragStart, onDragMove, onDragEnd }) {
  return (
    <button className={`tree-node ${selected ? "tree-node-selected" : ""} ${showPhotos ? "" : "tree-node-no-photo"} ${dragging ? "tree-node-dragging" : ""}`} style={{ left: position.left, top: position.top }} type="button" onClick={() => onSelect(person.id)} onPointerDown={(event) => onDragStart?.(person.id, event)} onPointerMove={(event) => onDragMove?.(event)} onPointerUp={(event) => onDragEnd?.(event)} onPointerCancel={(event) => onDragEnd?.(event)} aria-pressed={selected} aria-label={`${person.name || "Человек без имени"}${person.year ? ` ${person.year}` : ""}`}>
      <PersonAvatar person={person} showPhoto={showPhotos} />
      <span className="tree-node-copy">
        {(person.shortName || person.name || "Человек без имени").split("\n").map((line) => <span key={line} className="tree-node-name">{line}</span>)}
        <span className="tree-node-year">{person.year || "дата неизвестна"}</span>
      </span>
    </button>
  );
}

function Connector({ left, top, width, height = 1, vertical = false, className = "" }) {
  return <span className={`connector ${vertical ? "connector-vertical" : ""} ${className}`} style={{ left, top, width, height }} />;
}

function RelationshipItem({ person, onSelect, meta = "", relationshipId = "" }) {
  if (!person) return null;
  return (
    <button className="relationship-item" type="button" onClick={() => onSelect(person.id)}>
      <PersonAvatar person={person} />
      <span className="relationship-copy"><span>{person.name || "Человек без имени"}</span><small>{meta || person.year || "дата неизвестна"}</small>{relationshipId && <small className="relationship-id" title={`Уникальный идентификатор связи: ${relationshipId}`}>ID связи: {relationshipId}</small>}</span>
    </button>
  );
}

function SearchResults({ results, onSelect }) {
  if (!results.length) return <div className="search-empty">Ничего не найдено</div>;
  return <div className="search-results">{results.map((person) => <button key={person.id} type="button" className="search-result" onClick={() => onSelect(person.id)}><PersonAvatar person={person} /><span><strong>{person.name || "Человек без имени"}</strong><small>{person.place || "место не указано"}</small></span></button>)}</div>;
}

function RelationSection({ title, items, onSelect, emptyText }) {
  return <section className="relation-section"><div className="section-title-row"><h3>{title}</h3><PencilSimple size={15} /></div>{items.length ? items.map(({ person, meta, relationshipId }) => <RelationshipItem key={`${person.id}-${relationshipId || title}`} person={person} meta={meta} relationshipId={relationshipId} onSelect={onSelect} />) : <p className="empty-relation">{emptyText}</p>}</section>;
}

function partnershipDescription(partnership) {
  if (!partnership) return "Связь без уточнения";
  const type = partnershipTypeLabel[partnership.type] || "Связь";
  if (partnership.status === "divorced") return `${type} · развод${partnership.endDate ? ` ${partnership.endDate}` : ""}`;
  return `${type}${partnership.startDate ? ` · с ${partnership.startDate}` : ""}`;
}

function PersonDetail({ person, people, partnerships, onEdit, onSelect, onAddRelative, onManageRelationships, onShowOnMap, onDelete }) {
  if (!person) return <div className="detail-content empty-tree-state"><h2>Дерево пока пустое</h2><p>Добавьте первого человека, даже если известны только отдельные сведения.</p><button type="button" className="button button-primary" onClick={() => onAddRelative("")}><Plus size={18} /> Добавить человека</button></div>;
  const displayName = person.name || "Человек без имени";
  const find = (id) => people.find((item) => item.id === id);
  const parentLinks = person.parentLinks?.length ? person.parentLinks : person.parentIds.map((personId) => ({ id: makeParentLinkId(person.id, personId, "biological"), personId, type: "biological" }));
  const parents = parentLinks.map((link) => {
    const parent = find(link.personId);
    const roles = parentRelationshipRoles(link.type, parent, person);
    return { person: parent, meta: `${roles.currentRole} · вы для него: ${roles.inverseRole}`, relationshipId: link.id || makeParentLinkId(person.id, link.personId, link.type) };
  }).filter((item) => item.person);
  const relatedPartnerships = partnerships.filter((partnership) => partnership.personIds.includes(person.id));
  const partnerIds = [...new Set([...person.partnerIds, ...relatedPartnerships.flatMap((partnership) => partnership.personIds.filter((id) => id !== person.id))])];
  const partners = partnerIds.map((partnerId) => {
    const partner = find(partnerId);
    const partnership = [...partnerships].reverse().find((item) => item.personIds.includes(person.id) && item.personIds.includes(partnerId));
    const currentRole = partnerRole(person, partnership);
    const inverseRole = partnerRole(partner, partnership);
    return { person: partner, meta: `${partnershipDescription(partnership)} · вы для него: ${currentRole} · он/она для вас: ${inverseRole}`, relationshipId: partnership?.id || `partnership-${[person.id, partnerId].sort().join("-")}` };
  }).filter((item) => item.person);
  const children = person.childIds.map((childId) => {
    const child = find(childId);
    const parentLink = child?.parentLinks?.find((link) => link.personId === person.id);
    const type = parentLink?.type || "biological";
    const roles = childRelationshipRoles(type, person, child);
    return { person: child, meta: `${roles.currentRole} · вы для него: ${roles.inverseRole}`, relationshipId: parentLink?.id || makeParentLinkId(child?.id || childId, person.id, type) };
  }).filter((item) => item.person);
  const relationIds = [...parents, ...partners, ...children].map((item) => item.relationshipId).filter(Boolean);
  return (
    <div className="detail-content">
      <div className="profile-block"><PersonAvatar person={person} large /><div className="profile-summary"><h2>{displayName}</h2><p className="profile-year">{person.year || "Дата рождения неизвестна"}</p><div className="profile-place"><MapPin size={17} /> {person.place || "Место рождения не указано"}</div></div><div className="profile-actions"><button type="button" className="button button-secondary map-focus-button" onClick={() => onShowOnMap(person.id)}><Crosshair size={18} /> Показать найденного человека на карте</button><button type="button" className="button button-primary edit-button" onClick={onEdit}><PencilSimple size={18} weight="bold" /> Редактировать</button></div></div>
      <section className="detail-section"><div className="section-title-row"><h3>Основная информация</h3><PencilSimple size={16} /></div><dl className="facts-list"><div><dt>Дата рождения</dt><dd>{person.year || "—"}</dd></div><div><dt>Место рождения</dt><dd>{person.place || "—"}</dd></div><div><dt>Семейный статус</dt><dd>{familyStatusLabel(relatedPartnerships)}</dd></div><div><dt>Профессия</dt><dd>{person.occupation || "—"}</dd></div><div><dt>Девичья фамилия</dt><dd>{person.maidenName || "—"}</dd></div><div><dt>Примечание</dt><dd>{person.biography || "—"}</dd></div></dl></section>
      <RelationSection title="Родители" items={parents} onSelect={onSelect} emptyText="Родители ещё не добавлены" />
      <RelationSection title="Супруги и партнёры" items={partners} onSelect={onSelect} emptyText="Супруги и партнёры ещё не добавлены" />
      <RelationSection title="Дети" items={children} onSelect={onSelect} emptyText="Дети ещё не добавлены" />
      <section className="detail-section relationship-identifiers"><div className="section-title-row"><h3>Идентификаторы</h3><Info size={15} /></div><dl className="facts-list"><div><dt>ID человека</dt><dd className="identifier-value">{person.id}</dd></div><div><dt>Связей в панели</dt><dd>{relationIds.length}</dd></div><div><dt>ID связей</dt><dd className="identifier-value">{relationIds.length ? relationIds.join(" · ") : "—"}</dd></div></dl></section>
      <div className="relationship-actions"><button type="button" className="button button-secondary relationship-manage-button" onClick={onManageRelationships}><Link size={18} /> Управлять связями</button><button type="button" className="add-relative-button" onClick={() => onAddRelative("child")}><UserPlus size={20} /><span><strong>Добавить родственника</strong><small>Создать новую запись человека</small></span><CaretRight size={18} /></button><button type="button" className="button delete-person-button" onClick={onDelete}><Trash size={18} /> Удалить человека</button></div>
    </div>
  );
}

function PersonEditor({ draft, isNew, relationshipMode, relationshipType, partnershipType, connectionTargetId, people, onChange, onRelationChange, onRelationshipTypeChange, onPartnershipTypeChange, onConnectionTargetChange, onSave, onCancel }) {
  const [errors, setErrors] = useState({});
  const update = (field, value) => {
    onChange({ ...draft, [field]: value });
    setErrors((current) => ({ ...current, [field]: "" }));
  };
  const changeRelationMode = (value) => {
    onRelationChange(value);
    if (!value) onRelationshipTypeChange("biological");
    setErrors((current) => ({ ...current, connectionTargetId: "" }));
  };
  const changeConnectionTarget = (value) => {
    onConnectionTargetChange(value);
    setErrors((current) => ({ ...current, connectionTargetId: "" }));
  };
  const handleSave = () => {
    const nextErrors = validatePersonDraft(draft, { isNew, relationshipMode, connectionTargetId });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    onSave();
  };
  const relationText = relationshipMode ? `Новый человек — ${relationLabel[relationshipMode]}` : "Новый человек";
  const precision = draft.datePrecision || (draft.year && draft.year.length <= 4 ? "year" : "exact");
  const targetOptions = people.filter((person) => person.id !== draft.id);
  const relationDescription = relationshipMode === "parent" ? (relationshipType === "step" ? "Новый человек станет отчимом или мачехой выбранной записи." : relationshipType === "adoptive" ? "Новый человек станет усыновителем выбранной записи." : "Новый человек станет биологическим родителем выбранной записи.") : relationshipMode === "child" ? (relationshipType === "step" ? "Новый человек станет пасынком или падчерицей выбранной записи." : relationshipType === "adoptive" ? "Новый человек будет отмечен как усыновлённый ребёнок выбранной записи." : "Новый человек станет биологическим ребёнком выбранной записи.") : relationshipMode === "partner" ? `Новый человек будет добавлен как ${partnershipType === "marriage" ? "супруг или супруга" : "партнёр"}.` : "Можно сохранить человека без связи и добавить её позже.";
  return (
    <div className="editor-content">
      <div className="editor-intro"><div className="editor-photo-wrap"><PersonAvatar person={draft} large /><button type="button" className="photo-action" onClick={() => update("image", avatar.man)}><Camera size={16} /> Добавить фото</button></div><div><span className="eyebrow">{isNew ? relationText : "Редактирование"}</span><h2>{isNew ? "Добавить человека" : "Изменить сведения"}</h2><p>Заполните только то, что известно. Остальные поля можно оставить пустыми.</p></div></div>
      <div className="form-grid">
        {isNew && <div className="field field-full connection-field"><span>Связь с уже добавленным человеком <em>необязательно</em></span><div className="date-options relation-options"><button type="button" className={`date-option ${relationshipMode === "" ? "selected" : ""}`} onClick={() => changeRelationMode("")}>Без связи</button><button type="button" className={`date-option ${relationshipMode === "parent" ? "selected" : ""}`} onClick={() => changeRelationMode("parent")}>Родитель</button><button type="button" className={`date-option ${relationshipMode === "child" ? "selected" : ""}`} onClick={() => changeRelationMode("child")}>Ребёнок</button><button type="button" className={`date-option ${relationshipMode === "partner" ? "selected" : ""}`} onClick={() => changeRelationMode("partner")}>Супруг или партнёр</button></div>{relationshipMode && relationshipMode !== "partner" && <><span className="nested-field-label">Вид родственной связи</span><div className="date-options relation-options"><button type="button" className={`date-option ${relationshipType === "biological" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("biological")}>Биологическая</button><button type="button" className={`date-option ${relationshipType === "adoptive" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("adoptive")}>Усыновление</button><button type="button" className={`date-option ${relationshipType === "step" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("step")}>Степ-родство</button></div></>}{relationshipMode === "partner" && <><span className="nested-field-label">Вид партнёрства</span><div className="date-options relation-options"><button type="button" className={`date-option ${partnershipType === "marriage" ? "selected" : ""}`} onClick={() => onPartnershipTypeChange("marriage")}>Брак</button><button type="button" className={`date-option ${partnershipType === "partnership" ? "selected" : ""}`} onClick={() => onPartnershipTypeChange("partnership")}>Партнёрство</button></div></>}<label className="nested-field"><span>Выберите человека</span><select value={relationshipMode ? connectionTargetId : ""} disabled={!relationshipMode} onChange={(event) => changeConnectionTarget(event.target.value)}><option value="">Выберите человека</option>{targetOptions.map((person) => <option key={person.id} value={person.id}>{person.name || "Человек без имени"}{person.year ? ` · ${person.year}` : ""}</option>)}</select></label>{errors.connectionTargetId && <small className="field-error">{errors.connectionTargetId}</small>}<small className="field-hint">{relationDescription}</small></div>}
        <label className={`field field-full ${errors.name ? "has-error" : ""}`}><span>ФИО <em>необязательно</em></span><input autoFocus value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder="Например, Иван Петров" aria-invalid={Boolean(errors.name)} />{errors.name && <small className="field-error">{errors.name}</small>}</label>
        <label className={`field ${errors.maidenName ? "has-error" : ""}`}><span>Девичья фамилия <em>необязательно</em></span><input value={draft.maidenName} onChange={(event) => update("maidenName", event.target.value)} placeholder="Не указано" aria-invalid={Boolean(errors.maidenName)} />{errors.maidenName && <small className="field-error">{errors.maidenName}</small>}</label>
        <label className="field"><span>Пол <em>необязательно</em></span><select value={draft.gender || ""} onChange={(event) => update("gender", event.target.value)}><option value="">Не указан</option><option value="male">Мужчина</option><option value="female">Женщина</option></select></label>
        <label className={`field field-full ${errors.year ? "has-error" : ""}`}><span>Дата рождения <em>необязательно</em></span><input value={draft.year} onChange={(event) => update("year", event.target.value)} placeholder="Например, 1926" aria-invalid={Boolean(errors.year)} />{errors.year && <small className="field-error">{errors.year}</small>}</label>
        <div className="field field-full"><span>Точность даты</span><div className="date-options"><button type="button" className={`date-option ${precision === "exact" ? "selected" : ""}`} onClick={() => update("datePrecision", "exact")}>Точный день</button><button type="button" className={`date-option ${precision === "year" ? "selected" : ""}`} onClick={() => update("datePrecision", "year")}>Только год</button><button type="button" className={`date-option ${precision === "approximate" ? "selected" : ""}`} onClick={() => update("datePrecision", "approximate")}>Примерно</button><button type="button" className={`date-option ${precision === "unknown" ? "selected" : ""}`} onClick={() => update("datePrecision", "unknown")}>Неизвестно</button></div><small className="field-hint">Допустимо: 1926, 12.05.1926 или «около 1926».</small></div>
        <label className={`field field-full ${errors.place ? "has-error" : ""}`}><span>Место рождения <em>необязательно</em></span><div className="input-with-icon"><MapPin size={17} /><input value={draft.place} onChange={(event) => update("place", event.target.value)} placeholder="Город, область или страна" aria-invalid={Boolean(errors.place)} /></div>{errors.place && <small className="field-error">{errors.place}</small>}</label>
        <label className={`field field-full ${errors.occupation ? "has-error" : ""}`}><span>Профессия <em>необязательно</em></span><div className="input-with-icon"><Briefcase size={17} /><input value={draft.occupation} onChange={(event) => update("occupation", event.target.value)} placeholder="Например, учитель" aria-invalid={Boolean(errors.occupation)} /></div>{errors.occupation && <small className="field-error">{errors.occupation}</small>}</label>
        <label className={`field field-full ${errors.biography ? "has-error" : ""}`}><span>Краткая биография <em>необязательно</em></span><textarea value={draft.biography} onChange={(event) => update("biography", event.target.value)} placeholder="Важные события, интересы, воспоминания..." rows="5" aria-invalid={Boolean(errors.biography)} />{errors.biography && <small className="field-error">{errors.biography}</small>}</label>
      </div>
      <div className="editor-footer"><button type="button" className="button button-ghost" onClick={onCancel}>Отмена</button><button type="button" className="button button-primary save-button" onClick={handleSave}><FloppyDisk size={18} weight="bold" /> Сохранить</button></div>
    </div>
  );
}

function RelationshipEditor({ person, people, partnerships, onSave, onCancel }) {
  const [draft, setDraft] = useState({ kind: "parent", targetId: people.find((item) => item.id !== person.id)?.id || "", parentType: "biological", startDate: "", startDatePrecision: "unknown", endDate: "", endDatePrecision: "unknown" });
  const update = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const knownPartnerIds = new Set(partnerships.filter((partnership) => partnership.personIds.includes(person.id)).flatMap((partnership) => partnership.personIds.filter((id) => id !== person.id)));
  const currentPartnerIds = new Set([...person.partnerIds.filter((id) => !knownPartnerIds.has(id)), ...partnerships.filter((partnership) => partnership.status === "active" && partnership.personIds.includes(person.id)).flatMap((partnership) => partnership.personIds.filter((id) => id !== person.id))]);
  const targetOptions = people.filter((item) => item.id !== person.id && (draft.kind !== "divorce" || currentPartnerIds.has(item.id)));
  const targetId = targetOptions.some((item) => item.id === draft.targetId) ? draft.targetId : targetOptions[0]?.id || "";
  const isParent = draft.kind === "parent" || draft.kind === "child";
  const isPartnership = ["marriage", "partnership", "divorce"].includes(draft.kind);
  const isDivorce = draft.kind === "divorce";
  const dateValue = isDivorce ? draft.endDate : draft.startDate;
  const datePrecision = isDivorce ? draft.endDatePrecision : draft.startDatePrecision;
  const save = () => onSave({ ...draft, targetId });
  return (
    <div className="editor-content relationship-editor">
      <div className="editor-intro relation-editor-intro"><div className="relation-editor-icon"><Link size={34} /></div><div><span className="eyebrow">Семейная связь</span><h2>Управлять связями</h2><p>Свяжите человека с уже существующей записью или добавьте семейное событие.</p></div></div>
      <div className="form-grid">
        <div className="field field-full"><span>Тип связи</span><div className="date-options relation-options"><button type="button" className={`date-option ${draft.kind === "parent" ? "selected" : ""}`} onClick={() => update("kind", "parent")}>Родитель</button><button type="button" className={`date-option ${draft.kind === "child" ? "selected" : ""}`} onClick={() => update("kind", "child")}>Ребёнок</button><button type="button" className={`date-option ${draft.kind === "marriage" ? "selected" : ""}`} onClick={() => update("kind", "marriage")}>Брак</button><button type="button" className={`date-option ${draft.kind === "partnership" ? "selected" : ""}`} onClick={() => update("kind", "partnership")}>Партнёрство</button><button type="button" className={`date-option ${draft.kind === "divorce" ? "selected" : ""}`} onClick={() => update("kind", "divorce")}>Развод</button></div></div>
        <label className="field field-full"><span>{isDivorce ? "С кем оформить развод" : "С кем установить связь"}</span><select value={targetId} onChange={(event) => update("targetId", event.target.value)}><option value="">Не выбрано</option>{targetOptions.map((item) => <option key={item.id} value={item.id}>{item.name || "Человек без имени"}{item.year ? ` · ${item.year}` : ""}</option>)}</select></label>
        {isParent && <div className="field field-full"><span>Происхождение связи</span><div className="date-options relation-options"><button type="button" className={`date-option ${draft.parentType === "biological" ? "selected" : ""}`} onClick={() => update("parentType", "biological")}>Биологическая</button><button type="button" className={`date-option ${draft.parentType === "adoptive" ? "selected" : ""}`} onClick={() => update("parentType", "adoptive")}>Усыновление</button><button type="button" className={`date-option ${draft.parentType === "step" ? "selected" : ""}`} onClick={() => update("parentType", "step")}>Степ-родство</button></div><small className="field-hint">Степ-родство используется для отчима, мачехи, пасынка и падчерицы.</small></div>}
        {isPartnership && <><label className="field field-full"><span>{isDivorce ? "Дата развода" : "Дата начала отношений"} <em>необязательно</em></span><input value={dateValue} onChange={(event) => update(isDivorce ? "endDate" : "startDate", event.target.value)} placeholder="Точный день или год" /></label><div className="field field-full"><span>Точность даты</span><div className="date-options"><button type="button" className={`date-option ${datePrecision === "exact" ? "selected" : ""}`} onClick={() => update(isDivorce ? "endDatePrecision" : "startDatePrecision", "exact")}>Точный день</button><button type="button" className={`date-option ${datePrecision === "year" ? "selected" : ""}`} onClick={() => update(isDivorce ? "endDatePrecision" : "startDatePrecision", "year")}>Только год</button><button type="button" className={`date-option ${datePrecision === "approximate" ? "selected" : ""}`} onClick={() => update(isDivorce ? "endDatePrecision" : "startDatePrecision", "approximate")}>Примерно</button><button type="button" className={`date-option ${datePrecision === "unknown" ? "selected" : ""}`} onClick={() => update(isDivorce ? "endDatePrecision" : "startDatePrecision", "unknown")}>Неизвестно</button></div></div></>}
        {isDivorce && !targetOptions.length && <p className="relationship-hint field-full">У этого человека пока нет супруга или партнёра, для которого можно указать развод.</p>}
      </div>
      <div className="editor-footer"><button type="button" className="button button-ghost" onClick={onCancel}>Отмена</button><button type="button" className="button button-primary save-button" onClick={save} disabled={!targetId}><FloppyDisk size={18} weight="bold" /> Сохранить связь</button></div>
    </div>
  );
}

function getParentIds(person) {
  const links = Array.isArray(person.parentLinks) ? person.parentLinks.map((link) => link.personId) : [];
  return [...new Set([...(links.length ? links : person.parentIds || [])])];
}

function buildTreeLayout(people, partnerships = []) {
  const byId = new Map(people.map((person) => [person.id, person]));
  const groupParent = new Map(people.map((person) => [person.id, person.id]));
  const findGroup = (id) => {
    let root = groupParent.get(id) || id;
    while (groupParent.get(root) !== root) root = groupParent.get(root);
    let current = id;
    while (groupParent.get(current) !== current) { const next = groupParent.get(current); groupParent.set(current, root); current = next; }
    return root;
  };
  const unionGroups = (firstId, secondId) => { const first = findGroup(firstId); const second = findGroup(secondId); if (first !== second) groupParent.set(second, first); };
  partnerships.forEach((partnership) => { const [firstId, secondId] = partnership.personIds || []; if (byId.has(firstId) && byId.has(secondId)) unionGroups(firstId, secondId); });
  const groupParents = new Map();
  people.forEach((person) => {
    const group = findGroup(person.id);
    if (!groupParents.has(group)) groupParents.set(group, new Set());
    getParentIds(person).filter((parentId) => byId.has(parentId)).forEach((parentId) => { const parentGroup = findGroup(parentId); if (parentGroup !== group) groupParents.get(group).add(parentGroup); });
  });
  const generationCache = new Map();
  const getGroupGeneration = (group, stack = new Set()) => {
    if (generationCache.has(group)) return generationCache.get(group);
    if (stack.has(group)) return 0;
    const nextStack = new Set(stack);
    nextStack.add(group);
    const parents = [...(groupParents.get(group) || [])];
    const generation = parents.length ? Math.min(7, Math.min(...parents.map((parentGroup) => getGroupGeneration(parentGroup, nextStack) + 1))) : 0;
    generationCache.set(group, generation);
    return generation;
  };
  const groups = [];
  people.forEach((person) => {
    const generation = getGroupGeneration(findGroup(person.id));
    if (!groups[generation]) groups[generation] = [];
    groups[generation].push(person);
  });
  const generations = groups.map((members, index) => ({ index, members: members || [] })).filter((group) => group.members.length);
  const cardWidth = 190;
  const cardHeight = 92;
  const columnStep = 280;
  const horizontalPadding = 260;
  const verticalPadding = 180;
  const maxMembers = Math.max(1, ...generations.map((group) => group.members.length));
  const width = Math.max(1320, maxMembers * columnStep + 160) + horizontalPadding * 2;
  const top = 78 + verticalPadding;
  const rowStep = 230;
  const height = Math.max(850, 78 + generations.length * rowStep + 100) + verticalPadding * 2;
  const positions = Object.fromEntries(generations.flatMap((group) => {
    const groupWidth = (group.members.length - 1) * columnStep + cardWidth;
    const startX = Math.max(55, (width - groupWidth) / 2);
    return group.members.map((person, index) => [person.id, { left: startX + index * columnStep, top: top + group.index * rowStep, width: cardWidth, height: cardHeight, generation: group.index }]);
  }));
  return { generations, positions, width, height, top, cardWidth, cardHeight, columnStep, rowStep };
}

function TreeConnections({ people, partnerships, positions, width, height }) {
  const parentEdges = people.flatMap((child) => getParentIds(child).map((parentId) => ({ child, parent: people.find((person) => person.id === parentId), type: child.parentLinks?.find((link) => link.personId === parentId)?.type || "biological" }))).filter((edge) => edge.parent && positions[edge.parent.id] && positions[edge.child.id]);
  const partnerEdges = partnerships.map((partnership) => ({ partnership, first: people.find((person) => person.id === partnership.personIds[0]), second: people.find((person) => person.id === partnership.personIds[1]) })).filter((edge) => edge.first && edge.second && positions[edge.first.id] && positions[edge.second.id]);
  return <svg className="tree-connections" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><g className="parent-connections">{parentEdges.map(({ parent, child, type }) => { const from = positions[parent.id]; const to = positions[child.id]; const startX = from.left + from.width / 2; const startY = from.top + from.height; const endX = to.left + to.width / 2; const endY = to.top; const middleY = startY + Math.max(24, (endY - startY) / 2); return <path key={`${parent.id}-${child.id}-${type}`} className={`connection-line ${type === "adoptive" ? "connection-adoptive" : ""} ${type === "step" ? "connection-step" : ""}`} d={`M ${startX} ${startY} V ${middleY} H ${endX} V ${endY}`} />; })}</g><g className="partnership-connections">{partnerEdges.map(({ partnership, first, second }) => { const a = positions[first.id]; const b = positions[second.id]; const start = a.left < b.left ? a : b; const end = a.left < b.left ? b : a; const startX = start.left + start.width; const startY = start.top + start.height / 2; const endX = end.left; const endY = end.top + end.height / 2; const middleX = startX + Math.max(18, (endX - startX) / 2); const label = partnership.status === "divorced" ? "Развод" : partnershipTypeLabel[partnership.type] || "Связь"; return <g key={partnership.id}><path className={`connection-line connection-partnership ${partnership.status === "divorced" ? "connection-divorced" : ""}`} d={`M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}`} /><text className="partnership-label" x={middleX} y={Math.min(startY, endY) - 8} textAnchor="middle">{label}</text></g>; })}</g></svg>;
}

function TreeCanvas({ people, partnerships, selectedId, onSelect, zoom, onZoomChange, pan, onPanChange, treeStyle, showPhotos, focusRequest, inspectorOpen, onToggleInspector }) {
  const layout = useMemo(() => buildTreeLayout(people, partnerships), [people, partnerships]);
  const dragRef = useRef(null);
  const personDragRef = useRef(null);
  const viewportRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [personDraggingId, setPersonDraggingId] = useState("");
  const [manualOffsets, setManualOffsets] = useState({});
  const renderedPositions = useMemo(() => Object.fromEntries(Object.entries(layout.positions).map(([id, position]) => {
    const offset = manualOffsets[id] || { x: 0, y: 0 };
    return [id, { ...position, left: position.left + offset.x, top: position.top + offset.y }];
  })), [layout.positions, manualOffsets]);
  useEffect(() => {
    const knownIds = new Set(Object.keys(layout.positions));
    setManualOffsets((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([id]) => knownIds.has(id)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [layout.positions]);
  const getPanBounds = () => {
    const viewport = viewportRef.current;
    if (!viewport) return { minX: -900, maxX: 900, minY: -650, maxY: 650 };
    const edgePadding = 24;
    const boardRight = viewport.clientWidth - layout.width * zoom - edgePadding;
    const boardBottom = viewport.clientHeight - layout.height * zoom - edgePadding;
    return { minX: Math.min(edgePadding, boardRight), maxX: Math.max(edgePadding, boardRight), minY: Math.min(edgePadding, boardBottom), maxY: Math.max(edgePadding, boardBottom) };
  };
  const clampPan = (value) => { const bounds = getPanBounds(); return { x: Math.max(bounds.minX, Math.min(bounds.maxX, value.x)), y: Math.max(bounds.minY, Math.min(bounds.maxY, value.y)) }; };
  const movePan = (x, y) => onPanChange(clampPan({ x: pan.x + x, y: pan.y + y }));
  const onPointerDown = (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, pan };
    setDragging(true);
  };
  const onPersonPointerDown = (id, event) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const offset = manualOffsets[id] || { x: 0, y: 0 };
    const position = layout.positions[id];
    const group = layout.generations.find((generation) => generation.index === position?.generation);
    const index = group?.members.findIndex((member) => member.id === id) ?? -1;
    const previous = index > 0 ? layout.positions[group.members[index - 1].id] : null;
    const next = index >= 0 && index < group.members.length - 1 ? layout.positions[group.members[index + 1].id] : null;
    const minimumGap = 44;
    const minX = previous ? previous.left + previous.width + minimumGap - position.left : 24 - position.left;
    const maxX = next ? next.left - position.width - minimumGap - position.left : layout.width - position.width - 24 - position.left;
    personDragRef.current = { id, startX: event.clientX, startY: event.clientY, offset: { ...offset }, minX, maxX, captureTarget: event.currentTarget };
    setPersonDraggingId(id);
  };
  const onPersonPointerMove = (event) => {
    const drag = personDragRef.current;
    if (!drag) return;
    event.stopPropagation();
    const nextOffset = { x: Math.max(drag.minX, Math.min(drag.maxX, drag.offset.x + (event.clientX - drag.startX) / zoom)), y: drag.offset.y + (event.clientY - drag.startY) / zoom };
    drag.currentOffset = nextOffset;
    setManualOffsets((current) => ({ ...current, [drag.id]: nextOffset }));
  };
  const onPersonPointerEnd = (event) => {
    const drag = personDragRef.current;
    if (!drag) return;
    event.stopPropagation();
    drag.captureTarget?.releasePointerCapture?.(event.pointerId);
    const finalOffset = drag.currentOffset || drag.offset;
    const verticalSnapDistance = Math.max(52, layout.rowStep * 0.35);
    setManualOffsets((current) => {
      const next = { ...current };
      if (Math.abs(finalOffset.y) > verticalSnapDistance) delete next[drag.id];
      else next[drag.id] = { x: finalOffset.x, y: 0 };
      return next;
    });
    personDragRef.current = null;
    setPersonDraggingId("");
  };
  const onPointerMove = (event) => {
    if (personDragRef.current) {
      onPersonPointerMove(event);
      return;
    }
    if (!dragRef.current) return;
    onPanChange(clampPan({ x: dragRef.current.pan.x + event.clientX - dragRef.current.x, y: dragRef.current.pan.y + event.clientY - dragRef.current.y }));
  };
  const endDrag = (event) => {
    if (personDragRef.current) {
      onPersonPointerEnd(event);
      return;
    }
    if (dragRef.current) event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    setDragging(false);
  };
  const onWheel = (event) => {
    if (!event.deltaX && !event.deltaY) return;
    event.preventDefault();
    onPanChange(clampPan({ x: pan.x - event.deltaX, y: pan.y - event.deltaY }));
  };
  useEffect(() => {
    if (!focusRequest?.id || !viewportRef.current) return;
    const position = renderedPositions[focusRequest.id];
    if (!position) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const nextPan = {
      x: rect.width / 2 - (position.left + position.width / 2) * zoom,
      y: rect.height / 2 - (position.top + position.height / 2) * zoom,
    };
    onPanChange(clampPan(nextPan));
  }, [focusRequest?.token, layout, renderedPositions, zoom]);
  useEffect(() => {
    const nextPan = clampPan(pan);
    if (nextPan.x !== pan.x || nextPan.y !== pan.y) onPanChange(nextPan);
  }, [layout.width, layout.height, zoom, inspectorOpen]);
  const styleLabel = treeStyle === "album" ? "Семейный альбом" : treeStyle === "minimal" ? "Сдержанный" : "Классический";
  return (
    <section className={`tree-panel tree-style-${treeStyle}`}>
      <div className="tree-controls left-controls"><div className="pan-control"><IconButton label="Переместить вверх" onClick={() => movePan(0, -110)}><CaretUp size={18} /></IconButton><IconButton label="Переместить влево" onClick={() => movePan(-110, 0)}><CaretLeft size={18} /></IconButton><IconButton label="Переместить вправо" onClick={() => movePan(110, 0)}><CaretRight size={18} /></IconButton><IconButton label="Переместить вниз" onClick={() => movePan(0, 110)}><CaretDown size={18} /></IconButton></div><div className="zoom-control"><IconButton label="Увеличить" onClick={() => onZoomChange(Math.min(1.35, zoom + 0.08))}><Plus size={18} /></IconButton><span>{Math.round(zoom * 100)}%</span><IconButton label="Уменьшить" onClick={() => onZoomChange(Math.max(0.55, zoom - 0.08))}><Minus size={18} /></IconButton></div><IconButton label="По центру" className="center-control" onClick={() => { onPanChange({ x: 0, y: 0 }); onZoomChange(1); }}><Crosshair size={20} /></IconButton>{!inspectorOpen && <IconButton label="Открыть панель сведений" className="inspector-toggle-control" onClick={onToggleInspector}><Info size={20} /></IconButton>}</div>
      <div ref={viewportRef} className={`tree-viewport ${dragging ? "is-dragging" : ""}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onWheel={onWheel}><div className="tree-board" style={{ width: layout.width, height: layout.height, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}><TreeConnections people={people} partnerships={partnerships} positions={renderedPositions} width={layout.width} height={layout.height} />{layout.generations.map((group) => <span className="generation-label" key={group.index} style={{ top: layout.top - 38 + group.index * layout.rowStep, left: 24 }}>Поколение {group.index + 1}</span>)}{people.map((person) => renderedPositions[person.id] ? <TreeNode key={person.id} person={person} position={renderedPositions[person.id]} selected={person.id === selectedId} onSelect={onSelect} showPhotos={showPhotos} dragging={person.id === personDraggingId} onDragStart={onPersonPointerDown} onDragMove={onPersonPointerMove} onDragEnd={onPersonPointerEnd} /> : null)}</div></div>
      <div className="tree-status"><span><UsersThree size={17} /> Всего людей: {people.length}</span><span className="status-divider" /><span>Поколений: {layout.generations.length}</span><span className="tree-view-status">{showPhotos ? "Фото включены" : "Фото скрыты"} · {styleLabel}</span></div>
    </section>
  );
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function downloadProjectFile(payload, fileName) {
  const blob = new Blob([serializeProject(payload)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function ConfirmModal({ title, description, confirmLabel, onClose, onConfirm }) {
  return (
    <div className="backup-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="backup-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="backup-modal-header"><div><span className="eyebrow">Подтверждение действия</span><h2 id="confirm-modal-title">{title}</h2><p>{description}</p></div><button type="button" className="icon-button backup-close" onClick={onClose} aria-label="Закрыть подтверждение"><X size={21} /></button></div>
        <div className="confirm-actions"><button type="button" className="button button-ghost" onClick={onClose}>Отмена</button><button type="button" className="button danger-button" onClick={onConfirm}>{confirmLabel}</button></div>
      </section>
    </div>
  );
}

function MainMenuModal({ onCreate, onLoad, onSettings, onHelp, onExit, onClose }) {
  return (
    <div className="main-menu-backdrop" role="presentation" onClick={onClose}>
      <section className="main-menu-card" role="dialog" aria-modal="true" aria-labelledby="main-menu-title" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="icon-button main-menu-close" onClick={onClose} aria-label="Закрыть главное меню"><X size={21} /></button>
        <div className="main-menu-brand"><TreeStructure size={46} weight="fill" /><div><span className="eyebrow">Локальное приложение</span><h1 id="main-menu-title">Семейное древо</h1><p>Храните историю семьи на своём компьютере.</p></div></div>
        <div className="main-menu-list">
          <button type="button" className="main-menu-action main-menu-action-primary" onClick={onCreate}><Plus size={21} weight="bold" /><span><strong>Создать древо</strong><small>Начать новый семейный проект</small></span><CaretRight size={18} /></button>
          <button type="button" className="main-menu-action" onClick={onLoad}><FolderOpen size={21} /><span><strong>Загрузить древо</strong><small>Открыть сохранённый файл проекта</small></span><CaretRight size={18} /></button>
          <button type="button" className="main-menu-action" onClick={onSettings}><Note size={21} /><span><strong>Настройки</strong><small>Имя проекта, вид и автосохранение</small></span><CaretRight size={18} /></button>
          <button type="button" className="main-menu-action" onClick={onHelp}><Info size={21} /><span><strong>Инструкция для пользователей</strong><small>Пошаговое объяснение с иллюстрациями</small></span><CaretRight size={18} /></button>
          <button type="button" className="main-menu-action main-menu-action-exit" onClick={onExit}><X size={21} /><span><strong>Выход из приложения</strong><small>Закрыть окно программы</small></span></button>
        </div>
        <p className="main-menu-note">Проекты и резервные копии хранятся локально.</p>
      </section>
    </div>
  );
}

function UpdateModal({ status, onClose, onDownload, onInstall, onOpenReleases }) {
  const downloaded = status.state === "downloaded";
  const downloading = status.state === "downloading";
  const title = downloaded ? "Обновление готово" : downloading ? "Скачиваем обновление" : "Доступна новая версия";
  const description = downloaded
    ? "Новая версия уже загружена. Перезапустите приложение, чтобы установить её."
    : downloading
      ? "Приложение скачивает обновление с GitHub. Дерево можно оставить открытым."
      : "Для приложения вышла новая версия с исправлениями и улучшениями.";
  return (
    <div className="update-backdrop" role="presentation" onClick={onClose}>
      <section className="update-modal" role="dialog" aria-modal="true" aria-labelledby="update-modal-title" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="icon-button update-close" onClick={onClose} aria-label="Закрыть уведомление"><X size={21} /></button>
        <div className="update-icon"><DownloadSimple size={28} weight="bold" /></div>
        <span className="eyebrow">Обновление приложения</span>
        <h2 id="update-modal-title">{title}</h2>
        <p className="update-description">{description}</p>
        <div className="update-versions"><span>Текущая версия: <strong>{status.currentVersion || "—"}</strong></span><span>Новая версия: <strong>{status.version || "—"}</strong></span></div>
        {downloading && <div className="update-progress" aria-label="Ход скачивания"><div className="update-progress-track"><span style={{ width: (status.percent || 0) + "%" }} /></div><span>{status.percent || 0}%</span></div>}
        <div className="update-actions">
          <button type="button" className="button button-ghost" onClick={onOpenReleases}>Страница релиза</button>
          {!downloaded && <button type="button" className="button button-primary" onClick={onDownload} disabled={downloading}>{downloading ? "Скачивание…" : "Скачать обновление"}</button>}
          {downloaded && <button type="button" className="button button-primary" onClick={onInstall}>Перезапустить и обновить</button>}
        </div>
      </section>
    </div>
  );
}

const instructionSteps = [
  { image: "01-menu.svg", source: "source-01-menu.jpg", title: "Главное меню", text: "Здесь начинается работа с приложением. Меню можно открыть в любой момент кнопкой «Меню» или нажатием на логотип «Семейное древо».", tips: ["Создать древо — начать пустой проект.", "Загрузить древо — открыть файл .familytree.", "Настройки и инструкция доступны без закрытия проекта."] },
  { image: "02-project.svg", source: "source-02-project.jpg", title: "Создать, открыть и сохранить дерево", text: "После входа можно создать новое дерево, открыть ранее сохранённый файл или скачать текущий проект на компьютер.", tips: ["Файл проекта имеет расширение .familytree.", "Сохраняйте копию на внешний диск или флешку.", "Автосохранение работает отдельно от скачивания файла."] },
  { image: "03-person.svg", source: "source-03-person.jpg", title: "Добавить человека и сразу связать его", text: "При добавлении записи сначала выберите связь с уже известным человеком. Затем заполните только те поля, которые действительно известны.", tips: ["Можно добавить родителя, ребёнка или супруга/партнёра.", "Доступны биологическая связь, усыновление и степ-родство.", "Дата, место, профессия, фото и биография необязательны."] },
  { image: "04-tree.svg", source: "source-04-tree.jpg", title: "Смотреть дерево и перемещаться по полотну", text: "Дерево можно рассматривать как большое полотно: двигайте пустое место зажатой ЛКМ, меняйте масштаб и перетаскивайте карточки внутри своего поколения.", tips: ["Стрелки слева перемещают полотно небольшими шагами.", "Карточка не может наехать на соседнюю.", "Если потянуть её в другое поколение, она вернётся на свою строку."] },
  { image: "05-search.svg", source: "source-05-search.jpg", title: "Найти человека и показать его на карте", text: "Введите часть имени в строку поиска. После выбора записи правая панель покажет сведения, семейный статус, роли и ID связей.", tips: ["Нажмите «Показать найденного человека на карте», чтобы центрировать дерево.", "Нажатие на родственника в правой панели открывает его карточку.", "Панель можно закрыть крестиком и открыть снова кнопкой на полотне."] },
  { image: "06-relationships.svg", source: "source-06-relationships.jpg", title: "Управлять связями и удалять ошибочные записи", text: "Кнопка «Управлять связями» добавляет родство, брак, партнёрство или развод между уже существующими людьми.", tips: ["Степ-родство используется для отчима, мачехи, пасынка и падчерицы.", "Каждая связь получает отдельный ID.", "Удаление человека требует подтверждения и создаёт защитную копию."] },
  { image: "07-backups.svg", source: "source-07-backups.jpg", title: "Резервные копии и восстановление", text: "Приложение автоматически сохраняет локальные копии. Через меню «•••» можно открыть список, скачать копию или восстановить состояние дерева.", tips: ["Копии хранятся на этом компьютере.", "Перед важными действиями создаются дополнительные защитные копии.", "Для надёжности периодически скачивайте проект на внешний носитель."] },
  { image: "08-export-settings.svg", source: "source-08-export-settings.jpg", title: "Экспорт и настройки", text: "Кнопка «Экспорт» подготавливает файлы для альбома, типографии и печати. Настройки проекта находятся в меню и сохраняются локально.", tips: ["PNG подходит для семейного альбома.", "TIFF подходит для типографии.", "PDF можно сделать плакатом или разбить на листы."] },
];

function InstructionModal({ onClose }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const step = instructionSteps[activeIndex];
  const goTo = (index) => setActiveIndex(Math.max(0, Math.min(instructionSteps.length - 1, index)));
  return (
    <div className="instruction-backdrop" role="presentation" onClick={onClose}>
      <section className="instruction-card" role="dialog" aria-modal="true" aria-labelledby="instruction-title" onClick={(event) => event.stopPropagation()}>
        <header className="instruction-header"><div><span className="eyebrow">Пошаговая инструкция</span><h2 id="instruction-title">Как пользоваться семейным древом</h2><p>Выберите раздел слева или листайте кнопками «Назад» и «Далее».</p></div><button type="button" className="icon-button backup-close" onClick={onClose} aria-label="Закрыть инструкцию"><X size={22} /></button></header>
        <div className="instruction-layout">
          <nav className="instruction-nav" aria-label="Разделы инструкции">{instructionSteps.map((item, index) => <button type="button" key={item.image} className={`instruction-nav-item ${index === activeIndex ? "selected" : ""}`} onClick={() => goTo(index)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.title}</strong></button>)}</nav>
          <article className="instruction-page"><div className="instruction-image-frame"><div className="instruction-image-stage"><img className="instruction-source-image" src={`/instruction/${step.source}`} alt={`Экран приложения: ${step.title}`} /><img className="instruction-overlay-image" src={`/instruction/${step.image}`} alt="" aria-hidden="true" /></div></div><div className="instruction-copy"><span className="instruction-counter">Шаг {activeIndex + 1} из {instructionSteps.length}</span><h3>{step.title}</h3><p>{step.text}</p><ul>{step.tips.map((tip) => <li key={tip}><CheckCircle size={17} weight="fill" />{tip}</li>)}</ul></div></article>
        </div>
        <footer className="instruction-footer"><button type="button" className="button button-ghost" onClick={() => goTo(activeIndex - 1)} disabled={activeIndex === 0}><CaretLeft size={18} /> Назад</button><div className="instruction-dots" aria-label="Прогресс инструкции">{instructionSteps.map((item, index) => <button type="button" key={item.image} className={index === activeIndex ? "selected" : ""} onClick={() => goTo(index)} aria-label={`Перейти к шагу ${index + 1}`} />)}</div><button type="button" className="button button-primary" onClick={() => activeIndex === instructionSteps.length - 1 ? onClose() : goTo(activeIndex + 1)}>{activeIndex === instructionSteps.length - 1 ? "Завершить" : "Далее"} <CaretRight size={18} /></button></footer>
      </section>
    </div>
  );
}

function BackupModal({ backups, onClose, onRestore, onDownload }) {
  const reasonLabels = { auto: "Автокопия", save: "После сохранения", "before-open": "Перед открытием", "before-restore": "Перед восстановлением", "before-delete": "Перед удалением", "before-new": "Перед созданием нового дерева" };
  return (
    <div className="backup-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="backup-modal" role="dialog" aria-modal="true" aria-labelledby="backup-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="backup-modal-header"><div><span className="eyebrow">Локальное хранение</span><h2 id="backup-modal-title">Резервные копии</h2><p>Копии хранятся на этом компьютере в текущем браузере.</p></div><button type="button" className="icon-button backup-close" onClick={onClose} aria-label="Закрыть резервные копии"><X size={21} /></button></div>
        {backups.length === 0 ? <div className="backup-empty"><ClockCounterClockwise size={32} /><strong>Автоматических копий пока нет</strong><span>После изменения данных копия появится здесь автоматически.</span></div> : <div className="backup-list">{backups.map((backup) => <article className="backup-item" key={backup.id}><div className="backup-item-icon"><ClockCounterClockwise size={19} /></div><div className="backup-meta"><strong>{formatDateTime(backup.createdAt)}</strong><span>{reasonLabels[backup.reason] || "Резервная копия"} · людей: {backup.peopleCount}</span></div><div className="backup-actions"><button type="button" className="button button-ghost" onClick={() => onDownload(backup)}><DownloadSimple size={17} /> Скачать</button><button type="button" className="button button-secondary" onClick={() => onRestore(backup)}>Восстановить</button></div></article>)}</div>}
        <div className="backup-note"><Info size={16} /> Для защиты от потери данных периодически сохраняйте файл проекта на внешний диск или флешку.</div>
      </section>
    </div>
  );
}

function ViewSettingsModal({ treeStyle, showPhotos, onTreeStyleChange, onShowPhotosChange, onClose }) {
  const styles = [{ value: "classic", title: "Классический", description: "Чёткие карточки и спокойные линии" }, { value: "album", title: "Семейный альбом", description: "Тёплая бумажная палитра и цветные фото" }, { value: "minimal", title: "Сдержанный", description: "Больше воздуха и меньше декоративных деталей" }];
  return (
    <div className="backup-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="backup-modal view-settings-modal" role="dialog" aria-modal="true" aria-labelledby="view-settings-title" onClick={(event) => event.stopPropagation()}>
        <div className="backup-modal-header"><div><span className="eyebrow">Визуализация дерева</span><h2 id="view-settings-title">Настроить вид</h2><p>Выберите, как показывать семейные карточки на полотне.</p></div><button type="button" className="icon-button backup-close" onClick={onClose} aria-label="Закрыть настройки вида"><X size={21} /></button></div>
        <div className="view-settings-body"><label className="view-toggle"><input type="checkbox" checked={showPhotos} onChange={(event) => onShowPhotosChange(event.target.checked)} /><span><strong>Показывать фотографии</strong><small>Фото будут видны на карточках людей и в дереве.</small></span></label><div className="view-setting-group"><span className="field-label">Стиль карточек</span><div className="style-choice-list">{styles.map((style) => <button type="button" key={style.value} className={`style-choice ${treeStyle === style.value ? "selected" : ""}`} onClick={() => onTreeStyleChange(style.value)}><span className="style-choice-preview" data-style={style.value} /><span><strong>{style.title}</strong><small>{style.description}</small></span></button>)}</div></div></div>
        <div className="view-settings-footer"><button type="button" className="button button-primary" onClick={onClose}>Готово</button></div>
      </section>
    </div>
  );
}

function ProjectSettingsModal({ projectMeta, autoSaveEnabled, treeStyle, showPhotos, onSave, onClose }) {
  const [title, setTitle] = useState(projectMeta.title || "Моё семейное древо");
  const [autoSave, setAutoSave] = useState(autoSaveEnabled);
  const [nextTreeStyle, setNextTreeStyle] = useState(treeStyle);
  const [nextShowPhotos, setNextShowPhotos] = useState(showPhotos);
  const [error, setError] = useState("");
  const styles = [{ value: "classic", title: "Классический", description: "Чёткие карточки и спокойные линии" }, { value: "album", title: "Семейный альбом", description: "Тёплая бумажная палитра и цветные фото" }, { value: "minimal", title: "Сдержанный", description: "Больше воздуха и меньше декоративных деталей" }];
  const save = () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length > 120) {
      setError("Название проекта должно быть не длиннее 120 знаков.");
      return;
    }
    if (/[\u0000-\u001F]/.test(trimmedTitle)) {
      setError("Название проекта содержит недопустимые символы.");
      return;
    }
    onSave({ title: trimmedTitle, autoSave, treeStyle: nextTreeStyle, showPhotos: nextShowPhotos });
  };
  return (
    <div className="backup-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="backup-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="project-settings-title" onClick={(event) => event.stopPropagation()}>
        <div className="backup-modal-header"><div><span className="eyebrow">Параметры проекта</span><h2 id="project-settings-title">Настройки</h2><p>Основные настройки сохраняются в локальной копии проекта.</p></div><button type="button" className="icon-button backup-close" onClick={onClose} aria-label="Закрыть настройки"><X size={21} /></button></div>
        <div className="view-settings-body settings-body">
          <label className={`field settings-title-field ${error ? "has-error" : ""}`}><span>Название проекта</span><input value={title} onChange={(event) => { setTitle(event.target.value); setError(""); }} placeholder="Например, Семья Петровых" aria-invalid={Boolean(error)} />{error && <small className="field-error">{error}</small>}</label>
          <label className="view-toggle"><input type="checkbox" checked={autoSave} onChange={(event) => setAutoSave(event.target.checked)} /><span><strong>Автоматически сохранять изменения</strong><small>Локальная копия и резервная копия создаются после изменений.</small></span></label>
          <label className="view-toggle"><input type="checkbox" checked={nextShowPhotos} onChange={(event) => setNextShowPhotos(event.target.checked)} /><span><strong>Показывать фотографии</strong><small>Фото будут видны на карточках людей и в дереве.</small></span></label>
          <div className="view-setting-group"><span className="field-label">Стиль карточек</span><div className="style-choice-list">{styles.map((style) => <button type="button" key={style.value} className={`style-choice ${nextTreeStyle === style.value ? "selected" : ""}`} onClick={() => setNextTreeStyle(style.value)}><span className="style-choice-preview" data-style={style.value} /><span><strong>{style.title}</strong><small>{style.description}</small></span></button>)}</div></div>
        </div>
        <div className="view-settings-footer"><button type="button" className="button button-ghost" onClick={onClose}>Отмена</button><button type="button" className="button button-primary" onClick={save}>Сохранить настройки</button></div>
      </section>
    </div>
  );
}

function ExportModal({ initialFormat = "pdf", people, partnerships, treeStyle, showPhotos, onClose, onToast }) {
  const [format, setFormat] = useState(initialFormat);
  const [quality, setQuality] = useState(initialFormat === "print" ? "print" : "print");
  const [pdfMode, setPdfMode] = useState(initialFormat === "print" ? "tiles" : "poster");
  const [paper, setPaper] = useState("a4");
  const [orientation, setOrientation] = useState("landscape");
  const [busy, setBusy] = useState(false);
  const layout = useMemo(() => buildTreeLayout(people, partnerships), [people, partnerships]);
  const qualityInfo = EXPORT_QUALITY[quality] || EXPORT_QUALITY.print;
  const pixelWidth = Math.round(layout.width * qualityInfo.scale);
  const pixelHeight = Math.round(layout.height * qualityInfo.scale);
  const tileSize = PAPER_SIZES[paper] || PAPER_SIZES.a4;
  const pageWidth = orientation === "landscape" ? tileSize.height : tileSize.width;
  const pageHeight = orientation === "landscape" ? tileSize.width : tileSize.height;
  const pageCount = pdfMode === "poster" && format === "pdf" ? 1 : Math.ceil(pixelWidth / (pageWidth * 2)) * Math.ceil(pixelHeight / (pageHeight * 2));
  const formatOptions = [
    { value: "pdf", title: "PDF", description: "плакат или листы" },
    { value: "png", title: "PNG", description: "изображение для альбома" },
    { value: "tiff", title: "TIFF", description: "для типографии" },
    { value: "print", title: "Печать по листам", description: "многостраничный PDF" },
  ];

  const runExport = async () => {
    setBusy(true);
    try {
      const rendered = await renderTreeImage({ people, partnerships, layout, treeStyle, showPhotos, scale: qualityInfo.scale });
      const baseName = `семейное-древо-${new Date().toISOString().slice(0, 10)}`;
      if (format === "png") {
        downloadBlob(await canvasToBlob(rendered.canvas, "image/png"), `${baseName}.png`);
        onToast("PNG-файл подготовлен");
      } else if (format === "tiff") {
        downloadBlob(canvasToTiff(rendered.canvas), `${baseName}.tiff`);
        onToast("TIFF-файл подготовлен");
      } else {
        const mode = format === "print" ? "tiles" : pdfMode;
        const pdf = await buildPdfFromCanvas(rendered.canvas, { mode, paper, orientation });
        const suffix = mode === "poster" ? "плакат" : "печать";
        downloadBlob(pdf, `${baseName}-${suffix}.pdf`);
        onToast(mode === "poster" ? "PDF-плакат подготовлен" : "PDF для печати подготовлен");
      }
      onClose();
    } catch (error) {
      onToast(error.message || "Не удалось подготовить файл");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="backup-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="backup-modal export-modal" role="dialog" aria-modal="true" aria-labelledby="export-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="backup-modal-header"><div><span className="eyebrow">Локальный экспорт</span><h2 id="export-modal-title">Экспорт семейного дерева</h2><p>Файл создаётся на этом компьютере из текущего вида дерева.</p></div><button type="button" className="icon-button backup-close" onClick={onClose} aria-label="Закрыть экспорт"><X size={21} /></button></div>
        <div className="export-modal-body">
          <div className="export-setting-group"><span className="field-label">Формат</span><div className="export-format-list">{formatOptions.map((option) => <button type="button" key={option.value} className={`export-choice ${format === option.value ? "selected" : ""}`} onClick={() => { setFormat(option.value); if (option.value === "print") setPdfMode("tiles"); }}><strong>{option.title}</strong><small>{option.description}</small></button>)}</div></div>
          <div className="export-setting-group"><span className="field-label">Качество изображения</span><div className="export-quality-list">{Object.entries(EXPORT_QUALITY).map(([value, info]) => <button type="button" key={value} className={`export-choice export-quality-choice ${quality === value ? "selected" : ""}`} onClick={() => setQuality(value)}><strong>{info.label}</strong><small>{info.description}</small></button>)}</div></div>
          {(format === "pdf" || format === "print") && <div className="export-setting-group"><span className="field-label">Разметка страниц</span>{format === "pdf" && <div className="export-mode-list"><button type="button" className={`export-choice ${pdfMode === "poster" ? "selected" : ""}`} onClick={() => setPdfMode("poster")}><strong>Большой плакат</strong><small>Всё дерево на одном огромном листе</small></button><button type="button" className={`export-choice ${pdfMode === "tiles" ? "selected" : ""}`} onClick={() => setPdfMode("tiles")}><strong>Листы по страницам</strong><small>Разбить дерево на страницы для печати</small></button></div>}<div className="export-form-grid"><label className="field"><span>Размер листа</span><select value={paper} onChange={(event) => setPaper(event.target.value)}><option value="a4">A4</option><option value="a3">A3</option><option value="a2">A2</option></select></label><label className="field"><span>Ориентация</span><select value={orientation} onChange={(event) => setOrientation(event.target.value)}><option value="landscape">Альбомная</option><option value="portrait">Книжная</option></select></label></div></div>}
          <div className="export-summary"><div><strong>{pixelWidth.toLocaleString("ru-RU")} × {pixelHeight.toLocaleString("ru-RU")} пикселей</strong><span>Текущее дерево: {people.length} человек · {layout.generations.length} поколения</span></div>{(format === "pdf" || format === "print") && <span>{pdfMode === "poster" && format === "pdf" ? "1 лист-плакат" : `${pageCount} ${pageCount === 1 ? "лист" : pageCount < 5 ? "листа" : "листов"}`}</span>}</div>
          <div className="backup-note"><Info size={16} /> PNG подходит для семейного альбома, TIFF — для типографии, PDF — для домашней печати и большого плаката.</div>
        </div>
        <div className="export-footer"><button type="button" className="button button-ghost" onClick={onClose} disabled={busy}>Отмена</button><button type="button" className="button button-primary" onClick={runExport} disabled={busy}>{busy ? "Подготавливаю…" : "Создать файл"}</button></div>
      </section>
    </div>
  );
}

export function App() {
  const [loadedSession] = useState(() => readWorkingCopy());
  const sessionPeople = loadedSession?.people?.length ? loadedSession.people : initialPeople;
  const sessionPartnerships = loadedSession ? (loadedSession.partnerships || []) : initialPartnerships;
  const sessionProject = loadedSession?.project || { id: "local-family-tree", title: "Моё семейное древо", fileName: "семейное-древо.familytree" };
  const sessionSettings = { ...defaultProjectSettings, ...(sessionProject.settings || {}) };
  const [people, setPeople] = useState(sessionPeople);
  const [partnerships, setPartnerships] = useState(sessionPartnerships);
  const [projectMeta, setProjectMeta] = useState({ ...sessionProject, settings: sessionSettings });
  const [selectedId, setSelectedId] = useState(sessionPeople.find((person) => person.id === "ivan")?.id || sessionPeople[0]?.id || "");
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [focusRequest, setFocusRequest] = useState(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [treeStyle, setTreeStyle] = useState(sessionSettings.treeStyle || "classic");
  const [showPhotos, setShowPhotos] = useState(sessionSettings.showPhotos !== false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(sessionSettings.autoSave !== false);
  const [editing, setEditing] = useState(false);
  const [relationshipEditing, setRelationshipEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [relationshipMode, setRelationshipMode] = useState("");
  const [relationshipType, setRelationshipType] = useState("biological");
  const [partnershipType, setPartnershipType] = useState("marriage");
  const [connectionTargetId, setConnectionTargetId] = useState("");
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportPreset, setExportPreset] = useState("pdf");
  const [moreOpen, setMoreOpen] = useState(false);
  const [mainMenuOpen, setMainMenuOpen] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState("");
  const [newTreeConfirmOpen, setNewTreeConfirmOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(loadedSession?.savedAt || null);
  const [lastBackupAt, setLastBackupAt] = useState(() => readBackups()[0]?.createdAt || null);
  const [backups, setBackups] = useState(() => readBackups());
  const [backupOpen, setBackupOpen] = useState(false);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [instructionOpen, setInstructionOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const fileInputRef = useRef(null);
  const selectedPerson = people.find((person) => person.id === selectedId) || people[0];
  const treeLayout = useMemo(() => buildTreeLayout(people, partnerships), [people, partnerships]);
  const searchResults = useMemo(() => { const value = query.trim().toLocaleLowerCase("ru"); if (!value) return []; return people.filter((person) => `${person.name || "Человек без имени"} ${person.place || ""} ${person.year || ""}`.toLocaleLowerCase("ru").includes(value)).slice(0, 6); }, [people, query]);
  const updateViewSetting = (field, value) => {
    setProjectMeta((current) => ({ ...current, settings: { ...defaultProjectSettings, ...(current.settings || {}), [field]: value } }));
    if (field === "treeStyle") setTreeStyle(value);
    if (field === "showPhotos") setShowPhotos(value);
    setDirty(true);
  };
  const saveProjectSettings = ({ title, autoSave, treeStyle: nextTreeStyle, showPhotos: nextShowPhotos }) => {
    const nextTitle = String(title || "").trim() || "Моё семейное древо";
    const nextMeta = { ...projectMeta, title: nextTitle, settings: { ...defaultProjectSettings, ...(projectMeta.settings || {}), autoSave, treeStyle: nextTreeStyle, showPhotos: nextShowPhotos } };
    setProjectMeta(nextMeta);
    setAutoSaveEnabled(autoSave);
    setTreeStyle(nextTreeStyle);
    setShowPhotos(nextShowPhotos);
    const payload = createProjectPayload(people, nextMeta, partnerships);
    writeWorkingCopy(payload);
    setLastSavedAt(payload.manifest.updatedAt);
    setDirty(false);
    setSettingsOpen(false);
    setToast("Настройки сохранены");
  };

  useEffect(() => { if (!toast) return undefined; const timeout = window.setTimeout(() => setToast(""), 2600); return () => window.clearTimeout(timeout); }, [toast]);
  useEffect(() => { if (!loadedSession) return undefined; const timeout = window.setTimeout(() => setToast("Локальная рабочая копия восстановлена"), 250); return () => window.clearTimeout(timeout); }, [loadedSession]);
  useEffect(() => {
    const desktop = window.familyTreeDesktop;
    if (!desktop?.onUpdateStatus) return undefined;
    const unsubscribe = desktop.onUpdateStatus((status) => {
      setUpdateStatus(status);
      if (status.state === "available" || status.state === "downloaded") setUpdateOpen(true);
      if (status.state === "not-available") setToast("Установлена последняя версия приложения");
      if (status.state === "error") setToast("Не удалось проверить обновления");
    });
    return unsubscribe;
  }, []);
  useEffect(() => {
    if (!dirty || !autoSaveEnabled) return undefined;
    const timeout = window.setTimeout(() => {
      const payload = createProjectPayload(people, projectMeta, partnerships);
      writeWorkingCopy(payload);
      const backup = addBackup(payload, "auto");
      setLastBackupAt(backup?.createdAt || null);
      setBackups(readBackups());
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [dirty, autoSaveEnabled, people, projectMeta, partnerships]);

  const checkForUpdates = async () => {
    if (!window.familyTreeDesktop?.checkForUpdates) {
      setToast("Проверка обновлений доступна в установленном приложении");
      return;
    }
    setToast("Проверяем обновления…");
    try {
      await window.familyTreeDesktop.checkForUpdates();
    } catch {
      setToast("Не удалось проверить обновления");
    }
  };
  const downloadUpdate = async () => {
    try {
      await window.familyTreeDesktop?.downloadUpdate?.();
    } catch {
      setToast("Не удалось скачать обновление");
    }
  };
  const installUpdate = async () => {
    try {
      await window.familyTreeDesktop?.installUpdate?.();
    } catch {
      setToast("Не удалось установить обновление");
    }
  };
  const openReleasesPage = async () => {
    if (window.familyTreeDesktop?.openReleases) {
      await window.familyTreeDesktop.openReleases();
      return;
    }
    window.open("https://github.com/teru1337/family-tree-desktop/releases", "_blank", "noopener,noreferrer");
  };
  const selectPerson = (id) => { setSelectedId(id); setQuery(""); setEditing(false); setRelationshipEditing(false); setInspectorOpen(true); };
  const focusPersonOnMap = (id) => { const person = people.find((item) => item.id === id); if (!person) return; setSelectedId(id); setQuery(""); setInspectorOpen(true); setFocusRequest((current) => ({ id, token: (current?.token || 0) + 1 })); setToast(`Человек показан на карте: ${person.name || "без имени"}`); };
  const openEditor = (person = null, relation = "") => { setDraft(person ? { ...person } : { ...blankPerson, id: "" }); setRelationshipMode(relation); setRelationshipType("biological"); setPartnershipType("marriage"); setConnectionTargetId(person ? "" : selectedPerson?.id || people[0]?.id || ""); setRelationshipEditing(false); setInspectorOpen(true); setEditing(true); };
  const closeInspector = () => { setEditing(false); setRelationshipEditing(false); setDraft(null); setRelationshipMode(""); setRelationshipType("biological"); setPartnershipType("marriage"); setConnectionTargetId(""); setInspectorOpen(false); };
  const requestDelete = (id) => { if (people.some((person) => person.id === id)) setDeleteConfirmId(id); };
  const deletePerson = () => {
    const personToDelete = people.find((person) => person.id === deleteConfirmId);
    if (!personToDelete) return;
    const backup = addBackup(buildPayload(), "before-delete");
    const nextPeople = people.filter((person) => person.id !== deleteConfirmId).map((person) => ({
      ...person,
      parentIds: (person.parentIds || []).filter((id) => id !== deleteConfirmId),
      parentLinks: (person.parentLinks || []).filter((link) => link.personId !== deleteConfirmId),
      partnerIds: (person.partnerIds || []).filter((id) => id !== deleteConfirmId),
      childIds: (person.childIds || []).filter((id) => id !== deleteConfirmId),
    }));
    const nextPartnerships = partnerships.filter((partnership) => !partnership.personIds.includes(deleteConfirmId));
    const fallbackId = [personToDelete.parentIds?.[0], personToDelete.partnerIds?.[0], personToDelete.childIds?.[0]].find((id) => nextPeople.some((person) => person.id === id)) || nextPeople[0]?.id || "";
    setPeople(nextPeople);
    setPartnerships(nextPartnerships);
    setSelectedId(fallbackId);
    setEditing(false);
    setRelationshipEditing(false);
    setDraft(null);
    setRelationshipMode("");
    setRelationshipType("biological");
    setPartnershipType("marriage");
    setConnectionTargetId("");
    setDeleteConfirmId("");
    setBackups(readBackups());
    setLastBackupAt(backup?.createdAt || null);
    setDirty(true);
    setToast(`Удалён человек: ${personToDelete.name || "без имени"}`);
  };
  const savePerson = () => {
    const validationErrors = validatePersonDraft(draft, { isNew: !draft?.id, relationshipMode, connectionTargetId });
    if (Object.keys(validationErrors).length) { setToast("Проверьте заполненные поля"); return; }
    const normalizedName = draft.name.trim() || "Человек без имени";
    const personToSave = { ...draft, name: normalizedName, shortName: normalizedName };
    if (personToSave.id) { setPeople((current) => current.map((person) => person.id === personToSave.id ? personToSave : person)); setSelectedId(personToSave.id); setToast("Изменения сохранены"); } else {
      const newId = makeId(); const newPerson = { ...personToSave, id: newId };
      const relationTarget = people.find((person) => person.id === connectionTargetId);
      const selectedRelationType = relationshipType || "biological";
      setPeople((current) => {
        const next = current.map((person) => ({ ...person, parentIds: [...(person.parentIds || [])], parentLinks: [...(person.parentLinks || (person.parentIds || []).map((personId) => ({ id: makeParentLinkId(person.id, personId, "biological"), personId, type: "biological" })))], partnerIds: [...(person.partnerIds || [])], childIds: [...(person.childIds || [])] }));
        if (relationTarget && relationshipMode === "child") {
          if (selectedRelationType === "biological") newPerson.parentIds = addUniqueId(newPerson.parentIds, relationTarget.id);
          newPerson.parentLinks = addParentLink(newPerson.parentLinks, relationTarget.id, selectedRelationType, newId);
          next.forEach((person) => { if (person.id === relationTarget.id) person.childIds = addUniqueId(person.childIds, newId); });
        }
        if (relationTarget && relationshipMode === "parent") {
          newPerson.childIds = addUniqueId(newPerson.childIds, relationTarget.id);
          next.forEach((person) => { if (person.id === relationTarget.id) { if (selectedRelationType === "biological") person.parentIds = addUniqueId(person.parentIds, newId); person.parentLinks = addParentLink(person.parentLinks, newId, selectedRelationType, person.id); } });
        }
        if (relationTarget && relationshipMode === "partner") {
          newPerson.partnerIds = addUniqueId(newPerson.partnerIds, relationTarget.id);
          next.forEach((person) => { if (person.id === relationTarget.id) person.partnerIds = addUniqueId(person.partnerIds, newId); });
        }
        return [...next, newPerson];
      });
      if (relationTarget && relationshipMode === "partner") setPartnerships((current) => [...current, { id: `partnership-${relationTarget.id}-${newId}`, personIds: [relationTarget.id, newId], type: partnershipType, status: "active", startDate: "", startDatePrecision: "unknown", endDate: "", endDatePrecision: "unknown" }]);
      setSelectedId(newId); setToast("Человек добавлен в дерево");
    }
    setDirty(true);
    setEditing(false); setDraft(null); setRelationshipMode(""); setRelationshipType("biological"); setPartnershipType("marriage"); setConnectionTargetId("");
  };
  const saveRelationship = ({ kind, targetId, parentType, startDate, startDatePrecision, endDate, endDatePrecision }) => {
    if (!selectedPerson || !targetId) return;
    if (kind === "parent" || kind === "child") {
      const parentId = kind === "parent" ? targetId : selectedPerson.id;
      const childId = kind === "parent" ? selectedPerson.id : targetId;
      setPeople((current) => current.map((person) => {
        if (person.id === childId) {
          const parentIds = parentType === "biological" ? addUniqueId(person.parentIds, parentId) : [...(person.parentIds || [])];
          const existingLinks = person.parentLinks || (person.parentIds || []).map((personId) => ({ id: makeParentLinkId(childId, personId, "biological"), personId, type: "biological" }));
          return { ...person, parentIds, parentLinks: addParentLink(existingLinks, parentId, parentType, childId) };
        }
        if (person.id === parentId) return { ...person, childIds: addUniqueId(person.childIds, childId) };
        return person;
      }));
      setToast(parentType === "adoptive" ? "Усыновление добавлено" : parentType === "step" ? "Степ-родство добавлено" : "Родственная связь добавлена");
    } else if (kind === "marriage" || kind === "partnership") {
      setPeople((current) => current.map((person) => person.id === selectedPerson.id ? { ...person, partnerIds: addUniqueId(person.partnerIds, targetId) } : person.id === targetId ? { ...person, partnerIds: addUniqueId(person.partnerIds, selectedPerson.id) } : person));
      const pair = [selectedPerson.id, targetId];
      setPartnerships((current) => {
        const existingIndex = [...current].map((partnership, index) => ({ partnership, index })).reverse().find(({ partnership }) => partnership.status === "active" && pair.every((id) => partnership.personIds.includes(id)))?.index;
        if (existingIndex !== undefined) return current.map((partnership, index) => index === existingIndex ? { ...partnership, type: kind, startDate: startDate || partnership.startDate || "", startDatePrecision: startDatePrecision || partnership.startDatePrecision || "unknown" } : partnership);
        return [...current, { id: `partnership-${makeId()}`, personIds: pair, type: kind, status: "active", startDate: startDate || "", startDatePrecision: startDatePrecision || "unknown", endDate: "", endDatePrecision: "unknown" }];
      });
      setToast(kind === "marriage" ? "Брак добавлен" : "Партнёрство добавлено");
    } else if (kind === "divorce") {
      setPartnerships((current) => {
        const index = [...current].map((partnership, itemIndex) => ({ partnership, itemIndex })).reverse().find(({ partnership }) => partnership.status === "active" && partnership.personIds.includes(selectedPerson.id) && partnership.personIds.includes(targetId))?.itemIndex;
        if (index === undefined) return current;
        return current.map((partnership, itemIndex) => itemIndex === index ? { ...partnership, status: "divorced", endDate: endDate || "", endDatePrecision: endDatePrecision || "unknown" } : partnership);
      });
      setToast("Развод отмечен в истории семьи");
    }
    setDirty(true);
    setRelationshipEditing(false);
  };
  const buildPayload = () => createProjectPayload(people, projectMeta, partnerships);
  const commitLocalSave = (payload, reason = "save") => {
    writeWorkingCopy(payload);
    const backup = addBackup(payload, reason);
    setBackups(readBackups());
    setLastBackupAt(backup?.createdAt || null);
    setLastSavedAt(payload.manifest.updatedAt);
    setProjectMeta(payload.project);
    setDirty(false);
  };
  const saveProject = () => {
    const payload = buildPayload();
    downloadProjectFile(payload, projectMeta.fileName || "семейное-древо.familytree");
    commitLocalSave(payload);
    setToast(`Проект сохранён: ${projectMeta.fileName || "семейное-древо.familytree"}`);
  };
  const saveCopy = () => {
    const payload = buildPayload();
    downloadProjectFile(payload, "семейное-древо-копия.familytree");
    const backup = addBackup(payload, "save");
    setBackups(readBackups());
    setLastBackupAt(backup?.createdAt || null);
    setToast("Копия проекта подготовлена");
  };
  const openProject = () => fileInputRef.current?.click();
  const handleFileSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (dirty) {
        const backup = addBackup(buildPayload(), "before-open");
        setBackups(readBackups());
        setLastBackupAt(backup?.createdAt || null);
      }
      const payload = normalizeProject(JSON.parse(await file.text()));
      const loadedSettings = { ...defaultProjectSettings, ...(payload.project.settings || {}) };
      setPeople(payload.people);
      setPartnerships(payload.partnerships || []);
      setProjectMeta({ ...payload.project, fileName: file.name, settings: loadedSettings });
      setTreeStyle(loadedSettings.treeStyle || "classic");
      setShowPhotos(loadedSettings.showPhotos !== false);
      setAutoSaveEnabled(loadedSettings.autoSave !== false);
      setSelectedId(payload.people.find((person) => person.id === "ivan")?.id || payload.people[0]?.id || "");
      setEditing(false);
      setDraft(null);
      writeWorkingCopy({ ...payload, project: { ...payload.project, fileName: file.name } });
      setLastSavedAt(payload.manifest.updatedAt);
      setDirty(false);
      setMainMenuOpen(false);
      setToast(`Открыт проект: ${file.name}`);
    } catch (error) {
      setToast(error.message || "Не удалось открыть файл проекта");
    } finally {
      event.target.value = "";
    }
  };
  const restoreBackup = (backup) => {
    const currentBackup = addBackup(buildPayload(), "before-restore");
    const payload = normalizeProject(backup.payload);
    const restoredSettings = { ...defaultProjectSettings, ...(payload.project.settings || {}) };
    setPeople(payload.people);
    setPartnerships(payload.partnerships || []);
    setProjectMeta({ ...payload.project, settings: restoredSettings });
    setTreeStyle(restoredSettings.treeStyle || "classic");
    setShowPhotos(restoredSettings.showPhotos !== false);
    setAutoSaveEnabled(restoredSettings.autoSave !== false);
    setSelectedId(payload.people.find((person) => person.id === "ivan")?.id || payload.people[0]?.id || "");
    setEditing(false);
    setDraft(null);
    writeWorkingCopy(payload);
    setLastSavedAt(payload.manifest.updatedAt);
    setLastBackupAt(currentBackup?.createdAt || backup.createdAt);
    setBackups(readBackups());
    setDirty(false);
    setBackupOpen(false);
    setToast("Резервная копия восстановлена");
  };
  const downloadBackup = (backup) => downloadProjectFile(backup.payload, `резервная-копия-${backup.createdAt.slice(0, 10)}.familytree`);
  const openExport = (format = "pdf") => { setExportPreset(format); setExportModalOpen(true); setMoreOpen(false); };
  const openInstruction = () => { setMainMenuOpen(false); setMoreOpen(false); setInstructionOpen(true); };
  const openSettings = () => { setMainMenuOpen(false); setMoreOpen(false); setSettingsOpen(true); };
  const createNewTree = () => {
    if (people.length) {
      setMainMenuOpen(false);
      setNewTreeConfirmOpen(true);
      return;
    }
    applyNewTree();
  };
  const applyNewTree = () => {
    if (people.length) {
      const backup = addBackup(buildPayload(), "before-new");
      setBackups(readBackups());
      setLastBackupAt(backup?.createdAt || null);
    }
    setPeople([]);
    setPartnerships([]);
    setProjectMeta({ id: "local-family-tree", title: "Моё семейное древо", fileName: "семейное-древо.familytree", settings: { ...defaultProjectSettings, autoSave: autoSaveEnabled, treeStyle, showPhotos } });
    setSelectedId("");
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setEditing(false);
    setRelationshipEditing(false);
    setDraft(null);
    setRelationshipMode("");
    setRelationshipType("biological");
    setPartnershipType("marriage");
    setConnectionTargetId("");
    setDeleteConfirmId("");
    setNewTreeConfirmOpen(false);
    setMainMenuOpen(false);
    setDirty(true);
    setToast("Новое дерево создано");
  };
  const exitApplication = () => {
    setMainMenuOpen(false);
    if (window.familyTreeDesktop?.close) {
      window.familyTreeDesktop.close();
      return;
    }
    window.close();
    window.setTimeout(() => setToast("Чтобы завершить работу, закройте окно приложения."), 120);
  };

  return (
    <div className="app-window" onClick={() => { if (moreOpen) setMoreOpen(false); }}>
      <div className="window-bar"><div className="window-title"><TreeStructure size={18} weight="fill" /><span>Семейное древо</span></div><div className="window-controls"><Minus size={15} /><Square size={12} /><X size={15} /></div></div>
       <header className="app-header" onClick={(event) => event.stopPropagation()}>
         <button type="button" className="brand brand-button" onClick={() => setMainMenuOpen(true)} aria-label="Открыть главное меню"><TreeStructure size={42} weight="fill" /><span>Семейное древо</span></button>
         <div className="header-divider" />
         <button type="button" className="button button-primary add-person-button" onClick={() => openEditor()}><Plus size={20} weight="bold" /> Добавить человека</button>
         <button type="button" className="button button-secondary file-button" onClick={openProject}><FolderOpen size={18} /> Открыть проект</button>
         <button type="button" className="button button-primary save-project-button" onClick={saveProject}><FloppyDisk size={18} weight="bold" /> Сохранить проект</button>
         <div className="search-wrap"><MagnifyingGlass size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по именам..." aria-label="Поиск по именам" />{query && <button className="clear-search" type="button" onClick={() => setQuery("")} aria-label="Очистить поиск"><X size={16} /></button>}{query && <SearchResults results={searchResults} onSelect={selectPerson} />}</div>
         <div className="header-actions">
           <button type="button" className="header-action menu-action" onClick={() => setMainMenuOpen(true)}><List size={19} /> Меню</button>
           <button type="button" className="header-action" onClick={() => openExport("pdf")}><Export size={20} /> Экспорт</button>
           <button type="button" className="header-action" onClick={() => openExport("print")}><Printer size={20} /> Печать</button>
           <div className="menu-wrap"><button type="button" className="icon-button more-button" onClick={(event) => { event.stopPropagation(); setMoreOpen((open) => !open); }}><DotsThree size={22} weight="bold" /></button>{moreOpen && <div className="dropdown-menu more-menu" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => { setMoreOpen(false); saveCopy(); }}><Copy size={16} /> Сохранить копию</button><button type="button" onClick={() => { setMoreOpen(false); setBackupOpen(true); }}><ClockCounterClockwise size={16} /> Резервные копии</button><button type="button" onClick={() => { setMoreOpen(false); setViewSettingsOpen(true); }}><TreeStructure size={16} /> Настроить вид дерева</button><button type="button" onClick={openSettings}><Note size={16} /> Настройки проекта</button><button type="button" onClick={openInstruction}><Info size={16} /> Как это работает</button><button type="button" onClick={() => { setMoreOpen(false); checkForUpdates(); }}><DownloadSimple size={16} /> Проверить обновления</button></div>}</div>
         </div>
       </header>
      <main className={`workspace ${inspectorOpen ? "" : "workspace-inspector-closed"}`}><TreeCanvas people={people} partnerships={partnerships} selectedId={selectedId} onSelect={selectPerson} zoom={zoom} onZoomChange={setZoom} pan={pan} onPanChange={setPan} treeStyle={treeStyle} showPhotos={showPhotos} focusRequest={focusRequest} inspectorOpen={inspectorOpen} onToggleInspector={() => setInspectorOpen(true)} />{inspectorOpen && <aside className="inspector"><div className="inspector-header"><span>{editing ? "Редактирование" : relationshipEditing ? "Семейные связи" : "Выбран человек"}</span><IconButton label="Закрыть панель" onClick={closeInspector}><X size={21} /></IconButton></div>{editing ? <PersonEditor draft={draft} isNew={!draft?.id} relationshipMode={relationshipMode} relationshipType={relationshipType} partnershipType={partnershipType} connectionTargetId={connectionTargetId} people={people} onChange={setDraft} onRelationChange={setRelationshipMode} onRelationshipTypeChange={setRelationshipType} onPartnershipTypeChange={setPartnershipType} onConnectionTargetChange={setConnectionTargetId} onSave={savePerson} onCancel={() => { setEditing(false); setDraft(null); setRelationshipMode(""); setRelationshipType("biological"); setPartnershipType("marriage"); setConnectionTargetId(""); }} /> : relationshipEditing ? <RelationshipEditor person={selectedPerson} people={people} partnerships={partnerships} onSave={saveRelationship} onCancel={() => setRelationshipEditing(false)} /> : <PersonDetail person={selectedPerson} people={people} partnerships={partnerships} onEdit={() => openEditor(selectedPerson)} onSelect={selectPerson} onAddRelative={(relation) => openEditor(null, relation)} onManageRelationships={() => { setInspectorOpen(true); setRelationshipEditing(true); }} onShowOnMap={focusPersonOnMap} onDelete={() => requestDelete(selectedPerson?.id)} />}</aside>}</main>
       <footer className="app-footer"><span className="footer-info"><Info size={17} /> Всего людей: {people.length}</span><span className="status-divider" /><span>Поколений: {treeLayout.generations.length}</span><span className={`footer-save ${dirty ? "footer-save-dirty" : ""}`}><CheckCircle size={19} weight="fill" /> {dirty ? "Есть несохранённые изменения" : lastSavedAt ? `Последнее сохранение: ${formatDateTime(lastSavedAt)}` : "Проект ещё не сохранён"}</span><span className="footer-backup">Автосохранение: {autoSaveEnabled ? (lastBackupAt ? formatDateTime(lastBackupAt) : "включено") : "выключено"}</span></footer>
      <input ref={fileInputRef} className="visually-hidden" type="file" accept=".familytree,.json,application/json" onChange={handleFileSelected} />
       {toast && <div className="toast"><CheckCircle size={19} weight="fill" /> {toast}</div>}
       {backupOpen && <BackupModal backups={backups} onClose={() => setBackupOpen(false)} onRestore={restoreBackup} onDownload={downloadBackup} />}
       {viewSettingsOpen && <ViewSettingsModal treeStyle={treeStyle} showPhotos={showPhotos} onTreeStyleChange={(value) => updateViewSetting("treeStyle", value)} onShowPhotosChange={(value) => updateViewSetting("showPhotos", value)} onClose={() => setViewSettingsOpen(false)} />}
       {instructionOpen && <InstructionModal onClose={() => setInstructionOpen(false)} />}
       {exportModalOpen && <ExportModal initialFormat={exportPreset} people={people} partnerships={partnerships} treeStyle={treeStyle} showPhotos={showPhotos} onClose={() => setExportModalOpen(false)} onToast={setToast} />}
       {settingsOpen && <ProjectSettingsModal projectMeta={projectMeta} autoSaveEnabled={autoSaveEnabled} treeStyle={treeStyle} showPhotos={showPhotos} onSave={saveProjectSettings} onClose={() => setSettingsOpen(false)} />}
       {deleteConfirmId && <ConfirmModal title="Удалить человека?" description="Запись будет удалена из дерева, а её связи с родителями, партнёрами и детьми будут убраны. Перед этим будет создана резервная копия." confirmLabel="Удалить" onClose={() => setDeleteConfirmId("")} onConfirm={deletePerson} />}
       {newTreeConfirmOpen && <ConfirmModal title="Создать новое дерево?" description="Текущее дерево останется в резервной копии, а рабочее полотно будет очищено." confirmLabel="Создать новое дерево" onClose={() => setNewTreeConfirmOpen(false)} onConfirm={applyNewTree} />}
       {mainMenuOpen && <MainMenuModal onCreate={createNewTree} onLoad={openProject} onSettings={openSettings} onHelp={openInstruction} onExit={exitApplication} onClose={() => setMainMenuOpen(false)} />}
       {updateStatus && updateOpen && ["available", "downloading", "downloaded"].includes(updateStatus.state) && <UpdateModal status={updateStatus} onClose={() => setUpdateOpen(false)} onDownload={downloadUpdate} onInstall={installUpdate} onOpenReleases={openReleasesPage} />}
     </div>
  );
}
