import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Briefcase,
  Camera,
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsOut,
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
  Funnel,
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
  PERSON_CONFIDENCE_LEVELS,
  readBackups,
  readWorkingCopy,
  serializeProject,
  validateProject,
  verifyBackup,
  writeWorkingCopy,
} from "./storage.js";
import { formatDateRecord, inferDatePrecision, normalizeDateRecord, normalizePersonDate, validateDateRecord } from "./dates.js";
import { createHistory, createSnapshot, getHistoryStatus, recordHistory, redoHistory, snapshotsEqual, undoHistory } from "./history.js";
import { DEFAULT_SEARCH_FILTERS, filterPeople } from "./search.js";
import { createRenderIndex, visibleEdges } from "./render-index.js";
import { calculateRelationship, personLabel } from "./relationship-calculator.js";
import { explainUserError } from "./ui-feedback.js";
import { createFamilyArchive, verifyFamilyArchive } from "./archive.js";
import { getSiblingComponent, orderSiblingMembers, reorderSiblingComponent } from "./sibling-order.js";
import { getNearbyFamilyIds } from "./family-view.js";
import { canMovePersonNavigation, createPersonNavigation, currentPersonId, movePersonNavigation, visitPerson } from "./person-navigation.js";
import { CARD_FIELD_OPTIONS, DEFAULT_CARD_FIELDS, MAX_CUSTOM_FIELDS, MAX_CUSTOM_FIELD_LABEL, MAX_CUSTOM_FIELD_VALUE, formatCardFieldLines, normalizeCustomFields, sanitizeCardFields, validateCustomFields } from "./person-fields.js";
import { FACT_SOURCE_OPTIONS, MAX_EVENT_DATE, MAX_EVENT_DESCRIPTION, MAX_EVENT_PLACE, MAX_EVENT_SOURCE, MAX_EVENT_TITLE, MAX_TIMELINE_EVENTS, TIMELINE_EVENT_TYPES, normalizeFactSources, normalizeSourceValue, normalizeTimelineEvents, sortTimelineEvents, timelineEventLabel, validateFactSources, validateTimelineEvents } from "./timeline.js";
import { buildTreeLayout } from "./tree-layout.js";

const ExportModal = lazy(() => import("./ExportModal.jsx").then(({ ExportModal: Component }) => ({ default: Component })));

const BRAND_MARK_SRC = "/branding/family-circle.svg";

function BrandMark({ className = "" }) {
  return <img className={`brand-mark ${className}`.trim()} src={BRAND_MARK_SRC} alt="" aria-hidden="true" />;
}

const initialPeople = [];

const blankPerson = { id: "", name: "", shortName: "", isUnknown: false, source: "", confidence: "unknown", siblingOrder: null, customFields: [], factSources: {}, timelineEvents: [], year: "", datePrecision: "exact", birthDateFrom: "", birthDateTo: "", birthDate: { precision: "unknown", text: "", value: "", from: "", to: "" }, place: "", image: "", gender: "", parentIds: [], parentLinks: [], childIds: [], siblingIds: [], siblingLinks: [], occupation: "", biography: "", maidenName: "", familyContext: [] };
const defaultProjectSettings = { autoSave: true, treeStyle: "classic", showPhotos: true, largeText: false, cardFields: [...DEFAULT_CARD_FIELDS] };

const initialPartnerships = [];

const relationLabel = { parent: "родителя", child: "ребёнка", partner: "супруга или партнёра", sibling: "брата или сестры" };
const relationTypeLabel = { biological: "Биологическая связь", adoptive: "Усыновление", step: "Степ-родство", guardian: "Опекунство", unknown: "Тип связи неизвестен", half: "Неполнородное родство" };
const siblingTypeLabel = { biological: "Родной брат или сестра", half: "Единокровный или единоутробный брат/сестра", step: "Сводный брат или сестра", unknown: "Тип связи неизвестен" };
const partnershipTypeLabel = { marriage: "Брак", partnership: "Партнёрство" };
const confidenceLabel = { unknown: "Не указана", low: "Низкая", medium: "Средняя", high: "Высокая" };
const familyContextLabel = { "single-known-parent": "Один известный родитель", "out-of-marriage": "Ребёнок вне брака", "sibling-without-parents": "Родители не указаны" };

function personDisplayName(person) {
  if (person?.isUnknown) return "Неизвестный человек";
  return person?.name || "Человек без имени";
}

function familyContextText(person) {
  return (Array.isArray(person?.familyContext) ? person.familyContext : []).map((value) => familyContextLabel[value]).filter(Boolean).join(" · ");
}

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `person-${Date.now()}`;
}

function getDraftDateRecord(draft) {
  const precision = draft?.datePrecision || inferDatePrecision(draft?.year);
  return {
    precision,
    text: precision === "range" ? "" : String(draft?.year || "").trim(),
    value: precision === "range" ? "" : String(draft?.year || "").trim(),
    from: String(draft?.birthDateFrom || "").trim(),
    to: String(draft?.birthDateTo || "").trim(),
  };
}

function validatePersonDraft(draft, { isNew = false, relationshipMode = "", connectionTargetId = "", relationshipSource = "" } = {}) {
  const errors = {};
  const name = String(draft?.name || "").trim();
  const maidenName = String(draft?.maidenName || "").trim();
  const place = String(draft?.place || "").trim();
  const occupation = String(draft?.occupation || "").trim();
  const biography = String(draft?.biography || "").trim();
  const source = String(draft?.source || "").trim();
  const customFields = Array.isArray(draft?.customFields) ? draft.customFields : [];
  const factSources = draft?.factSources || {};
  const timelineEvents = Array.isArray(draft?.timelineEvents) ? draft.timelineEvents : [];
  const personNamePattern = /^[\p{L}\s.'’\-–—()]+$/u;
  const placePattern = /^[\p{L}\p{N}\s.,'’\-–—()\/$№]+$/u;
  const occupationPattern = /^[\p{L}\p{N}\s.,'’\-–—()/$№]+$/u;
  if (name && (!personNamePattern.test(name) || name.length > 120)) errors.name = "ФИО укажите буквами, без цифр; максимум 120 знаков.";
  if (maidenName && (!personNamePattern.test(maidenName) || maidenName.length > 80)) errors.maidenName = "Фамилия должна содержать буквы и стандартные знаки препинания.";
  const dateReport = validateDateRecord(getDraftDateRecord(draft));
  if (!dateReport.valid) errors.year = dateReport.error;
  if (place && (!placePattern.test(place) || place.length > 160)) errors.place = "Укажите город, область или страну без необычных символов; максимум 160 знаков.";
  if (occupation && (!occupationPattern.test(occupation) || occupation.length > 100)) errors.occupation = "Профессия содержит недопустимые символы или слишком длинная.";
  if (biography.length > 2000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(biography)) errors.biography = "Биография слишком длинная или содержит недопустимые символы.";
  if (source.length > 300 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(source)) errors.source = "Источник слишком длинный или содержит недопустимые символы; максимум 300 знаков.";
  const customFieldsError = validateCustomFields(customFields);
  if (customFieldsError) errors.customFields = customFieldsError;
  const factSourcesError = validateFactSources(factSources);
  if (factSourcesError) errors.factSources = factSourcesError;
  const timelineError = validateTimelineEvents(timelineEvents);
  if (timelineError) errors.timelineEvents = timelineError;
  if (String(relationshipSource || "").trim().length > MAX_EVENT_SOURCE) errors.relationshipSource = `Источник связи — не больше ${MAX_EVENT_SOURCE} знаков.`;
  if (isNew && relationshipMode && !connectionTargetId) errors.connectionTargetId = "Выберите человека, с которым нужно установить связь.";
  return errors;
}

function addUniqueId(ids, id) {
  return [...new Set([...(Array.isArray(ids) ? ids : []), id])];
}

function makeParentLinkId(childId, parentId, type) {
  return `parent-link-${childId}-${parentId}-${type}`;
}

function addParentLink(links, personId, type, childId = "unknown-person", source = "") {
  const current = Array.isArray(links) ? links : [];
  const existing = current.find((link) => link.personId === personId && link.type === type);
  if (existing) return current.map((link) => link === existing ? { ...link, source: normalizeSourceValue(source) || link.source || "" } : link);
  return [...current, { id: makeParentLinkId(childId, personId, type), personId, type, source: normalizeSourceValue(source) }];
}

function makeSiblingLinkId(personId, siblingId, type) {
  return `sibling-link-${personId}-${siblingId}-${type}`;
}

function addSiblingLink(links, personId, type, siblingId = "unknown-person", source = "") {
  const current = Array.isArray(links) ? links : [];
  const existing = current.find((link) => link.personId === personId && link.type === type);
  if (existing) return current.map((link) => link === existing ? { ...link, source: normalizeSourceValue(source) || link.source || "" } : link);
  const baseId = makeSiblingLinkId(siblingId, personId, type);
  let id = baseId;
  let suffix = 1;
  while (current.some((link) => link.id === id)) id = `${baseId}-${++suffix}`;
  return [...current, { id, personId, type, source: normalizeSourceValue(source) }];
}

function relationshipDeleteOptions(person, people, partnerships) {
  if (!person) return [];
  const find = (id) => people.find((item) => item.id === id);
  const options = [];
  const parentLinks = person.parentLinks?.length
    ? person.parentLinks
    : (person.parentIds || []).map((personId) => ({ id: makeParentLinkId(person.id, personId, "biological"), personId, type: "biological" }));
  parentLinks.forEach((link) => {
    const target = find(link.personId);
    if (target) options.push({ id: link.id || makeParentLinkId(person.id, link.personId, link.type || "biological"), kind: "parent", parentId: link.personId, childId: person.id, type: link.type || "biological", label: `Родитель: ${personDisplayName(target)}` });
  });
  (person.childIds || []).forEach((childId) => {
    const target = find(childId);
    if (!target) return;
    const link = target.parentLinks?.find((item) => item.personId === person.id);
    const type = link?.type || "biological";
    options.push({ id: link?.id || makeParentLinkId(childId, person.id, type), kind: "parent", parentId: person.id, childId, type, label: `Ребёнок: ${personDisplayName(target)}` });
  });
  const siblingLinks = person.siblingLinks?.length
    ? person.siblingLinks
    : (person.siblingIds || []).map((personId) => ({ id: makeSiblingLinkId(person.id, personId, "biological"), personId, type: "biological" }));
  siblingLinks.forEach((link) => {
    const target = find(link.personId);
    if (target) options.push({ id: link.id || makeSiblingLinkId(person.id, link.personId, link.type || "biological"), kind: "sibling", personIds: [person.id, link.personId], type: link.type || "biological", label: `Брат или сестра: ${personDisplayName(target)}` });
  });
  partnerships.filter((partnership) => partnership.personIds.includes(person.id)).forEach((partnership) => {
    const targetId = partnership.personIds.find((id) => id !== person.id);
    const target = find(targetId);
    if (target) options.push({ id: partnership.id, kind: "partnership", personIds: [...partnership.personIds], label: `${partnershipTypeLabel[partnership.type] || "Связь"}: ${personDisplayName(target)}` });
  });
  return options.filter((option, index, all) => all.findIndex((item) => item.id === option.id) === index);
}

function roleByGender(person, male, female, unknown) {
  if (person?.gender === "male") return male;
  if (person?.gender === "female") return female;
  return unknown;
}

function parentRelationshipRoles(type, parent, child) {
  if (type === "step") return { currentRole: roleByGender(parent, "Отчим", "Мачеха", "Отчим/мачеха"), inverseRole: roleByGender(child, "Пасынок", "Падчерица", "Пасынок/падчерица") };
  if (type === "adoptive") return { currentRole: "Усыновитель", inverseRole: "Усыновлённый ребёнок" };
  if (type === "guardian") return { currentRole: "Опекун", inverseRole: "Подопечный" };
  if (type === "unknown") return { currentRole: "Родитель или взрослый родственник (тип не указан)", inverseRole: "Ребёнок или подопечный (тип не указан)" };
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

function TreeNode({ person, position, selected, onSelect, showPhotos, cardFields, dragging, onDragStart, onDragMove, onDragEnd }) {
  const cardLines = formatCardFieldLines(person, cardFields);
  return (
    <button className={`tree-node ${selected ? "tree-node-selected" : ""} ${showPhotos ? "" : "tree-node-no-photo"} ${dragging ? "tree-node-dragging" : ""}`} style={{ left: position.left, top: position.top }} type="button" onClick={() => onSelect(person.id)} onPointerDown={(event) => onDragStart?.(person.id, event)} onPointerMove={(event) => onDragMove?.(event)} onPointerUp={(event) => onDragEnd?.(event)} onPointerCancel={(event) => onDragEnd?.(event)} aria-pressed={selected} aria-label={`${personDisplayName(person)}${cardLines.length ? `, ${cardLines.join(", ")}` : ""}`}>
      <PersonAvatar person={person} showPhoto={showPhotos} />
      <span className="tree-node-copy">
        {(person.isUnknown ? personDisplayName(person) : (person.shortName || person.name || personDisplayName(person))).split("\n").map((line) => <span key={line} className="tree-node-name">{line}</span>)}
        <span className="tree-node-details">{cardLines.map((line, index) => <span key={`${person.id}-card-line-${index}`} className={index === 0 && sanitizeCardFields(cardFields).includes("year") ? "tree-node-year" : "tree-node-detail"}>{line}</span>)}</span>
      </span>
    </button>
  );
}

function Connector({ left, top, width, height = 1, vertical = false, className = "" }) {
  return <span className={`connector ${vertical ? "connector-vertical" : ""} ${className}`} style={{ left, top, width, height }} />;
}

function RelationshipItem({ person, onSelect, meta = "", relationshipId = "", source = "" }) {
  if (!person) return null;
  return (
    <button className="relationship-item" type="button" onClick={() => onSelect(person.id)}>
      <PersonAvatar person={person} />
      <span className="relationship-copy"><span>{personDisplayName(person)}</span><small>{meta || person.year || "дата неизвестна"}</small>{source && <small className="relationship-source">{relationSourceText(source)}</small>}{relationshipId && <small className="relationship-id" title={`Уникальный идентификатор связи: ${relationshipId}`}>ID связи: {relationshipId}</small>}</span>
    </button>
  );
}

function SearchResults({ results, onSelect }) {
  if (!results.length) return <div className="search-empty">Ничего не найдено</div>;
  return <div className="search-results">{results.map((person) => <button key={person.id} type="button" className="search-result" onClick={() => onSelect(person.id)}><PersonAvatar person={person} /><span><strong>{personDisplayName(person)}</strong><small>{person.place || "место не указано"}</small></span></button>)}</div>;
}

function SearchFilterPanel({ filters, generations, onChange, onReset }) {
  return (
    <div className="search-filters" role="dialog" aria-label="Фильтры поиска" onClick={(event) => event.stopPropagation()}>
      <div className="search-filter-heading"><strong>Фильтры поиска</strong><button type="button" className="filter-reset" onClick={onReset}>Сбросить</button></div>
      <label><span>Поколение</span><select value={filters.generation} onChange={(event) => onChange("generation", event.target.value)}><option value="all">Любое поколение</option>{generations.map((generation) => <option key={generation.index} value={String(generation.index)}>Поколение {generation.index + 1}</option>)}</select></label>
      <label><span>Тип связи</span><select value={filters.relation} onChange={(event) => onChange("relation", event.target.value)}><option value="all">Любая связь</option><option value="parent">Есть родительская связь</option><option value="child">Есть связь с ребёнком</option><option value="partner">Есть супруг или партнёр</option><option value="sibling">Есть связь брат/сестра</option><option value="biological">Биологическая</option><option value="adoptive">Усыновление</option><option value="guardian">Опекунство</option><option value="step">Степ- или сводное родство</option><option value="unknown">Неизвестный тип связи</option></select></label>
      <div className="search-filter-range"><label><span>Год от</span><input inputMode="numeric" value={filters.yearFrom} onChange={(event) => onChange("yearFrom", event.target.value.replace(/[^0-9]/g, "").slice(0, 4))} placeholder="1900" /></label><label><span>Год до</span><input inputMode="numeric" value={filters.yearTo} onChange={(event) => onChange("yearTo", event.target.value.replace(/[^0-9]/g, "").slice(0, 4))} placeholder="2026" /></label></div>
      <label><span>Место рождения</span><input value={filters.place} onChange={(event) => onChange("place", event.target.value)} placeholder="Например, Новосибирск" /></label>
      <label><span>Профессия</span><input value={filters.occupation} onChange={(event) => onChange("occupation", event.target.value)} placeholder="Например, учитель" /></label>
      <label><span>Биография</span><input value={filters.biography} onChange={(event) => onChange("biography", event.target.value)} placeholder="Событие или интерес" /></label>
      <label><span>Источник</span><input value={filters.source} onChange={(event) => onChange("source", event.target.value)} placeholder="Например, семейный архив" /></label>
      <label><span>Фотография</span><select value={filters.photo} onChange={(event) => onChange("photo", event.target.value)}><option value="all">Не важно</option><option value="with">Только с фотографией</option><option value="without">Только без фотографии</option></select></label>
    </div>
  );
}

function RelationSection({ title, items, onSelect, emptyText }) {
  return <section className="relation-section"><div className="section-title-row"><h3>{title}</h3><PencilSimple size={15} /></div>{items.length ? items.map(({ person, meta, relationshipId, source }) => <RelationshipItem key={`${person.id}-${relationshipId || title}`} person={person} meta={meta} relationshipId={relationshipId} source={source} onSelect={onSelect} />) : <p className="empty-relation">{emptyText}</p>}</section>;
}

function SiblingOrderSection({ person, siblings, onMove }) {
  const siblingPeople = orderSiblingMembers(siblings.map((item) => item.person));
  if (siblingPeople.length < 2) return null;
  const currentIndex = siblingPeople.findIndex((item) => item.id === person.id);
  return <section className="detail-section sibling-order-section"><div className="section-title-row"><h3>Порядок братьев и сестёр</h3><UsersThree size={15} /></div><p className="sibling-order-help">По умолчанию порядок определяется датой рождения. Кнопки сохраняют ручной порядок в проекте.</p><div className="sibling-order-list">{siblingPeople.map((sibling, index) => <div className={`sibling-order-item ${sibling.id === person.id ? "selected" : ""}`} key={sibling.id}><span>{index + 1}</span><strong>{personDisplayName(sibling)}</strong>{sibling.id === person.id && <small>выбран</small>}</div>)}</div><div className="sibling-order-actions"><button type="button" className="button button-secondary" onClick={() => onMove("up")} disabled={currentIndex <= 0}><CaretUp size={17} /> Выше</button><button type="button" className="button button-secondary" onClick={() => onMove("down")} disabled={currentIndex < 0 || currentIndex >= siblingPeople.length - 1}><CaretDown size={17} /> Ниже</button></div></section>;
}

function partnershipDescription(partnership) {
  if (!partnership) return "Связь без уточнения";
  const type = partnershipTypeLabel[partnership.type] || "Связь";
  if (partnership.status === "divorced") return `${type} · развод${partnership.endDate ? ` ${partnership.endDate}` : ""}`;
  return `${type}${partnership.startDate ? ` · с ${partnership.startDate}` : ""}`;
}

const factSourceLabel = Object.fromEntries(FACT_SOURCE_OPTIONS.map((item) => [item.value, item.label]));
const timelinePrecisionLabel = { exact: "точная дата", year: "только год", approximate: "примерная дата", range: "диапазон", unknown: "дата не уточнена" };

function relationSourceText(source) {
  return source ? `Источник: ${source}` : "";
}

function FactSourcesSection({ person }) {
  const sources = Object.entries(person?.factSources || {}).filter(([, source]) => source);
  if (!sources.length) return null;
  return <section className="detail-section fact-sources-section"><div className="section-title-row"><h3>Источники отдельных сведений</h3><Info size={15} /></div><dl className="facts-list">{sources.map(([fact, source]) => <div key={fact}><dt>{factSourceLabel[fact] || fact}</dt><dd>{source}</dd></div>)}</dl></section>;
}

function TimelineSection({ person }) {
  const events = sortTimelineEvents(person?.timelineEvents);
  return <section className="detail-section timeline-section"><div className="section-title-row"><h3>Временная шкала</h3><ClockCounterClockwise size={15} /></div>{events.length ? <ol className="timeline-list">{events.map((event) => <li className="timeline-item" key={event.id}><div className="timeline-marker" /><div className="timeline-event-copy"><div className="timeline-event-heading"><strong>{event.title}</strong><span>{event.date || "Дата не указана"}</span></div><small>{timelineEventLabel(event)}{event.date && event.datePrecision !== "unknown" ? ` · ${timelinePrecisionLabel[event.datePrecision] || ""}` : ""}{event.place ? ` · ${event.place}` : ""}</small>{event.description && <p>{event.description}</p>}{event.source && <em>Источник: {event.source}</em>}</div></li>)}</ol> : <p className="empty-relation">События ещё не добавлены</p>}</section>;
}

function PersonDetail({ person, people, partnerships, onEdit, onSelect, onAddRelative, onManageRelationships, onCalculateRelationship, onShowOnMap, onDelete, onMoveSiblingOrder, onPreviousPerson, onNextPerson, canGoPrevious, canGoNext }) {
  if (!person) return <div className="detail-content empty-tree-state"><h2>Дерево пока пустое</h2><p>Добавьте первого человека, даже если известны только отдельные сведения.</p><button type="button" className="button button-primary" onClick={() => onAddRelative("")}><Plus size={18} /> Добавить человека</button></div>;
  const displayName = personDisplayName(person);
  const find = (id) => people.find((item) => item.id === id);
  const parentLinks = person.parentLinks?.length ? person.parentLinks : person.parentIds.map((personId) => ({ id: makeParentLinkId(person.id, personId, "biological"), personId, type: "biological" }));
  const parents = parentLinks.map((link) => {
    const parent = find(link.personId);
    const roles = parentRelationshipRoles(link.type, parent, person);
    return { person: parent, meta: `${roles.currentRole} · вы для него: ${roles.inverseRole}`, source: link.source, relationshipId: link.id || makeParentLinkId(person.id, link.personId, link.type) };
  }).filter((item) => item.person);
  const relatedPartnerships = partnerships.filter((partnership) => partnership.personIds.includes(person.id));
  const partnerIds = [...new Set([...person.partnerIds, ...relatedPartnerships.flatMap((partnership) => partnership.personIds.filter((id) => id !== person.id))])];
  const partners = partnerIds.map((partnerId) => {
    const partner = find(partnerId);
    const partnership = [...partnerships].reverse().find((item) => item.personIds.includes(person.id) && item.personIds.includes(partnerId));
    const currentRole = partnerRole(person, partnership);
    const inverseRole = partnerRole(partner, partnership);
    return { person: partner, meta: `${partnershipDescription(partnership)} · вы для него: ${currentRole} · он/она для вас: ${inverseRole}`, source: partnership?.source, relationshipId: partnership?.id || `partnership-${[person.id, partnerId].sort().join("-")}` };
  }).filter((item) => item.person);
  const children = person.childIds.map((childId) => {
    const child = find(childId);
    const parentLink = child?.parentLinks?.find((link) => link.personId === person.id);
    const type = parentLink?.type || "biological";
    const roles = childRelationshipRoles(type, person, child);
    return { person: child, meta: `${roles.currentRole} · вы для него: ${roles.inverseRole}`, source: parentLink?.source, relationshipId: parentLink?.id || makeParentLinkId(child?.id || childId, person.id, type) };
  }).filter((item) => item.person);
  const siblingLinks = person.siblingLinks?.length ? person.siblingLinks : (person.siblingIds || []).map((siblingId) => ({ id: makeSiblingLinkId(person.id, siblingId, "biological"), personId: siblingId, type: "biological" }));
  const siblingItems = siblingLinks.map((link) => {
    const sibling = find(link.personId);
    return { person: sibling, meta: siblingTypeLabel[link.type] || relationTypeLabel.unknown, source: link.source, relationshipId: link.id || makeSiblingLinkId(person.id, link.personId, link.type || "unknown") };
  }).filter((item) => item.person);
  const siblingPeople = orderSiblingMembers(siblingItems.map((item) => item.person));
  const siblings = siblingPeople.map((sibling) => siblingItems.find((item) => item.person.id === sibling.id)).filter(Boolean);
  const relationIds = [...parents, ...partners, ...children, ...siblings].map((item) => item.relationshipId).filter(Boolean);
  return (
    <div className="detail-content">
      <div className="profile-block"><PersonAvatar person={person} large /><div className="profile-summary"><h2>{displayName}</h2><p className="profile-year">{person.year || "Дата рождения неизвестна"}</p><div className="profile-place"><MapPin size={17} /> {person.place || "Место рождения не указано"}</div></div><div className="profile-actions"><div className="person-navigation-actions"><button type="button" className="button button-secondary person-nav-button" onClick={onPreviousPerson} disabled={!canGoPrevious}><CaretLeft size={17} /> Предыдущий</button><button type="button" className="button button-secondary person-nav-button" onClick={onNextPerson} disabled={!canGoNext}>Следующий <CaretRight size={17} /></button></div><button type="button" className="button button-secondary map-focus-button" onClick={() => onShowOnMap(person.id)}><Crosshair size={18} /> Показать найденного человека на карте</button><button type="button" className="button button-primary edit-button" onClick={onEdit}><PencilSimple size={18} weight="bold" /> Редактировать</button></div></div>
      <section className="detail-section"><div className="section-title-row"><h3>Основная информация</h3><PencilSimple size={16} /></div><dl className="facts-list"><div><dt>Дата рождения</dt><dd>{person.year || "—"}</dd></div><div><dt>Место рождения</dt><dd>{person.place || "—"}</dd></div><div><dt>Семейный статус</dt><dd>{familyStatusLabel(relatedPartnerships)}</dd></div><div><dt>Семейная ситуация</dt><dd>{familyContextText(person) || "—"}</dd></div><div><dt>Профессия</dt><dd>{person.occupation || "—"}</dd></div><div><dt>Девичья фамилия</dt><dd>{person.maidenName || "—"}</dd></div><div><dt>Тип записи</dt><dd>{person.isUnknown ? "Неизвестный человек" : "Обычная запись"}</dd></div><div><dt>Источник сведений</dt><dd>{person.source || "—"}</dd></div><div><dt>Достоверность</dt><dd>{confidenceLabel[person.confidence] || confidenceLabel.unknown}</dd></div><div><dt>Примечание</dt><dd>{person.biography || "—"}</dd></div></dl></section>
      <FactSourcesSection person={person} />
      <TimelineSection person={person} />
      <RelationSection title="Родители" items={parents} onSelect={onSelect} emptyText="Родители ещё не добавлены" />
      <RelationSection title="Супруги и партнёры" items={partners} onSelect={onSelect} emptyText="Супруги и партнёры ещё не добавлены" />
      <RelationSection title="Братья и сёстры" items={siblings} onSelect={onSelect} emptyText="Братья и сёстры ещё не добавлены" />
      <SiblingOrderSection person={person} siblings={siblings} onMove={(direction) => onMoveSiblingOrder?.(person.id, direction)} />
      <RelationSection title="Дети" items={children} onSelect={onSelect} emptyText="Дети ещё не добавлены" />
      <section className="detail-section relationship-identifiers"><div className="section-title-row"><h3>Идентификаторы</h3><Info size={15} /></div><dl className="facts-list"><div><dt>ID человека</dt><dd className="identifier-value">{person.id}</dd></div><div><dt>Связей в панели</dt><dd>{relationIds.length}</dd></div><div><dt>ID связей</dt><dd className="identifier-value">{relationIds.length ? relationIds.join(" · ") : "—"}</dd></div></dl></section>
      <div className="relationship-actions"><button type="button" className="button button-secondary relationship-calculator-button" onClick={() => onCalculateRelationship(person.id)}><UsersThree size={18} /> Узнать родство</button><button type="button" className="button button-secondary relationship-manage-button" onClick={onManageRelationships}><Link size={18} /> Управлять связями</button><button type="button" className="add-relative-button" onClick={() => onAddRelative("child")}><UserPlus size={20} /><span><strong>Добавить родственника</strong><small>Создать новую запись человека</small></span><CaretRight size={18} /></button><button type="button" className="button delete-person-button" onClick={onDelete}><Trash size={18} /> Удалить человека</button></div>
    </div>
  );
}

function RelationshipCalculatorModal({ people, partnerships, initialSourceId, onClose, onSelectPerson, onShowOnMap }) {
  const options = useMemo(() => [...people].sort((first, second) => personLabel(first).localeCompare(personLabel(second), "ru")), [people]);
  const firstAvailable = options[0]?.id || "";
  const secondAvailable = options.find((person) => person.id !== (initialSourceId || firstAvailable))?.id || "";
  const [sourceId, setSourceId] = useState(initialSourceId || firstAvailable);
  const [targetId, setTargetId] = useState(secondAvailable);
  const result = useMemo(() => calculateRelationship(people, partnerships, sourceId, targetId), [people, partnerships, sourceId, targetId]);
  useEffect(() => {
    if (sourceId && sourceId === targetId) setTargetId(options.find((person) => person.id !== sourceId)?.id || "");
  }, [options, sourceId, targetId]);
  useEffect(() => {
    const handleKeyDown = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  const selectPathPerson = (id) => { onSelectPerson(id); onClose(); };
  return (
    <div className="relationship-calculator-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="relationship-calculator-card" role="dialog" aria-modal="true" aria-labelledby="relationship-calculator-title" onClick={(event) => event.stopPropagation()}>
        <div className="relationship-calculator-header"><div><span className="eyebrow">Проверка связи</span><h2 id="relationship-calculator-title">Калькулятор родства</h2><p>Выберите двух людей — приложение покажет краткое родство и путь между ними.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть калькулятор родства"><X size={21} /></button></div>
        <div className="relationship-calculator-pickers"><label className="field"><span>Первый человек</span><select value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">Выберите человека</option>{options.map((person) => <option key={person.id} value={person.id}>{personLabel(person)}{person.year ? ` · ${person.year}` : ""}</option>)}</select></label><div className="relationship-calculator-arrow" aria-hidden="true">↔</div><label className="field"><span>Второй человек</span><select value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Выберите человека</option>{options.map((person) => <option key={person.id} value={person.id}>{personLabel(person)}{person.year ? ` · ${person.year}` : ""}</option>)}</select></label></div>
        {result.status === "missing" && <div className="relationship-calculator-empty"><UsersThree size={27} /><strong>Выберите двух людей</strong><span>После выбора здесь появится объяснение связи.</span></div>}
        {result.status === "same" && <div className="relationship-calculator-result"><span className="eyebrow">Результат</span><h3>{result.label}</h3><p>Вы выбрали одну и ту же запись дважды.</p></div>}
        {result.status === "unrelated" && <div className="relationship-calculator-empty relationship-calculator-warning"><Info size={27} /><strong>Связь не найдена</strong><span>Люди пока находятся в разных частях дерева или связь ещё не добавлена.</span></div>}
        {result.status === "found" && <div className="relationship-calculator-result"><div className="relationship-result-heading"><div><span className="eyebrow">Результат</span><h3>{result.label}</h3></div><button type="button" className="button button-secondary" onClick={() => onShowOnMap(result.target.id)}><Crosshair size={17} /> Показать второго на карте</button></div><p className="relationship-result-subtitle">Путь между людьми: {Math.max(0, result.path.length - 2)} промежуточных {result.path.length - 2 === 1 ? "человек" : "человека"}.</p><div className="relationship-path" aria-label="Путь родства">{result.path.map((person, index) => <div className="relationship-path-row" key={person.id}><button type="button" className="relationship-path-person" onClick={() => selectPathPerson(person.id)}><PersonAvatar person={person} /><span><strong>{personLabel(person)}</strong><small>{person.year || "дата неизвестна"}</small></span></button>{index < result.steps.length && <div className="relationship-path-step"><span>{result.steps[index].label}</span><CaretRight size={15} /></div>}</div>)}</div></div>}
        <div className="relationship-calculator-footer"><span>Связь рассчитывается только по данным текущего локального дерева.</span><button type="button" className="button button-ghost" onClick={onClose}>Закрыть</button></div>
      </section>
    </div>
  );
}

function FactSourcesEditor({ sources, error, onChange }) {
  const safeSources = sources && typeof sources === "object" && !Array.isArray(sources) ? sources : {};
  const entries = Object.entries(safeSources);
  const addSource = () => {
    const next = FACT_SOURCE_OPTIONS.find((item) => !Object.hasOwn(safeSources, item.value));
    if (next) onChange({ ...safeSources, [next.value]: "" });
  };
  const changeFact = (oldFact, newFact) => {
    const next = { ...safeSources, [newFact]: safeSources[oldFact] || "" };
    if (oldFact !== newFact) delete next[oldFact];
    onChange(next);
  };
  const removeSource = (fact) => {
    const next = { ...safeSources };
    delete next[fact];
    onChange(next);
  };
  return <div className={`field field-full fact-sources-editor ${error ? "has-error" : ""}`}>
    <div className="timeline-editor-heading"><span>Источники отдельных сведений <em>необязательно</em></span><small>Укажите, откуда взята конкретная дата, фамилия, профессия или биография.</small></div>
    {entries.length > 0 && <div className="fact-source-list">{entries.map(([fact, source], index) => <div className="fact-source-row" key={fact}>
      <select value={fact} onChange={(event) => changeFact(fact, event.target.value)} aria-label={`Тип источника ${index + 1}`}>{FACT_SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value} disabled={Object.hasOwn(safeSources, option.value) && option.value !== fact}>{option.label}</option>)}</select>
      <input value={source || ""} maxLength={MAX_EVENT_SOURCE} onChange={(event) => onChange({ ...safeSources, [fact]: event.target.value })} placeholder="Например, рассказала мама" aria-label={`Источник для поля ${factSourceLabel[fact] || fact}`} />
      <button type="button" className="icon-button custom-field-remove" onClick={() => removeSource(fact)} aria-label={`Удалить источник ${index + 1}`} title="Удалить источник"><Trash size={16} /></button>
    </div>)}</div>}
    <button type="button" className="custom-field-add" onClick={addSource} disabled={entries.length >= FACT_SOURCE_OPTIONS.length}><Plus size={16} /> Добавить источник</button>
    {error && <small className="field-error">{error}</small>}
  </div>;
}

function TimelineEditor({ events, error, onChange }) {
  const safeEvents = Array.isArray(events) ? events : [];
  const updateEvent = (index, field, value) => onChange(safeEvents.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  const addEvent = () => {
    if (safeEvents.length >= MAX_TIMELINE_EVENTS) return;
    onChange([...safeEvents, { id: `event-draft-${safeEvents.length + 1}`, type: "other", title: "", date: "", datePrecision: "year", place: "", description: "", source: "" }]);
  };
  return <div className={`field field-full timeline-editor ${error ? "has-error" : ""}`}>
    <div className="timeline-editor-heading"><span>События жизни <em>необязательно</em></span><small>Добавляйте важные события с датой, местом, описанием и отдельным источником.</small></div>
    {safeEvents.length > 0 && <div className="timeline-event-editor-list">{safeEvents.map((event, index) => <div className="timeline-event-editor" key={event.id || index}>
      <div className="timeline-event-editor-header"><strong>Событие {index + 1}</strong><button type="button" className="icon-button custom-field-remove" onClick={() => onChange(safeEvents.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Удалить событие ${index + 1}`} title="Удалить событие"><Trash size={16} /></button></div>
      <div className="timeline-event-editor-grid"><label className="field"><span>Тип</span><select value={event.type || "other"} onChange={(input) => updateEvent(index, "type", input.target.value)}>{TIMELINE_EVENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label><label className="field"><span>Название</span><input value={event.title || ""} maxLength={MAX_EVENT_TITLE} onChange={(input) => updateEvent(index, "title", input.target.value)} placeholder="Например, переехал в Новосибирск" /></label><label className="field"><span>Дата</span><input value={event.date || ""} maxLength={MAX_EVENT_DATE} onChange={(input) => updateEvent(index, "date", input.target.value)} placeholder="Например, 1945 или около 1945" /></label><label className="field"><span>Точность</span><select value={event.datePrecision || "unknown"} onChange={(input) => updateEvent(index, "datePrecision", input.target.value)}><option value="exact">Точная дата</option><option value="year">Только год</option><option value="approximate">Примерно</option><option value="range">Диапазон</option><option value="unknown">Неизвестно</option></select></label><label className="field"><span>Место</span><input value={event.place || ""} maxLength={MAX_EVENT_PLACE} onChange={(input) => updateEvent(index, "place", input.target.value)} placeholder="Город или страна" /></label><label className="field"><span>Источник</span><input value={event.source || ""} maxLength={MAX_EVENT_SOURCE} onChange={(input) => updateEvent(index, "source", input.target.value)} placeholder="Откуда это известно" /></label><label className="field field-full"><span>Описание</span><textarea value={event.description || ""} maxLength={MAX_EVENT_DESCRIPTION} rows="2" onChange={(input) => updateEvent(index, "description", input.target.value)} placeholder="Коротко опишите событие" /></label></div>
    </div>)}</div>}
    <button type="button" className="custom-field-add" onClick={addEvent} disabled={safeEvents.length >= MAX_TIMELINE_EVENTS}><Plus size={16} /> Добавить событие{safeEvents.length >= MAX_TIMELINE_EVENTS ? ` (максимум ${MAX_TIMELINE_EVENTS})` : ""}</button>
    {error && <small className="field-error">{error}</small>}
  </div>;
}

function CustomFieldsEditor({ fields, error, onChange }) {
  const safeFields = Array.isArray(fields) ? fields : [];
  const updateField = (index, field, value) => onChange(safeFields.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  const removeField = (index) => onChange(safeFields.filter((_, itemIndex) => itemIndex !== index));
  const addField = () => {
    if (safeFields.length >= MAX_CUSTOM_FIELDS) return;
    onChange([...safeFields, { id: `custom-draft-${safeFields.length + 1}`, label: "", value: "" }]);
  };
  return <div className={`field field-full custom-fields-editor ${error ? "has-error" : ""}`}>
    <div className="custom-fields-heading"><span>Дополнительные поля <em>необязательно</em></span><small>Например: звание, семейное прозвище, награда или важное событие.</small></div>
    {safeFields.length > 0 && <div className="custom-field-list">{safeFields.map((item, index) => <div className="custom-field-row" key={item.id || index}>
      <input value={item.label || ""} maxLength={MAX_CUSTOM_FIELD_LABEL} onChange={(event) => updateField(index, "label", event.target.value)} placeholder="Название" aria-label={`Название поля ${index + 1}`} />
      <input value={item.value || ""} maxLength={MAX_CUSTOM_FIELD_VALUE} onChange={(event) => updateField(index, "value", event.target.value)} placeholder="Значение" aria-label={`Значение поля ${index + 1}`} />
      <button type="button" className="icon-button custom-field-remove" onClick={() => removeField(index)} aria-label={`Удалить поле ${index + 1}`} title="Удалить поле"><Trash size={16} /></button>
    </div>)}</div>}
    <button type="button" className="custom-field-add" onClick={addField} disabled={safeFields.length >= MAX_CUSTOM_FIELDS}><Plus size={16} /> Добавить поле{safeFields.length >= MAX_CUSTOM_FIELDS ? ` (максимум ${MAX_CUSTOM_FIELDS})` : ""}</button>
    {error && <small className="field-error">{error}</small>}
  </div>;
}

function PersonEditor({ draft, isNew, relationshipMode, relationshipType, partnershipType, connectionTargetId, relationshipSource, unknownParent, singleKnownParent, outOfMarriage, siblingWithoutParents, people, onChange, onRelationChange, onRelationshipTypeChange, onPartnershipTypeChange, onConnectionTargetChange, onRelationshipSourceChange, onUnknownParentChange, onSingleKnownParentChange, onOutOfMarriageChange, onSiblingWithoutParentsChange, onSave, onCancel }) {
  const [errors, setErrors] = useState({});
  const [wizardStep, setWizardStep] = useState(isNew ? 1 : 2);
  const photoInputRef = useRef(null);
  useEffect(() => { setWizardStep(isNew ? 1 : 2); setErrors({}); }, [isNew, draft?.id]);
  const update = (field, value) => {
    onChange({ ...draft, [field]: value });
    setErrors((current) => ({ ...current, [field]: "" }));
  };
  const changeRelationMode = (value) => {
    onRelationChange(value);
    if (!value) onRelationshipTypeChange("biological");
    if (value !== "parent") onUnknownParentChange(false);
    if (value !== "child") {
      onSingleKnownParentChange(false);
      onOutOfMarriageChange(false);
    }
    if (value !== "sibling") onSiblingWithoutParentsChange(false);
    setErrors((current) => ({ ...current, connectionTargetId: "" }));
  };
  const chooseUnknownParent = () => {
    onRelationChange("parent");
    onRelationshipTypeChange("biological");
    onUnknownParentChange(true);
    onSingleKnownParentChange(false);
    onOutOfMarriageChange(false);
    onSiblingWithoutParentsChange(false);
    setErrors((current) => ({ ...current, connectionTargetId: "" }));
  };
  const changeConnectionTarget = (value) => {
    onConnectionTargetChange(value);
    setErrors((current) => ({ ...current, connectionTargetId: "" }));
  };
  const choosePhoto = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrors((current) => ({ ...current, image: "Выберите файл изображения PNG, JPEG, WebP или GIF." }));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErrors((current) => ({ ...current, image: "Размер фотографии не должен превышать 8 МБ." }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange({ ...draft, image: String(reader.result || "") });
      setErrors((current) => ({ ...current, image: "" }));
    };
    reader.onerror = () => setErrors((current) => ({ ...current, image: "Не удалось прочитать фотографию. Попробуйте другой файл." }));
    reader.readAsDataURL(file);
  };
  const handleSave = (addAnother = false) => {
    const nextErrors = validatePersonDraft(draft, { isNew, relationshipMode, connectionTargetId, relationshipSource });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    onSave({ addAnother });
  };
  const handleNext = () => {
    if (wizardStep === 1) {
      if (relationshipMode && !connectionTargetId) {
        setErrors({ connectionTargetId: "Выберите человека, с которым нужно установить связь." });
        return;
      }
      setWizardStep(2);
      return;
    }
    const nextErrors = validatePersonDraft(draft, { isNew, relationshipMode, connectionTargetId, relationshipSource });
    setErrors(nextErrors);
    if (!Object.keys(nextErrors).length) setWizardStep(3);
  };
  const handleBack = () => setWizardStep((current) => Math.max(1, current - 1));
  const displayUnknown = Boolean(draft.isUnknown || unknownParent);
  const relationText = unknownParent ? "Новый человек — неизвестный родитель" : relationshipMode ? `Новый человек — ${relationLabel[relationshipMode]}` : "Новый человек";
  const precision = draft.datePrecision || inferDatePrecision(draft.year);
  const targetOptions = people.filter((person) => person.id !== draft.id);
  const relationTarget = targetOptions.find((person) => person.id === connectionTargetId);
  const scenarioLabels = [singleKnownParent && familyContextLabel["single-known-parent"], outOfMarriage && familyContextLabel["out-of-marriage"], siblingWithoutParents && familyContextLabel["sibling-without-parents"]].filter(Boolean);
  const scenarioSummary = scenarioLabels.join(" · ");
  const relationSummary = relationshipMode ? `${relationLabel[relationshipMode]}; ${relationshipMode === "partner" ? partnershipTypeLabel[partnershipType] : relationTypeLabel[relationshipType]}; ${relationTarget ? personDisplayName(relationTarget) : "человек не выбран"}${scenarioSummary ? ` · ${scenarioSummary}` : ""}${unknownParent ? " · карточка без имени" : ""}` : "Без связи — её можно добавить позже.";
  const baseRelationDescription = unknownParent ? "Будет создана отдельная карточка «Неизвестный человек» как родитель выбранного человека. Её можно заполнить позже." : relationshipMode === "parent" ? (relationshipType === "step" ? "Новый человек станет отчимом или мачехой выбранной записи." : relationshipType === "adoptive" ? "Новый человек станет усыновителем выбранной записи." : relationshipType === "guardian" ? "Новый человек будет указан как опекун выбранной записи." : relationshipType === "unknown" ? "Родительская связь будет сохранена без уточнения происхождения." : "Новый человек станет биологическим родителем выбранной записи.") : relationshipMode === "child" ? (relationshipType === "step" ? "Новый человек станет пасынком или падчерицей выбранной записи." : relationshipType === "adoptive" ? "Новый человек будет отмечен как усыновлённый ребёнок выбранной записи." : relationshipType === "guardian" ? "Новый человек будет связан с выбранным человеком отношением опеки." : relationshipType === "unknown" ? "Связь с ребёнком будет сохранена без уточнения происхождения." : "Новый человек станет биологическим ребёнком выбранной записи.") : relationshipMode === "sibling" ? `Новый человек будет добавлен как ${siblingTypeLabel[relationshipType]?.toLocaleLowerCase("ru") || "брат или сестра"}.` : relationshipMode === "partner" ? `Новый человек будет добавлен как ${partnershipType === "marriage" ? "супруг или супруга" : "партнёр"}. Можно сохранить и добавить ещё одного — существующие союзы не заменяются.` : "Можно сохранить человека без связи и добавить её позже.";
  const relationDescription = [baseRelationDescription, singleKnownParent && "Будет отмечено, что известен только один родитель; второго человека приложение не создаёт.", outOfMarriage && "Будет отмечено, что ребёнок родился вне брака; брак автоматически не создаётся.", siblingWithoutParents && "Связь брата или сестры создаётся без автоматического добавления родителей."].filter(Boolean).join(" ");
  return (
    <div className="editor-content">
      <div className="editor-intro"><div className="editor-photo-wrap"><PersonAvatar person={draft} large /><button type="button" className="photo-action" onClick={() => photoInputRef.current?.click()}><Camera size={16} /> {draft.image ? "Заменить фото" : "Добавить фото"}</button><input ref={photoInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={choosePhoto} />{errors.image && <small className="field-error photo-error">{errors.image}</small>}</div><div><span className="eyebrow">{isNew ? relationText : "Редактирование"}</span><h2>{isNew ? "Добавить человека" : "Изменить сведения"}</h2><p>Заполните только то, что известно. Остальные поля можно оставить пустыми.</p></div></div>
      {isNew && <div className="wizard-progress" aria-label={`Шаг ${wizardStep} из 3`}><div className={wizardStep >= 1 ? "current" : ""}><span>1</span><strong>Связь</strong></div><div className={wizardStep >= 2 ? "current" : ""}><span>2</span><strong>Сведения</strong></div><div className={wizardStep >= 3 ? "current" : ""}><span>3</span><strong>Проверка</strong></div></div>}
      {(!isNew || wizardStep !== 3) && <div className="form-grid">
        {isNew && wizardStep === 1 && <div className="field field-full connection-field wizard-step"><div className="wizard-step-heading"><span className="eyebrow">Шаг 1 из 3</span><strong>Сначала определим место человека в семье</strong><small>Выберите готовый сценарий. Неполные сведения — это нормально: их можно дополнить позже.</small></div><span>Кем будет новый человек? <em>необязательно</em></span><div className="wizard-relation-list"><button type="button" className={`wizard-relation-choice ${relationshipMode === "" ? "selected" : ""}`} onClick={() => changeRelationMode("")}><strong>Без связи</strong><small>Добавить отдельно</small></button><button type="button" className={`wizard-relation-choice ${relationshipMode === "parent" && !unknownParent ? "selected" : ""}`} onClick={() => changeRelationMode("parent")}><strong>Родитель</strong><small>Родитель выбранного человека</small></button><button type="button" className={`wizard-relation-choice ${relationshipMode === "parent" && unknownParent ? "selected" : ""}`} onClick={chooseUnknownParent}><strong>Неизвестный родитель</strong><small>Создать родителя без имени</small></button><button type="button" className={`wizard-relation-choice ${relationshipMode === "child" ? "selected" : ""}`} onClick={() => changeRelationMode("child")}><strong>Ребёнок</strong><small>Ребёнок выбранного человека</small></button><button type="button" className={`wizard-relation-choice ${relationshipMode === "sibling" ? "selected" : ""}`} onClick={() => changeRelationMode("sibling")}><strong>Брат или сестра</strong><small>Связь без обязательных родителей</small></button><button type="button" className={`wizard-relation-choice ${relationshipMode === "partner" ? "selected" : ""}`} onClick={() => changeRelationMode("partner")}><strong>Супруг или партнёр</strong><small>Можно добавить несколько союзов</small></button></div>{relationshipMode && relationshipMode !== "partner" && <><span className="nested-field-label">{relationshipMode === "sibling" ? "Вид связи между братом и сестрой" : "Вид родственной связи"}</span><div className="date-options relation-options">{relationshipMode === "sibling" ? <><button type="button" className={`date-option ${relationshipType === "biological" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("biological")}>Родной</button><button type="button" className={`date-option ${relationshipType === "half" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("half")}>Неполнородный</button><button type="button" className={`date-option ${relationshipType === "step" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("step")}>Сводный</button><button type="button" className={`date-option ${relationshipType === "unknown" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("unknown")}>Неизвестно</button></> : <><button type="button" className={`date-option ${relationshipType === "biological" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("biological")}>Биологическая</button><button type="button" className={`date-option ${relationshipType === "adoptive" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("adoptive")}>Усыновление</button><button type="button" className={`date-option ${relationshipType === "step" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("step")}>Степ-родство</button><button type="button" className={`date-option ${relationshipType === "guardian" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("guardian")}>Опекунство</button><button type="button" className={`date-option ${relationshipType === "unknown" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("unknown")}>Неизвестно</button></>}</div></>}{relationshipMode === "child" && <div className="wizard-scenario-box"><span className="nested-field-label">Особенности ситуации — необязательно</span><label className="wizard-scenario-option"><input type="checkbox" checked={singleKnownParent} onChange={(event) => onSingleKnownParentChange(event.target.checked)} /><span><strong>Известен только один родитель</strong><small>Второй родитель не создаётся и не добавляется автоматически.</small></span></label><label className="wizard-scenario-option"><input type="checkbox" checked={outOfMarriage} onChange={(event) => onOutOfMarriageChange(event.target.checked)} /><span><strong>Ребёнок вне брака</strong><small>Отметка сохраняется отдельно; брак между людьми не создаётся.</small></span></label></div>}{relationshipMode === "sibling" && <div className="wizard-scenario-box"><span className="nested-field-label">Неполные сведения — необязательно</span><label className="wizard-scenario-option"><input type="checkbox" checked={siblingWithoutParents} onChange={(event) => onSiblingWithoutParentsChange(event.target.checked)} /><span><strong>Добавить без указания родителей</strong><small>Создаётся только связь брата или сестры; родителей можно добавить позже.</small></span></label></div>}{relationshipMode === "parent" && unknownParent && <div className="wizard-scenario-note"><strong>Будет создана запись «Неизвестный человек».</strong><small>Она будет связана как родитель выбранного человека, а имя и остальные сведения можно заполнить позже.</small></div>}{relationshipMode === "partner" && <div className="wizard-scenario-note"><strong>Можно добавить несколько партнёрств.</strong><small>После сохранения нажмите «Сохранить и добавить ещё одного»: текущий выбранный человек останется целью новой связи.</small></div>}<label className="nested-field"><span>С кем установить связь</span><select value={relationshipMode ? connectionTargetId : ""} disabled={!relationshipMode} onChange={(event) => changeConnectionTarget(event.target.value)}><option value="">Сначала выберите человека</option>{targetOptions.map((person) => <option key={person.id} value={person.id}>{personDisplayName(person)}{person.year ? ` · ${person.year}` : ""}</option>)}</select></label>{errors.connectionTargetId && <small className="field-error">{errors.connectionTargetId}</small>}<small className="field-hint">{relationDescription}</small></div>}
        {isNew && wizardStep === 1 && relationshipMode && <label className="field field-full relationship-source-field"><span>Источник связи <em>необязательно</em></span><input value={relationshipSource || ""} maxLength={MAX_EVENT_SOURCE} onChange={(event) => onRelationshipSourceChange(event.target.value)} placeholder="Например, семейный архив" />{errors.relationshipSource && <small className="field-error">{errors.relationshipSource}</small>}</label>}
        {(!isNew || wizardStep === 2) && <>
        <label className="unknown-person-toggle"><input type="checkbox" checked={displayUnknown} disabled={unknownParent} onChange={(event) => update("isUnknown", event.target.checked)} /><span><strong>{unknownParent ? "Неизвестный родитель" : "Неизвестный человек"}</strong><small>{unknownParent ? "ФИО можно оставить пустым: запись уже будет связана с выбранным человеком." : "Оставьте ФИО пустым, если нужно создать связь без имени."}</small></span></label>
        <label className={`field field-full ${errors.name ? "has-error" : ""}`}><span>ФИО <em>необязательно</em></span><input autoFocus value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder={displayUnknown ? "Можно оставить пустым" : "Например, Иван Петров"} aria-invalid={Boolean(errors.name)} />{errors.name && <small className="field-error">{errors.name}</small>}</label>
        <label className={`field ${errors.maidenName ? "has-error" : ""}`}><span>Девичья фамилия <em>необязательно</em></span><input value={draft.maidenName} onChange={(event) => update("maidenName", event.target.value)} placeholder="Не указано" aria-invalid={Boolean(errors.maidenName)} /></label>
        <label className="field"><span>Пол <em>необязательно</em></span><select value={draft.gender || ""} onChange={(event) => update("gender", event.target.value)}><option value="">Не указан</option><option value="male">Мужчина</option><option value="female">Женщина</option></select></label>
        <div className={`field field-full ${errors.year ? "has-error" : ""}`}><span>Дата рождения <em>необязательно</em></span>{precision === "range" ? <div className="date-range-inputs"><input value={draft.birthDateFrom || ""} onChange={(event) => update("birthDateFrom", event.target.value)} placeholder="Начало, например 1940" aria-invalid={Boolean(errors.year)} /><span>—</span><input value={draft.birthDateTo || ""} onChange={(event) => update("birthDateTo", event.target.value)} placeholder="Конец, например 1945" aria-invalid={Boolean(errors.year)} /></div> : <input value={draft.year} onChange={(event) => update("year", event.target.value)} placeholder={precision === "exact" ? "Например, 12.05.1926" : precision === "approximate" ? "Например, около 1926" : "Например, 1926"} aria-invalid={Boolean(errors.year)} />}{errors.year && <small className="field-error">{errors.year}</small>}</div>
        <div className="field field-full"><span>Точность даты</span><div className="date-options"><button type="button" className={`date-option ${precision === "exact" ? "selected" : ""}`} onClick={() => update("datePrecision", "exact")}>Точный день</button><button type="button" className={`date-option ${precision === "year" ? "selected" : ""}`} onClick={() => update("datePrecision", "year")}>Только год</button><button type="button" className={`date-option ${precision === "approximate" ? "selected" : ""}`} onClick={() => update("datePrecision", "approximate")}>Примерно</button><button type="button" className={`date-option ${precision === "range" ? "selected" : ""}`} onClick={() => update("datePrecision", "range")}>Диапазон</button><button type="button" className={`date-option ${precision === "unknown" ? "selected" : ""}`} onClick={() => { onChange({ ...draft, datePrecision: "unknown", year: "", birthDateFrom: "", birthDateTo: "" }); setErrors((current) => ({ ...current, year: "" })); }}>Неизвестно</button></div><small className="field-hint">Допустимо: 1926, 12.05.1926, «около 1926» или диапазон 1940–1945.</small></div>
        <label className={`field field-full ${errors.place ? "has-error" : ""}`}><span>Место рождения <em>необязательно</em></span><div className="input-with-icon"><MapPin size={17} /><input value={draft.place} onChange={(event) => update("place", event.target.value)} placeholder="Город, область или страна" aria-invalid={Boolean(errors.place)} /></div>{errors.place && <small className="field-error">{errors.place}</small>}</label>
        <label className={`field field-full ${errors.occupation ? "has-error" : ""}`}><span>Профессия <em>необязательно</em></span><div className="input-with-icon"><Briefcase size={17} /><input value={draft.occupation} onChange={(event) => update("occupation", event.target.value)} placeholder="Например, учитель" aria-invalid={Boolean(errors.occupation)} /></div>{errors.occupation && <small className="field-error">{errors.occupation}</small>}</label>
        <label className={`field field-full ${errors.biography ? "has-error" : ""}`}><span>Краткая биография <em>необязательно</em></span><textarea value={draft.biography} onChange={(event) => update("biography", event.target.value)} placeholder="Важные события, интересы, воспоминания..." rows="5" aria-invalid={Boolean(errors.biography)} />{errors.biography && <small className="field-error">{errors.biography}</small>}</label>
        <label className={`field ${errors.source ? "has-error" : ""}`}><span>Источник сведений <em>необязательно</em></span><input value={draft.source || ""} onChange={(event) => update("source", event.target.value)} placeholder="Например, рассказала мама" aria-invalid={Boolean(errors.source)} />{errors.source && <small className="field-error">{errors.source}</small>}</label>
        <label className="field"><span>Достоверность</span><select value={draft.confidence || "unknown"} onChange={(event) => update("confidence", event.target.value)}>{PERSON_CONFIDENCE_LEVELS.map((level) => <option key={level} value={level}>{confidenceLabel[level]}</option>)}</select></label>
        <CustomFieldsEditor fields={draft.customFields} error={errors.customFields} onChange={(value) => update("customFields", value)} />
        <FactSourcesEditor sources={draft.factSources} error={errors.factSources} onChange={(value) => update("factSources", value)} />
        <TimelineEditor events={draft.timelineEvents} error={errors.timelineEvents} onChange={(value) => update("timelineEvents", value)} />
        </>}
      </div>}
      {isNew && wizardStep === 3 && <div className="wizard-review"><div className="wizard-review-heading"><CheckCircle size={22} weight="fill" /><div><strong>Проверьте запись перед добавлением</strong><small>Если всё верно, нажмите «Добавить человека».</small></div></div><div className="wizard-review-grid"><div><span>ФИО</span><strong>{displayUnknown ? "Неизвестный человек" : personDisplayName(draft)}</strong></div><div><span>Дата рождения</span><strong>{formatDateRecord(getDraftDateRecord(draft)) || "Не указана"}</strong></div><div><span>Место рождения</span><strong>{draft.place.trim() || "Не указано"}</strong></div><div><span>Фото</span><strong>{draft.image ? "Добавлено" : "Не добавлено"}</strong></div></div><div className="wizard-review-relation"><Link size={18} /><div><span>Связь и семейная ситуация</span><strong>{relationSummary}</strong><small>{relationDescription}</small></div></div></div>}
      <div className="editor-footer"><button type="button" className="button button-ghost" onClick={onCancel}>Отмена</button>{isNew && wizardStep > 1 && <button type="button" className="button button-secondary" onClick={handleBack}>Назад</button>}{isNew && wizardStep < 3 && <button type="button" className="button button-primary save-button" onClick={handleNext} disabled={wizardStep === 1 && Boolean(relationshipMode) && !connectionTargetId}>{wizardStep === 1 ? "К сведениям" : "К проверке"}</button>}{isNew && wizardStep === 3 && <button type="button" className="button button-secondary add-another-button" onClick={() => handleSave(true)}><UserPlus size={17} /> Сохранить и добавить ещё одного</button>}{(!isNew || wizardStep === 3) && <button type="button" className="button button-primary save-button" onClick={() => handleSave(false)}><FloppyDisk size={18} weight="bold" /> {isNew ? "Добавить человека" : "Сохранить"}</button>}</div>
    </div>
  );
}

function RelationshipEditor({ person, people, partnerships, onSave, onDeleteRelationship, onCancel }) {
  const [draft, setDraft] = useState({ kind: "parent", targetId: people.find((item) => item.id !== person.id)?.id || "", parentType: "biological", source: "", startDate: "", startDatePrecision: "unknown", endDate: "", endDatePrecision: "unknown" });
  const [relationToDelete, setRelationToDelete] = useState("");
  const update = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const changeKind = (kind) => setDraft((current) => ({ ...current, kind, parentType: kind === "sibling" ? "biological" : (kind === "parent" || kind === "child") ? "biological" : current.parentType }));
  const knownPartnerIds = new Set(partnerships.filter((partnership) => partnership.personIds.includes(person.id)).flatMap((partnership) => partnership.personIds.filter((id) => id !== person.id)));
  const currentPartnerIds = new Set([...person.partnerIds.filter((id) => !knownPartnerIds.has(id)), ...partnerships.filter((partnership) => partnership.status === "active" && partnership.personIds.includes(person.id)).flatMap((partnership) => partnership.personIds.filter((id) => id !== person.id))]);
  const targetOptions = people.filter((item) => item.id !== person.id && (draft.kind !== "divorce" || currentPartnerIds.has(item.id)));
  const targetId = targetOptions.some((item) => item.id === draft.targetId) ? draft.targetId : targetOptions[0]?.id || "";
  const isParent = draft.kind === "parent" || draft.kind === "child";
  const isSibling = draft.kind === "sibling";
  const isPartnership = ["marriage", "partnership", "divorce"].includes(draft.kind);
  const isDivorce = draft.kind === "divorce";
  const existingRelations = relationshipDeleteOptions(person, people, partnerships);
  const dateValue = isDivorce ? draft.endDate : draft.startDate;
  const datePrecision = isDivorce ? draft.endDatePrecision : draft.startDatePrecision;
  const save = () => onSave({ ...draft, targetId });
  return (
    <div className="editor-content relationship-editor">
      <div className="editor-intro relation-editor-intro"><div className="relation-editor-icon"><Link size={34} /></div><div><span className="eyebrow">Семейная связь</span><h2>Управлять связями</h2><p>Свяжите человека с уже существующей записью или добавьте семейное событие.</p></div></div>
      <div className="form-grid">
        <div className="field field-full"><span>Тип связи</span><div className="date-options relation-options"><button type="button" className={`date-option ${draft.kind === "parent" ? "selected" : ""}`} onClick={() => changeKind("parent")}>Родитель</button><button type="button" className={`date-option ${draft.kind === "child" ? "selected" : ""}`} onClick={() => changeKind("child")}>Ребёнок</button><button type="button" className={`date-option ${draft.kind === "sibling" ? "selected" : ""}`} onClick={() => changeKind("sibling")}>Брат/сестра</button><button type="button" className={`date-option ${draft.kind === "marriage" ? "selected" : ""}`} onClick={() => changeKind("marriage")}>Брак</button><button type="button" className={`date-option ${draft.kind === "partnership" ? "selected" : ""}`} onClick={() => changeKind("partnership")}>Партнёрство</button><button type="button" className={`date-option ${draft.kind === "divorce" ? "selected" : ""}`} onClick={() => changeKind("divorce")}>Развод</button></div></div>
        <label className="field field-full"><span>{isDivorce ? "С кем оформить развод" : "С кем установить связь"}</span><select value={targetId} onChange={(event) => update("targetId", event.target.value)}><option value="">Не выбрано</option>{targetOptions.map((item) => <option key={item.id} value={item.id}>{personDisplayName(item)}{item.year ? ` · ${item.year}` : ""}</option>)}</select></label>
        <label className="field field-full"><span>Источник связи <em>необязательно</em></span><input value={draft.source || ""} maxLength={MAX_EVENT_SOURCE} onChange={(event) => update("source", event.target.value)} placeholder="Например, семейный архив" /></label>
        {isParent && <div className="field field-full"><span>Происхождение связи</span><div className="date-options relation-options"><button type="button" className={`date-option ${draft.parentType === "biological" ? "selected" : ""}`} onClick={() => update("parentType", "biological")}>Биологическая</button><button type="button" className={`date-option ${draft.parentType === "adoptive" ? "selected" : ""}`} onClick={() => update("parentType", "adoptive")}>Усыновление</button><button type="button" className={`date-option ${draft.parentType === "step" ? "selected" : ""}`} onClick={() => update("parentType", "step")}>Степ-родство</button><button type="button" className={`date-option ${draft.parentType === "guardian" ? "selected" : ""}`} onClick={() => update("parentType", "guardian")}>Опекунство</button><button type="button" className={`date-option ${draft.parentType === "unknown" ? "selected" : ""}`} onClick={() => update("parentType", "unknown")}>Неизвестно</button></div><small className="field-hint">Можно указать биологическую связь, усыновление, опекунство, отчимство/мачеху или оставить происхождение неизвестным.</small></div>}
        {isSibling && <div className="field field-full"><span>Вид связи между братом и сестрой</span><div className="date-options relation-options"><button type="button" className={`date-option ${draft.parentType === "biological" ? "selected" : ""}`} onClick={() => update("parentType", "biological")}>Родной</button><button type="button" className={`date-option ${draft.parentType === "half" ? "selected" : ""}`} onClick={() => update("parentType", "half")}>Неполнородный</button><button type="button" className={`date-option ${draft.parentType === "step" ? "selected" : ""}`} onClick={() => update("parentType", "step")}>Сводный</button><button type="button" className={`date-option ${draft.parentType === "unknown" ? "selected" : ""}`} onClick={() => update("parentType", "unknown")}>Неизвестно</button></div><small className="field-hint">Неполнородные — общий только отец или только мать; сводные — без общего биологического родителя.</small></div>}
        {isPartnership && <><label className="field field-full"><span>{isDivorce ? "Дата развода" : "Дата начала отношений"} <em>необязательно</em></span><input value={dateValue} onChange={(event) => update(isDivorce ? "endDate" : "startDate", event.target.value)} placeholder="Точный день или год" /></label><div className="field field-full"><span>Точность даты</span><div className="date-options"><button type="button" className={`date-option ${datePrecision === "exact" ? "selected" : ""}`} onClick={() => update(isDivorce ? "endDatePrecision" : "startDatePrecision", "exact")}>Точный день</button><button type="button" className={`date-option ${datePrecision === "year" ? "selected" : ""}`} onClick={() => update(isDivorce ? "endDatePrecision" : "startDatePrecision", "year")}>Только год</button><button type="button" className={`date-option ${datePrecision === "approximate" ? "selected" : ""}`} onClick={() => update(isDivorce ? "endDatePrecision" : "startDatePrecision", "approximate")}>Примерно</button><button type="button" className={`date-option ${datePrecision === "unknown" ? "selected" : ""}`} onClick={() => update(isDivorce ? "endDatePrecision" : "startDatePrecision", "unknown")}>Неизвестно</button></div></div></>}
        {isDivorce && !targetOptions.length && <p className="relationship-hint field-full">У этого человека пока нет супруга или партнёра, для которого можно указать развод.</p>}
      </div>
      {existingRelations.length > 0 && <div className="relationship-delete-block"><div><span className="field-label">Удалить существующую связь</span><small>Выберите связь, если она была добавлена ошибочно.</small></div><select aria-label="Связь для удаления" value={relationToDelete} onChange={(event) => setRelationToDelete(event.target.value)}><option value="">Не выбрано</option>{existingRelations.map((relation) => <option key={relation.id} value={relation.id}>{relation.label}</option>)}</select><button type="button" className="button delete-person-button" onClick={() => onDeleteRelationship(relationToDelete)} disabled={!relationToDelete}><Trash size={18} /> Удалить связь</button></div>}
      <div className="editor-footer"><button type="button" className="button button-ghost" onClick={onCancel}>Отмена</button><button type="button" className="button button-primary save-button" onClick={save} disabled={!targetId}><FloppyDisk size={18} weight="bold" /> Сохранить связь</button></div>
    </div>
  );
}

function TreeConnections({ people, partnerships, positions, width, height, visibleIds = null, renderIndex = null, strictVisible = false }) {
  const byId = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const fallbackIndex = useMemo(() => createRenderIndex(people, partnerships, byId), [people, partnerships, byId]);
  const index = renderIndex || fallbackIndex;
  const edgeVisible = (edge, firstId, secondId) => !strictVisible || !visibleIds || (visibleIds.has(firstId) && visibleIds.has(secondId));
  const parentEdges = useMemo(() => visibleEdges(index.parentEdges, visibleIds).filter((edge) => positions[edge.parent.id] && positions[edge.child.id] && edgeVisible(edge, edge.parent.id, edge.child.id)), [index, positions, visibleIds, strictVisible]);
  const partnerEdges = useMemo(() => visibleEdges(index.partnershipEdges, visibleIds).filter((edge) => positions[edge.first.id] && positions[edge.second.id] && edgeVisible(edge, edge.first.id, edge.second.id)), [index, positions, visibleIds, strictVisible]);
  return <svg className="tree-connections" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><g className="parent-connections">{parentEdges.map(({ parent, child, type }) => { const from = positions[parent.id]; const to = positions[child.id]; const startX = from.left + from.width / 2; const startY = from.top + from.height; const endX = to.left + to.width / 2; const endY = to.top; const middleY = startY + Math.max(24, (endY - startY) / 2); return <path key={`${parent.id}-${child.id}-${type}`} className={`connection-line ${type === "adoptive" ? "connection-adoptive" : ""} ${type === "step" ? "connection-step" : ""}`} d={`M ${startX} ${startY} V ${middleY} H ${endX} V ${endY}`} />; })}</g><g className="partnership-connections">{partnerEdges.map(({ partnership, first, second }) => { const a = positions[first.id]; const b = positions[second.id]; const start = a.left < b.left ? a : b; const end = a.left < b.left ? b : a; const startX = start.left + start.width; const startY = start.top + start.height / 2; const endX = end.left; const endY = end.top + end.height / 2; const middleX = startX + Math.max(18, (endX - startX) / 2); const label = partnership.status === "divorced" ? "Развод" : partnershipTypeLabel[partnership.type] || "Связь"; return <g key={partnership.id}><path className={`connection-line connection-partnership ${partnership.status === "divorced" ? "connection-divorced" : ""}`} d={`M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}`} /><text className="partnership-label" x={middleX} y={Math.min(startY, endY) - 8} textAnchor="middle">{label}</text></g>; })}</g></svg>;
}

function TreeMiniMap({ people, partnerships, layout, positions, pan, zoom, viewportSize, onNavigate, renderIndex = null }) {
  const mapWidth = 204;
  const mapHeight = 136;
  const padding = 9;
  const scale = Math.min((mapWidth - padding * 2) / layout.width, (mapHeight - padding * 2) / layout.height);
  const point = (position) => ({ x: padding + position.left * scale, y: padding + position.top * scale, width: position.width * scale, height: position.height * scale });
  const fallbackIndex = useMemo(() => createRenderIndex(people, partnerships), [people, partnerships]);
  const index = renderIndex || fallbackIndex;
  const parentLines = index.parentEdges.map(({ parent, child }) => ({ parent: positions[parent.id], child: positions[child.id] })).filter((edge) => edge.parent && edge.child);
  const partnerLines = index.partnershipEdges.map(({ partnership, first, second }) => ({ partnership, first: positions[first.id], second: positions[second.id] })).filter((edge) => edge.first && edge.second);
  const viewportWidth = viewportSize.width ? viewportSize.width / zoom : 0;
  const viewportHeight = viewportSize.height ? viewportSize.height / zoom : 0;
  const visibleBoard = { x: Math.max(0, -pan.x / zoom), y: Math.max(0, -pan.y / zoom), width: Math.min(layout.width, viewportWidth), height: Math.min(layout.height, viewportHeight) };
  const navigate = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = ((event.clientX - rect.left) / rect.width) * mapWidth;
    const localY = ((event.clientY - rect.top) / rect.height) * mapHeight;
    onNavigate({ x: Math.max(0, Math.min(layout.width, (localX - padding) / scale)), y: Math.max(0, Math.min(layout.height, (localY - padding) / scale)) });
  };
  return <div className="tree-minimap" aria-label="Мини-карта всего дерева"><div className="tree-minimap-title">Мини-карта</div><svg width={mapWidth} height={mapHeight} viewBox={`0 0 ${mapWidth} ${mapHeight}`} role="img" aria-label="Обзор дерева" onClick={navigate}><rect className="tree-minimap-board" x="0" y="0" width={mapWidth} height={mapHeight} rx="6" />{parentLines.map(({ parent, child }, index) => { const from = point(parent); const to = point(child); return <line key={`mini-parent-${index}`} className="tree-minimap-parent-line" x1={from.x + from.width / 2} y1={from.y + from.height} x2={to.x + to.width / 2} y2={to.y} />; })}{partnerLines.map(({ first, second }, index) => { const from = point(first); const to = point(second); return <line key={`mini-partner-${index}`} className="tree-minimap-partner-line" x1={from.x + from.width / 2} y1={from.y + from.height / 2} x2={to.x + to.width / 2} y2={to.y + to.height / 2} />; })}{people.map((person) => { const position = positions[person.id]; if (!position) return null; const card = point(position); return <rect key={person.id} className="tree-minimap-person" x={card.x} y={card.y} width={Math.max(3, card.width)} height={Math.max(3, card.height)} rx="1.5" />; })}<rect className="tree-minimap-viewport" x={padding + visibleBoard.x * scale} y={padding + visibleBoard.y * scale} width={Math.max(4, visibleBoard.width * scale)} height={Math.max(4, visibleBoard.height * scale)} rx="2" /></svg><small>Нажмите на область, чтобы перейти к ней</small></div>;
}

function TreeCanvas({ people, partnerships, layout, selectedId, onSelect, zoom, onZoomChange, pan, onPanChange, treeStyle, showPhotos, cardFields, focusRequest, keyboardPanRequest, inspectorOpen, onToggleInspector, onFocusSelected, viewMode = "full", nearbyIds = new Set(), onViewModeChange }) {
  const dragRef = useRef(null);
  const personDragRef = useRef(null);
  const viewportRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [personDraggingId, setPersonDraggingId] = useState("");
  const [manualOffsets, setManualOffsets] = useState({});
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const renderIndex = useMemo(() => createRenderIndex(people, partnerships, peopleById), [people, partnerships, peopleById]);
  const renderedPositions = useMemo(() => Object.fromEntries(Object.entries(layout.positions).map(([id, position]) => {
    const offset = manualOffsets[id] || { x: 0, y: 0 };
    return [id, { ...position, left: position.left + offset.x, top: position.top + offset.y }];
  })), [layout.positions, manualOffsets]);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const updateSize = () => setViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    updateSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
  const visibleIds = useMemo(() => {
    const modeIds = viewMode === "nearby" ? nearbyIds : null;
    if (!viewportSize.width || !viewportSize.height) return modeIds;
    const margin = Math.max(240, 520 / zoom);
    const left = (-pan.x / zoom) - margin;
    const top = (-pan.y / zoom) - margin;
    const right = ((viewportSize.width - pan.x) / zoom) + margin;
    const bottom = ((viewportSize.height - pan.y) / zoom) + margin;
    const viewportIds = new Set(Object.entries(renderedPositions).filter(([, position]) => position.left + position.width >= left && position.left <= right && position.top + position.height >= top && position.top <= bottom).map(([id]) => id));
    if (!modeIds) return viewportIds;
    return new Set([...modeIds].filter((id) => viewportIds.has(id)));
  }, [renderedPositions, pan.x, pan.y, zoom, viewportSize, viewMode, nearbyIds]);
  const visiblePeople = useMemo(() => visibleIds ? people.filter((person) => visibleIds.has(person.id)) : people, [people, visibleIds]);
  useEffect(() => {
    const knownIds = new Set(Object.keys(layout.positions));
    setManualOffsets((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([id]) => knownIds.has(id)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [layout.positions]);
  const getPanBounds = (forZoom = zoom) => {
    const viewport = viewportRef.current;
    if (!viewport) return { minX: -900, maxX: 900, minY: -650, maxY: 650 };
    const edgePadding = 24;
    const boardRight = viewport.clientWidth - layout.width * forZoom - edgePadding;
    const boardBottom = viewport.clientHeight - layout.height * forZoom - edgePadding;
    return { minX: Math.min(edgePadding, boardRight), maxX: Math.max(edgePadding, boardRight), minY: Math.min(edgePadding, boardBottom), maxY: Math.max(edgePadding, boardBottom) };
  };
  const clampPan = (value, forZoom = zoom) => { const bounds = getPanBounds(forZoom); return { x: Math.max(bounds.minX, Math.min(bounds.maxX, value.x)), y: Math.max(bounds.minY, Math.min(bounds.maxY, value.y)) }; };
  const movePan = (x, y) => onPanChange(clampPan({ x: pan.x + x, y: pan.y + y }));
  const centerView = () => {
    const width = viewportSize.width || viewportRef.current?.clientWidth || 0;
    const height = viewportSize.height || viewportRef.current?.clientHeight || 0;
    if (!width || !height) return;
    onPanChange(clampPan({ x: (width - layout.width * zoom) / 2, y: (height - layout.height * zoom) / 2 }));
  };
  const fitAll = () => {
    const width = viewportSize.width || viewportRef.current?.clientWidth || 0;
    const height = viewportSize.height || viewportRef.current?.clientHeight || 0;
    if (!width || !height) return;
    const nextZoom = Math.max(0.55, Math.min(1.35, Math.min((width - 48) / layout.width, (height - 48) / layout.height)));
    onZoomChange(nextZoom);
    onPanChange(clampPan({ x: (width - layout.width * nextZoom) / 2, y: (height - layout.height * nextZoom) / 2 }, nextZoom));
  };
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
    if (!keyboardPanRequest?.token) return;
    movePan(keyboardPanRequest.dx, keyboardPanRequest.dy);
  }, [keyboardPanRequest?.token]);
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
  const navigateToBoardPoint = ({ x, y }) => {
    const width = viewportSize.width || viewportRef.current?.clientWidth || 0;
    const height = viewportSize.height || viewportRef.current?.clientHeight || 0;
    if (!width || !height) return;
    onPanChange(clampPan({ x: width / 2 - x * zoom, y: height / 2 - y * zoom }));
  };
  const styleLabel = treeStyle === "album" ? "Семейный альбом" : treeStyle === "minimal" ? "Сдержанный" : "Классический";
  return (
    <section className={`tree-panel tree-style-${treeStyle}`}>
      <div className="tree-view-mode" role="group" aria-label="Режим просмотра дерева"><span>Вид дерева</span><button type="button" className={viewMode === "full" ? "selected" : ""} aria-pressed={viewMode === "full"} onClick={() => onViewModeChange?.("full")}>Всё дерево</button><button type="button" className={viewMode === "nearby" ? "selected" : ""} aria-pressed={viewMode === "nearby"} onClick={() => onViewModeChange?.("nearby")} disabled={!selectedId}>Ближайшая семья</button></div>
      <div className="tree-controls left-controls"><div className="pan-control"><IconButton label="Переместить вверх" onClick={() => movePan(0, -110)}><CaretUp size={18} /></IconButton><IconButton label="Переместить влево" onClick={() => movePan(-110, 0)}><CaretLeft size={18} /></IconButton><IconButton label="Переместить вправо" onClick={() => movePan(110, 0)}><CaretRight size={18} /></IconButton><IconButton label="Переместить вниз" onClick={() => movePan(0, 110)}><CaretDown size={18} /></IconButton></div><div className="zoom-control"><IconButton label="Увеличить" onClick={() => onZoomChange(Math.min(1.35, zoom + 0.08))}><Plus size={18} /></IconButton><span>{Math.round(zoom * 100)}%</span><IconButton label="Уменьшить" onClick={() => onZoomChange(Math.max(0.55, zoom - 0.08))}><Minus size={18} /></IconButton></div><div className="view-command-control"><IconButton label="Показать всё дерево" onClick={fitAll}><ArrowsOut size={18} /></IconButton><IconButton label="По центру" onClick={centerView}><Crosshair size={18} /></IconButton><IconButton label="Вернуться к выбранному человеку" onClick={onFocusSelected} disabled={!selectedId}><MapPin size={18} /></IconButton></div>{!inspectorOpen && <IconButton label="Открыть панель сведений" className="inspector-toggle-control" onClick={onToggleInspector}><Info size={20} /></IconButton>}</div>
      <div ref={viewportRef} className={`tree-viewport ${dragging ? "is-dragging" : ""}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onWheel={onWheel}><div className="tree-board" style={{ width: layout.width, height: layout.height, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}><TreeConnections people={people} partnerships={partnerships} positions={renderedPositions} visibleIds={visibleIds} strictVisible={viewMode === "nearby"} renderIndex={renderIndex} width={layout.width} height={layout.height} />{layout.generations.map((group) => <span className="generation-label" key={group.index} style={{ top: layout.top - 38 + group.index * layout.rowStep, left: 24 }}>Поколение {group.index + 1}</span>)}{visiblePeople.map((person) => renderedPositions[person.id] ? <TreeNode key={person.id} person={person} position={renderedPositions[person.id]} selected={person.id === selectedId} onSelect={onSelect} showPhotos={showPhotos} cardFields={cardFields} dragging={person.id === personDraggingId} onDragStart={onPersonPointerDown} onDragMove={onPersonPointerMove} onDragEnd={onPersonPointerEnd} /> : null)}</div></div>
      {people.length > 0 && <TreeMiniMap people={people} partnerships={partnerships} layout={layout} positions={renderedPositions} pan={pan} zoom={zoom} viewportSize={viewportSize} onNavigate={navigateToBoardPoint} renderIndex={renderIndex} />}
      <div className="tree-status"><span><UsersThree size={17} /> Всего людей: {people.length}</span><span className="status-divider" /><span>Поколений: {layout.generations.length}</span><span className="tree-view-status">{viewMode === "nearby" ? "Ближайшая семья" : "Всё дерево"} · {showPhotos ? "Фото включены" : "Фото скрыты"} · {styleLabel}</span></div>
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

function fileNameFromPath(value) {
  return String(value || "").split(/[\\/]/).pop() || "";
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

function UnsavedChangesModal({ onSave, onDiscard, onCancel }) {
  return (
    <div className="backup-modal-backdrop" role="presentation" onClick={onCancel}>
      <section className="backup-modal confirm-modal unsaved-modal" role="dialog" aria-modal="true" aria-labelledby="unsaved-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="backup-modal-header"><div><span className="eyebrow">Проект изменён</span><h2 id="unsaved-modal-title">Сохранить изменения?</h2><p>Есть сведения, которые ещё не сохранены в файл проекта. Выберите действие перед продолжением.</p></div><button type="button" className="icon-button backup-close" onClick={onCancel} aria-label="Отменить действие"><X size={21} /></button></div>
        <div className="unsaved-actions"><button type="button" className="button button-ghost" onClick={onCancel}>Отмена</button><button type="button" className="button danger-button" onClick={onDiscard}>Не сохранять</button><button type="button" className="button button-primary" onClick={onSave}><FloppyDisk size={18} /> Сохранить и продолжить</button></div>
      </section>
    </div>
  );
}

function DataQualityModal({ report, peopleCount, onClose }) {
  const errors = Array.isArray(report?.errors) ? report.errors : [];
  const warnings = Array.isArray(report?.warnings) ? report.warnings : [];
  const issues = [...errors.map((message) => ({ kind: "error", message })), ...warnings.map((message) => ({ kind: "warning", message }))];
  return (
    <div className="backup-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="backup-modal quality-modal" role="dialog" aria-modal="true" aria-labelledby="quality-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="backup-modal-header"><div><span className="eyebrow">Проверка проекта</span><h2 id="quality-modal-title">Проверить данные</h2><p>Проверка ничего не удаляет и не меняет. Она помогает заметить возможные дубликаты и противоречия перед сохранением семейной истории.</p></div><button type="button" className="icon-button backup-close" onClick={onClose} aria-label="Закрыть проверку данных"><X size={21} /></button></div>
        <div className={`quality-summary ${issues.length ? "quality-summary-warning" : "quality-summary-valid"}`} role="status"><div className="quality-summary-icon">{issues.length ? <Info size={22} /> : <CheckCircle size={22} weight="fill" />}</div><div><strong>{issues.length ? `Найдено замечаний: ${issues.length}` : "Замечаний не найдено"}</strong><span>Записей проверено: {peopleCount}</span></div></div>
        {issues.length ? <div className="quality-list" aria-label="Список замечаний">{issues.map((issue, index) => <div className={`quality-item quality-item-${issue.kind}`} key={`${issue.kind}-${issue.message}`}><span className="quality-item-number">{index + 1}</span><span>{issue.message}</span></div>)}</div> : <div className="quality-empty"><CheckCircle size={30} weight="fill" /><strong>Сведения выглядят согласованно</strong><span>Если вы добавите новые записи или связи, проверку можно запустить снова.</span></div>}
        <div className="quality-note"><Info size={16} /> Возможное противоречие не всегда означает ошибку: например, однофамильцы могут быть разными людьми. Откройте записи и уточните сведения вручную.</div>
        <div className="confirm-actions"><button type="button" className="button button-primary" onClick={onClose}>Понятно</button></div>
      </section>
    </div>
  );
}

function MainMenuModal({ onCreate, onLoad, onSettings, onHelp, onExit, onClose }) {
  const [closing, setClosing] = useState(false);
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 160);
  };
  return (
    <div className={`main-menu-backdrop ${closing ? "is-closing" : ""}`} role="presentation" onClick={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section className="main-menu-card" role="dialog" aria-modal="true" aria-labelledby="main-menu-title" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="icon-button main-menu-close" onClick={requestClose} aria-label="Закрыть главное меню"><X size={21} /></button>
        <div className="main-menu-brand"><BrandMark className="menu-logo" /><div><h1 id="main-menu-title">Семейное древо</h1><p>Храните историю семьи на своём компьютере.</p></div></div>
        <div className="main-menu-list">
          <button type="button" className="main-menu-action main-menu-action-primary" onClick={onCreate}><Plus size={21} weight="bold" /><span><strong>Создать древо</strong><small>Начать новый семейный проект</small></span><CaretRight size={18} /></button>
          <button type="button" className="main-menu-action" onClick={onLoad}><FolderOpen size={21} /><span><strong>Загрузить древо</strong><small>Открыть сохранённый файл проекта</small></span><CaretRight size={18} /></button>
          <button type="button" className="main-menu-action" onClick={onSettings}><Note size={21} /><span><strong>Настройки</strong><small>Имя проекта, вид и автосохранение</small></span><CaretRight size={18} /></button>
          <button type="button" className="main-menu-action" onClick={onHelp}><Info size={21} /><span><strong>Инструкция для пользователей</strong><small>Пошаговое объяснение с иллюстрациями</small></span><CaretRight size={18} /></button>
          <button type="button" className="main-menu-action main-menu-action-exit" onClick={onExit}><X size={21} /><span><strong>Выход из приложения</strong><small>Закрыть окно программы</small></span></button>
        </div>
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
  { image: "04-tree.svg", source: "source-04-tree.jpg", title: "Смотреть дерево и перемещаться по полотну", text: "Дерево можно рассматривать как большое полотно: двигайте пустое место зажатой ЛКМ, меняйте масштаб и перетаскивайте карточки внутри своего поколения.", tips: ["Стрелки слева перемещают полотно небольшими шагами.", "Карточка не может наехать на соседнюю.", "Если потянуть её в другое поколение, она вернётся на свою строку.", "Порядок братьев и сестёр меняется в правой панели кнопками «Выше» и «Ниже»."] },
  { image: "05-search.svg", source: "source-05-search.jpg", title: "Найти человека и показать его на карте", text: "Введите часть имени в строку поиска. После выбора записи правая панель покажет сведения, семейный статус, роли и ID связей.", tips: ["Нажмите «Показать найденного человека на карте», чтобы центрировать дерево.", "Нажатие на родственника в правой панели открывает его карточку.", "Панель можно закрыть крестиком и открыть снова кнопкой на полотне."] },
  { image: "06-relationships.svg", source: "source-06-relationships.jpg", title: "Управлять связями и удалять ошибочные записи", text: "Кнопка «Управлять связями» добавляет родство, брак, партнёрство или развод между уже существующими людьми.", tips: ["Степ-родство используется для отчима, мачехи, пасынка и падчерицы.", "Каждая связь получает отдельный ID.", "Удаление человека требует подтверждения и создаёт защитную копию."] },
  { image: "07-backups.svg", source: "source-07-backups.jpg", title: "Копии, архив и восстановление", text: "Приложение автоматически сохраняет локальные копии. Через меню «•••» можно открыть список копий или создать полный архив материалов для переноса.", tips: ["Копии хранятся на этом компьютере.", "Архив .familyarchive включает людей, фотографии, биографии, связи и источники.", "Перед восстановлением архива приложение проверяет его содержимое."] },
  { image: "08-export-settings.svg", source: "source-08-export-settings.jpg", title: "Экспорт и настройки", text: "Кнопка «Экспорт» подготавливает файлы для альбома, типографии и печати. Настройки проекта находятся в меню и сохраняются локально.", tips: ["PNG подходит для семейного альбома.", "TIFF подходит для типографии.", "PDF можно сделать плакатом или разбить на листы."] },
];

function InstructionModal({ onClose }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const instructionCardRef = useRef(null);
  const pointerStartedInsideCardRef = useRef(false);
  const step = instructionSteps[activeIndex];
  const goTo = (index) => setActiveIndex(Math.max(0, Math.min(instructionSteps.length - 1, index)));
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 180);
  };
  const handleBackdropPointerDown = (event) => {
    pointerStartedInsideCardRef.current = instructionCardRef.current?.contains(event.target) || false;
  };
  const handleBackdropClick = (event) => {
    const clickedBackdrop = event.target === event.currentTarget;
    const startedInsideCard = pointerStartedInsideCardRef.current;
    pointerStartedInsideCardRef.current = false;
    if (clickedBackdrop && !startedInsideCard) requestClose();
  };
  return (
    <div className={`instruction-backdrop ${closing ? "is-closing" : ""}`} role="presentation" onPointerDown={handleBackdropPointerDown} onClick={handleBackdropClick}>
      <section ref={instructionCardRef} className={`instruction-card ${closing ? "is-closing" : ""}`} role="dialog" aria-modal="true" aria-labelledby="instruction-title" onClick={(event) => event.stopPropagation()}>
        <header className="instruction-header"><div><span className="eyebrow">Пошаговая инструкция</span><h2 id="instruction-title">Как пользоваться семейным древом</h2><p>Выберите раздел слева или листайте кнопками «Назад» и «Далее». Окно можно увеличить за правый нижний угол.</p></div><button type="button" className="icon-button backup-close" onClick={requestClose} aria-label="Закрыть инструкцию"><X size={22} /></button></header>
        <div className="instruction-layout">
          <nav className="instruction-nav" aria-label="Разделы инструкции">{instructionSteps.map((item, index) => <button type="button" key={item.image} className={`instruction-nav-item ${index === activeIndex ? "selected" : ""}`} onClick={() => goTo(index)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.title}</strong></button>)}</nav>
          <article className="instruction-page"><div className="instruction-image-frame"><div className="instruction-image-stage"><img className="instruction-source-image" src={`/instruction/${step.source}`} alt={`Экран приложения: ${step.title}`} /><img className="instruction-overlay-image" src={`/instruction/${step.image}`} alt="" aria-hidden="true" /></div><button type="button" className="button instruction-image-expand" onClick={() => setPreviewOpen(true)}><MagnifyingGlass size={16} /> Открыть изображение крупно</button></div><div className="instruction-copy"><span className="instruction-counter">Шаг {activeIndex + 1} из {instructionSteps.length}</span><h3>{step.title}</h3><p>{step.text}</p><ul>{step.tips.map((tip) => <li key={tip}><CheckCircle size={17} weight="fill" />{tip}</li>)}</ul></div></article>
        </div>
        <footer className="instruction-footer"><button type="button" className="button button-ghost" onClick={() => goTo(activeIndex - 1)} disabled={activeIndex === 0}><CaretLeft size={18} /> Назад</button><div className="instruction-dots" aria-label="Прогресс инструкции">{instructionSteps.map((item, index) => <button type="button" key={item.image} className={index === activeIndex ? "selected" : ""} onClick={() => goTo(index)} aria-label={`Перейти к шагу ${index + 1}`} />)}</div><button type="button" className="button button-primary" onClick={() => activeIndex === instructionSteps.length - 1 ? requestClose() : goTo(activeIndex + 1)}>{activeIndex === instructionSteps.length - 1 ? "Завершить" : "Далее"} <CaretRight size={18} /></button></footer>
      </section>
      {previewOpen && <div className="instruction-preview-backdrop" role="presentation" onClick={() => setPreviewOpen(false)}><section className="instruction-preview-card" role="dialog" aria-modal="true" aria-labelledby="instruction-preview-title" onClick={(event) => event.stopPropagation()}><header className="instruction-preview-header"><div><span className="eyebrow">Увеличенный просмотр</span><h3 id="instruction-preview-title">{step.title}</h3><p>Здесь схема показана в большом размере. При необходимости прокрутите её.</p></div><button type="button" className="icon-button backup-close" onClick={() => setPreviewOpen(false)} aria-label="Закрыть увеличенный просмотр"><X size={22} /></button></header><div className="instruction-preview-scroll"><div className="instruction-preview-stage"><img className="instruction-source-image" src={`/instruction/${step.source}`} alt={`Экран приложения крупно: ${step.title}`} /><img className="instruction-overlay-image" src={`/instruction/${step.image}`} alt="" aria-hidden="true" /></div></div></section></div>}
    </div>
  );
}

function BackupModal({ backups, projectMeta, lastSavedAt, lastBackupAt, onClose, onRestore, onDownload }) {
  const [verification, setVerification] = useState(null);
  const reasonLabels = { auto: "Автокопия", save: "После сохранения", "before-open": "Перед открытием", "before-restore": "Перед восстановлением", "before-delete": "Перед удалением", "before-new": "Перед созданием нового дерева" };
  const verifySelectedBackup = (backup) => setVerification({ backup, report: verifyBackup(backup) });
  const restoreVerifiedBackup = () => {
    if (!verification?.report?.valid) return;
    onRestore(verification.backup, verification.report);
    setVerification(null);
  };
  return (
    <div className="backup-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="backup-modal" role="dialog" aria-modal="true" aria-labelledby="backup-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="backup-modal-header"><div><span className="eyebrow">Сохранение и восстановление</span><h2 id="backup-modal-title">Резервные копии</h2><p>Перед восстановлением приложение отдельно проверяет выбранную копию проекта.</p></div><button type="button" className="icon-button backup-close" onClick={onClose} aria-label="Закрыть резервные копии"><X size={21} /></button></div>
        <div className="backup-project-summary"><div><span>Текущий проект</span><strong>{projectMeta?.title || "Моё семейное древо"}</strong><small>{projectMeta?.fileName || "семейное-древо.familytree"}</small></div><div><span>Путь к файлу</span><strong className="backup-path-value">{projectMeta?.filePath || "Путь появится после сохранения через окно приложения"}</strong></div><div><span>Последнее сохранение</span><strong>{lastSavedAt ? formatDateTime(lastSavedAt) : "Ещё не сохранялся"}</strong><small>Последняя копия: {lastBackupAt ? formatDateTime(lastBackupAt) : "нет"}</small></div></div>
        {verification && <div className={`backup-verification ${verification.report.valid ? "backup-verification-valid" : "backup-verification-invalid"}`} role="status"><div className="backup-verification-copy"><strong>{verification.report.valid ? "Копия прошла проверку" : "Копия не прошла проверку"}</strong><span>{verification.report.valid ? `Людей: ${verification.report.peopleCount} · связей: ${verification.report.relationCount}${verification.report.warnings.length ? ` · замечаний: ${verification.report.warnings.length}` : ""}` : verification.report.error}</span>{verification.report.valid && verification.report.warnings.length > 0 && <small>{verification.report.warnings.slice(0, 2).join(" ")}</small>}</div><div className="backup-verification-actions"><button type="button" className="button button-ghost" onClick={() => setVerification(null)}>Отмена</button>{verification.report.valid && <button type="button" className="button button-primary" onClick={restoreVerifiedBackup}>Восстановить проверенную копию</button>}</div></div>}
        {backups.length === 0 ? <div className="backup-empty"><ClockCounterClockwise size={32} /><strong>Автоматических копий пока нет</strong><span>После изменения данных копия появится здесь автоматически.</span></div> : <div className="backup-list">{backups.map((backup) => <article className="backup-item" key={backup.id}><div className="backup-item-icon"><ClockCounterClockwise size={19} /></div><div className="backup-meta"><strong>{formatDateTime(backup.createdAt)}</strong><span>{reasonLabels[backup.reason] || "Резервная копия"} · людей: {backup.peopleCount}</span></div><div className="backup-actions"><button type="button" className="button button-ghost" onClick={() => onDownload(backup)}><DownloadSimple size={17} /> Скачать</button><button type="button" className="button button-secondary" onClick={() => verifySelectedBackup(backup)}>Проверить и восстановить</button></div></article>)}</div>}
        <div className="backup-note"><Info size={16} /> Для защиты от потери данных периодически скачивайте файл проекта на внешний диск или флешку. Восстановление не изменится, пока вы не подтвердите проверенную копию.</div>
      </section>
    </div>
  );
}

function ArchiveModal({ payload, importState, onClose, onDownload, onImport, onRestoreImport, onClearImport }) {
  const inputRef = useRef(null);
  const archive = useMemo(() => createFamilyArchive(payload), [payload]);
  const contents = archive.contents;
  const report = importState?.report;
  return (
    <div className="backup-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="backup-modal archive-modal" role="dialog" aria-modal="true" aria-labelledby="archive-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="backup-modal-header"><div><span className="eyebrow">Локальные семейные материалы</span><h2 id="archive-modal-title">Архив семейных материалов</h2><p>Один файл с проектом, фотографиями, биографиями, связями и источниками.</p></div><button type="button" className="icon-button backup-close" onClick={onClose} aria-label="Закрыть архив материалов"><X size={21} /></button></div>
        <div className="archive-summary" aria-label="Состав текущего архива">
          <div><strong>{contents.people}</strong><span>людей</span></div>
          <div><strong>{contents.relations}</strong><span>связей</span></div>
          <div><strong>{contents.photos}</strong><span>фотографий</span></div>
          <div><strong>{contents.biographies}</strong><span>биографий</span></div>
          <div><strong>{contents.sources}</strong><span>источников</span></div>
        </div>
        <div className="archive-actions"><button type="button" className="button button-primary" onClick={onDownload}><DownloadSimple size={18} /> Скачать полный архив</button><button type="button" className="button button-secondary" onClick={() => inputRef.current?.click()}><FolderOpen size={18} /> Загрузить архив</button><input ref={inputRef} className="visually-hidden" type="file" accept=".familyarchive,application/json" onChange={onImport} /></div>
        <div className="archive-note"><Info size={16} /> Архив хранится только на выбранном компьютере. Его можно скопировать на внешний диск или флешку и восстановить в этом приложении.</div>
        {importState && <div className={`archive-verification ${report?.valid ? "archive-verification-valid" : "archive-verification-invalid"}`} role="status"><div className="backup-verification-copy"><strong>{report?.valid ? "Архив прошёл проверку" : "Архив не прошёл проверку"}</strong><span>{importState.fileName}{report?.valid ? ` · людей: ${report.contents.people} · связей: ${report.contents.relations} · фото: ${report.contents.photos}` : ` · ${report?.error || "Файл повреждён."}`}</span>{report?.valid && report.warnings.length > 0 && <small>{report.warnings.slice(0, 2).join(" ")}</small>}</div><div className="backup-verification-actions"><button type="button" className="button button-ghost" onClick={onClearImport}>Отмена</button>{report?.valid && <button type="button" className="button button-primary" onClick={() => onRestoreImport(report.payload)}>Восстановить архив</button>}</div></div>}
      </section>
    </div>
  );
}

function CardFieldsPicker({ cardFields, onChange }) {
  const selected = sanitizeCardFields(cardFields);
  const toggle = (value) => {
    if (selected.includes(value) && selected.length === 1) return;
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  };
  return <div className="view-setting-group card-fields-picker"><div><span className="field-label">Поля на карточках</span><small className="field-hint">Выберите, что показывать под именем. Дата остаётся всегда, чтобы карточка не теряла главный ориентир.</small></div><div className="card-field-choice-list">{CARD_FIELD_OPTIONS.map((option) => <label className={`card-field-choice ${selected.includes(option.value) ? "selected" : ""}`} key={option.value}><input type="checkbox" checked={selected.includes(option.value)} disabled={selected.includes(option.value) && selected.length === 1} onChange={() => toggle(option.value)} /><span><strong>{option.label}</strong><small>{option.description}</small></span></label>)}</div></div>;
}

function ViewSettingsModal({ treeStyle, showPhotos, cardFields, onTreeStyleChange, onShowPhotosChange, onCardFieldsChange, onClose }) {
  const styles = [{ value: "classic", title: "Классический", description: "Чёткие карточки и спокойные линии" }, { value: "album", title: "Семейный альбом", description: "Тёплая бумажная палитра и цветные фото" }, { value: "minimal", title: "Сдержанный", description: "Больше воздуха и меньше декоративных деталей" }];
  return (
    <div className="backup-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="backup-modal view-settings-modal" role="dialog" aria-modal="true" aria-labelledby="view-settings-title" onClick={(event) => event.stopPropagation()}>
        <div className="backup-modal-header"><div><span className="eyebrow">Визуализация дерева</span><h2 id="view-settings-title">Настроить вид</h2><p>Выберите, как показывать семейные карточки на полотне.</p></div><button type="button" className="icon-button backup-close" onClick={onClose} aria-label="Закрыть настройки вида"><X size={21} /></button></div>
        <div className="view-settings-body"><label className="view-toggle"><input type="checkbox" checked={showPhotos} onChange={(event) => onShowPhotosChange(event.target.checked)} /><span><strong>Показывать фотографии</strong><small>Фото будут видны на карточках людей и в дереве.</small></span></label><div className="view-setting-group"><span className="field-label">Стиль карточек</span><div className="style-choice-list">{styles.map((style) => <button type="button" key={style.value} className={`style-choice ${treeStyle === style.value ? "selected" : ""}`} onClick={() => onTreeStyleChange(style.value)}><span className="style-choice-preview" data-style={style.value} /><span><strong>{style.title}</strong><small>{style.description}</small></span></button>)}</div></div><CardFieldsPicker cardFields={cardFields} onChange={onCardFieldsChange} /></div>
        <div className="view-settings-footer"><button type="button" className="button button-primary" onClick={onClose}>Готово</button></div>
      </section>
    </div>
  );
}

function ProjectSettingsModal({ projectMeta, autoSaveEnabled, treeStyle, showPhotos, largeText, cardFields, onSave, onClose }) {
  const [title, setTitle] = useState(projectMeta.title || "Моё семейное древо");
  const [autoSave, setAutoSave] = useState(autoSaveEnabled);
  const [nextTreeStyle, setNextTreeStyle] = useState(treeStyle);
  const [nextShowPhotos, setNextShowPhotos] = useState(showPhotos);
  const [nextLargeText, setNextLargeText] = useState(largeText);
  const [nextCardFields, setNextCardFields] = useState(sanitizeCardFields(cardFields));
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
    onSave({ title: trimmedTitle, autoSave, treeStyle: nextTreeStyle, showPhotos: nextShowPhotos, largeText: nextLargeText, cardFields: nextCardFields });
  };
  return (
    <div className="backup-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="backup-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="project-settings-title" onClick={(event) => event.stopPropagation()}>
        <div className="backup-modal-header"><div><span className="eyebrow">Параметры проекта</span><h2 id="project-settings-title">Настройки</h2><p>Основные настройки сохраняются в локальной копии проекта.</p></div><button type="button" className="icon-button backup-close" onClick={onClose} aria-label="Закрыть настройки"><X size={21} /></button></div>
        <div className="view-settings-body settings-body">
          <label className={`field settings-title-field ${error ? "has-error" : ""}`}><span>Название проекта</span><input value={title} onChange={(event) => { setTitle(event.target.value); setError(""); }} placeholder="Например, Семья Петровых" aria-invalid={Boolean(error)} />{error && <small className="field-error">{error}</small>}</label>
          <label className="view-toggle"><input type="checkbox" checked={autoSave} onChange={(event) => setAutoSave(event.target.checked)} /><span><strong>Автоматически сохранять изменения</strong><small>Локальная копия и резервная копия создаются после изменений.</small></span></label>
          <label className="view-toggle"><input type="checkbox" checked={nextShowPhotos} onChange={(event) => setNextShowPhotos(event.target.checked)} /><span><strong>Показывать фотографии</strong><small>Фото будут видны на карточках людей и в дереве.</small></span></label>
          <label className="view-toggle accessibility-toggle"><input type="checkbox" checked={nextLargeText} onChange={(event) => setNextLargeText(event.target.checked)} /><span><strong>Крупный текст</strong><small>Увеличивает основные подписи, кнопки, карточки и сведения для более комфортного чтения.</small></span></label>
          <CardFieldsPicker cardFields={nextCardFields} onChange={setNextCardFields} />
          <div className="view-setting-group"><span className="field-label">Стиль карточек</span><div className="style-choice-list">{styles.map((style) => <button type="button" key={style.value} className={`style-choice ${nextTreeStyle === style.value ? "selected" : ""}`} onClick={() => setNextTreeStyle(style.value)}><span className="style-choice-preview" data-style={style.value} /><span><strong>{style.title}</strong><small>{style.description}</small></span></button>)}</div></div>
        </div>
        <div className="view-settings-footer"><button type="button" className="button button-ghost" onClick={onClose}>Отмена</button><button type="button" className="button button-primary" onClick={save}>Сохранить настройки</button></div>
      </section>
    </div>
  );
}

export function App() {
  const [loadedSession] = useState(() => readWorkingCopy());
  const sessionPeople = loadedSession ? loadedSession.people : initialPeople;
  const sessionPartnerships = loadedSession ? (loadedSession.partnerships || []) : initialPartnerships;
  const sessionProject = loadedSession?.project || { id: "local-family-tree", title: "Моё семейное древо", fileName: "семейное-древо.familytree" };
  const sessionSettings = { ...defaultProjectSettings, ...(sessionProject.settings || {}), cardFields: sanitizeCardFields(sessionProject.settings?.cardFields) };
  const [people, setPeople] = useState(sessionPeople);
  const [partnerships, setPartnerships] = useState(sessionPartnerships);
  const [projectMeta, setProjectMeta] = useState({ ...sessionProject, settings: sessionSettings });
  const initialSelectedId = sessionPeople.find((person) => person.id === "ivan")?.id || sessionPeople[0]?.id || "";
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [personNavigation, setPersonNavigation] = useState(() => createPersonNavigation(initialSelectedId));
  const personNavigationRef = useRef(createPersonNavigation(initialSelectedId));
  const [query, setQuery] = useState("");
  const [searchFilters, setSearchFilters] = useState({ ...DEFAULT_SEARCH_FILTERS });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [treeViewMode, setTreeViewMode] = useState("full");
  const [focusRequest, setFocusRequest] = useState(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorWidth, setInspectorWidth] = useState(() => {
    if (typeof window === "undefined") return 380;
    try {
      const savedWidth = Number(window.localStorage?.getItem("family-tree-inspector-width"));
      return Number.isFinite(savedWidth) && savedWidth >= 300 && savedWidth <= 560 ? savedWidth : 380;
    } catch {
      return 380;
    }
  });
  const [inspectorResizing, setInspectorResizing] = useState(false);
  const [keyboardPanRequest, setKeyboardPanRequest] = useState(null);
  const [treeStyle, setTreeStyle] = useState(sessionSettings.treeStyle || "classic");
  const [showPhotos, setShowPhotos] = useState(sessionSettings.showPhotos !== false);
  const [largeText, setLargeText] = useState(sessionSettings.largeText === true);
  const [cardFields, setCardFields] = useState(sessionSettings.cardFields);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(sessionSettings.autoSave !== false);
  const [editing, setEditing] = useState(false);
  const [editorSessionKey, setEditorSessionKey] = useState(0);
  const [relationshipEditing, setRelationshipEditing] = useState(false);
  const [relationshipCalculatorOpen, setRelationshipCalculatorOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [relationshipMode, setRelationshipMode] = useState("");
  const [relationshipType, setRelationshipType] = useState("biological");
  const [partnershipType, setPartnershipType] = useState("marriage");
  const [connectionTargetId, setConnectionTargetId] = useState("");
  const [relationshipSource, setRelationshipSource] = useState("");
  const [unknownParent, setUnknownParent] = useState(false);
  const [singleKnownParent, setSingleKnownParent] = useState(false);
  const [outOfMarriage, setOutOfMarriage] = useState(false);
  const [siblingWithoutParents, setSiblingWithoutParents] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportPreset, setExportPreset] = useState("pdf");
  const [moreOpen, setMoreOpen] = useState(false);
  const [mainMenuOpen, setMainMenuOpen] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState("");
  const [relationshipDeleteConfirm, setRelationshipDeleteConfirm] = useState(null);
  const [newTreeConfirmOpen, setNewTreeConfirmOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [toastAction, setToastAction] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [pendingUnsavedAction, setPendingUnsavedAction] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(loadedSession?.savedAt || null);
  const [lastBackupAt, setLastBackupAt] = useState(() => readBackups()[0]?.createdAt || null);
  const [backups, setBackups] = useState(() => readBackups());
  const [backupOpen, setBackupOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveImport, setArchiveImport] = useState(null);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [instructionOpen, setInstructionOpen] = useState(false);
  const [returnToMenuAfterModal, setReturnToMenuAfterModal] = useState("");
  const [updateStatus, setUpdateStatus] = useState(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [qualityReport, setQualityReport] = useState({ valid: true, errors: [], warnings: [] });
  const historyRef = useRef(null);
  const [historyStatus, setHistoryStatus] = useState({ canUndo: false, canRedo: false });
  const fileInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const inspectorResizeRef = useRef(null);
  const selectedPerson = people.find((person) => person.id === selectedId) || people[0];
  if (!historyRef.current) historyRef.current = createHistory(createSnapshot(people, partnerships, projectMeta));
  const treeLayout = useMemo(() => buildTreeLayout(people, partnerships, { cardWidth: largeText ? 220 : 190, cardHeight: (largeText ? 108 : 92) + Math.max(0, sanitizeCardFields(cardFields).length - 1) * (largeText ? 16 : 14) }), [people, partnerships, cardFields, largeText]);
  const deferredQuery = useDeferredValue(query);
  const hasActiveSearch = Boolean(query.trim() || Object.entries(searchFilters).some(([field, value]) => value && value !== DEFAULT_SEARCH_FILTERS[field]));
  const searchResults = useMemo(() => filterPeople(people, partnerships, treeLayout.positions, deferredQuery, searchFilters), [people, partnerships, deferredQuery, searchFilters, treeLayout.positions]);
  const nearbyFamilyIds = useMemo(() => getNearbyFamilyIds(people, partnerships, selectedId), [people, partnerships, selectedId]);
  const resetPersonNavigation = (id) => {
    const next = createPersonNavigation(id);
    personNavigationRef.current = next;
    setPersonNavigation(next);
  };
  const setSelectedPerson = (id, { record = true } = {}) => {
    const person = people.find((item) => item.id === id);
    if (!person) return false;
    if (record) {
      const next = visitPerson(personNavigationRef.current, id);
      personNavigationRef.current = next;
      setPersonNavigation(next);
    }
    setSelectedId(id);
    return true;
  };
  const navigatePersonHistory = (direction) => {
    const next = movePersonNavigation(personNavigationRef.current, direction);
    const id = currentPersonId(next);
    if (!id || !people.some((person) => person.id === id)) return;
    personNavigationRef.current = next;
    setPersonNavigation(next);
    setSelectedPerson(id, { record: false });
    setQuery("");
    setFiltersOpen(false);
    setEditing(false);
    setRelationshipEditing(false);
    setInspectorOpen(true);
    setFocusRequest((current) => ({ id, token: (current?.token || 0) + 1 }));
  };
  const changeTreeViewMode = (mode) => {
    if (mode === "nearby" && !selectedId) {
      setToast("Сначала выберите человека");
      return;
    }
    setTreeViewMode(mode);
    if (mode === "nearby" && selectedId) setFocusRequest((current) => ({ id: selectedId, token: (current?.token || 0) + 1 }));
    setToast(mode === "nearby" ? "Показана ближайшая семья" : "Показано всё дерево");
  };
  const applyHistorySnapshot = (snapshot) => {
    setPeople(snapshot.people);
    setPartnerships(snapshot.partnerships);
    setProjectMeta(snapshot.projectMeta);
    const settings = { ...defaultProjectSettings, ...(snapshot.projectMeta.settings || {}) };
    setTreeStyle(settings.treeStyle || "classic");
    setShowPhotos(settings.showPhotos !== false);
    setLargeText(settings.largeText === true);
    setCardFields(sanitizeCardFields(settings.cardFields));
    setAutoSaveEnabled(settings.autoSave !== false);
    setSelectedId((current) => snapshot.people.some((person) => person.id === current) ? current : snapshot.people[0]?.id || "");
  };
  const undoAction = () => {
    const nextHistory = undoHistory(historyRef.current);
    if (nextHistory === historyRef.current) return;
    historyRef.current = nextHistory;
    applyHistorySnapshot(nextHistory.present);
    setHistoryStatus(getHistoryStatus(nextHistory));
    setDirty(true);
    setToastAction(null);
    setToast("Последнее действие отменено");
  };
  const redoAction = () => {
    const nextHistory = redoHistory(historyRef.current);
    if (nextHistory === historyRef.current) return;
    historyRef.current = nextHistory;
    applyHistorySnapshot(nextHistory.present);
    setHistoryStatus(getHistoryStatus(nextHistory));
    setDirty(true);
    setToast("Действие повторено");
  };
  const resetHistory = (nextPeople, nextPartnerships, nextProjectMeta) => {
    const nextHistory = createHistory(createSnapshot(nextPeople, nextPartnerships, nextProjectMeta));
    historyRef.current = nextHistory;
    setHistoryStatus(getHistoryStatus(nextHistory));
  };
  const updateViewSetting = (field, value) => {
    const nextValue = field === "cardFields" ? sanitizeCardFields(value) : value;
    setProjectMeta((current) => ({ ...current, settings: { ...defaultProjectSettings, ...(current.settings || {}), [field]: nextValue } }));
    if (field === "treeStyle") setTreeStyle(value);
    if (field === "showPhotos") setShowPhotos(value);
    if (field === "cardFields") setCardFields(nextValue);
    setDirty(true);
  };
  const saveProjectSettings = ({ title, autoSave, treeStyle: nextTreeStyle, showPhotos: nextShowPhotos, largeText: nextLargeText, cardFields: nextCardFields }) => {
    const nextTitle = String(title || "").trim() || "Моё семейное древо";
    const normalizedCardFields = sanitizeCardFields(nextCardFields);
    const nextMeta = { ...projectMeta, title: nextTitle, settings: { ...defaultProjectSettings, ...(projectMeta.settings || {}), autoSave, treeStyle: nextTreeStyle, showPhotos: nextShowPhotos, largeText: nextLargeText, cardFields: normalizedCardFields } };
    const payload = createProjectPayload(people, nextMeta, partnerships);
    try {
      writeWorkingCopy(payload);
      setProjectMeta(nextMeta);
      setAutoSaveEnabled(autoSave);
      setTreeStyle(nextTreeStyle);
      setShowPhotos(nextShowPhotos);
      setLargeText(nextLargeText);
      setCardFields(normalizedCardFields);
      setLastSavedAt(payload.manifest.updatedAt);
      setDirty(false);
      closeSettings();
      setToast("Настройки сохранены");
    } catch (error) {
      setToast(explainUserError(error, { action: "Не удалось сохранить настройки", next: "проверьте доступ к локальному хранилищу и повторите" }));
    }
  };

  useEffect(() => { if (!toast) return undefined; const timeout = window.setTimeout(() => setToast(""), 2600); return () => window.clearTimeout(timeout); }, [toast]);
  useEffect(() => {
    if (!loadedSession) return undefined;
    const timeout = window.setTimeout(() => {
      if (loadedSession.recoveredFrom) setToast("Рабочая копия восстановлена после сбоя сохранения");
      else if (loadedSession.validationWarnings?.length) setToast(`Рабочая копия восстановлена; найдено замечаний: ${loadedSession.validationWarnings.length}`);
      else setToast("Локальная рабочая копия восстановлена");
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [loadedSession]);
  useEffect(() => {
    const desktop = window.familyTreeDesktop;
    if (!desktop?.onUpdateStatus) return undefined;
    const unsubscribe = desktop.onUpdateStatus((status) => {
      setUpdateStatus(status);
      if (status.state === "available" || status.state === "downloaded") setUpdateOpen(true);
      if (status.state === "not-available") setToast("Установлена последняя версия приложения");
      if (status.state === "error") setToast(explainUserError(status.error || status.message, { action: "Не удалось проверить обновления", next: "проверьте интернет-соединение и повторите позже" }));
    });
    return unsubscribe;
  }, []);
  useEffect(() => {
    if (!dirty || !autoSaveEnabled) return undefined;
    const timeout = window.setTimeout(() => {
      try {
        const payload = createProjectPayload(people, projectMeta, partnerships);
        writeWorkingCopy(payload);
        const backup = addBackup(payload, "auto");
        setLastBackupAt(backup?.createdAt || null);
        setBackups(readBackups());
      } catch (error) {
        setToast(explainUserError(error, { action: "Не удалось выполнить автосохранение", next: "проверьте свободное место и сохраните проект вручную" }));
      }
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [dirty, autoSaveEnabled, people, projectMeta, partnerships]);
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "В проекте есть несохранённые изменения.";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);
  useEffect(() => {
    const nextSnapshot = createSnapshot(people, partnerships, projectMeta);
    if (snapshotsEqual(historyRef.current.present, nextSnapshot)) return;
    const nextHistory = recordHistory(historyRef.current, nextSnapshot);
    historyRef.current = nextHistory;
    setHistoryStatus(getHistoryStatus(nextHistory));
  }, [people, partnerships, projectMeta]);
  useEffect(() => {
    try {
      window.localStorage?.setItem("family-tree-inspector-width", String(inspectorWidth));
    } catch {
      // Настройка ширины панели не должна мешать работе приложения.
    }
  }, [inspectorWidth]);
  useEffect(() => {
    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase();
      if (event.key === "Escape") {
        event.preventDefault();
        if (updateOpen) setUpdateOpen(false);
        else if (qualityOpen) setQualityOpen(false);
        else if (pendingUnsavedAction) setPendingUnsavedAction(null);
        else if (deleteConfirmId) setDeleteConfirmId("");
        else if (relationshipDeleteConfirm) setRelationshipDeleteConfirm(null);
        else if (newTreeConfirmOpen) cancelNewTree();
        else if (exportModalOpen) setExportModalOpen(false);
        else if (instructionOpen) closeInstruction();
        else if (settingsOpen) closeSettings();
        else if (backupOpen) setBackupOpen(false);
        else if (archiveOpen) { setArchiveOpen(false); setArchiveImport(null); }
        else if (viewSettingsOpen) setViewSettingsOpen(false);
        else if (filtersOpen) setFiltersOpen(false);
        else if (moreOpen) setMoreOpen(false);
        else if (mainMenuOpen) setMainMenuOpen(false);
        else if (inspectorOpen) closeInspector();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && key === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      const tagName = event.target?.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select" || event.target?.isContentEditable) return;
      if (!(event.ctrlKey || event.metaKey) && !event.altKey) {
        const panByKey = { ArrowUp: [0, -110], ArrowDown: [0, 110], ArrowLeft: [-110, 0], ArrowRight: [110, 0] }[event.key];
        if (panByKey) {
          event.preventDefault();
          setKeyboardPanRequest((current) => ({ dx: panByKey[0], dy: panByKey[1], token: (current?.token || 0) + 1 }));
          return;
        }
        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          setZoom((current) => Math.min(1.35, current + 0.08));
          return;
        }
        if (event.key === "-" || event.key === "_") {
          event.preventDefault();
          setZoom((current) => Math.max(0.55, current - 0.08));
          return;
        }
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        redoAction();
      } else if (key === "z") {
        event.preventDefault();
        undoAction();
      } else if (key === "y") {
        event.preventDefault();
        redoAction();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [historyStatus, updateOpen, qualityOpen, pendingUnsavedAction, deleteConfirmId, relationshipDeleteConfirm, newTreeConfirmOpen, exportModalOpen, instructionOpen, settingsOpen, backupOpen, archiveOpen, viewSettingsOpen, filtersOpen, moreOpen, mainMenuOpen, inspectorOpen, returnToMenuAfterModal]);

  const checkForUpdates = async () => {
    if (!window.familyTreeDesktop?.checkForUpdates) {
      setToast("Проверка обновлений доступна в установленном приложении");
      return;
    }
    setToast("Проверяем обновления…");
    try {
      await window.familyTreeDesktop.checkForUpdates();
    } catch (error) {
      setToast(explainUserError(error, { action: "Не удалось проверить обновления", next: "проверьте интернет-соединение и повторите позже" }));
    }
  };
  const downloadUpdate = async () => {
    try {
      await window.familyTreeDesktop?.downloadUpdate?.();
    } catch (error) {
      setToast(explainUserError(error, { action: "Не удалось скачать обновление", next: "проверьте интернет-соединение и повторите позже" }));
    }
  };
  const installUpdate = async () => {
    try {
      await window.familyTreeDesktop?.installUpdate?.();
    } catch (error) {
      setToast(explainUserError(error, { action: "Не удалось установить обновление", next: "перезапустите приложение и повторите установку" }));
    }
  };
  const openReleasesPage = async () => {
    if (window.familyTreeDesktop?.openReleases) {
      await window.familyTreeDesktop.openReleases();
      return;
    }
    window.open("https://github.com/teru1337/family-tree-desktop/releases", "_blank", "noopener,noreferrer");
  };
  const selectPerson = (id) => { if (!setSelectedPerson(id)) return; setQuery(""); setFiltersOpen(false); setEditing(false); setRelationshipEditing(false); setInspectorOpen(true); };
  const focusPersonOnMap = (id) => { const person = people.find((item) => item.id === id); if (!person || !setSelectedPerson(id)) return; setQuery(""); setInspectorOpen(true); setFocusRequest((current) => ({ id, token: (current?.token || 0) + 1 })); setToast(`Человек показан на карте: ${personDisplayName(person)}`); };
  const moveSiblingOrder = (personId, direction) => {
    const nextPeople = reorderSiblingComponent(people, personId, direction);
    if (nextPeople === people) return;
    setPeople(nextPeople);
    setDirty(true);
    const movedPerson = nextPeople.find((person) => person.id === personId);
    const position = getSiblingComponent(nextPeople, personId).findIndex((person) => person.id === personId) + 1;
    setToast(`Порядок изменён: ${personDisplayName(movedPerson)} — место ${position}`);
  };
  const openEditor = (person = null, relation = "") => {
    const contexts = new Set(Array.isArray(person?.familyContext) ? person.familyContext : []);
    setEditorSessionKey((current) => current + 1);
    setDraft(person ? normalizePersonDate({ ...person }) : { ...blankPerson, id: "" });
    setRelationshipMode(relation);
    setRelationshipType("biological");
    setPartnershipType("marriage");
    setConnectionTargetId(person ? "" : selectedPerson?.id || people[0]?.id || "");
    setRelationshipSource("");
    setUnknownParent(false);
    setSingleKnownParent(contexts.has("single-known-parent"));
    setOutOfMarriage(contexts.has("out-of-marriage"));
    setSiblingWithoutParents(contexts.has("sibling-without-parents"));
    setRelationshipEditing(false);
    setInspectorOpen(true);
    setEditing(true);
  };
  const closeInspector = () => { setEditing(false); setRelationshipEditing(false); setDraft(null); setRelationshipMode(""); setRelationshipType("biological"); setPartnershipType("marriage"); setConnectionTargetId(""); setRelationshipSource(""); setInspectorOpen(false); };
  const resizeInspectorBy = (delta) => setInspectorWidth((current) => Math.max(300, Math.min(560, current + delta)));
  const startInspectorResize = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    inspectorResizeRef.current = { startX: event.clientX, startWidth: inspectorWidth };
    setInspectorResizing(true);
  };
  const moveInspectorResize = (event) => {
    const resize = inspectorResizeRef.current;
    if (!resize) return;
    setInspectorWidth(Math.max(300, Math.min(560, resize.startWidth - (event.clientX - resize.startX))));
  };
  const endInspectorResize = (event) => {
    if (!inspectorResizeRef.current) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    inspectorResizeRef.current = null;
    setInspectorResizing(false);
  };
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
      siblingIds: (person.siblingIds || []).filter((id) => id !== deleteConfirmId),
      siblingLinks: (person.siblingLinks || []).filter((link) => link.personId !== deleteConfirmId),
    }));
    const nextPartnerships = partnerships.filter((partnership) => !partnership.personIds.includes(deleteConfirmId));
    const fallbackId = [personToDelete.parentIds?.[0], personToDelete.partnerIds?.[0], personToDelete.childIds?.[0]].find((id) => nextPeople.some((person) => person.id === id)) || nextPeople[0]?.id || "";
    setPeople(nextPeople);
    setPartnerships(nextPartnerships);
    setSelectedId(fallbackId);
    resetPersonNavigation(fallbackId);
    setEditing(false);
    setRelationshipEditing(false);
    setDraft(null);
    setRelationshipMode("");
    setRelationshipType("biological");
    setPartnershipType("marriage");
    setConnectionTargetId("");
    setRelationshipSource("");
    setDeleteConfirmId("");
    setBackups(readBackups());
    setLastBackupAt(backup?.createdAt || null);
    setDirty(true);
    const message = `Удалён человек: ${personDisplayName(personToDelete)}`;
    setToast(message);
    setToastAction({ message, label: "Отменить", onClick: undoAction });
  };
  const requestDeleteRelationship = (relationId) => {
    const relation = relationshipDeleteOptions(selectedPerson, people, partnerships).find((item) => item.id === relationId);
    if (relation) setRelationshipDeleteConfirm(relation);
  };
  const deleteRelationship = () => {
    const relation = relationshipDeleteConfirm;
    if (!relation) return;
    const backup = addBackup(buildPayload(), "before-delete");
    const makeParentLinks = (person) => person.parentLinks?.length
      ? person.parentLinks
      : (person.parentIds || []).map((parentId) => ({ id: makeParentLinkId(person.id, parentId, "biological"), personId: parentId, type: "biological" }));
    const makeSiblingLinks = (person) => person.siblingLinks?.length
      ? person.siblingLinks
      : (person.siblingIds || []).map((siblingId) => ({ id: makeSiblingLinkId(person.id, siblingId, "biological"), personId: siblingId, type: "biological" }));
    let nextPeople = people;
    let nextPartnerships = partnerships;
    if (relation.kind === "partnership") {
      nextPartnerships = partnerships.filter((partnership) => partnership.id !== relation.id);
      const stillConnected = nextPartnerships.some((partnership) => relation.personIds.every((id) => partnership.personIds.includes(id)));
      nextPeople = people.map((person) => relation.personIds.includes(person.id) && !stillConnected ? { ...person, partnerIds: (person.partnerIds || []).filter((id) => !relation.personIds.includes(id)) } : person);
    }
    if (relation.kind === "parent") {
      const remainingParentRelation = (personId) => nextPeople.some((person) => makeParentLinks(person).some((link) => link.id !== relation.id && link.personId === relation.parentId && person.id === relation.childId));
      nextPeople = people.map((person) => {
        if (person.id === relation.childId) {
          const parentLinks = makeParentLinks(person).filter((link) => link.id !== relation.id && !(link.personId === relation.parentId && link.type === relation.type));
          const parentIds = relation.type === "biological" && !remainingParentRelation(person.id) ? (person.parentIds || []).filter((id) => id !== relation.parentId) : [...(person.parentIds || [])];
          return { ...person, parentIds, parentLinks };
        }
        if (person.id === relation.parentId && !remainingParentRelation(relation.childId)) return { ...person, childIds: (person.childIds || []).filter((id) => id !== relation.childId) };
        return person;
      });
    }
    if (relation.kind === "sibling") {
      const [firstId, secondId] = relation.personIds;
      nextPeople = people.map((person) => {
        if (person.id !== firstId && person.id !== secondId) return person;
        const otherId = person.id === firstId ? secondId : firstId;
        const siblingLinks = makeSiblingLinks(person).filter((link) => link.id !== relation.id && !(link.personId === otherId && link.type === relation.type));
        const hasRemainingSibling = siblingLinks.some((link) => link.personId === otherId);
        return { ...person, siblingIds: hasRemainingSibling ? [...(person.siblingIds || [])] : (person.siblingIds || []).filter((id) => id !== otherId), siblingLinks };
      });
    }
    setPeople(nextPeople);
    setPartnerships(nextPartnerships);
    setRelationshipDeleteConfirm(null);
    setRelationshipEditing(false);
    setBackups(readBackups());
    setLastBackupAt(backup?.createdAt || null);
    setDirty(true);
    const message = `Связь удалена: ${relation.label}`;
    setToast(message);
    setToastAction({ message, label: "Отменить", onClick: undoAction });
  };
  const savePerson = ({ addAnother = false } = {}) => {
    const validationErrors = validatePersonDraft(draft, { isNew: !draft?.id, relationshipMode, connectionTargetId, relationshipSource });
    if (Object.keys(validationErrors).length) { setToast("Не удалось сохранить человека. Причина: некоторые поля заполнены неверно. Следующее действие: исправьте подсвеченные поля и повторите."); return; }
    const isUnknownRecord = Boolean(draft.isUnknown || unknownParent);
    const existingFamilyContext = Array.isArray(draft.familyContext) ? draft.familyContext : [];
    const newFamilyContext = draft.id ? existingFamilyContext : [...new Set([
      ...existingFamilyContext,
      ...(relationshipMode === "child" && singleKnownParent ? ["single-known-parent"] : []),
      ...(relationshipMode === "child" && outOfMarriage ? ["out-of-marriage"] : []),
      ...(relationshipMode === "sibling" && siblingWithoutParents ? ["sibling-without-parents"] : []),
    ])];
    const normalizedName = isUnknownRecord ? "" : draft.name.trim() || "Человек без имени";
    const normalizedBirthDate = normalizeDateRecord(getDraftDateRecord(draft));
    const personToSave = { ...draft, isUnknown: isUnknownRecord, name: normalizedName, shortName: normalizedName, source: String(draft.source || "").trim(), confidence: PERSON_CONFIDENCE_LEVELS.includes(draft.confidence) ? draft.confidence : "unknown", customFields: normalizeCustomFields(draft.customFields), factSources: normalizeFactSources(draft.factSources), timelineEvents: normalizeTimelineEvents(draft.timelineEvents), familyContext: newFamilyContext, birthDate: normalizedBirthDate, datePrecision: normalizedBirthDate.precision, year: formatDateRecord(normalizedBirthDate), birthDateFrom: normalizedBirthDate.from, birthDateTo: normalizedBirthDate.to };
    if (personToSave.id) { setPeople((current) => current.map((person) => person.id === personToSave.id ? personToSave : person)); setSelectedPerson(personToSave.id); setToast("Изменения сохранены"); } else {
      const newId = makeId(); const newPerson = { ...personToSave, id: newId };
      const relationTarget = people.find((person) => person.id === connectionTargetId);
      const selectedRelationType = relationshipType || "biological";
      setPeople((current) => {
        const next = current.map((person) => ({ ...person, parentIds: [...(person.parentIds || [])], parentLinks: [...(person.parentLinks || (person.parentIds || []).map((personId) => ({ id: makeParentLinkId(person.id, personId, "biological"), personId, type: "biological" })))], partnerIds: [...(person.partnerIds || [])], childIds: [...(person.childIds || [])], siblingIds: [...(person.siblingIds || [])], siblingLinks: [...(person.siblingLinks || (person.siblingIds || []).map((personId) => ({ id: makeSiblingLinkId(person.id, personId, "biological"), personId, type: "biological" })))] }));
        if (relationTarget && relationshipMode === "child") {
          if (selectedRelationType === "biological") newPerson.parentIds = addUniqueId(newPerson.parentIds, relationTarget.id);
          newPerson.parentLinks = addParentLink(newPerson.parentLinks, relationTarget.id, selectedRelationType, newId, relationshipSource);
          next.forEach((person) => { if (person.id === relationTarget.id) person.childIds = addUniqueId(person.childIds, newId); });
        }
        if (relationTarget && relationshipMode === "parent") {
          newPerson.childIds = addUniqueId(newPerson.childIds, relationTarget.id);
            next.forEach((person) => { if (person.id === relationTarget.id) { if (selectedRelationType === "biological") person.parentIds = addUniqueId(person.parentIds, newId); person.parentLinks = addParentLink(person.parentLinks, newId, selectedRelationType, person.id, relationshipSource); } });
        }
        if (relationTarget && relationshipMode === "partner") {
          newPerson.partnerIds = addUniqueId(newPerson.partnerIds, relationTarget.id);
          next.forEach((person) => { if (person.id === relationTarget.id) person.partnerIds = addUniqueId(person.partnerIds, newId); });
        }
        if (relationTarget && relationshipMode === "sibling") {
          newPerson.siblingIds = addUniqueId(newPerson.siblingIds, relationTarget.id);
          newPerson.siblingLinks = addSiblingLink(newPerson.siblingLinks, relationTarget.id, selectedRelationType, newId, relationshipSource);
          next.forEach((person) => {
            if (person.id !== relationTarget.id) return;
            person.siblingIds = addUniqueId(person.siblingIds, newId);
            person.siblingLinks = addSiblingLink(person.siblingLinks, newId, selectedRelationType, person.id, relationshipSource);
          });
        }
        return [...next, newPerson];
      });
      if (relationTarget && relationshipMode === "partner") setPartnerships((current) => [...current, { id: `partnership-${relationTarget.id}-${newId}`, personIds: [relationTarget.id, newId], type: partnershipType, status: "active", startDate: "", startDatePrecision: "unknown", endDate: "", endDatePrecision: "unknown", source: normalizeSourceValue(relationshipSource) }]);
      const nextNavigation = visitPerson(personNavigationRef.current, newId);
      personNavigationRef.current = nextNavigation;
      setPersonNavigation(nextNavigation);
      setSelectedId(newId);
      if (addAnother) {
        setEditorSessionKey((current) => current + 1);
        setDraft({ ...blankPerson, id: "", isUnknown: relationshipMode === "parent" && unknownParent });
        setRelationshipMode(relationshipMode);
        setRelationshipType(selectedRelationType);
        setPartnershipType(partnershipType);
        setConnectionTargetId(relationTarget?.id || "");
        setUnknownParent(relationshipMode === "parent" && unknownParent);
        setSingleKnownParent(relationshipMode === "child" && singleKnownParent);
        setOutOfMarriage(relationshipMode === "child" && outOfMarriage);
        setSiblingWithoutParents(relationshipMode === "sibling" && siblingWithoutParents);
        setEditing(true);
        setRelationshipEditing(false);
        setInspectorOpen(true);
        setToast("Человек добавлен. Можно добавить следующего родственника.");
      } else setToast("Человек добавлен в дерево");
    }
    setDirty(true);
    if (!addAnother) { setEditing(false); setDraft(null); setRelationshipMode(""); setRelationshipType("biological"); setPartnershipType("marriage"); setConnectionTargetId(""); setRelationshipSource(""); setUnknownParent(false); setSingleKnownParent(false); setOutOfMarriage(false); setSiblingWithoutParents(false); }
  };
  const saveRelationship = ({ kind, targetId, parentType, source, startDate, startDatePrecision, endDate, endDatePrecision }) => {
    if (!selectedPerson || !targetId) return;
    if (kind === "parent" || kind === "child") {
      const parentId = kind === "parent" ? targetId : selectedPerson.id;
      const childId = kind === "parent" ? selectedPerson.id : targetId;
      setPeople((current) => current.map((person) => {
        if (person.id === childId) {
          const parentIds = parentType === "biological" ? addUniqueId(person.parentIds, parentId) : [...(person.parentIds || [])];
          const existingLinks = person.parentLinks || (person.parentIds || []).map((personId) => ({ id: makeParentLinkId(childId, personId, "biological"), personId, type: "biological" }));
          return { ...person, parentIds, parentLinks: addParentLink(existingLinks, parentId, parentType, childId, source) };
        }
        if (person.id === parentId) return { ...person, childIds: addUniqueId(person.childIds, childId) };
        return person;
      }));
      setToast(parentType === "adoptive" ? "Усыновление добавлено" : parentType === "step" ? "Степ-родство добавлено" : parentType === "guardian" ? "Опекунство добавлено" : parentType === "unknown" ? "Связь добавлена без уточнения типа" : "Родственная связь добавлена");
    } else if (kind === "sibling") {
      setPeople((current) => current.map((person) => {
        if (person.id === selectedPerson.id) return { ...person, siblingIds: addUniqueId(person.siblingIds, targetId), siblingLinks: addSiblingLink(person.siblingLinks, targetId, parentType, person.id, source) };
        if (person.id === targetId) return { ...person, siblingIds: addUniqueId(person.siblingIds, selectedPerson.id), siblingLinks: addSiblingLink(person.siblingLinks, selectedPerson.id, parentType, person.id, source) };
        return person;
      }));
      setToast(parentType === "half" ? "Неполнородная связь добавлена" : parentType === "step" ? "Сводная связь добавлена" : parentType === "unknown" ? "Связь братьев и сестёр добавлена без уточнения типа" : "Связь братьев и сестёр добавлена");
    } else if (kind === "marriage" || kind === "partnership") {
      setPeople((current) => current.map((person) => person.id === selectedPerson.id ? { ...person, partnerIds: addUniqueId(person.partnerIds, targetId) } : person.id === targetId ? { ...person, partnerIds: addUniqueId(person.partnerIds, selectedPerson.id) } : person));
      const pair = [selectedPerson.id, targetId];
      setPartnerships((current) => {
        const existingIndex = [...current].map((partnership, index) => ({ partnership, index })).reverse().find(({ partnership }) => partnership.status === "active" && pair.every((id) => partnership.personIds.includes(id)))?.index;
        if (existingIndex !== undefined) return current.map((partnership, index) => index === existingIndex ? { ...partnership, type: kind, startDate: startDate || partnership.startDate || "", startDatePrecision: startDatePrecision || partnership.startDatePrecision || "unknown", source: normalizeSourceValue(source) || partnership.source || "" } : partnership);
        return [...current, { id: `partnership-${makeId()}`, personIds: pair, type: kind, status: "active", startDate: startDate || "", startDatePrecision: startDatePrecision || "unknown", endDate: "", endDatePrecision: "unknown", source: normalizeSourceValue(source) }];
      });
      setToast(kind === "marriage" ? "Брак добавлен" : "Партнёрство добавлено");
    } else if (kind === "divorce") {
      setPartnerships((current) => {
        const index = [...current].map((partnership, itemIndex) => ({ partnership, itemIndex })).reverse().find(({ partnership }) => partnership.status === "active" && partnership.personIds.includes(selectedPerson.id) && partnership.personIds.includes(targetId))?.itemIndex;
        if (index === undefined) return current;
        return current.map((partnership, itemIndex) => itemIndex === index ? { ...partnership, status: "divorced", endDate: endDate || "", endDatePrecision: endDatePrecision || "unknown", source: normalizeSourceValue(source) || partnership.source || "" } : partnership);
      });
      setToast("Развод отмечен в истории семьи");
    }
    setDirty(true);
    setRelationshipEditing(false);
  };
  const buildPayload = () => createProjectPayload(people, projectMeta, partnerships);
  const openQualityCheck = () => {
    try {
      const report = validateProject(buildPayload());
      setQualityReport(report);
      setMoreOpen(false);
      setQualityOpen(true);
    } catch (error) {
      setQualityReport({ valid: false, errors: [explainUserError(error, { action: "Не удалось проверить данные", next: "сохраните копию проекта и повторите проверку" })], warnings: [] });
      setMoreOpen(false);
      setQualityOpen(true);
    }
  };
  const commitLocalSave = (payload, reason = "save") => {
    const normalized = writeWorkingCopy(payload);
    const backup = addBackup(payload, reason);
    setBackups(readBackups());
    setLastBackupAt(backup?.createdAt || null);
    setLastSavedAt(payload.manifest.updatedAt);
    setDirty(false);
    return normalized;
  };
  const saveProjectToFile = async () => {
    const payload = buildPayload();
    const suggestedName = projectMeta.fileName || "семейное-древо.familytree";
    const saveWithDesktop = window.familyTreeDesktop?.saveProjectFile;
    if (!saveWithDesktop) {
      downloadProjectFile(payload, suggestedName);
      return { canceled: false, payload, projectMeta };
    }
    const result = await saveWithDesktop(payload, suggestedName, projectMeta.filePath || "");
    if (result?.canceled) return { canceled: true };
    const filePath = result?.filePath || projectMeta.filePath || "";
    const nextProjectMeta = { ...projectMeta, fileName: fileNameFromPath(filePath) || suggestedName, filePath };
    return { canceled: false, payload: createProjectPayload(people, nextProjectMeta, partnerships), projectMeta: nextProjectMeta };
  };
  const saveProject = async () => {
    try {
      const saved = await saveProjectToFile();
      if (saved.canceled) {
        setToast("Сохранение отменено");
        return;
      }
      const normalized = commitLocalSave(saved.payload);
      setProjectMeta(saved.projectMeta);
      const warningCount = normalized.validationWarnings?.length || 0;
      setToast(warningCount ? `Проект сохранён; найдено замечаний: ${warningCount}` : `Проект сохранён: ${saved.projectMeta.fileName || "семейное-древо.familytree"}`);
    } catch (error) {
      setToast(explainUserError(error, { action: "Не удалось сохранить проект", next: "проверьте свободное место и доступ к папке загрузок" }));
    }
  };
  const saveForContinuation = async () => {
    const saved = await saveProjectToFile();
    if (saved.canceled) return false;
    const normalized = commitLocalSave(saved.payload);
    setProjectMeta(saved.projectMeta);
    const warningCount = normalized.validationWarnings?.length || 0;
    setToast(warningCount ? `Проект сохранён; найдено замечаний: ${warningCount}` : "Проект сохранён");
    return true;
  };
  const saveCopy = () => {
    const payload = buildPayload();
    downloadProjectFile(payload, "семейное-древо-копия.familytree");
    const backup = addBackup(payload, "save");
    setBackups(readBackups());
    setLastBackupAt(backup?.createdAt || null);
    setToast("Копия проекта подготовлена");
  };
  const saveFamilyArchive = async () => {
    const archive = createFamilyArchive(buildPayload());
    const baseName = String(projectMeta.fileName || "семейное-древо.familytree").replace(/\.familytree$/i, "") || "семейное-древо";
    const suggestedName = `${baseName}.familyarchive`;
    try {
      const saveWithDesktop = window.familyTreeDesktop?.saveProjectFile;
      if (saveWithDesktop) {
        const result = await saveWithDesktop(archive, suggestedName, "", "archive");
        if (result?.canceled) {
          setToast("Сохранение архива отменено");
          return;
        }
      } else {
        downloadProjectFile(archive, suggestedName);
      }
      setToast("Полный архив семейных материалов подготовлен");
    } catch (error) {
      setToast(explainUserError(error, { action: "Не удалось сохранить архив", next: "проверьте доступ к папке и повторите" }));
    }
  };
  const handleArchiveSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const report = verifyFamilyArchive(JSON.parse(await file.text()));
      setArchiveImport({ fileName: file.name, report });
      if (!report.valid) setToast("Архив не прошёл проверку и не будет восстановлен");
    } catch (error) {
      setArchiveImport({ fileName: file.name, report: { valid: false, contents: { people: 0, relations: 0, photos: 0 }, warnings: [], error: String(error?.message || "Не удалось прочитать архив.") } });
      setToast("Не удалось прочитать архив");
    } finally {
      event.target.value = "";
    }
  };
  const restoreFamilyArchive = (payload) => {
    try {
      const currentBackup = addBackup(buildPayload(), "before-restore");
      const restoredPayload = normalizeProject(payload);
      writeWorkingCopy(restoredPayload);
      const restoredSettings = { ...defaultProjectSettings, ...(restoredPayload.project.settings || {}) };
      const nextProjectMeta = { ...restoredPayload.project, settings: restoredSettings, filePath: projectMeta.filePath || "" };
      setPeople(restoredPayload.people);
      setPartnerships(restoredPayload.partnerships || []);
      setProjectMeta(nextProjectMeta);
      setTreeStyle(restoredSettings.treeStyle || "classic");
      setShowPhotos(restoredSettings.showPhotos !== false);
      setLargeText(restoredSettings.largeText === true);
      setCardFields(sanitizeCardFields(restoredSettings.cardFields));
      setAutoSaveEnabled(restoredSettings.autoSave !== false);
      const restoredSelectedId = restoredPayload.people.find((person) => person.id === "ivan")?.id || restoredPayload.people[0]?.id || "";
      setSelectedId(restoredSelectedId);
      resetPersonNavigation(restoredSelectedId);
      resetHistory(restoredPayload.people, restoredPayload.partnerships || [], nextProjectMeta);
      setEditing(false);
      setDraft(null);
      setLastSavedAt(restoredPayload.manifest.updatedAt);
      setLastBackupAt(currentBackup?.createdAt || lastBackupAt);
      setBackups(readBackups());
      setDirty(false);
      setArchiveImport(null);
      setArchiveOpen(false);
      setMainMenuOpen(false);
      setToast(restoredPayload.validationWarnings?.length ? `Архив восстановлен; найдено замечаний: ${restoredPayload.validationWarnings.length}` : "Архив семейных материалов восстановлен");
    } catch (error) {
      setToast(explainUserError(error, { action: "Не удалось восстановить архив", next: "выберите другой архив и повторите восстановление" }));
    }
  };
  const openProject = (skipPrompt = false) => {
    if (!skipPrompt && dirty) {
      setMainMenuOpen(false);
      setPendingUnsavedAction({ type: "open" });
      return;
    }
    fileInputRef.current?.click();
  };
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
      const loadedFilePath = typeof file.path === "string" ? file.path : "";
      const loadedPayload = { ...payload, project: { ...payload.project, fileName: file.name } };
      writeWorkingCopy(loadedPayload);
      const loadedSettings = { ...defaultProjectSettings, ...(loadedPayload.project.settings || {}) };
      const nextProjectMeta = { ...loadedPayload.project, settings: loadedSettings, filePath: loadedFilePath };
      resetHistory(loadedPayload.people, loadedPayload.partnerships || [], nextProjectMeta);
      setPeople(payload.people);
      setPartnerships(loadedPayload.partnerships || []);
      setProjectMeta(nextProjectMeta);
      setTreeStyle(loadedSettings.treeStyle || "classic");
      setShowPhotos(loadedSettings.showPhotos !== false);
      setLargeText(loadedSettings.largeText === true);
      setCardFields(sanitizeCardFields(loadedSettings.cardFields));
      setAutoSaveEnabled(loadedSettings.autoSave !== false);
      const loadedSelectedId = loadedPayload.people.find((person) => person.id === "ivan")?.id || loadedPayload.people[0]?.id || "";
      setSelectedId(loadedSelectedId);
      resetPersonNavigation(loadedSelectedId);
      setEditing(false);
      setDraft(null);
      setLastSavedAt(loadedPayload.manifest.updatedAt);
      setDirty(false);
      setMainMenuOpen(false);
      setToast(loadedPayload.validationWarnings?.length ? `Проект открыт; найдено замечаний: ${loadedPayload.validationWarnings.length}` : `Открыт проект: ${file.name}`);
    } catch (error) {
      setToast(explainUserError(error, { action: "Не удалось открыть файл проекта", next: "выберите корректный файл .familytree или резервную копию" }));
    } finally {
      event.target.value = "";
    }
  };
  const restoreBackup = (backup) => {
    try {
      const currentBackup = addBackup(buildPayload(), "before-restore");
      const payload = normalizeProject(backup.payload);
      writeWorkingCopy(payload);
      const restoredSettings = { ...defaultProjectSettings, ...(payload.project.settings || {}) };
      setPeople(payload.people);
      setPartnerships(payload.partnerships || []);
      setProjectMeta({ ...payload.project, settings: restoredSettings, filePath: projectMeta.filePath || "" });
      setTreeStyle(restoredSettings.treeStyle || "classic");
      setShowPhotos(restoredSettings.showPhotos !== false);
      setLargeText(restoredSettings.largeText === true);
      setCardFields(sanitizeCardFields(restoredSettings.cardFields));
      setAutoSaveEnabled(restoredSettings.autoSave !== false);
      const backupSelectedId = payload.people.find((person) => person.id === "ivan")?.id || payload.people[0]?.id || "";
      setSelectedId(backupSelectedId);
      resetPersonNavigation(backupSelectedId);
      setEditing(false);
      setDraft(null);
      setLastSavedAt(payload.manifest.updatedAt);
      setLastBackupAt(currentBackup?.createdAt || backup.createdAt);
      setBackups(readBackups());
      setDirty(false);
      setBackupOpen(false);
      setToast(payload.validationWarnings?.length ? `Резервная копия восстановлена; найдено замечаний: ${payload.validationWarnings.length}` : "Резервная копия восстановлена");
    } catch (error) {
      setToast(explainUserError(error, { action: "Не удалось восстановить резервную копию", next: "выберите другую копию и повторите восстановление" }));
    }
  };
  const downloadBackup = (backup) => downloadProjectFile(backup.payload, `резервная-копия-${backup.createdAt.slice(0, 10)}.familytree`);
  const openExport = (format = "pdf") => { setExportPreset(format); setExportModalOpen(true); setMoreOpen(false); };
  const openRelationshipCalculator = (sourceId = selectedId) => {
    if (people.length < 2) {
      setToast("Для расчёта нужны минимум два человека в дереве");
      return;
    }
    setMoreOpen(false);
    setRelationshipCalculatorOpen(true);
    if (sourceId && people.some((person) => person.id === sourceId)) setSelectedPerson(sourceId);
  };
  const closeSettings = () => {
    setSettingsOpen(false);
    if (returnToMenuAfterModal === "settings") setMainMenuOpen(true);
    setReturnToMenuAfterModal("");
  };
  const closeInstruction = () => {
    setInstructionOpen(false);
    if (returnToMenuAfterModal === "instruction") setMainMenuOpen(true);
    setReturnToMenuAfterModal("");
  };
  const cancelNewTree = () => {
    setNewTreeConfirmOpen(false);
    if (returnToMenuAfterModal === "new-tree") setMainMenuOpen(true);
    setReturnToMenuAfterModal("");
  };
  const openInstruction = (fromMenu = false) => { setMainMenuOpen(false); setMoreOpen(false); setReturnToMenuAfterModal(fromMenu ? "instruction" : ""); setInstructionOpen(true); };
  const openSettings = (fromMenu = false) => { setMainMenuOpen(false); setMoreOpen(false); setReturnToMenuAfterModal(fromMenu ? "settings" : ""); setSettingsOpen(true); };
  const continueAfterUnsavedChoice = async (saveChanges) => {
    const action = pendingUnsavedAction;
    if (saveChanges) {
      try {
        const saved = await saveForContinuation();
        if (!saved) return;
      } catch (error) {
        setToast(explainUserError(error, { action: "Не удалось сохранить изменения", next: "проверьте свободное место и повторите действие" }));
        return;
      }
    } else {
      setDirty(false);
    }
    setPendingUnsavedAction(null);
    if (action?.type === "open") openProject(true);
    if (action?.type === "new-tree") createNewTree(action.fromMenu, true);
    if (action?.type === "exit") exitApplication(true);
  };
  const createNewTree = (fromMenu = false, skipPrompt = false) => {
    if (!skipPrompt && dirty) {
      setMainMenuOpen(false);
      setPendingUnsavedAction({ type: "new-tree", fromMenu });
      return;
    }
    if (people.length) {
      setMainMenuOpen(false);
      setReturnToMenuAfterModal(fromMenu ? "new-tree" : "");
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
    setProjectMeta({ id: "local-family-tree", title: "Моё семейное древо", fileName: "семейное-древо.familytree", filePath: "", settings: { ...defaultProjectSettings, autoSave: autoSaveEnabled, treeStyle, showPhotos, largeText, cardFields: [...cardFields] } });
    setSelectedId("");
    resetPersonNavigation("");
    setTreeViewMode("full");
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setEditing(false);
    setRelationshipEditing(false);
    setDraft(null);
    setRelationshipMode("");
    setRelationshipType("biological");
    setPartnershipType("marriage");
    setConnectionTargetId("");
    setRelationshipSource("");
    setDeleteConfirmId("");
    setNewTreeConfirmOpen(false);
    setReturnToMenuAfterModal("");
    setMainMenuOpen(false);
    setDirty(true);
    setToast("Новое дерево создано");
  };
  const exitApplication = (skipPrompt = false) => {
    if (!skipPrompt && dirty) {
      setMainMenuOpen(false);
      setPendingUnsavedAction({ type: "exit" });
      return;
    }
    setMainMenuOpen(false);
    if (window.familyTreeDesktop?.close) {
      window.familyTreeDesktop.close();
      return;
    }
    window.close();
    window.setTimeout(() => setToast("Чтобы завершить работу, закройте окно приложения."), 120);
  };

  return (
    <div className={`app-window ${inspectorResizing ? "is-resizing" : ""} ${largeText ? "app-large-text" : ""}`} onClick={() => { if (moreOpen) setMoreOpen(false); }}>
      <div className="window-bar"><div className="window-title"><BrandMark className="window-logo" /><span>Семейное древо</span></div><div className="window-controls"><Minus size={15} /><Square size={12} /><X size={15} /></div></div>
       <header className="app-header" onClick={(event) => event.stopPropagation()}>
         <button type="button" className="brand brand-button" onClick={() => setMainMenuOpen(true)} aria-label="Открыть главное меню"><BrandMark className="brand-logo" /><span>Семейное древо</span></button>
         <div className="header-divider" />
         <button type="button" className="button button-primary add-person-button" onClick={() => openEditor()}><Plus size={20} weight="bold" /> Добавить человека</button>
          <button type="button" className="button button-secondary file-button" onClick={openProject}><FolderOpen size={18} /> Открыть проект</button>
          <button type="button" className="button button-primary save-project-button" onClick={saveProject}><FloppyDisk size={18} weight="bold" /> Сохранить проект</button>
          <div className="history-actions" aria-label="История действий"><button type="button" className="icon-button history-button" onClick={undoAction} disabled={!historyStatus.canUndo} title="Отменить действие (Ctrl+Z)" aria-label="Отменить действие"><ArrowCounterClockwise size={20} /></button><button type="button" className="icon-button history-button" onClick={redoAction} disabled={!historyStatus.canRedo} title="Повторить действие (Ctrl+Y)" aria-label="Повторить действие"><ArrowClockwise size={20} /></button></div>
          <div className="search-wrap"><MagnifyingGlass size={19} /><input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по семейным сведениям..." aria-label="Поиск по семейным сведениям" />{query && <button className="clear-search" type="button" onClick={() => setQuery("")} aria-label="Очистить поиск"><X size={16} /></button>}<button className={`filter-button ${filtersOpen || hasActiveSearch && Object.entries(searchFilters).some(([field, value]) => value && value !== DEFAULT_SEARCH_FILTERS[field]) ? "filter-button-active" : ""}`} type="button" onClick={(event) => { event.stopPropagation(); setFiltersOpen((open) => !open); }} aria-label="Открыть фильтры поиска" title="Фильтры поиска"><Funnel size={17} /></button>{filtersOpen && <SearchFilterPanel filters={searchFilters} generations={treeLayout.generations} onChange={(field, value) => setSearchFilters((current) => ({ ...current, [field]: value }))} onReset={() => setSearchFilters({ ...DEFAULT_SEARCH_FILTERS })} />}{hasActiveSearch && !filtersOpen && <SearchResults results={searchResults} onSelect={selectPerson} />}</div>
         <div className="header-actions">
           <button type="button" className="header-action menu-action" onClick={() => setMainMenuOpen(true)}><List size={19} /> Меню</button>
           <button type="button" className="header-action" onClick={() => openExport("pdf")}><Export size={20} /> Экспорт</button>
           <button type="button" className="header-action" onClick={() => openExport("print")}><Printer size={20} /> Печать</button>
           <div className="menu-wrap"><button type="button" className="icon-button more-button" onClick={(event) => { event.stopPropagation(); setMoreOpen((open) => !open); }}><DotsThree size={22} weight="bold" /></button>{moreOpen && <div className="dropdown-menu more-menu" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => { setMoreOpen(false); saveCopy(); }}><Copy size={16} /> Сохранить копию</button><button type="button" onClick={() => { setMoreOpen(false); setArchiveImport(null); setArchiveOpen(true); }}><Copy size={16} /> Архив материалов</button><button type="button" onClick={() => { setMoreOpen(false); setBackupOpen(true); }}><ClockCounterClockwise size={16} /> Резервные копии</button><button type="button" onClick={() => openRelationshipCalculator()} disabled={people.length < 2}><UsersThree size={16} /> Узнать родство</button><button type="button" onClick={openQualityCheck}><Info size={16} /> Проверить данные</button><button type="button" onClick={() => { setMoreOpen(false); setViewSettingsOpen(true); }}><TreeStructure size={16} /> Настроить вид дерева</button><button type="button" onClick={() => openSettings(false)}><Note size={16} /> Настройки проекта</button><button type="button" onClick={() => openInstruction(false)}><Info size={16} /> Как это работает</button><button type="button" onClick={() => { setMoreOpen(false); checkForUpdates(); }}><DownloadSimple size={16} /> Проверить обновления</button></div>}</div>
         </div>
       </header>
       <main className={`workspace ${inspectorOpen ? "" : "workspace-inspector-closed"}`} style={{ "--inspector-width": `${inspectorWidth}px` }}>
         <TreeCanvas people={people} partnerships={partnerships} layout={treeLayout} selectedId={selectedId} onSelect={selectPerson} zoom={zoom} onZoomChange={setZoom} pan={pan} onPanChange={setPan} treeStyle={treeStyle} showPhotos={showPhotos} cardFields={cardFields} focusRequest={focusRequest} keyboardPanRequest={keyboardPanRequest} inspectorOpen={inspectorOpen} onToggleInspector={() => setInspectorOpen(true)} onFocusSelected={() => selectedId ? focusPersonOnMap(selectedId) : setToast("Сначала выберите человека")} viewMode={treeViewMode} nearbyIds={nearbyFamilyIds} onViewModeChange={changeTreeViewMode} />
         <aside className={`inspector ${inspectorOpen ? "inspector-open" : "inspector-closed"}`} aria-hidden={!inspectorOpen}>
           <div className="inspector-resize-handle" role="separator" aria-orientation="vertical" aria-label="Изменить ширину правой панели" aria-valuemin="300" aria-valuemax="560" aria-valuenow={Math.round(inspectorWidth)} tabIndex="0" onPointerDown={startInspectorResize} onPointerMove={moveInspectorResize} onPointerUp={endInspectorResize} onPointerCancel={endInspectorResize} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); resizeInspectorBy(16); } else if (event.key === "ArrowRight") { event.preventDefault(); resizeInspectorBy(-16); } else if (event.key === "Home") { event.preventDefault(); setInspectorWidth(560); } else if (event.key === "End") { event.preventDefault(); setInspectorWidth(300); } }} />
           <div className="inspector-header"><span>{editing ? "Редактирование" : relationshipEditing ? "Семейные связи" : "Выбран человек"}</span><IconButton label="Закрыть панель" onClick={closeInspector}><X size={21} /></IconButton></div>
           {editing ? <PersonEditor key={editorSessionKey} draft={draft} isNew={!draft?.id} relationshipMode={relationshipMode} relationshipType={relationshipType} partnershipType={partnershipType} connectionTargetId={connectionTargetId} relationshipSource={relationshipSource} unknownParent={unknownParent} singleKnownParent={singleKnownParent} outOfMarriage={outOfMarriage} siblingWithoutParents={siblingWithoutParents} people={people} onChange={setDraft} onRelationChange={setRelationshipMode} onRelationshipTypeChange={setRelationshipType} onPartnershipTypeChange={setPartnershipType} onConnectionTargetChange={setConnectionTargetId} onRelationshipSourceChange={setRelationshipSource} onUnknownParentChange={setUnknownParent} onSingleKnownParentChange={setSingleKnownParent} onOutOfMarriageChange={setOutOfMarriage} onSiblingWithoutParentsChange={setSiblingWithoutParents} onSave={savePerson} onCancel={() => { setEditing(false); setDraft(null); setRelationshipMode(""); setRelationshipType("biological"); setPartnershipType("marriage"); setConnectionTargetId(""); setRelationshipSource(""); setUnknownParent(false); setSingleKnownParent(false); setOutOfMarriage(false); setSiblingWithoutParents(false); }} /> : relationshipEditing ? <RelationshipEditor person={selectedPerson} people={people} partnerships={partnerships} onSave={saveRelationship} onDeleteRelationship={requestDeleteRelationship} onCancel={() => setRelationshipEditing(false)} /> : <PersonDetail person={selectedPerson} people={people} partnerships={partnerships} onEdit={() => openEditor(selectedPerson)} onSelect={selectPerson} onAddRelative={(relation) => openEditor(null, relation)} onManageRelationships={() => { setInspectorOpen(true); setRelationshipEditing(true); }} onCalculateRelationship={openRelationshipCalculator} onShowOnMap={focusPersonOnMap} onDelete={() => requestDelete(selectedPerson?.id)} onMoveSiblingOrder={moveSiblingOrder} onPreviousPerson={() => navigatePersonHistory(-1)} onNextPerson={() => navigatePersonHistory(1)} canGoPrevious={canMovePersonNavigation(personNavigation, -1)} canGoNext={canMovePersonNavigation(personNavigation, 1)} />}
         </aside>
       </main>
       <footer className="app-footer"><span className="footer-info"><Info size={17} /> Всего людей: {people.length}</span><span className="status-divider" /><span>Поколений: {treeLayout.generations.length}</span><span className="footer-file" title={projectMeta.filePath || `Имя файла: ${projectMeta.fileName || "семейное-древо.familytree"}`}>Файл: {projectMeta.fileName || "семейное-древо.familytree"}</span><span className={`footer-save ${dirty ? "footer-save-dirty" : ""}`}><CheckCircle size={19} weight="fill" /> {dirty ? "Есть несохранённые изменения" : lastSavedAt ? `Последнее сохранение: ${formatDateTime(lastSavedAt)}` : "Проект ещё не сохранён"}</span><span className="footer-backup">Автосохранение: {autoSaveEnabled ? (lastBackupAt ? formatDateTime(lastBackupAt) : "включено") : "выключено"}</span></footer>
      <input ref={fileInputRef} className="visually-hidden" type="file" accept=".familytree,.json,application/json" onChange={handleFileSelected} />
       {toast && <div className="toast" role="status" aria-live="polite"><CheckCircle size={19} weight="fill" /> <span>{toast}</span>{toastAction?.message === toast && <button type="button" className="toast-action" onClick={() => { setToastAction(null); toastAction.onClick(); }}>{toastAction.label}</button>}</div>}
       {backupOpen && <BackupModal backups={backups} projectMeta={projectMeta} lastSavedAt={lastSavedAt} lastBackupAt={lastBackupAt} onClose={() => setBackupOpen(false)} onRestore={restoreBackup} onDownload={downloadBackup} />}
       {archiveOpen && <ArchiveModal payload={buildPayload()} importState={archiveImport} onClose={() => { setArchiveOpen(false); setArchiveImport(null); }} onDownload={saveFamilyArchive} onImport={handleArchiveSelected} onRestoreImport={restoreFamilyArchive} onClearImport={() => setArchiveImport(null)} />}
       {viewSettingsOpen && <ViewSettingsModal treeStyle={treeStyle} showPhotos={showPhotos} cardFields={cardFields} onTreeStyleChange={(value) => updateViewSetting("treeStyle", value)} onShowPhotosChange={(value) => updateViewSetting("showPhotos", value)} onCardFieldsChange={(value) => updateViewSetting("cardFields", value)} onClose={() => setViewSettingsOpen(false)} />}
       {instructionOpen && <InstructionModal onClose={closeInstruction} />}
       {exportModalOpen && <Suspense fallback={<div className="backup-modal-backdrop" role="status" aria-live="polite"><section className="backup-modal export-loading" role="dialog" aria-modal="true" aria-label="Открытие экспорта"><strong>Открываю экспорт…</strong></section></div>}><ExportModal initialFormat={exportPreset} people={people} partnerships={partnerships} treeStyle={treeStyle} showPhotos={showPhotos} cardFields={cardFields} onClose={() => setExportModalOpen(false)} onToast={setToast} /></Suspense>}
       {relationshipCalculatorOpen && <RelationshipCalculatorModal people={people} partnerships={partnerships} initialSourceId={selectedId} onClose={() => setRelationshipCalculatorOpen(false)} onSelectPerson={selectPerson} onShowOnMap={focusPersonOnMap} />}
       {settingsOpen && <ProjectSettingsModal projectMeta={projectMeta} autoSaveEnabled={autoSaveEnabled} treeStyle={treeStyle} showPhotos={showPhotos} largeText={largeText} cardFields={cardFields} onSave={saveProjectSettings} onClose={closeSettings} />}
       {deleteConfirmId && <ConfirmModal title="Удалить человека?" description="Запись будет удалена из дерева, а её связи с родителями, партнёрами, братьями, сёстрами и детьми будут убраны. Перед этим будет создана резервная копия." confirmLabel="Удалить" onClose={() => setDeleteConfirmId("")} onConfirm={deletePerson} />}
       {relationshipDeleteConfirm && <ConfirmModal title="Удалить связь?" description={`${relationshipDeleteConfirm.label}. Связь будет убрана из дерева, а перед этим будет создана резервная копия. После удаления можно сразу отменить действие.`} confirmLabel="Удалить связь" onClose={() => setRelationshipDeleteConfirm(null)} onConfirm={deleteRelationship} />}
       {newTreeConfirmOpen && <ConfirmModal title="Создать новое дерево?" description="Текущее дерево останется в резервной копии, а рабочее полотно будет очищено." confirmLabel="Создать новое дерево" onClose={cancelNewTree} onConfirm={applyNewTree} />}
       {pendingUnsavedAction && <UnsavedChangesModal onSave={() => continueAfterUnsavedChoice(true)} onDiscard={() => continueAfterUnsavedChoice(false)} onCancel={() => setPendingUnsavedAction(null)} />}
       {mainMenuOpen && <MainMenuModal onCreate={() => createNewTree(true)} onLoad={openProject} onSettings={() => openSettings(true)} onHelp={() => openInstruction(true)} onExit={exitApplication} onClose={() => setMainMenuOpen(false)} />}
       {qualityOpen && <DataQualityModal report={qualityReport} peopleCount={people.length} onClose={() => setQualityOpen(false)} />}
       {updateStatus && updateOpen && ["available", "downloading", "downloaded"].includes(updateStatus.state) && <UpdateModal status={updateStatus} onClose={() => setUpdateOpen(false)} onDownload={downloadUpdate} onInstall={installUpdate} onOpenReleases={openReleasesPage} />}
     </div>
  );
}
