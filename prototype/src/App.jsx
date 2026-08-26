import { lazy, Suspense, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { formatAgeAtDeath, formatDateRecord, inferDatePrecision, normalizeDateRecord, normalizePersonDate } from "./dates.js";
import { createHistory, createSnapshot, getHistoryStatus, recordHistory, redoHistory, snapshotsEqual, undoHistory } from "./history.js";
import { DEFAULT_SEARCH_FILTERS, filterPeople } from "./search.js";
import { createRenderIndex, visibleEdges } from "./render-index.js";
import { calculateRelationship, personLabel } from "./relationship-calculator.js";
import { explainUserError } from "./ui-feedback.js";
import { createFamilyArchive, verifyFamilyArchive } from "./archive.js";
import { getSiblingComponent, orderChildrenForParent, orderSiblingMembers, reorderSiblingComponent } from "./sibling-order.js";
import { getFamilyView, getNearbyFamilyIds } from "./family-view.js";
import { canMovePersonNavigation, createPersonNavigation, currentPersonId, movePersonNavigation, visitPerson } from "./person-navigation.js";
import { CARD_FIELD_OPTIONS, DEFAULT_CARD_FIELDS, MAX_CUSTOM_FIELDS, MAX_CUSTOM_FIELD_LABEL, MAX_CUSTOM_FIELD_VALUE, formatCardFieldLines, normalizeCustomFields, sanitizeCardFields, validateCustomFields } from "./person-fields.js";
import { FACT_SOURCE_OPTIONS, MAX_EVENT_DATE, MAX_EVENT_DESCRIPTION, MAX_EVENT_PLACE, MAX_EVENT_SOURCE, MAX_EVENT_TITLE, MAX_TIMELINE_EVENTS, TIMELINE_EVENT_TYPES, normalizeFactSources, normalizeSourceValue, normalizeTimelineEvents, sortTimelineEvents } from "./timeline.js";
import { buildTreeLayout, withExpandedPartnershipClearance } from "./tree-layout.js";
import { horizontalConnection, verticalConnection } from "./tree-geometry.js";
import { layoutConnectionLabels, partnershipLabelAnchor } from "./connection-labels.js";
import { applyRelationOperation, normalizeRelationState } from "./relation-operations.js";
import { applySuggestedChildSurname, formerSurnames, formatPersonName, normalizeNameParts, normalizePersonNames, normalizeSurnameHistory, surnameSuggestionsForChild } from "./person-names.js";
import { validateBasicPersonSection, validateFactSourcesSection, validateTimelineSection } from "./section-validation.js";
import { appendChangeLog, normalizeRecordOrigin, recordOriginLabel } from "./change-log.js";
import { createCollapseIndex, getCollapsedDescendantIds, getCollapsibleIds } from "./tree-collapse.js";
import { dateMaskCaretForDigits, formatDateMask } from "./date-input.js";
import { MAX_TREE_ZOOM, MIN_TREE_ZOOM, zoomAtPoint } from "./tree-viewport.js";
import { DEFAULT_TREE_BRANCH_DEPTH, MAX_TREE_BRANCH_DEPTH, MIN_TREE_BRANCH_DEPTH, normalizeTreeBranchDepth } from "./tree-branch-depth.js";
import { DEFAULT_SHORTCUTS, SHORTCUT_COMMANDS, sanitizeShortcutMap, shortcutCommandId, shortcutDisplayName, shortcutFromKeyboardEvent, validateShortcutMap } from "./shortcuts.js";
import { layoutDelta, motionDurationMs, prefersReducedMotion } from "./motion.js";
import { ADDITION_PHASES, additionEdgeMatches, additionRole, additionSequenceDurations } from "./addition-motion.js";

const ExportModal = lazy(() => import("./ExportModal.jsx").then(({ ExportModal: Component }) => ({ default: Component })));
const NameEditorFields = lazy(() => import("./NameEditorFields.jsx"));
const AddressField = lazy(() => import("./AddressField.jsx").then(({ AddressField: Component }) => ({ default: Component })));
const RecordOriginField = lazy(() => import("./RecordOriginField.jsx").then(({ RecordOriginField: Component }) => ({ default: Component })));
const ChangeLogModal = lazy(() => import("./ChangeLogModal.jsx").then(({ ChangeLogModal: Component }) => ({ default: Component })));

const BRAND_MARK_SRC = "/branding/family-circle.svg";

function BrandMark({ className = "" }) {
  return <img className={`brand-mark ${className}`.trim()} src={BRAND_MARK_SRC} alt="" aria-hidden="true" />;
}

const initialPeople = [];

const blankPerson = { id: "", name: "", shortName: "", nameParts: normalizeNameParts(), nameOrigin: { status: "unknown", source: "", personIds: [] }, recordOrigin: { status: "manual", source: "" }, surnameHistory: [], isUnknown: false, source: "", confidence: "unknown", siblingOrder: null, customFields: [], factSources: {}, timelineEvents: [], year: "", datePrecision: "exact", birthDateFrom: "", birthDateTo: "", birthDate: { precision: "unknown", text: "", value: "", from: "", to: "" }, deathYear: "", deathDatePrecision: "", deathDateFrom: "", deathDateTo: "", place: "", placeDetails: null, image: "", gender: "", parentIds: [], parentLinks: [], partnerIds: [], childIds: [], siblingIds: [], siblingLinks: [], occupation: "", biography: "", maidenName: "", familyContext: [] };
const defaultProjectSettings = { autoSave: true, treeStyle: "classic", showPhotos: true, showFormerSurnames: true, largeText: false, branchDepth: String(DEFAULT_TREE_BRANCH_DEPTH), cardFields: [...DEFAULT_CARD_FIELDS], shortcuts: { ...DEFAULT_SHORTCUTS } };

function normalizeAppSettings(settings = {}) {
  return { ...defaultProjectSettings, ...(settings && typeof settings === "object" ? settings : {}), branchDepth: normalizeTreeBranchDepth(settings?.branchDepth), cardFields: sanitizeCardFields(settings?.cardFields), shortcuts: sanitizeShortcutMap(settings?.shortcuts) };
}

const initialPartnerships = [];

const relationLabel = { parent: "родителя", child: "ребёнка", partner: "супруга или партнёра", sibling: "брата или сестры" };
const relationTypeLabel = { biological: "Биологическая связь", adoptive: "Усыновление", step: "Степ-родство", guardian: "Опекунство", unknown: "Тип связи неизвестен", half: "Неполнородное родство" };
const siblingTypeLabel = { biological: "Родной брат или сестра", half: "Единокровный или единоутробный брат/сестра", step: "Сводный брат или сестра", unknown: "Тип связи неизвестен" };
const partnershipTypeLabel = { marriage: "Брак", engagement: "Помолвка", partnership: "Партнёрство" };
const confidenceLabel = { unknown: "Не указана", low: "Низкая", medium: "Средняя", high: "Высокая" };
const familyContextLabel = { "single-known-parent": "Один известный родитель", "out-of-marriage": "Ребёнок вне брака", "sibling-without-parents": "Родители не указаны" };

function personDisplayName(person) { return formatPersonName(person); }

function familyContextText(person) {
  return (Array.isArray(person?.familyContext) ? person.familyContext : []).map((value) => familyContextLabel[value]).filter(Boolean).join(" · ");
}

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `person-${Date.now()}`;
}

function getDraftDateRecord(draft, kind = "birth") {
  const isDeath = kind === "death";
  const value = isDeath ? draft?.deathYear : draft?.year;
  const precision = (isDeath ? draft?.deathDatePrecision : draft?.datePrecision) || inferDatePrecision(value);
  return {
    precision,
    text: precision === "range" ? "" : String(value || "").trim(),
    value: precision === "range" ? "" : String(value || "").trim(),
    from: String(draft?.[isDeath ? "deathDateFrom" : "birthDateFrom"] || "").trim(),
    to: String(draft?.[isDeath ? "deathDateTo" : "birthDateTo"] || "").trim(),
  };
}

function deathFieldsFromDraft(draft) {
  const record = normalizeDateRecord(getDraftDateRecord(draft, "death"));
  const hasDate = Boolean(record.text || record.value || record.from || record.to);
  return hasDate ? {
    deathDate: record,
    deathDatePrecision: record.precision,
    deathYear: formatDateRecord(record),
    deathDateFrom: record.precision === "range" ? record.from : "",
    deathDateTo: record.precision === "range" ? record.to : "",
  } : {};
}

function withoutDeathDateFields(person) {
  const { deathDate, deathYear, deathDatePrecision, deathDateFrom, deathDateTo, ...rest } = person || {};
  return rest;
}

function validatePersonDraft(draft, { isNew = false, relationshipMode = "", connectionTargetId = "", relationshipSource = "" } = {}) {
  const errors = {};
  const customFields = Array.isArray(draft?.customFields) ? draft.customFields : [];
  Object.assign(errors, validateBasicPersonSection(draft));
  const customFieldsError = validateCustomFields(customFields);
  if (customFieldsError) errors.customFields = customFieldsError;
  Object.assign(errors, validateFactSourcesSection(draft?.factSources || {}));
  Object.assign(errors, validateTimelineSection(Array.isArray(draft?.timelineEvents) ? draft.timelineEvents : []));
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
  if (partnership?.type === "engagement") return roleByGender(person, "Жених", "Невеста", "Жених/невеста");
  return roleByGender(person, "Супруг", "Супруга", "Супруг/супруга");
}

function familyStatusLabel(partnerships) {
  if (partnerships.some((partnership) => partnership.status === "active" && partnership.type === "marriage")) return "В браке";
  if (partnerships.some((partnership) => partnership.status === "active" && partnership.type === "engagement")) return "В помолвке";
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

function TreeNode({ person, position, selected, branchMuted, onSelect, onKeyboardNavigate, showPhotos, showFormerSurnames, cardFields, childNumber, dragging, onDragStart, onDragMove, onDragEnd, collapsible = false, collapsed = false, onToggleCollapse, motionTransform = "", entering = false, additionRoleName = "", additionPhase = "" }) {
  const cardLines = formatCardFieldLines(person, cardFields);
  const cardName = formatPersonName(person, { showFormerSurnames });
  const genderClass = !person.isUnknown && person.gender === "male" ? "tree-node-gender-male" : !person.isUnknown && person.gender === "female" ? "tree-node-gender-female" : "";
  return (
    <>
    <button className={`tree-node ${genderClass} ${branchMuted ? "tree-node-branch-muted" : ""} ${selected ? "tree-node-selected" : ""} ${showPhotos ? "" : "tree-node-no-photo"} ${dragging ? "tree-node-dragging" : ""} ${entering ? "tree-node-motion-enter" : ""} ${additionRoleName ? `tree-node-addition-${additionRoleName} tree-node-addition-${additionPhase}` : ""}`} data-person-id={person.id} style={{ left: position.left, top: position.top, width: position.width, height: position.height, ...(motionTransform ? { transform: motionTransform } : {}) }} type="button" onClick={() => onSelect(person.id)} onKeyDown={(event) => onKeyboardNavigate?.(person.id, event)} onPointerDown={(event) => onDragStart?.(person.id, event)} onPointerMove={(event) => onDragMove?.(event)} onPointerUp={(event) => onDragEnd?.(event)} onPointerCancel={(event) => onDragEnd?.(event)} aria-pressed={selected} aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight" aria-label={`${cardName}${childNumber ? `, ребёнок номер ${childNumber}` : ""}${cardLines.length ? `, ${cardLines.join(", ")}` : ""}`}>
      {childNumber && <span className="tree-node-child-number" aria-label={`Ребёнок номер ${childNumber}`}>№{childNumber}</span>}
      {hasDeathInformation(person) && <span className="tree-node-death-marker" aria-label="Дата смерти указана" title="Дата смерти указана">†</span>}
      <PersonAvatar person={person} showPhoto={showPhotos} />
      <span className="tree-node-copy">
        {cardName.split("\n").map((line) => <span key={line} className="tree-node-name">{line}</span>)}
        <span className="tree-node-details">{cardLines.map((line, index) => <span key={`${person.id}-card-line-${index}`} className={index === 0 && sanitizeCardFields(cardFields).includes("year") ? "tree-node-year" : "tree-node-detail"}>{line}</span>)}</span>
      </span>
    </button>
    {collapsible && <button type="button" className={`tree-node-collapse ${collapsed ? "is-collapsed" : ""} ${entering ? "tree-node-motion-enter" : ""}`} style={{ left: position.left + position.width - 22, top: position.top - 10, ...(motionTransform ? { transform: motionTransform } : {}) }} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onToggleCollapse?.(person.id); }} aria-label={`${collapsed ? "Развернуть" : "Свернуть"} ветвь: ${cardName}`} title={`${collapsed ? "Развернуть" : "Свернуть"} ветвь`}><span className="tree-node-collapse-icon" aria-hidden="true">{collapsed ? <CaretRight size={14} weight="bold" /> : <CaretDown size={14} weight="bold" />}</span></button>}
    </>
  );
}

function Connector({ left, top, width, height = 1, vertical = false, className = "" }) {
  return <span className={`connector ${vertical ? "connector-vertical" : ""} ${className}`} style={{ left, top, width, height }} />;
}

function RelationshipItem({ person, onSelect, meta = "", source = "", childNumber = null }) {
  if (!person) return null;
  return (
    <button className="relationship-item" type="button" onClick={() => onSelect(person.id)}>
      <PersonAvatar person={person} />
      <span className="relationship-copy"><span>{personDisplayName(person)}</span>{childNumber && <small className="relationship-child-number">Ребёнок №{childNumber}</small>}<small>{meta || person.year || "дата неизвестна"}</small>{source && <small className="relationship-source">{relationSourceText(source)}</small>}</span>
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

function SectionEditButton({ label, onClick }) {
  return <button type="button" className="section-edit-button" onClick={onClick} aria-label={`Редактировать раздел «${label}»`} title={`Редактировать раздел «${label}»`}><PencilSimple size={15} /></button>;
}

function SectionEditorFooter({ onCancel, onSave }) {
  return <div className="editor-footer"><button type="button" className="button button-ghost" onClick={onCancel}>Отмена</button><button type="button" className="button button-primary save-button" onClick={onSave}><FloppyDisk size={18} weight="bold" /> Сохранить</button></div>;
}

function DateMaskInput({ value, onChange, onBlur, ...props }) {
  const inputRef = useRef(null);
  const pendingCaret = useRef(null);
  const maskedValue = formatDateMask(value);
  useLayoutEffect(() => {
    if (pendingCaret.current === null || !inputRef.current) return;
    const caret = pendingCaret.current;
    pendingCaret.current = null;
    inputRef.current.setSelectionRange(caret, caret);
  }, [maskedValue]);
  const handleChange = (event) => {
    const rawValue = event.target.value;
    const selectionStart = event.target.selectionStart ?? rawValue.length;
    const nextValue = formatDateMask(rawValue);
    const digitsBeforeCaret = rawValue.slice(0, selectionStart).replace(/\D/g, "").length;
    pendingCaret.current = dateMaskCaretForDigits(nextValue, digitsBeforeCaret);
    onChange(nextValue);
  };
  return <input {...props} ref={inputRef} value={maskedValue} inputMode="numeric" maxLength={10} placeholder="__.__.____" onChange={handleChange} onBlur={onBlur} />;
}

function DeathFields({ draft, update, onClear, errors = {} }) {
  const precision = draft.deathDatePrecision || inferDatePrecision(draft.deathYear);
  const clear = () => onClear?.() || update("deathDatePrecision", "unknown");
  return <>
    <div className={`field field-full ${errors.deathYear ? "has-error" : ""}`}><span>Дата смерти <em>необязательно</em></span>{precision === "range" ? <div className="date-range-inputs"><input value={draft.deathDateFrom || ""} onChange={(event) => update("deathDateFrom", event.target.value)} placeholder="Начало, например 2020" aria-invalid={Boolean(errors.deathYear)} /><span>—</span><input value={draft.deathDateTo || ""} onChange={(event) => update("deathDateTo", event.target.value)} placeholder="Конец, например 2021" aria-invalid={Boolean(errors.deathYear)} /></div> : <input value={draft.deathYear || ""} onChange={(event) => update("deathYear", event.target.value)} placeholder={precision === "exact" ? "Например, 12.05.2020" : precision === "approximate" ? "Например, около 2020" : "Например, 2020"} aria-invalid={Boolean(errors.deathYear)} />}{errors.deathYear && <small className="field-error">{errors.deathYear}</small>}</div>
    <div className="field field-full"><span>Точность даты смерти</span><div className="date-options"><button type="button" className={`date-option ${precision === "exact" ? "selected" : ""}`} onClick={() => update("deathDatePrecision", "exact")}>Точный день</button><button type="button" className={`date-option ${precision === "year" ? "selected" : ""}`} onClick={() => update("deathDatePrecision", "year")}>Только год</button><button type="button" className={`date-option ${precision === "approximate" ? "selected" : ""}`} onClick={() => update("deathDatePrecision", "approximate")}>Примерно</button><button type="button" className={`date-option ${precision === "range" ? "selected" : ""}`} onClick={() => update("deathDatePrecision", "range")}>Диапазон</button><button type="button" className={`date-option ${precision === "unknown" ? "selected" : ""}`} onClick={clear}>Неизвестно</button></div><small className="field-hint">Дата смерти не может быть раньше даты рождения.</small></div>
    <label className={`field field-full ${errors.deathPlace ? "has-error" : ""}`}><span>Место смерти <em>необязательно</em></span><div className="input-with-icon"><MapPin size={17} /><input value={draft.deathPlace || ""} onChange={(event) => update("deathPlace", event.target.value)} aria-invalid={Boolean(errors.deathPlace)} /></div>{errors.deathPlace && <small className="field-error">{errors.deathPlace}</small>}</label>
    <label className={`field field-full ${errors.deathCause ? "has-error" : ""}`}><span>Причина смерти <em>необязательно</em></span><input value={draft.deathCause || ""} onChange={(event) => update("deathCause", event.target.value)} aria-invalid={Boolean(errors.deathCause)} />{errors.deathCause && <small className="field-error">{errors.deathCause}</small>}</label>
    <label className={`field ${errors.deathSource ? "has-error" : ""}`}><span>Источник смерти <em>необязательно</em></span><input value={draft.deathSource || ""} onChange={(event) => update("deathSource", event.target.value)} aria-invalid={Boolean(errors.deathSource)} />{errors.deathSource && <small className="field-error">{errors.deathSource}</small>}</label>
    <label className={`field field-full ${errors.deathComment ? "has-error" : ""}`}><span>Комментарий о смерти <em>необязательно</em></span><textarea value={draft.deathComment || ""} onChange={(event) => update("deathComment", event.target.value)} rows="3" aria-invalid={Boolean(errors.deathComment)} />{errors.deathComment && <small className="field-error">{errors.deathComment}</small>}</label>
  </>;
}

function BasicPersonSectionEditor({ person, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => normalizePersonDate({ ...person }));
  const [errors, setErrors] = useState({});
  const precision = draft.datePrecision || inferDatePrecision(draft.year);
  const update = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const validateDateField = (field) => setErrors((current) => ({ ...current, [field]: validateBasicPersonSection(draft)[field] || "" }));
  const save = () => {
    const nextErrors = validateBasicPersonSection(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    onSave(draft);
  };
  return <div className="editor-content section-editor"><div className="editor-intro"><div className="relation-editor-icon"><PencilSimple size={30} /></div><div><span className="eyebrow">Раздел человека</span><h2>Основная информация</h2><p>Проверьте только этот раздел. Остальные сведения останутся без изменений.</p></div></div><div className="form-grid section-form-grid">
    <label className="unknown-person-toggle field-full"><input type="checkbox" checked={Boolean(draft.isUnknown)} onChange={(event) => update("isUnknown", event.target.checked)} /><span><strong>Неизвестный человек</strong><small>ФИО можно оставить пустым, если имя пока неизвестно.</small></span></label>
    <Suspense fallback={null}><NameEditorFields draft={draft} onChange={setDraft} errors={errors} /><NameEditorFields kind="history" value={draft.surnameHistory} error={errors.surnameHistory} onChange={(value) => update("surnameHistory", value)} /></Suspense>
    <label className="field"><span>Пол <em>необязательно</em></span><select value={draft.gender || ""} onChange={(event) => update("gender", event.target.value)}><option value="">Не указан</option><option value="male">Мужчина</option><option value="female">Женщина</option></select></label>
    <Suspense fallback={null}><RecordOriginField value={draft.recordOrigin} onChange={(value) => update("recordOrigin", value)} /></Suspense>
    <div className={`field field-full ${errors.year ? "has-error" : ""}`}><span>Дата рождения <em>необязательно</em></span>{precision === "range" ? <div className="date-range-inputs"><input value={draft.birthDateFrom || ""} onChange={(event) => update("birthDateFrom", event.target.value)} placeholder="Начало, например 1940" aria-invalid={Boolean(errors.year)} /><span>—</span><input value={draft.birthDateTo || ""} onChange={(event) => update("birthDateTo", event.target.value)} placeholder="Конец, например 1945" aria-invalid={Boolean(errors.year)} /></div> : precision === "exact" ? <DateMaskInput value={draft.year || ""} onChange={(value) => update("year", value)} onBlur={() => validateDateField("year")} aria-invalid={Boolean(errors.year)} aria-label="Дата рождения: точный день" /> : <input value={draft.year || ""} onChange={(event) => update("year", event.target.value)} placeholder={precision === "approximate" ? "Например, около 1926" : "Например, 1926"} aria-invalid={Boolean(errors.year)} />}{errors.year && <small className="field-error">{errors.year}</small>}</div>
    <div className="field field-full"><span>Точность даты</span><div className="date-options"><button type="button" className={`date-option ${precision === "exact" ? "selected" : ""}`} onClick={() => update("datePrecision", "exact")}>Точный день</button><button type="button" className={`date-option ${precision === "year" ? "selected" : ""}`} onClick={() => update("datePrecision", "year")}>Только год</button><button type="button" className={`date-option ${precision === "approximate" ? "selected" : ""}`} onClick={() => update("datePrecision", "approximate")}>Примерно</button><button type="button" className={`date-option ${precision === "range" ? "selected" : ""}`} onClick={() => update("datePrecision", "range")}>Диапазон</button><button type="button" className={`date-option ${precision === "unknown" ? "selected" : ""}`} onClick={() => setDraft((current) => ({ ...current, datePrecision: "unknown", year: "", birthDateFrom: "", birthDateTo: "" }))}>Неизвестно</button></div></div>
    <DeathFields draft={draft} update={update} onClear={() => setDraft((current) => ({ ...current, deathDatePrecision: "unknown", deathYear: "", deathDateFrom: "", deathDateTo: "" }))} errors={errors} />
    <Suspense fallback={null}><AddressField draft={draft} errors={errors} onChange={setDraft} /></Suspense>
    <label className={`field field-full ${errors.occupation ? "has-error" : ""}`}><span>Профессия <em>необязательно</em></span><div className="input-with-icon"><Briefcase size={17} /><input value={draft.occupation || ""} onChange={(event) => update("occupation", event.target.value)} aria-invalid={Boolean(errors.occupation)} /></div>{errors.occupation && <small className="field-error">{errors.occupation}</small>}</label>
    <label className={`field field-full ${errors.biography ? "has-error" : ""}`}><span>Краткая биография <em>необязательно</em></span><textarea value={draft.biography || ""} onChange={(event) => update("biography", event.target.value)} rows="5" aria-invalid={Boolean(errors.biography)} />{errors.biography && <small className="field-error">{errors.biography}</small>}</label>
    <label className={`field ${errors.source ? "has-error" : ""}`}><span>Источник сведений <em>необязательно</em></span><input value={draft.source || ""} onChange={(event) => update("source", event.target.value)} aria-invalid={Boolean(errors.source)} />{errors.source && <small className="field-error">{errors.source}</small>}</label>
    <label className="field"><span>Достоверность</span><select value={draft.confidence || "unknown"} onChange={(event) => update("confidence", event.target.value)}>{PERSON_CONFIDENCE_LEVELS.map((level) => <option key={level} value={level}>{confidenceLabel[level]}</option>)}</select></label>
  </div><SectionEditorFooter onCancel={onCancel} onSave={save} /></div>;
}

function TimelineSectionEditor({ person, onSave, onCancel }) {
  const [events, setEvents] = useState(() => (Array.isArray(person?.timelineEvents) ? person.timelineEvents : []));
  const [errors, setErrors] = useState({});
  const save = () => { const nextErrors = validateTimelineSection(events); setErrors(nextErrors); if (!Object.keys(nextErrors).length) onSave(events); };
  return <div className="editor-content section-editor"><div className="editor-intro"><div className="relation-editor-icon"><ClockCounterClockwise size={30} /></div><div><span className="eyebrow">Раздел человека</span><h2>Временная шкала</h2><p>События проверяются отдельно; остальные разделы не блокируются их ошибками.</p></div></div><TimelineEditor events={events} error={errors.timelineEvents} onChange={setEvents} /><SectionEditorFooter onCancel={onCancel} onSave={save} /></div>;
}

function FactSourcesSectionEditor({ person, onSave, onCancel }) {
  const [sources, setSources] = useState(() => ({ ...(person?.factSources || {}) }));
  const [errors, setErrors] = useState({});
  const save = () => { const nextErrors = validateFactSourcesSection(sources); setErrors(nextErrors); if (!Object.keys(nextErrors).length) onSave(sources); };
  return <div className="editor-content section-editor"><div className="editor-intro"><div className="relation-editor-icon"><Info size={30} /></div><div><span className="eyebrow">Раздел человека</span><h2>Источники отдельных сведений</h2><p>Источники сохраняются отдельно от самих фактов и проверяются только в этом разделе.</p></div></div><FactSourcesEditor sources={sources} error={errors.factSources} onChange={setSources} /><SectionEditorFooter onCancel={onCancel} onSave={save} /></div>;
}

function RelationSection({ title, items, onSelect, onEdit, emptyText }) {
  return <section className="relation-section"><div className="section-title-row"><h3>{title}</h3><SectionEditButton label={title} onClick={onEdit} /></div>{items.length ? items.map(({ person, meta, relationshipId, source, childNumber }) => <RelationshipItem key={`${person.id}-${relationshipId || title}`} person={person} meta={meta} relationshipId={relationshipId} source={source} childNumber={childNumber} onSelect={onSelect} />) : <p className="empty-relation">{emptyText}</p>}</section>;
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

function deathDateText(person) {
  return person?.deathYear || formatDateRecord(person?.deathDate) || "";
}

function hasDeathInformation(person) {
  return Boolean(deathDateText(person) || person?.deathPlace || person?.deathCause || person?.deathSource || person?.deathComment);
}

function generatedDeathEvent(person) {
  if (!hasDeathInformation(person)) return null;
  const age = formatAgeAtDeath(person?.birthDate, person?.deathDate);
  return {
    id: `death-${person.id}`,
    type: "death",
    title: "Смерть",
    date: deathDateText(person),
    datePrecision: person?.deathDatePrecision || person?.deathDate?.precision || "unknown",
    place: person?.deathPlace || "",
    description: [person?.deathCause, age ? `Возраст: ${age}` : "", person?.deathComment].filter(Boolean).join(" · "),
    source: person?.deathSource || "",
  };
}

function relationSourceText(source) {
  return source ? `Источник: ${source}` : "";
}

function FactSourcesSection({ person, onEdit }) {
  const sources = Object.entries(person?.factSources || {}).filter(([, source]) => source);
  return <section className="detail-section fact-sources-section"><div className="section-title-row"><h3>Источники отдельных сведений</h3><SectionEditButton label="Источники отдельных сведений" onClick={onEdit} /></div>{sources.length ? <dl className="facts-list">{sources.map(([fact, source]) => <div key={fact}><dt>{factSourceLabel[fact] || fact}</dt><dd>{source}</dd></div>)}</dl> : <p className="empty-relation">Источники отдельных сведений ещё не добавлены</p>}</section>;
}

function TimelineSection({ person, onEdit }) {
  const deathEvent = generatedDeathEvent(person);
  const hasStoredDeathEvent = (Array.isArray(person?.timelineEvents) ? person.timelineEvents : []).some((event) => event?.type === "death");
  const events = sortTimelineEvents([...(Array.isArray(person?.timelineEvents) ? person.timelineEvents : []), ...(deathEvent && !hasStoredDeathEvent ? [deathEvent] : [])]);
  return <section className="detail-section timeline-section"><div className="section-title-row"><h3>Временная шкала</h3><SectionEditButton label="Временная шкала" onClick={onEdit} /></div>{events.length ? <ol className="timeline-list">{events.map((event) => <li className="timeline-item" key={event.id}><div className="timeline-marker" /><div className="timeline-event-copy"><div className="timeline-event-heading"><strong>{event.title}</strong><span>{event.date || "Дата не указана"}</span></div><small>{timelineEventLabel(event)}{event.date && event.datePrecision !== "unknown" ? ` · ${timelinePrecisionLabel[event.datePrecision] || ""}` : ""}{event.place ? ` · ${event.place}` : ""}</small>{event.description && <p>{event.description}</p>}{event.source && <em>Источник: {event.source}</em>}</div></li>)}</ol> : <p className="empty-relation">События ещё не добавлены</p>}</section>;
}

function PersonDetail({ person, people, partnerships, onEdit, onSelect, onAddRelative, onManageRelationships, onSaveBasicSection, onSaveTimelineSection, onSaveFactSourcesSection, onCalculateRelationship, onShowOnMap, onDelete, onMoveSiblingOrder, onPreviousPerson, onNextPerson, canGoPrevious, canGoNext }) {
  const [editingSection, setEditingSection] = useState("");
  useEffect(() => setEditingSection(""), [person?.id]);
  if (!person) return <div className="detail-content empty-tree-state"><h2>Дерево пока пустое</h2><p>Добавьте первого человека, даже если известны только отдельные сведения.</p><button type="button" className="button button-primary" onClick={() => onAddRelative("")}><Plus size={18} /> Добавить человека</button></div>;
  if (editingSection === "basic") return <BasicPersonSectionEditor person={person} onSave={(draft) => { onSaveBasicSection(person.id, draft); setEditingSection(""); }} onCancel={() => setEditingSection("")} />;
  if (editingSection === "timeline") return <TimelineSectionEditor person={person} onSave={(events) => { onSaveTimelineSection(person.id, events); setEditingSection(""); }} onCancel={() => setEditingSection("")} />;
  if (editingSection === "sources") return <FactSourcesSectionEditor person={person} onSave={(sources) => { onSaveFactSourcesSection(person.id, sources); setEditingSection(""); }} onCancel={() => setEditingSection("")} />;
  const displayName = personDisplayName(person);
  const find = (id) => people.find((item) => item.id === id);
  const parentIds = Array.isArray(person.parentIds) ? person.parentIds : [];
  const parentLinks = person.parentLinks?.length ? person.parentLinks : parentIds.map((personId) => ({ id: makeParentLinkId(person.id, personId, "biological"), personId, type: "biological" }));
  const parents = parentLinks.map((link) => {
    const parent = find(link.personId);
    const roles = parentRelationshipRoles(link.type, parent, person);
    return { person: parent, meta: `${roles.currentRole} · вы для него: ${roles.inverseRole}`, source: link.source, relationshipId: link.id || makeParentLinkId(person.id, link.personId, link.type) };
  }).filter((item) => item.person);
  const relatedPartnerships = partnerships.filter((partnership) => partnership.personIds.includes(person.id));
  const partnerIds = [...new Set([...(person.partnerIds || []), ...relatedPartnerships.flatMap((partnership) => partnership.personIds.filter((id) => id !== person.id))])];
  const partners = partnerIds.map((partnerId) => {
    const partner = find(partnerId);
    const partnership = [...partnerships].reverse().find((item) => item.personIds.includes(person.id) && item.personIds.includes(partnerId));
    const currentRole = partnerRole(person, partnership);
    const inverseRole = partnerRole(partner, partnership);
    return { person: partner, meta: `${partnershipDescription(partnership)} · вы для него: ${currentRole} · он/она для вас: ${inverseRole}`, source: partnership?.source, relationshipId: partnership?.id || `partnership-${[person.id, partnerId].sort().join("-")}` };
  }).filter((item) => item.person);
  const children = orderChildrenForParent(person, people).map((child, childIndex) => {
    const childId = child.id;
    const parentLink = child?.parentLinks?.find((link) => link.personId === person.id);
    const type = parentLink?.type || "biological";
    const roles = childRelationshipRoles(type, person, child);
    return { person: child, childNumber: childIndex + 1, meta: `${roles.currentRole} · вы для него: ${roles.inverseRole}`, source: parentLink?.source, relationshipId: parentLink?.id || makeParentLinkId(child?.id || childId, person.id, type) };
  }).filter((item) => item.person);
  const siblingLinks = person.siblingLinks?.length ? person.siblingLinks : (person.siblingIds || []).map((siblingId) => ({ id: makeSiblingLinkId(person.id, siblingId, "biological"), personId: siblingId, type: "biological" }));
  const siblingItems = siblingLinks.map((link) => {
    const sibling = find(link.personId);
    return { person: sibling, meta: siblingTypeLabel[link.type] || relationTypeLabel.unknown, source: link.source, relationshipId: link.id || makeSiblingLinkId(person.id, link.personId, link.type || "unknown") };
  }).filter((item) => item.person);
  const siblingPeople = orderSiblingMembers(siblingItems.map((item) => item.person));
  const siblings = siblingPeople.map((sibling) => siblingItems.find((item) => item.person.id === sibling.id)).filter(Boolean);
  return (
    <div className="detail-content">
      <div className="profile-block"><PersonAvatar person={person} large /><div className="profile-summary"><h2>{displayName}</h2><p className="profile-year">{person.year || "Дата рождения неизвестна"}{deathDateText(person) ? ` · † ${deathDateText(person)}` : ""}</p><div className="profile-place"><MapPin size={17} /> {person.place || "Место рождения не указано"}</div>{person.deathPlace && <div className="profile-place profile-death-place"><MapPin size={17} /> {person.deathPlace}</div>}</div><div className="profile-actions"><div className="person-navigation-actions"><button type="button" className="button button-secondary person-nav-button" onClick={onPreviousPerson} disabled={!canGoPrevious}><CaretLeft size={17} /> Предыдущий</button><button type="button" className="button button-secondary person-nav-button" onClick={onNextPerson} disabled={!canGoNext}>Следующий <CaretRight size={17} /></button></div><button type="button" className="button button-secondary map-focus-button" onClick={() => onShowOnMap(person.id)}><Crosshair size={18} /> Показать найденного человека на карте</button><button type="button" className="button button-primary edit-button" onClick={onEdit}><PencilSimple size={18} weight="bold" /> Редактировать</button></div></div>
      <section className="detail-section"><div className="section-title-row"><h3>Основная информация</h3><SectionEditButton label="Основная информация" onClick={() => setEditingSection("basic")} /></div><dl className="facts-list"><div><dt>Дата рождения</dt><dd>{person.year || "—"}</dd></div><div><dt>Место рождения</dt><dd>{person.place || "—"}</dd></div><div><dt>Дата смерти</dt><dd>{deathDateText(person) || "—"}</dd></div><div><dt>Место смерти</dt><dd>{person.deathPlace || "—"}</dd></div><div><dt>Причина смерти</dt><dd>{person.deathCause || "—"}</dd></div>{person.deathDate && <div><dt>Возраст на момент смерти</dt><dd>{formatAgeAtDeath(person.birthDate, person.deathDate) || "—"}</dd></div>}<div><dt>Источник смерти</dt><dd>{person.deathSource || "—"}</dd></div><div><dt>Комментарий о смерти</dt><dd>{person.deathComment || "—"}</dd></div><div><dt>Семейный статус</dt><dd>{familyStatusLabel(relatedPartnerships)}</dd></div><div><dt>Семейная ситуация</dt><dd>{familyContextText(person) || "—"}</dd></div><div><dt>Профессия</dt><dd>{person.occupation || "—"}</dd></div><div><dt>Текущая фамилия</dt><dd>{person.nameParts?.familyName || "—"}</dd></div><div><dt>Прежние фамилии</dt><dd>{formerSurnames(person).join(", ") || "—"}</dd></div><div><dt>Происхождение ФИО</dt><dd>{person.nameOrigin?.status === "suggested" ? "Предложено по родителям" : person.nameOrigin?.status === "inferred" ? "Выведено из старой записи" : "Введено пользователем"}</dd></div><div><dt>Происхождение записи</dt><dd>{recordOriginLabel(person.recordOrigin)}</dd></div><div><dt>Тип записи</dt><dd>{person.isUnknown ? "Неизвестный человек" : "Обычная запись"}</dd></div><div><dt>Источник сведений</dt><dd>{person.source || "—"}</dd></div><div><dt>Достоверность</dt><dd>{confidenceLabel[person.confidence] || confidenceLabel.unknown}</dd></div><div><dt>Примечание</dt><dd>{person.biography || "—"}</dd></div></dl></section>
      <FactSourcesSection person={person} onEdit={() => setEditingSection("sources")} />
      <TimelineSection person={person} onEdit={() => setEditingSection("timeline")} />
      <RelationSection title="Родители" items={parents} onSelect={onSelect} onEdit={() => onManageRelationships("parent")} emptyText="Родители ещё не добавлены" />
      <RelationSection title="Супруги и партнёры" items={partners} onSelect={onSelect} onEdit={() => onManageRelationships("marriage")} emptyText="Супруги и партнёры ещё не добавлены" />
      <RelationSection title="Братья и сёстры" items={siblings} onSelect={onSelect} onEdit={() => onManageRelationships("sibling")} emptyText="Братья и сёстры ещё не добавлены" />
      <SiblingOrderSection person={person} siblings={siblings} onMove={(direction) => onMoveSiblingOrder?.(person.id, direction)} />
      <RelationSection title="Дети" items={children} onSelect={onSelect} onEdit={() => onManageRelationships("child")} emptyText="Дети ещё не добавлены" />
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
  const displayPath = result.displayPath || result.path;
  const displaySteps = result.displaySteps || result.steps;
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
        {result.status === "found" && <div className="relationship-calculator-result"><div className="relationship-result-heading"><div><span className="eyebrow">Результат</span><h3>{result.label}</h3></div><button type="button" className="button button-secondary" onClick={() => onShowOnMap(result.target.id)}><Crosshair size={17} /> Показать второго на карте</button></div><p className="relationship-result-subtitle">Путь от старших к младшим: {Math.max(0, displayPath.length - 2)} промежуточных {displayPath.length - 2 === 1 ? "человек" : "человека"}.</p><div className="relationship-path" aria-label="Путь родства">{displayPath.map((person, index) => <div className="relationship-path-row" key={person.id}><button type="button" className="relationship-path-person" onClick={() => selectPathPerson(person.id)}><PersonAvatar person={person} /><span><strong>{personLabel(person)}</strong><small>{person.year || "дата неизвестна"}</small></span></button>{index < displaySteps.length && <div className="relationship-path-step"><span>{displaySteps[index].label}</span><CaretRight size={15} /></div>}</div>)}</div></div>}
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

function PersonEditor({ draft, isNew, relationshipMode, relationshipType, partnershipType, connectionTargetId, relationshipSource, unknownParent, singleKnownParent, outOfMarriage, siblingWithoutParents, people, partnerships, onChange, onRelationChange, onRelationshipTypeChange, onPartnershipTypeChange, onConnectionTargetChange, onRelationshipSourceChange, onUnknownParentChange, onSingleKnownParentChange, onOutOfMarriageChange, onSiblingWithoutParentsChange, onSave, onCancel }) {
  const [errors, setErrors] = useState({});
  const [wizardStep, setWizardStep] = useState(isNew ? 1 : 2);
  const photoInputRef = useRef(null);
  const targetOptions = people.filter((person) => person.id !== draft.id);
  const firstPerson = isNew && targetOptions.length === 0;
  const surnameSuggestions = useMemo(() => relationshipMode === "child" && connectionTargetId ? surnameSuggestionsForChild({ people, partnerships, parentId: connectionTargetId }) : [], [people, partnerships, relationshipMode, connectionTargetId]);
  const surnameSuggestion = surnameSuggestions[0] || null;
  useEffect(() => { setWizardStep(isNew ? 1 : 2); setErrors({}); }, [isNew, draft?.id]);
  const update = (field, value) => {
    onChange({ ...draft, [field]: value });
    setErrors((current) => ({ ...current, [field]: "" }));
  };
  const validateDateField = (field) => setErrors((current) => ({ ...current, [field]: validateBasicPersonSection(draft)[field] || "" }));
  const changeRelationMode = (value) => {
    if (firstPerson && value) return;
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
    if (firstPerson) return;
    onRelationChange("parent");
    onRelationshipTypeChange("biological");
    onUnknownParentChange(true);
    onSingleKnownParentChange(false);
    onOutOfMarriageChange(false);
    onSiblingWithoutParentsChange(false);
    setErrors((current) => ({ ...current, connectionTargetId: "" }));
  };
  useEffect(() => {
    if (!firstPerson || !relationshipMode) return;
    onRelationChange("");
    onRelationshipTypeChange("biological");
    onConnectionTargetChange("");
    onUnknownParentChange(false);
    onSingleKnownParentChange(false);
    onOutOfMarriageChange(false);
    onSiblingWithoutParentsChange(false);
  }, [firstPerson, relationshipMode]);
  useEffect(() => {
    if (!isNew || relationshipMode !== "child" || !connectionTargetId || draft?.nameOrigin?.status === "manual") return;
    if (surnameSuggestion?.surname) onChange(applySuggestedChildSurname(draft, surnameSuggestion));
  }, [isNew, relationshipMode, connectionTargetId, surnameSuggestion?.surname]);
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
  const handleSave = () => {
    const nextErrors = validatePersonDraft(draft, { isNew, relationshipMode, connectionTargetId, relationshipSource });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    onSave();
  };
  const handleNext = () => {
    if (wizardStep === 1) {
      if (firstPerson && relationshipMode) {
        changeRelationMode("");
        setWizardStep(2);
        return;
      }
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
  const relationTarget = targetOptions.find((person) => person.id === connectionTargetId);
  const scenarioLabels = [singleKnownParent && familyContextLabel["single-known-parent"], outOfMarriage && familyContextLabel["out-of-marriage"], siblingWithoutParents && familyContextLabel["sibling-without-parents"]].filter(Boolean);
  const scenarioSummary = scenarioLabels.join(" · ");
  const relationSummary = relationshipMode ? `${relationLabel[relationshipMode]}; ${relationshipMode === "partner" ? partnershipTypeLabel[partnershipType] : relationTypeLabel[relationshipType]}; ${relationTarget ? personDisplayName(relationTarget) : "человек не выбран"}${scenarioSummary ? ` · ${scenarioSummary}` : ""}${unknownParent ? " · карточка без имени" : ""}` : "Без связи — её можно добавить позже.";
  const baseRelationDescription = unknownParent ? "Будет создана отдельная карточка «Неизвестный человек» как родитель выбранного человека. Её можно заполнить позже." : relationshipMode === "parent" ? (relationshipType === "step" ? "Новый человек станет отчимом или мачехой выбранной записи." : relationshipType === "adoptive" ? "Новый человек станет усыновителем выбранной записи." : relationshipType === "guardian" ? "Новый человек будет указан как опекун выбранной записи." : relationshipType === "unknown" ? "Родительская связь будет сохранена без уточнения происхождения." : "Новый человек станет биологическим родителем выбранной записи.") : relationshipMode === "child" ? (relationshipType === "step" ? "Новый человек станет пасынком или падчерицей выбранной записи." : relationshipType === "adoptive" ? "Новый человек будет отмечен как усыновлённый ребёнок выбранной записи." : relationshipType === "guardian" ? "Новый человек будет связан с выбранным человеком отношением опеки." : relationshipType === "unknown" ? "Связь с ребёнком будет сохранена без уточнения происхождения." : "Новый человек станет биологическим ребёнком выбранной записи.") : relationshipMode === "sibling" ? `Новый человек будет добавлен как ${siblingTypeLabel[relationshipType]?.toLocaleLowerCase("ru") || "брат или сестра"}.` : relationshipMode === "partner" ? `Новый человек будет добавлен как ${partnershipType === "marriage" ? "супруг или супруга" : partnershipType === "engagement" ? "жених или невеста" : "партнёр"}. Новый союз можно добавить отдельной операцией; существующие союзы не заменяются.` : "Можно сохранить человека без связи и добавить её позже.";
  const relationDescription = [baseRelationDescription, singleKnownParent && "Будет отмечено, что известен только один родитель; второго человека приложение не создаёт.", outOfMarriage && "Будет отмечено, что ребёнок родился вне брака; брак автоматически не создаётся.", siblingWithoutParents && "Связь брата или сестры создаётся без автоматического добавления родителей."].filter(Boolean).join(" ");
  return (
    <div className={`editor-content ${firstPerson && wizardStep === 1 ? "editor-empty-tree" : ""}`}>
      <div className="editor-intro"><div className="editor-photo-wrap"><PersonAvatar person={draft} large /><button type="button" className="photo-action" onClick={() => photoInputRef.current?.click()}><Camera size={16} /> {draft.image ? "Заменить фото" : "Добавить фото"}</button><input ref={photoInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={choosePhoto} />{errors.image && <small className="field-error photo-error">{errors.image}</small>}</div><div><span className="eyebrow">{isNew ? relationText : "Редактирование"}</span><h2>{isNew ? "Добавить человека" : "Изменить сведения"}</h2><p>Заполните только то, что известно. Остальные поля можно оставить пустыми.</p></div></div>
      {isNew && <div className="wizard-progress" aria-label={`Шаг ${wizardStep} из 3`}><div className={wizardStep >= 1 ? "current" : ""}><span>1</span><strong>Связь</strong></div><div className={wizardStep >= 2 ? "current" : ""}><span>2</span><strong>Сведения</strong></div><div className={wizardStep >= 3 ? "current" : ""}><span>3</span><strong>Проверка</strong></div></div>}
      {(!isNew || wizardStep !== 3) && <div className="form-grid">
       {isNew && wizardStep === 1 && <div className="field field-full connection-field wizard-step"><div className="wizard-step-heading"><span className="eyebrow">Шаг 1 из 3</span><strong>Сначала определим место человека в семье</strong><small>Выберите готовый сценарий. Неполные сведения — это нормально: их можно дополнить позже.</small></div><span>Кем будет новый человек? <em>необязательно</em></span><div className="wizard-relation-list"><button type="button" className={`wizard-relation-choice ${relationshipMode === "" ? "selected" : ""}`} onClick={() => changeRelationMode("")}><strong>Без связи</strong><small>Добавить отдельно</small></button><button type="button" className={`wizard-relation-choice ${relationshipMode === "parent" && !unknownParent ? "selected" : ""}`} onClick={() => changeRelationMode("parent")}><strong>Родитель</strong><small>Родитель выбранного человека</small></button><button type="button" className={`wizard-relation-choice ${relationshipMode === "parent" && unknownParent ? "selected" : ""}`} onClick={chooseUnknownParent}><strong>Неизвестный родитель</strong><small>Создать родителя без имени</small></button><button type="button" className={`wizard-relation-choice ${relationshipMode === "child" ? "selected" : ""}`} onClick={() => changeRelationMode("child")}><strong>Ребёнок</strong><small>Ребёнок выбранного человека</small></button><button type="button" className={`wizard-relation-choice ${relationshipMode === "sibling" ? "selected" : ""}`} onClick={() => changeRelationMode("sibling")}><strong>Брат или сестра</strong><small>Связь без обязательных родителей</small></button><button type="button" className={`wizard-relation-choice ${relationshipMode === "partner" ? "selected" : ""}`} onClick={() => changeRelationMode("partner")}><strong>Супруг или партнёр</strong><small>Можно добавить несколько союзов</small></button></div>{relationshipMode === "partner" && <div className="date-options relation-options"><button type="button" className={`date-option ${partnershipType === "marriage" ? "selected" : ""}`} onClick={() => onPartnershipTypeChange("marriage")}>Брак</button><button type="button" className={`date-option ${partnershipType === "engagement" ? "selected" : ""}`} onClick={() => onPartnershipTypeChange("engagement")}>Помолвка</button><button type="button" className={`date-option ${partnershipType === "partnership" ? "selected" : ""}`} onClick={() => onPartnershipTypeChange("partnership")}>Партнёрство</button></div>}{relationshipMode && relationshipMode !== "partner" && <><span className="nested-field-label">{relationshipMode === "sibling" ? "Вид связи между братом и сестрой" : "Вид родственной связи"}</span><div className="date-options relation-options">{relationshipMode === "sibling" ? <><button type="button" className={`date-option ${relationshipType === "biological" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("biological")}>Родной</button><button type="button" className={`date-option ${relationshipType === "half" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("half")}>Неполнородный</button><button type="button" className={`date-option ${relationshipType === "step" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("step")}>Сводный</button><button type="button" className={`date-option ${relationshipType === "unknown" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("unknown")}>Неизвестно</button></> : <><button type="button" className={`date-option ${relationshipType === "biological" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("biological")}>Биологическая</button><button type="button" className={`date-option ${relationshipType === "adoptive" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("adoptive")}>Усыновление</button><button type="button" className={`date-option ${relationshipType === "step" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("step")}>Степ-родство</button><button type="button" className={`date-option ${relationshipType === "guardian" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("guardian")}>Опекунство</button><button type="button" className={`date-option ${relationshipType === "unknown" ? "selected" : ""}`} onClick={() => onRelationshipTypeChange("unknown")}>Неизвестно</button></>}</div></>}{relationshipMode === "child" && <div className="wizard-scenario-box"><span className="nested-field-label">Особенности ситуации — необязательно</span><label className="wizard-scenario-option"><input type="checkbox" checked={singleKnownParent} onChange={(event) => onSingleKnownParentChange(event.target.checked)} /><span><strong>Известен только один родитель</strong><small>Второй родитель не создаётся и не добавляется автоматически.</small></span></label><label className="wizard-scenario-option"><input type="checkbox" checked={outOfMarriage} onChange={(event) => onOutOfMarriageChange(event.target.checked)} /><span><strong>Ребёнок вне брака</strong><small>Отметка сохраняется отдельно; брак автоматически не создаётся.</small></span></label></div>}{relationshipMode === "sibling" && <div className="wizard-scenario-box"><span className="nested-field-label">Неполные сведения — необязательно</span><label className="wizard-scenario-option"><input type="checkbox" checked={siblingWithoutParents} onChange={(event) => onSiblingWithoutParentsChange(event.target.checked)} /><span><strong>Добавить без указания родителей</strong><small>Создаётся только связь брата или сестры; родителей можно добавить позже.</small></span></label></div>}{relationshipMode === "parent" && unknownParent && <div className="wizard-scenario-note"><strong>Будет создана запись «Неизвестный человек».</strong><small>Она будет связана как родитель выбранного человека, а имя и остальные сведения можно заполнить позже.</small></div>}{relationshipMode === "partner" && <div className="wizard-scenario-note"><strong>Можно добавить несколько партнёрств.</strong><small>После сохранения снова нажмите «Добавить родственника», чтобы создать следующий союз.</small></div>}<label className="nested-field"><span>С кем установить связь</span><select value={relationshipMode ? connectionTargetId : ""} disabled={!relationshipMode} onChange={(event) => changeConnectionTarget(event.target.value)}><option value="">Сначала выберите человека</option>{targetOptions.map((person) => <option key={person.id} value={person.id}>{personDisplayName(person)}{person.year ? ` · ${person.year}` : ""}</option>)}</select></label>{errors.connectionTargetId && <small className="field-error">{errors.connectionTargetId}</small>}<small className="field-hint">{relationDescription}</small></div>}
        {isNew && wizardStep === 1 && relationshipMode && <label className="field field-full relationship-source-field"><span>Источник связи <em>необязательно</em></span><input value={relationshipSource || ""} maxLength={MAX_EVENT_SOURCE} onChange={(event) => onRelationshipSourceChange(event.target.value)} placeholder="Например, семейный архив" />{errors.relationshipSource && <small className="field-error">{errors.relationshipSource}</small>}</label>}
        {(!isNew || wizardStep === 2) && <>
        <label className="unknown-person-toggle"><input type="checkbox" checked={displayUnknown} disabled={unknownParent} onChange={(event) => update("isUnknown", event.target.checked)} /><span><strong>{unknownParent ? "Неизвестный родитель" : "Неизвестный человек"}</strong><small>{unknownParent ? "ФИО можно оставить пустым: запись уже будет связана с выбранным человеком." : "Оставьте ФИО пустым, если нужно создать связь без имени."}</small></span></label>
        <Suspense fallback={null}><NameEditorFields draft={draft} onChange={onChange} errors={errors} suggestion={isNew && relationshipMode === "child" ? surnameSuggestion : null} /><NameEditorFields kind="history" value={draft.surnameHistory} error={errors.surnameHistory} onChange={(value) => update("surnameHistory", value)} /></Suspense>
        <label className="field"><span>Пол <em>необязательно</em></span><select value={draft.gender || ""} onChange={(event) => update("gender", event.target.value)}><option value="">Не указан</option><option value="male">Мужчина</option><option value="female">Женщина</option></select></label>
        <Suspense fallback={null}><RecordOriginField value={draft.recordOrigin} onChange={(value) => update("recordOrigin", value)} /></Suspense>
        <div className={`field field-full ${errors.year ? "has-error" : ""}`}><span>Дата рождения <em>необязательно</em></span>{precision === "range" ? <div className="date-range-inputs"><input value={draft.birthDateFrom || ""} onChange={(event) => update("birthDateFrom", event.target.value)} placeholder="Начало, например 1940" aria-invalid={Boolean(errors.year)} /><span>—</span><input value={draft.birthDateTo || ""} onChange={(event) => update("birthDateTo", event.target.value)} placeholder="Конец, например 1945" aria-invalid={Boolean(errors.year)} /></div> : precision === "exact" ? <DateMaskInput value={draft.year} onChange={(value) => update("year", value)} onBlur={() => validateDateField("year")} aria-invalid={Boolean(errors.year)} aria-label="Дата рождения: точный день" /> : <input value={draft.year} onChange={(event) => update("year", event.target.value)} placeholder={precision === "approximate" ? "Например, около 1926" : "Например, 1926"} aria-invalid={Boolean(errors.year)} />}{errors.year && <small className="field-error">{errors.year}</small>}</div>
        <div className="field field-full"><span>Точность даты</span><div className="date-options"><button type="button" className={`date-option ${precision === "exact" ? "selected" : ""}`} onClick={() => update("datePrecision", "exact")}>Точный день</button><button type="button" className={`date-option ${precision === "year" ? "selected" : ""}`} onClick={() => update("datePrecision", "year")}>Только год</button><button type="button" className={`date-option ${precision === "approximate" ? "selected" : ""}`} onClick={() => update("datePrecision", "approximate")}>Примерно</button><button type="button" className={`date-option ${precision === "range" ? "selected" : ""}`} onClick={() => update("datePrecision", "range")}>Диапазон</button><button type="button" className={`date-option ${precision === "unknown" ? "selected" : ""}`} onClick={() => { onChange({ ...draft, datePrecision: "unknown", year: "", birthDateFrom: "", birthDateTo: "" }); setErrors((current) => ({ ...current, year: "" })); }}>Неизвестно</button></div><small className="field-hint">Допустимо: 1926, 12.05.1926, «около 1926» или диапазон 1940–1945.</small></div>
        <DeathFields draft={draft} update={update} onClear={() => onChange({ ...draft, deathDatePrecision: "unknown", deathYear: "", deathDateFrom: "", deathDateTo: "" })} errors={errors} />
        <Suspense fallback={null}><AddressField draft={draft} errors={errors} onChange={onChange} /></Suspense>
        <label className={`field field-full ${errors.occupation ? "has-error" : ""}`}><span>Профессия <em>необязательно</em></span><div className="input-with-icon"><Briefcase size={17} /><input value={draft.occupation} onChange={(event) => update("occupation", event.target.value)} placeholder="Например, учитель" aria-invalid={Boolean(errors.occupation)} /></div>{errors.occupation && <small className="field-error">{errors.occupation}</small>}</label>
        <label className={`field field-full ${errors.biography ? "has-error" : ""}`}><span>Краткая биография <em>необязательно</em></span><textarea value={draft.biography} onChange={(event) => update("biography", event.target.value)} placeholder="Важные события, интересы, воспоминания..." rows="5" aria-invalid={Boolean(errors.biography)} />{errors.biography && <small className="field-error">{errors.biography}</small>}</label>
        <label className={`field ${errors.source ? "has-error" : ""}`}><span>Источник сведений <em>необязательно</em></span><input value={draft.source || ""} onChange={(event) => update("source", event.target.value)} placeholder="Например, рассказала мама" aria-invalid={Boolean(errors.source)} />{errors.source && <small className="field-error">{errors.source}</small>}</label>
        <label className="field"><span>Достоверность</span><select value={draft.confidence || "unknown"} onChange={(event) => update("confidence", event.target.value)}>{PERSON_CONFIDENCE_LEVELS.map((level) => <option key={level} value={level}>{confidenceLabel[level]}</option>)}</select></label>
        <CustomFieldsEditor fields={draft.customFields} error={errors.customFields} onChange={(value) => update("customFields", value)} />
        <FactSourcesEditor sources={draft.factSources} error={errors.factSources} onChange={(value) => update("factSources", value)} />
        <TimelineEditor events={draft.timelineEvents} error={errors.timelineEvents} onChange={(value) => update("timelineEvents", value)} />
       </>}
      </div>}
      {isNew && wizardStep === 1 && firstPerson && <div className="wizard-first-person-note" role="status"><strong>Это первая запись в дереве</strong><small>Добавьте её без связи — после сохранения можно будет добавлять родителей, детей и других родственников.</small></div>}
      {isNew && wizardStep === 3 && <div className="wizard-review"><div className="wizard-review-heading"><CheckCircle size={22} weight="fill" /><div><strong>Проверьте запись перед добавлением</strong><small>Если всё верно, нажмите «Добавить человека».</small></div></div><div className="wizard-review-grid"><div><span>ФИО</span><strong>{displayUnknown ? "Неизвестный человек" : personDisplayName(draft)}</strong></div><div><span>Дата рождения</span><strong>{formatDateRecord(getDraftDateRecord(draft)) || "Не указана"}</strong></div><div><span>Дата смерти</span><strong>{formatDateRecord(getDraftDateRecord(draft, "death")) || "Не указана"}</strong></div><div><span>Место рождения</span><strong>{draft.place.trim() || "Не указано"}</strong></div><div><span>Место смерти</span><strong>{draft.deathPlace?.trim() || "Не указано"}</strong></div><div><span>Фото</span><strong>{draft.image ? "Добавлено" : "Не добавлено"}</strong></div></div><div className="wizard-review-relation"><Link size={18} /><div><span>Связь и семейная ситуация</span><strong>{relationSummary}</strong><small>{relationDescription}</small></div></div></div>}
      <div className="editor-footer"><button type="button" className="button button-ghost" onClick={onCancel}>Отмена</button>{isNew && wizardStep > 1 && <button type="button" className="button button-secondary" onClick={handleBack}>Назад</button>}{isNew && wizardStep < 3 && <button type="button" className="button button-primary save-button" onClick={handleNext} disabled={wizardStep === 1 && Boolean(relationshipMode) && !connectionTargetId}>{wizardStep === 1 ? "К сведениям" : "К проверке"}</button>}{(!isNew || wizardStep === 3) && <button type="button" className="button button-primary save-button" onClick={handleSave}><FloppyDisk size={18} weight="bold" /> {isNew ? "Добавить человека" : "Сохранить"}</button>}</div>
    </div>
  );
}

function RelationshipEditor({ person, people, partnerships, initialKind = "parent", onSave, onDeleteRelationship, onCancel }) {
  const [draft, setDraft] = useState({ kind: initialKind, targetId: people.find((item) => item.id !== person.id)?.id || "", parentType: "biological", source: "", startDate: "", startDatePrecision: "unknown", endDate: "", endDatePrecision: "unknown" });
  const [relationToDelete, setRelationToDelete] = useState("");
  const update = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const changeKind = (kind) => setDraft((current) => ({ ...current, kind, parentType: kind === "sibling" ? "biological" : (kind === "parent" || kind === "child") ? "biological" : current.parentType }));
  const knownPartnerIds = new Set(partnerships.filter((partnership) => partnership.personIds.includes(person.id)).flatMap((partnership) => partnership.personIds.filter((id) => id !== person.id)));
  const currentPartnerIds = new Set([...(person.partnerIds || []).filter((id) => !knownPartnerIds.has(id)), ...partnerships.filter((partnership) => partnership.status === "active" && partnership.personIds.includes(person.id)).flatMap((partnership) => partnership.personIds.filter((id) => id !== person.id))]);
  const targetOptions = people.filter((item) => item.id !== person.id && (draft.kind !== "divorce" || currentPartnerIds.has(item.id)));
  const targetId = targetOptions.some((item) => item.id === draft.targetId) ? draft.targetId : targetOptions[0]?.id || "";
  const isParent = draft.kind === "parent" || draft.kind === "child";
  const isSibling = draft.kind === "sibling";
  const isPartnership = ["marriage", "engagement", "partnership", "divorce"].includes(draft.kind);
  const isDivorce = draft.kind === "divorce";
  const existingRelations = relationshipDeleteOptions(person, people, partnerships);
  const dateValue = isDivorce ? draft.endDate : draft.startDate;
  const datePrecision = isDivorce ? draft.endDatePrecision : draft.startDatePrecision;
  const save = () => onSave({ ...draft, targetId });
  return (
    <div className="editor-content relationship-editor">
      <div className="editor-intro relation-editor-intro"><div className="relation-editor-icon"><Link size={34} /></div><div><span className="eyebrow">Семейная связь</span><h2>Управлять связями</h2><p>Свяжите человека с уже существующей записью или добавьте семейное событие.</p></div></div>
      <div className="form-grid">
        <div className="field field-full"><span>Тип связи</span><div className="date-options relation-options"><button type="button" className={`date-option ${draft.kind === "parent" ? "selected" : ""}`} onClick={() => changeKind("parent")}>Родитель</button><button type="button" className={`date-option ${draft.kind === "child" ? "selected" : ""}`} onClick={() => changeKind("child")}>Ребёнок</button><button type="button" className={`date-option ${draft.kind === "sibling" ? "selected" : ""}`} onClick={() => changeKind("sibling")}>Брат/сестра</button><button type="button" className={`date-option ${draft.kind === "marriage" ? "selected" : ""}`} onClick={() => changeKind("marriage")}>Брак</button><button type="button" className={`date-option ${draft.kind === "engagement" ? "selected" : ""}`} onClick={() => changeKind("engagement")}>Помолвка</button><button type="button" className={`date-option ${draft.kind === "partnership" ? "selected" : ""}`} onClick={() => changeKind("partnership")}>Партнёрство</button><button type="button" className={`date-option ${draft.kind === "divorce" ? "selected" : ""}`} onClick={() => changeKind("divorce")}>Развод</button></div></div>
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

function TreeConnections({ people, partnerships, positions, width, height, visibleIds = null, hiddenIds = new Set(), renderIndex = null, strictVisible = false, branchMode = false, branchIds = new Set(), contextIds = new Set(), expandedLabelId = "", onExpandedLabelChange, transitionPositions = null, transitionPhase = "from", additionMotion = null }) {
  const byId = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const fallbackIndex = useMemo(() => createRenderIndex(people, partnerships, byId), [people, partnerships, byId]);
  const index = renderIndex || fallbackIndex;
  const edgeVisible = (edge, firstId, secondId) => !hiddenIds.has(firstId) && !hiddenIds.has(secondId) && (!strictVisible || !visibleIds || (visibleIds.has(firstId) && visibleIds.has(secondId)));
  const allParentEdges = useMemo(() => visibleEdges(index.parentEdges, visibleIds, index.parentEdgesByPerson), [index, visibleIds]);
  const allPartnerEdges = useMemo(() => visibleEdges(index.partnershipEdges, visibleIds, index.partnershipEdgesByPerson), [index, visibleIds]);
  const parentEdges = useMemo(() => allParentEdges.filter((edge) => positions[edge.parent.id] && positions[edge.child.id] && edgeVisible(edge, edge.parent.id, edge.child.id)), [allParentEdges, positions, hiddenIds, strictVisible, visibleIds]);
  const partnerEdges = useMemo(() => allPartnerEdges.filter((edge) => positions[edge.first.id] && positions[edge.second.id] && edgeVisible(edge, edge.first.id, edge.second.id)), [allPartnerEdges, positions, hiddenIds, strictVisible, visibleIds]);
  const branchVisible = (id) => branchIds.has(id) || contextIds.has(id);
  const edgeMuted = (firstId, secondId) => branchMode && !branchVisible(firstId) && !branchVisible(secondId);
  const labels = useMemo(() => [
    ...parentEdges.map(({ parent, child, type }) => {
      const geometry = verticalConnection(positions[parent.id], positions[child.id]);
      const roles = parentRelationshipRoles(type, parent, child);
      return {
        id: `parent-${parent.id}-${child.id}-${type}`,
        short: type === "biological" ? "Родство" : relationTypeLabel[type] || "Родство",
        full: `${roles.currentRole} — ${roles.inverseRole}`,
        left: (geometry.startX + geometry.endX) / 2,
        top: geometry.middleY,
        orientation: "vertical",
        muted: edgeMuted(parent.id, child.id),
      };
    }),
    ...partnerEdges.map(({ partnership, first, second }) => {
      const geometry = horizontalConnection(positions[first.id], positions[second.id]);
      const short = partnership.status === "divorced" ? "Развод" : partnershipTypeLabel[partnership.type] || "Связь";
      return {
        id: `partnership-${partnership.id}`,
        short,
        full: `${short}: ${personDisplayName(first)} — ${personDisplayName(second)}`,
        left: partnershipLabelAnchor(positions[first.id], positions[second.id]),
        top: Math.min(positions[first.id].top, positions[second.id].top),
        orientation: "horizontal",
        aboveCards: true,
        anchor: "upper-left",
        expandedMaxWidth: 250,
        muted: edgeMuted(first.id, second.id),
      };
    }),
  ], [parentEdges, partnerEdges, positions, branchMode, branchIds, contextIds]);
  const positionedLabels = useMemo(() => layoutConnectionLabels(labels, { positions: Object.values(positions), labelGap: 8, channelGap: 24 }), [labels, positions]);
  const additionClass = (edge) => additionMotion && additionEdgeMatches(edge, additionMotion) ? `connection-addition connection-addition-${additionMotion.phase}` : "";
  const renderConnectionSvg = (positionMap, className) => (
    <svg className={className} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <g className="parent-connections">
        {allParentEdges.filter(({ parent, child }) => positionMap[parent.id] && positionMap[child.id] && edgeVisible({ parent, child }, parent.id, child.id)).map(({ parent, child, type }) => {
          const geometry = verticalConnection(positionMap[parent.id], positionMap[child.id]);
          const extraClass = additionClass({ kind: "parent", personIds: [parent.id, child.id] });
          return <path key={`${parent.id}-${child.id}-${type}`} className={`connection-line ${type === "adoptive" ? "connection-adoptive" : ""} ${type === "step" ? "connection-step" : ""} ${edgeMuted(parent.id, child.id) ? "connection-branch-muted" : ""} ${extraClass}`} d={geometry.path} />;
        })}
      </g>
      <g className="partnership-connections">
        {allPartnerEdges.filter(({ first, second }) => positionMap[first.id] && positionMap[second.id] && edgeVisible({ first, second }, first.id, second.id)).map(({ partnership, first, second }) => {
          const geometry = horizontalConnection(positionMap[first.id], positionMap[second.id]);
          const extraClass = additionClass({ kind: "partnership", personIds: [first.id, second.id] });
          return <path key={partnership.id} className={`connection-line connection-partnership ${partnership.status === "divorced" ? "connection-divorced" : ""} ${edgeMuted(first.id, second.id) ? "connection-branch-muted" : ""} ${extraClass}`} d={geometry.path} />;
        })}
      </g>
      {additionMotion?.relationKind === "sibling" && positionMap[additionMotion.targetPersonId] && positionMap[additionMotion.newPersonId] && <path className={`connection-line connection-sibling connection-addition connection-addition-${additionMotion.phase}`} d={horizontalConnection(positionMap[additionMotion.targetPersonId], positionMap[additionMotion.newPersonId]).path} />}
    </svg>
  );
  const currentClass = transitionPositions ? `tree-connections tree-connections-current tree-connections-current-${transitionPhase}` : "tree-connections";
  return <>{transitionPositions && renderConnectionSvg(transitionPositions, `tree-connections tree-connections-previous ${transitionPhase === "to" ? "tree-connections-previous-to" : ""}`)}{renderConnectionSvg(positions, currentClass)}<div className="tree-connection-labels" aria-label="Подписи семейных связей">{positionedLabels.map((label) => { const expanded = expandedLabelId === label.id; return <button key={label.id} type="button" className={`connection-label ${label.muted ? "connection-label-muted" : ""} ${expanded ? "expanded" : ""}`} style={{ left: label.left, top: label.top, width: expanded ? label.expandedWidth : label.width, ...(expanded ? { minHeight: label.expandedHeight } : {}) }} aria-expanded={expanded} title={expanded ? "Свернуть полное название связи" : label.full} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onExpandedLabelChange?.((current) => current === label.id ? "" : label.id); }}>{expanded ? label.full : label.short}</button>; })}</div></>;
}

function TreeMiniMap({ people, partnerships, layout, positions, pan, zoom, viewportSize, onNavigate, hiddenIds = new Set(), renderIndex = null }) {
  const mapWidth = 204;
  const mapHeight = 136;
  const padding = 9;
  const scale = Math.min((mapWidth - padding * 2) / layout.width, (mapHeight - padding * 2) / layout.height);
  const point = (position) => ({ x: padding + position.left * scale, y: padding + position.top * scale, width: position.width * scale, height: position.height * scale });
  const fallbackIndex = useMemo(() => createRenderIndex(people, partnerships), [people, partnerships]);
  const index = renderIndex || fallbackIndex;
  const parentLines = useMemo(() => index.parentEdges.filter(({ parent, child }) => !hiddenIds.has(parent.id) && !hiddenIds.has(child.id)).map(({ parent, child }) => ({ parent: positions[parent.id], child: positions[child.id] })).filter((edge) => edge.parent && edge.child), [index, hiddenIds, positions]);
  const partnerLines = useMemo(() => index.partnershipEdges.filter(({ first, second }) => !hiddenIds.has(first.id) && !hiddenIds.has(second.id)).map(({ partnership, first, second }) => ({ partnership, first: positions[first.id], second: positions[second.id] })).filter((edge) => edge.first && edge.second), [index, hiddenIds, positions]);
  const miniMapPeople = useMemo(() => people.filter((person) => !hiddenIds.has(person.id)), [people, hiddenIds]);
  const viewportWidth = viewportSize.width ? viewportSize.width / zoom : 0;
  const viewportHeight = viewportSize.height ? viewportSize.height / zoom : 0;
  const visibleBoard = { x: Math.max(0, -pan.x / zoom), y: Math.max(0, -pan.y / zoom), width: Math.min(layout.width, viewportWidth), height: Math.min(layout.height, viewportHeight) };
  const navigate = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = ((event.clientX - rect.left) / rect.width) * mapWidth;
    const localY = ((event.clientY - rect.top) / rect.height) * mapHeight;
    onNavigate({ x: Math.max(0, Math.min(layout.width, (localX - padding) / scale)), y: Math.max(0, Math.min(layout.height, (localY - padding) / scale)) });
  };
  return <div className="tree-minimap" aria-label="Мини-карта всего дерева"><div className="tree-minimap-title">Мини-карта</div><svg width={mapWidth} height={mapHeight} viewBox={`0 0 ${mapWidth} ${mapHeight}`} role="img" aria-label="Обзор дерева" onClick={navigate}><rect className="tree-minimap-board" x="0" y="0" width={mapWidth} height={mapHeight} rx="6" />{parentLines.map(({ parent, child }, index) => { const from = point(parent); const to = point(child); return <line key={`mini-parent-${index}`} className="tree-minimap-parent-line" x1={from.x + from.width / 2} y1={from.y + from.height} x2={to.x + to.width / 2} y2={to.y} />; })}{partnerLines.map(({ first, second }, index) => { const from = point(first); const to = point(second); return <line key={`mini-partner-${index}`} className="tree-minimap-partner-line" x1={from.x + from.width / 2} y1={from.y + from.height / 2} x2={to.x + to.width / 2} y2={to.y + to.height / 2} />; })}{miniMapPeople.map((person) => { const position = positions[person.id]; if (!position) return null; const card = point(position); return <rect key={person.id} className="tree-minimap-person" x={card.x} y={card.y} width={Math.max(3, card.width)} height={Math.max(3, card.height)} rx="1.5" />; })}<rect className="tree-minimap-viewport" x={padding + visibleBoard.x * scale} y={padding + visibleBoard.y * scale} width={Math.max(4, visibleBoard.width * scale)} height={Math.max(4, visibleBoard.height * scale)} rx="2" /></svg><small>Нажмите на область, чтобы перейти к ней</small></div>;
}

function TreeCanvas({ people, partnerships, layout, selectedId, onSelect, zoom, onZoomChange, pan, onPanChange, treeStyle, showPhotos, showFormerSurnames, cardFields, focusRequest, keyboardPanRequest, inspectorOpen, onToggleInspector, onFocusSelected, viewMode = "full", branchDepth = String(DEFAULT_TREE_BRANCH_DEPTH), branchIds = new Set(), contextIds = new Set(), nearbyIds = new Set(), collapsedIds = new Set(), onToggleCollapse, onResetCollapsedBranches, onViewModeChange, onBranchDepthChange, additionMotion = null }) {
  const dragRef = useRef(null);
  const personDragRef = useRef(null);
  const viewportRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [personDraggingId, setPersonDraggingId] = useState("");
  const [expandedLabelId, setExpandedLabelId] = useState("");
  const [manualOffsets, setManualOffsets] = useState({});
  const [cardMotion, setCardMotion] = useState({ transforms: {}, enteringIds: new Set() });
  const [connectionMotion, setConnectionMotion] = useState(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const previousPositionsRef = useRef(null);
  const motionFrameRef = useRef(0);
  const motionTimerRef = useRef(0);
  const motionTokenRef = useRef(0);
  const displayLayout = useMemo(() => withExpandedPartnershipClearance(layout, partnerships, expandedLabelId), [layout, partnerships, expandedLabelId]);
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const renderIndex = useMemo(() => createRenderIndex(people, partnerships, peopleById), [people, partnerships, peopleById]);
  const collapseIndex = useMemo(() => createCollapseIndex(people, partnerships), [people, partnerships]);
  const hiddenIds = useMemo(() => getCollapsedDescendantIds(people, partnerships, collapsedIds, collapseIndex), [people, partnerships, collapsedIds, collapseIndex]);
  const collapsibleIds = useMemo(() => getCollapsibleIds(people, partnerships, collapseIndex), [people, partnerships, collapseIndex]);
  const childNumberById = useMemo(() => {
    const childIdsByParent = new Map();
    const addChild = (parentId, childId) => {
      if (!parentId || !childId) return;
      if (!childIdsByParent.has(parentId)) childIdsByParent.set(parentId, new Set());
      childIdsByParent.get(parentId).add(childId);
    };
    people.forEach((parent) => (parent.childIds || []).forEach((childId) => addChild(parent.id, childId)));
    people.forEach((child) => {
      const links = child.parentLinks?.length ? child.parentLinks : (child.parentIds || []).map((parentId) => ({ personId: parentId }));
      links.forEach((link) => addChild(link.personId, child.id));
    });
    const result = new Map();
    childIdsByParent.forEach((childIds, parentId) => {
      const parent = peopleById.get(parentId);
      const ordered = orderChildrenForParent({ ...(parent || {}), childIds: [...childIds] }, people);
      ordered.forEach((child, index) => { if (!result.has(child.id)) result.set(child.id, index + 1); });
    });
    return result;
  }, [people, peopleById]);
  const renderedPositions = useMemo(() => Object.fromEntries(Object.entries(displayLayout.positions).map(([id, position]) => {
    const offset = manualOffsets[id] || { x: 0, y: 0 };
    return [id, { ...position, left: position.left + offset.x, top: position.top + offset.y }];
  })), [displayLayout.positions, manualOffsets]);
  useLayoutEffect(() => {
    const previous = previousPositionsRef.current;
    previousPositionsRef.current = renderedPositions;
    if (!previous || personDraggingId || prefersReducedMotion()) return;
    const transforms = {};
    const enteringIds = [];
    Object.entries(renderedPositions).forEach(([id, position]) => {
      const delta = layoutDelta(previous[id], position);
      if (delta) transforms[id] = `translate(${delta.x}px, ${delta.y}px)`;
      else if (!previous[id]) enteringIds.push(id);
    });
    if (!Object.keys(transforms).length && !enteringIds.length) return;
    if (motionFrameRef.current) window.cancelAnimationFrame(motionFrameRef.current);
    if (motionTimerRef.current) window.clearTimeout(motionTimerRef.current);
    const token = motionTokenRef.current + 1;
    motionTokenRef.current = token;
    setCardMotion({ transforms, enteringIds: new Set(enteringIds) });
    setConnectionMotion({ previousPositions: previous, phase: "from", token });
    motionFrameRef.current = window.requestAnimationFrame(() => {
      setCardMotion({ transforms: {}, enteringIds: new Set() });
      setConnectionMotion((current) => current?.token === token ? { ...current, phase: "to" } : current);
    });
    motionTimerRef.current = window.setTimeout(() => {
      setConnectionMotion((current) => current?.token === token ? null : current);
      motionFrameRef.current = 0;
      motionTimerRef.current = 0;
    }, motionDurationMs() + 40);
  }, [renderedPositions, personDraggingId]);
  useEffect(() => () => {
    if (motionFrameRef.current) window.cancelAnimationFrame(motionFrameRef.current);
    if (motionTimerRef.current) window.clearTimeout(motionTimerRef.current);
  }, []);
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
    const modeIds = null;
    if (!viewportSize.width || !viewportSize.height) return modeIds;
    const margin = Math.max(240, 520 / zoom);
    const left = (-pan.x / zoom) - margin;
    const top = (-pan.y / zoom) - margin;
    const right = ((viewportSize.width - pan.x) / zoom) + margin;
    const bottom = ((viewportSize.height - pan.y) / zoom) + margin;
    const viewportIds = new Set(Object.entries(renderedPositions).filter(([id, position]) => !hiddenIds.has(id) && position.left + position.width >= left && position.left <= right && position.top + position.height >= top && position.top <= bottom).map(([id]) => id));
    if (!modeIds) return viewportIds;
    return new Set([...modeIds].filter((id) => viewportIds.has(id)));
  }, [renderedPositions, hiddenIds, pan.x, pan.y, zoom, viewportSize, viewMode, nearbyIds]);
  const visiblePeople = useMemo(() => visibleIds ? people.filter((person) => visibleIds.has(person.id) && !hiddenIds.has(person.id)) : people.filter((person) => !hiddenIds.has(person.id)), [people, visibleIds, hiddenIds]);
  const navigateTreeNode = (personId, event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const current = renderedPositions[personId];
    if (!current) return;
    const currentGeneration = current.generation;
    const candidates = visiblePeople.map((person) => ({ person, position: renderedPositions[person.id] })).filter(({ person, position }) => person.id !== personId && position);
    let target = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const sameGeneration = candidates.filter(({ position }) => position.generation === currentGeneration).sort((first, second) => first.position.left - second.position.left);
      const currentIndex = sameGeneration.findIndex(({ position }) => position.left > current.left);
      const orderedIndex = event.key === "ArrowRight" ? currentIndex : currentIndex - 1;
      if (event.key === "ArrowLeft" && currentIndex === -1) target = sameGeneration.at(-1);
      else if (event.key === "ArrowRight") target = sameGeneration[orderedIndex];
      else target = sameGeneration[orderedIndex];
    } else {
      const generationDelta = event.key === "ArrowUp" ? -1 : 1;
      const nextGeneration = candidates.filter(({ position }) => position.generation === currentGeneration + generationDelta);
      target = nextGeneration.sort((first, second) => Math.abs((first.position.left + first.position.width / 2) - (current.left + current.width / 2)) - Math.abs((second.position.left + second.position.width / 2) - (current.left + current.width / 2)))[0];
    }
    if (!target) return;
    onSelect(target.person.id);
    [...document.querySelectorAll(".tree-node")].find((node) => node.dataset.personId === target.person.id)?.focus();
  };
  useEffect(() => {
    const knownIds = new Set(Object.keys(displayLayout.positions));
    setManualOffsets((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([id]) => knownIds.has(id)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [displayLayout.positions]);
  const getPanBounds = (forZoom = zoom) => {
    const viewport = viewportRef.current;
    if (!viewport) return { minX: -900, maxX: 900, minY: -650, maxY: 650 };
    const edgePadding = 24;
    const boardRight = viewport.clientWidth - displayLayout.width * forZoom - edgePadding;
    const boardBottom = viewport.clientHeight - displayLayout.height * forZoom - edgePadding;
    return { minX: Math.min(edgePadding, boardRight), maxX: Math.max(edgePadding, boardRight), minY: Math.min(edgePadding, boardBottom), maxY: Math.max(edgePadding, boardBottom) };
  };
  const clampPan = (value, forZoom = zoom) => { const bounds = getPanBounds(forZoom); return { x: Math.max(bounds.minX, Math.min(bounds.maxX, value.x)), y: Math.max(bounds.minY, Math.min(bounds.maxY, value.y)) }; };
  const movePan = (x, y) => onPanChange(clampPan({ x: pan.x + x, y: pan.y + y }));
  const centerView = () => {
    const width = viewportSize.width || viewportRef.current?.clientWidth || 0;
    const height = viewportSize.height || viewportRef.current?.clientHeight || 0;
    if (!width || !height) return;
    onPanChange(clampPan({ x: (width - displayLayout.width * zoom) / 2, y: (height - displayLayout.height * zoom) / 2 }));
  };
  const fitAll = () => {
    const width = viewportSize.width || viewportRef.current?.clientWidth || 0;
    const height = viewportSize.height || viewportRef.current?.clientHeight || 0;
    if (!width || !height) return;
    const nextZoom = Math.max(MIN_TREE_ZOOM, Math.min(MAX_TREE_ZOOM, Math.min((width - 48) / displayLayout.width, (height - 48) / displayLayout.height)));
    onZoomChange(nextZoom);
    onPanChange(clampPan({ x: (width - displayLayout.width * nextZoom) / 2, y: (height - displayLayout.height * nextZoom) / 2 }, nextZoom));
  };
  const centerFamilyPair = () => {
    const selectedPosition = renderedPositions[selectedId];
    if (!selectedPosition) return;
    const partner = partnerships.find((item) => item.status !== "divorced" && item.personIds?.includes(selectedId));
    const partnerId = partner?.personIds?.find((id) => id !== selectedId);
    const partnerPosition = partnerId ? renderedPositions[partnerId] : null;
    const centerX = partnerPosition ? (selectedPosition.left + selectedPosition.width / 2 + partnerPosition.left + partnerPosition.width / 2) / 2 : selectedPosition.left + selectedPosition.width / 2;
    const centerY = partnerPosition ? (selectedPosition.top + selectedPosition.height / 2 + partnerPosition.top + partnerPosition.height / 2) / 2 : selectedPosition.top + selectedPosition.height / 2;
    const width = viewportSize.width || viewportRef.current?.clientWidth || 0;
    const height = viewportSize.height || viewportRef.current?.clientHeight || 0;
    if (width && height) onPanChange(clampPan({ x: width / 2 - centerX * zoom, y: height / 2 - centerY * zoom }));
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
    const position = displayLayout.positions[id];
    const group = displayLayout.generations.find((generation) => generation.index === position?.generation);
    const index = group?.members.findIndex((member) => member.id === id) ?? -1;
    const previous = index > 0 ? displayLayout.positions[group.members[index - 1].id] : null;
    const next = index >= 0 && index < group.members.length - 1 ? displayLayout.positions[group.members[index + 1].id] : null;
    const minimumGap = 44;
    const minX = previous ? previous.left + previous.width + minimumGap - position.left : 24 - position.left;
    const maxX = next ? next.left - position.width - minimumGap - position.left : displayLayout.width - position.width - 24 - position.left;
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
    const verticalSnapDistance = Math.max(52, displayLayout.rowStep * 0.35);
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
  const normalizeWheelDelta = (value, deltaMode) => {
    if (deltaMode === 1) return value * 16;
    if (deltaMode === 2) return value * (viewportRef.current?.clientHeight || 800);
    return value;
  };
  const onWheel = (event) => {
    const deltaX = normalizeWheelDelta(event.deltaX, event.deltaMode);
    const deltaY = normalizeWheelDelta(event.deltaY, event.deltaMode);
    if (!deltaX && !deltaY) return;
    event.preventDefault();
    if (event.shiftKey || (!deltaY && deltaX)) {
      movePan(-(deltaX || deltaY), 0);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const styles = window.getComputedStyle(event.currentTarget);
    const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
    const nextViewport = zoomAtPoint({
      zoom,
      pan,
      point: { x: event.clientX - rect.left - paddingLeft, y: event.clientY - rect.top - paddingTop },
      wheelDelta: deltaY,
    });
    onZoomChange(nextViewport.zoom);
    onPanChange(clampPan(nextViewport.pan, nextViewport.zoom));
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
  }, [focusRequest?.token, displayLayout, renderedPositions, zoom]);
  useEffect(() => {
    const nextPan = clampPan(pan);
    if (nextPan.x !== pan.x || nextPan.y !== pan.y) onPanChange(nextPan);
  }, [displayLayout.width, displayLayout.height, zoom, inspectorOpen]);
  const navigateToBoardPoint = ({ x, y }) => {
    const width = viewportSize.width || viewportRef.current?.clientWidth || 0;
    const height = viewportSize.height || viewportRef.current?.clientHeight || 0;
    if (!width || !height) return;
    onPanChange(clampPan({ x: width / 2 - x * zoom, y: height / 2 - y * zoom }));
  };
  const styleLabel = treeStyle === "album" ? "Семейный альбом" : treeStyle === "minimal" ? "Сдержанный" : "Классический";
  return (
    <section className={`tree-panel tree-style-${treeStyle}`}>
      <div className={`tree-view-mode ${viewMode === "branch" ? "tree-view-mode-branch" : ""}`} role="group" aria-label="Режим просмотра дерева"><span>Вид дерева</span><button type="button" className={viewMode === "full" ? "selected" : ""} aria-pressed={viewMode === "full"} onClick={() => onViewModeChange?.("full")}>Всё дерево</button><button type="button" className={viewMode === "branch" ? "selected" : ""} aria-pressed={viewMode === "branch"} onClick={() => onViewModeChange?.("branch")} disabled={!selectedId}>Родственная ветвь</button>{viewMode === "branch" && <label className="tree-branch-depth"><span>Глубина</span><select value={branchDepth} onChange={(event) => onBranchDepthChange?.(event.target.value)} aria-label="Глубина родственной ветви">{Array.from({ length: MAX_TREE_BRANCH_DEPTH - MIN_TREE_BRANCH_DEPTH + 1 }, (_, index) => { const value = String(MIN_TREE_BRANCH_DEPTH + index); return <option key={value} value={value}>{value} {value === "1" ? "поколение" : "поколений"}</option>; })}</select></label>}{collapsedIds.size > 0 && <button type="button" className="tree-collapse-reset" onClick={onResetCollapsedBranches}>Развернуть ветви</button>}</div>
      <div className="tree-controls left-controls"><div className="pan-control"><IconButton label="Переместить вверх" onClick={() => movePan(0, -110)}><CaretUp size={18} /></IconButton><IconButton label="Переместить влево" onClick={() => movePan(-110, 0)}><CaretLeft size={18} /></IconButton><IconButton label="Переместить вправо" onClick={() => movePan(110, 0)}><CaretRight size={18} /></IconButton><IconButton label="Переместить вниз" onClick={() => movePan(0, 110)}><CaretDown size={18} /></IconButton></div><div className="zoom-control"><IconButton label="Увеличить" onClick={() => onZoomChange(Math.min(MAX_TREE_ZOOM, zoom + 0.08))}><Plus size={18} /></IconButton><span>{Math.round(zoom * 100)}%</span><IconButton label="Уменьшить" onClick={() => onZoomChange(Math.max(MIN_TREE_ZOOM, zoom - 0.08))}><Minus size={18} /></IconButton></div><div className="view-command-control"><IconButton label="Показать всё дерево" onClick={fitAll}><ArrowsOut size={18} /></IconButton><IconButton label="По центру" onClick={centerView}><Crosshair size={18} /></IconButton><IconButton label="Центрировать семейную пару" onClick={centerFamilyPair} disabled={!selectedId}><UsersThree size={18} /></IconButton><IconButton label="Вернуться к выбранному человеку" onClick={onFocusSelected} disabled={!selectedId}><MapPin size={18} /></IconButton></div>{!inspectorOpen && <IconButton label="Открыть панель сведений" className="inspector-toggle-control" onClick={onToggleInspector}><Info size={20} /></IconButton>}</div>
      <div ref={viewportRef} className={`tree-viewport ${dragging ? "is-dragging" : ""}`} role="region" aria-label="Полотно семейного дерева. Колесо мыши изменяет масштаб, Shift+колесо перемещает полотно" tabIndex="0" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onWheel={onWheel}><div className="tree-board" style={{ width: displayLayout.width, height: displayLayout.height, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}><TreeConnections people={people} partnerships={partnerships} positions={renderedPositions} transitionPositions={connectionMotion?.previousPositions} transitionPhase={connectionMotion?.phase} additionMotion={additionMotion} visibleIds={visibleIds} hiddenIds={hiddenIds} strictVisible={viewMode === "branch"} branchMode={viewMode === "branch"} branchIds={branchIds} contextIds={contextIds} renderIndex={renderIndex} width={displayLayout.width} height={displayLayout.height} expandedLabelId={expandedLabelId} onExpandedLabelChange={setExpandedLabelId} />{displayLayout.generations.map((group) => <span className="generation-label" key={group.index} style={{ top: group.top - 38, left: 24 }}>Поколение {group.index + 1}</span>)}{visiblePeople.map((person) => renderedPositions[person.id] ? <TreeNode key={person.id} person={person} position={renderedPositions[person.id]} motionTransform={cardMotion.transforms[person.id]} entering={cardMotion.enteringIds.has(person.id)} additionRoleName={additionRole(person.id, additionMotion)} additionPhase={additionMotion?.phase || ""} selected={person.id === selectedId} branchMuted={viewMode === "branch" && !branchIds.has(person.id) && !contextIds.has(person.id)} collapsible={collapsibleIds.has(person.id)} collapsed={collapsedIds.has(person.id)} onToggleCollapse={onToggleCollapse} onSelect={onSelect} onKeyboardNavigate={navigateTreeNode} showPhotos={showPhotos} showFormerSurnames={showFormerSurnames} cardFields={cardFields} childNumber={childNumberById.get(person.id)} dragging={person.id === personDraggingId} onDragStart={onPersonPointerDown} onDragMove={onPersonPointerMove} onDragEnd={onPersonPointerEnd} /> : null)}</div></div>
      {people.length > 0 && <TreeMiniMap people={people} partnerships={partnerships} layout={displayLayout} positions={renderedPositions} hiddenIds={hiddenIds} pan={pan} zoom={zoom} viewportSize={viewportSize} onNavigate={navigateToBoardPoint} renderIndex={renderIndex} />}
      <div className="tree-status"><span><UsersThree size={17} /> Всего людей: {people.length}</span><span className="status-divider" /><span>Поколений: {displayLayout.generations.length}</span><span className="tree-view-status">{viewMode === "branch" ? `Родственная ветвь · ${branchDepth} ${branchDepth === "1" ? "поколение" : "поколений"}` : "Всё дерево"} · {showPhotos ? "Фото включены" : "Фото скрыты"} · {styleLabel}</span></div>
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

function MainMenuBackground() {
  return (
    <div className="main-menu-background" aria-hidden="true">
      <span className="main-menu-branch main-menu-branch-1" />
      <span className="main-menu-branch main-menu-branch-2" />
      <span className="main-menu-branch main-menu-branch-3" />
      <span className="main-menu-branch main-menu-branch-4" />
      <span className="main-menu-relation-line main-menu-relation-line-1" />
      <span className="main-menu-relation-line main-menu-relation-line-2" />
      <span className="main-menu-relation-line main-menu-relation-line-3" />
      <span className="main-menu-ghost-card main-menu-ghost-card-1" />
      <span className="main-menu-ghost-card main-menu-ghost-card-2" />
      <span className="main-menu-ghost-card main-menu-ghost-card-3" />
      <span className="main-menu-leaf main-menu-leaf-1" />
      <span className="main-menu-leaf main-menu-leaf-2" />
      <span className="main-menu-leaf main-menu-leaf-3" />
      <span className="main-menu-leaf main-menu-leaf-4" />
      <span className="main-menu-leaf main-menu-leaf-5" />
      <span className="main-menu-leaf main-menu-leaf-6" />
      <span className="main-menu-particle main-menu-particle-1" />
      <span className="main-menu-particle main-menu-particle-2" />
      <span className="main-menu-particle main-menu-particle-3" />
      <span className="main-menu-particle main-menu-particle-4" />
      <span className="main-menu-particle main-menu-particle-5" />
      <span className="main-menu-particle main-menu-particle-6" />
      <span className="main-menu-particle main-menu-particle-7" />
      <span className="main-menu-particle main-menu-particle-8" />
    </div>
  );
}

function MainMenuModal({ onCreate, onLoad, onSettings, onHelp, onExit, onClose, safeMode = false }) {
  const [closing, setClosing] = useState(false);
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 160);
  };
  return (
    <div className={`main-menu-backdrop ${closing ? "is-closing" : ""} is-animation-active`} role="presentation" onClick={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <MainMenuBackground />
      <section className="main-menu-card" role="dialog" aria-modal="true" aria-labelledby="main-menu-title" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="icon-button main-menu-close" onClick={requestClose} aria-label="Закрыть главное меню"><X size={21} /></button>
        <div className="main-menu-brand"><BrandMark className="menu-logo" /><div><h1 id="main-menu-title">Семейное древо</h1><p>Храните историю семьи на своём компьютере.</p></div></div>
        {safeMode && <p className="main-menu-runtime-status" role="status">Безопасный режим: используется программный рендеринг.</p>}
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
    ? "Новая версия уже загружена. После нажатия приложение тихо установит её и перезапустится."
    : downloading
      ? "Приложение скачивает обновление с GitHub. Дерево можно оставить открытым."
      : "Для приложения вышла новая версия. Она будет загружена в фоне, пока вы продолжаете работу.";
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
          {downloaded && <button type="button" className="button button-primary" onClick={onInstall}>Установить и перезапустить</button>}
        </div>
      </section>
    </div>
  );
}

const instructionSteps = [
  { image: "01-menu.svg", source: "source-01-menu.jpg", title: "Главное меню", text: "Откройте меню кнопкой «Меню» в верхней панели или нажмите на логотип «Семейное древо». Здесь собраны основные действия приложения.", tips: ["«Создать древо» начинает пустой проект без демонстрационных записей.", "«Загрузить древо» открывает сохранённый файл .familytree.", "«Настройки» и «Инструкция для пользователей» доступны в любой момент.", "«Выход из приложения» закрывает окно программы."] },
  { image: "02-project.svg", source: "source-02-project.jpg", title: "Создать, открыть и сохранить дерево", text: "Работа с проектом находится в верхней панели. Добавляйте записи, открывайте сохранённое дерево и сохраняйте изменения в файл на компьютере.", tips: ["«Добавить человека» открывает мастер записи и связи.", "«Открыть проект» загружает файл .familytree.", "«Сохранить проект» записывает текущие данные и фотографии.", "Поиск и мини-карта помогают быстро найти нужную ветку."] },
  { image: "03-person.svg", source: "source-03-person.jpg", title: "Добавить человека и сразу связать его", text: "Мастер ведёт по шагам: сначала выберите уже известного человека и тип связи, затем заполните только те сведения, которые действительно известны.", tips: ["Можно добавить родителя, ребёнка, супруга или партнёра.", "Поддерживаются биологическая связь, усыновление, опека и степ-родство.", "ФИО, дата, место, профессия, фото и биография необязательны.", "Для записи можно указать источник, события и приблизительную дату."] },
  { image: "04-tree.svg", source: "source-04-tree.jpg", title: "Смотреть дерево и перемещаться по полотну", text: "Рассматривайте дерево как большое полотно: тяните пустое место зажатой ЛКМ, меняйте масштаб и выбирайте удобный вид дерева.", tips: ["Стрелки слева перемещают полотно небольшими шагами.", "Переключатель сверху показывает всё дерево или ближайшую семью.", "Мини-карта помогает быстро перейти к другой области.", "Карточки можно перемещать только внутри своего поколения."] },
  { image: "05-search.svg", source: "source-05-search.jpg", title: "Найти человека и показать его на карте", text: "Введите часть имени или другого известного сведения в поиск. После выбора записи правая панель покажет карточку, семейный статус, роли и связи.", tips: ["Фильтры уточняют поиск по поколениям, датам, месту и типу связи.", "«Показать найденного человека на карте» центрирует дерево на выбранной записи.", "Нажатие на родственника в правой панели открывает его карточку.", "Правую панель можно закрыть крестиком и открыть снова с полотна."] },
  { image: "06-relationships.svg", source: "source-06-relationships.jpg", title: "Управлять связями и удалять ошибочные записи", text: "В разделе связей можно указать, кто кому приходится, откуда происходит связь и какие роли видят оба участника.", tips: ["Доступны родители, дети, супруги, партнёры, разводы и другие семейные связи.", "Для усыновления, опеки и степ-родства отдельно указывается происхождение связи.", "Программа проверяет связи на дубли и противоречия, а технические ключи сохраняет автоматически.", "Удаление человека требует подтверждения и создаёт защитную копию."] },
  { image: "07-backups.svg", source: "source-07-backups.jpg", title: "Копии, архив и восстановление", text: "Приложение сохраняет рабочие копии локально. В меню «•••» можно проверить копию, восстановить состояние или подготовить архив для переноса на другой компьютер.", tips: ["Автоматические копии защищают проект отдельно от обычного сохранения.", "Перед восстановлением приложение проверяет целостность данных.", "Архив .familyarchive включает людей, фотографии, связи, события и источники.", "Периодически переносите копию проекта на внешний диск или флешку."] },
  { image: "08-export-settings.svg", source: "source-08-export-settings.jpg", title: "Экспорт и настройки", text: "В окне экспорта настройте формат, качество, размеры карточек и разметку страниц. Параметры проекта и крупный текст находятся в настройках.", tips: ["PNG подходит для семейного альбома, TIFF — для типографии.", "PDF можно сделать одним большим плакатом или разделить по листам.", "Размер карточек, шрифт, расстояния и плотность связей влияют на читаемость.", "Предпросмотр помогает проверить результат до сохранения файла."] },
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

function ShortcutSettings({ shortcuts, onChange }) {
  const [capturingId, setCapturingId] = useState("");
  const validation = useMemo(() => validateShortcutMap(shortcuts), [shortcuts]);
  const commandLabels = useMemo(() => Object.fromEntries(SHORTCUT_COMMANDS.map((command) => [command.id, command.label])), []);
  const updateShortcut = (commandId, value) => onChange({ ...shortcuts, [commandId]: value });
  const captureShortcut = (event, command) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setCapturingId("");
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      updateShortcut(command.id, command.defaultShortcut);
      setCapturingId("");
      return;
    }
    const nextShortcut = shortcutFromKeyboardEvent(event);
    if (!nextShortcut) return;
    updateShortcut(command.id, nextShortcut);
    setCapturingId("");
  };
  return <section className="shortcut-settings" aria-labelledby="shortcut-settings-title">
    <div className="shortcut-settings-header"><div><span className="field-label" id="shortcut-settings-title">Горячие клавиши</span><small className="field-hint">Нажмите на сочетание, затем нажмите нужные клавиши. Изменения применятся после сохранения настроек.</small></div><button type="button" className="button button-ghost shortcut-reset-all" onClick={() => { onChange({ ...DEFAULT_SHORTCUTS }); setCapturingId(""); }}>Сбросить все</button></div>
    <div className="shortcut-list">{SHORTCUT_COMMANDS.map((command) => {
      const active = capturingId === command.id;
      const value = validation.shortcuts[command.id];
      return <div className={`shortcut-row ${active ? "is-capturing" : ""}`} key={command.id}>
        <div className="shortcut-copy"><strong>{command.label}</strong><small>{command.description}</small></div>
        <button type="button" className="shortcut-capture" data-shortcut-capture="true" aria-pressed={active} aria-label={`${active ? "Введите" : "Изменить"} сочетание для команды «${command.label}»`} onClick={() => setCapturingId(command.id)} onKeyDown={(event) => captureShortcut(event, command)}>{active ? "Нажмите сочетание…" : shortcutDisplayName(value)}</button>
        <button type="button" className="icon-button shortcut-reset" aria-label={`Сбросить сочетание «${command.label}»`} title={`Сбросить сочетание «${command.label}»`} onClick={() => updateShortcut(command.id, command.defaultShortcut)}><ArrowCounterClockwise size={16} /></button>
      </div>;
    })}</div>
    {validation.conflicts.length > 0 && <div className="shortcut-validation shortcut-validation-error" role="alert"><strong>Есть совпадающие сочетания.</strong>{validation.conflicts.map((conflict) => <span key={conflict.shortcut}>{shortcutDisplayName(conflict.shortcut)} назначено: {conflict.commandIds.map((id) => commandLabels[id]).join(", ")}.</span>)}</div>}
    {validation.unsupported.length > 0 && <div className="shortcut-validation shortcut-validation-error" role="alert"><strong>Сочетания Windows недоступны.</strong><span>{validation.unsupported.map((item) => `${commandLabels[item.commandId]}: ${shortcutDisplayName(item.shortcut)}`).join("; ")}</span></div>}
    {validation.warnings.length > 0 && <div className="shortcut-validation shortcut-validation-warning" role="status"><strong>Предупреждение о системном сочетании.</strong><span>{validation.warnings.map((item) => `${commandLabels[item.commandId]}: ${item.message}`).join(" ")}</span></div>}
    <small className="shortcut-help">По умолчанию: Ctrl+S, Ctrl+O, Ctrl+Shift+S, Ctrl+Z, Ctrl+Y, Ctrl+F, +/−, стрелки, Home и Ctrl+B. Escape отменяет ввод, Backspace или Delete возвращают сочетание команды по умолчанию.</small>
  </section>;
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

function ProjectSettingsModal({ projectMeta, autoSaveEnabled, treeStyle, showPhotos, showFormerSurnames, largeText, cardFields, shortcuts, onSave, onClose }) {
  const [title, setTitle] = useState(projectMeta.title || "Моё семейное древо");
  const [autoSave, setAutoSave] = useState(autoSaveEnabled);
  const [nextTreeStyle, setNextTreeStyle] = useState(treeStyle);
  const [nextShowPhotos, setNextShowPhotos] = useState(showPhotos);
  const [nextShowFormerSurnames, setNextShowFormerSurnames] = useState(showFormerSurnames);
  const [nextLargeText, setNextLargeText] = useState(largeText);
  const [nextCardFields, setNextCardFields] = useState(sanitizeCardFields(cardFields));
  const [nextShortcuts, setNextShortcuts] = useState(sanitizeShortcutMap(shortcuts));
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
    const shortcutValidation = validateShortcutMap(nextShortcuts);
    if (!shortcutValidation.valid) return;
    onSave({ title: trimmedTitle, autoSave, treeStyle: nextTreeStyle, showPhotos: nextShowPhotos, showFormerSurnames: nextShowFormerSurnames, largeText: nextLargeText, cardFields: nextCardFields, shortcuts: nextShortcuts });
  };
  return (
    <div className="backup-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="backup-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="project-settings-title" onClick={(event) => event.stopPropagation()}>
        <div className="backup-modal-header"><div><span className="eyebrow">Параметры проекта</span><h2 id="project-settings-title">Настройки</h2><p>Основные настройки сохраняются в локальной копии проекта.</p></div><button type="button" className="icon-button backup-close" onClick={onClose} aria-label="Закрыть настройки"><X size={21} /></button></div>
        <div className="view-settings-body settings-body">
          <label className={`field settings-title-field ${error ? "has-error" : ""}`}><span>Название проекта</span><input value={title} onChange={(event) => { setTitle(event.target.value); setError(""); }} placeholder="Например, Семья Петровых" aria-invalid={Boolean(error)} />{error && <small className="field-error">{error}</small>}</label>
          <label className="view-toggle"><input type="checkbox" checked={autoSave} onChange={(event) => setAutoSave(event.target.checked)} /><span><strong>Автоматически сохранять изменения</strong><small>Локальная копия и резервная копия создаются после изменений.</small></span></label>
          <label className="view-toggle"><input type="checkbox" checked={nextShowPhotos} onChange={(event) => setNextShowPhotos(event.target.checked)} /><span><strong>Показывать фотографии</strong><small>Фото будут видны на карточках людей и в дереве.</small></span></label>
          <label className="view-toggle"><input type="checkbox" checked={nextShowFormerSurnames} onChange={(event) => setNextShowFormerSurnames(event.target.checked)} /><span><strong>Показывать прежние фамилии</strong><small>Прежние фамилии будут указаны в скобках на карточках дерева.</small></span></label>
          <label className="view-toggle accessibility-toggle"><input type="checkbox" checked={nextLargeText} onChange={(event) => setNextLargeText(event.target.checked)} /><span><strong>Крупный текст</strong><small>Увеличивает основные подписи, кнопки, карточки и сведения для более комфортного чтения.</small></span></label>
          <CardFieldsPicker cardFields={nextCardFields} onChange={setNextCardFields} />
          <div className="view-setting-group"><span className="field-label">Стиль карточек</span><div className="style-choice-list">{styles.map((style) => <button type="button" key={style.value} className={`style-choice ${nextTreeStyle === style.value ? "selected" : ""}`} onClick={() => setNextTreeStyle(style.value)}><span className="style-choice-preview" data-style={style.value} /><span><strong>{style.title}</strong><small>{style.description}</small></span></button>)}</div></div>
          <ShortcutSettings shortcuts={nextShortcuts} onChange={(value) => { setNextShortcuts(value); setError(""); }} />
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
  const sessionSettings = normalizeAppSettings(sessionProject.settings);
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
  const [treeBranchDepth, setTreeBranchDepth] = useState(sessionSettings.branchDepth);
  const [collapsedBranches, setCollapsedBranches] = useState(() => new Set());
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
  const [showFormerSurnames, setShowFormerSurnames] = useState(sessionSettings.showFormerSurnames !== false);
  const [largeText, setLargeText] = useState(sessionSettings.largeText === true);
  const [cardFields, setCardFields] = useState(sessionSettings.cardFields);
  const [shortcuts, setShortcuts] = useState(sessionSettings.shortcuts);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(sessionSettings.autoSave !== false);
  const [editing, setEditing] = useState(false);
  const [editorSessionKey, setEditorSessionKey] = useState(0);
  const [relationshipEditing, setRelationshipEditing] = useState(false);
  const [relationshipInitialKind, setRelationshipInitialKind] = useState("parent");
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
  const [additionMotion, setAdditionMotion] = useState(null);
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
  const [runtimeStatus, setRuntimeStatus] = useState({ safeMode: false });
  const [updateOpen, setUpdateOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [qualityReport, setQualityReport] = useState({ valid: true, errors: [], warnings: [] });
  const [changeLogOpen, setChangeLogOpen] = useState(false);
  const historyRef = useRef(null);
  const [historyStatus, setHistoryStatus] = useState({ canUndo: false, canRedo: false });
  const fileInputRef = useRef(null);
  const saveInProgressRef = useRef(false);
  const additionFrameRef = useRef(0);
  const additionTimerRef = useRef(0);
  const additionClearTimerRef = useRef(0);
  const additionTokenRef = useRef(0);
  const searchInputRef = useRef(null);
  const inspectorResizeRef = useRef(null);
  const selectedPerson = people.find((person) => person.id === selectedId) || people[0];
  if (!historyRef.current) historyRef.current = createHistory(createSnapshot(people, partnerships, projectMeta));
  const treeLayout = useMemo(() => buildTreeLayout(people, partnerships, { cardWidth: largeText ? 220 : 190, cardHeight: (largeText ? 108 : 92) + Math.max(0, sanitizeCardFields(cardFields).length - 1) * (largeText ? 16 : 14) }), [people, partnerships, cardFields, largeText]);
  const deferredQuery = useDeferredValue(query);
  const hasActiveSearch = Boolean(query.trim() || Object.entries(searchFilters).some(([field, value]) => value && value !== DEFAULT_SEARCH_FILTERS[field]));
  const searchResults = useMemo(() => filterPeople(people, partnerships, treeLayout.positions, deferredQuery, searchFilters), [people, partnerships, deferredQuery, searchFilters, treeLayout.positions]);
  const nearbyFamilyIds = useMemo(() => getNearbyFamilyIds(people, partnerships, selectedId), [people, partnerships, selectedId]);
  const familyView = useMemo(() => getFamilyView(people, partnerships, selectedId, treeBranchDepth), [people, partnerships, selectedId, treeBranchDepth]);
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
  const recordChange = (summary, entityId = "", personIds = [], kind = "update", entityType = "person") => {
    setProjectMeta((current) => ({ ...current, changeLog: appendChangeLog(current.changeLog, { summary, entityType, entityId, personIds, kind }) }));
  };
  const cancelAdditionMotion = () => {
    if (additionFrameRef.current) window.cancelAnimationFrame(additionFrameRef.current);
    if (additionTimerRef.current) window.clearTimeout(additionTimerRef.current);
    if (additionClearTimerRef.current) window.clearTimeout(additionClearTimerRef.current);
    additionFrameRef.current = 0;
    additionTimerRef.current = 0;
    additionClearTimerRef.current = 0;
  };
  const startAdditionMotion = ({ newPersonId, targetPersonId = "", relationKind = "", message }) => {
    cancelAdditionMotion();
    const token = additionTokenRef.current + 1;
    additionTokenRef.current = token;
    const reduced = prefersReducedMotion();
    const durations = additionSequenceDurations(reduced);
    const base = { newPersonId, targetPersonId, relationKind, token };
    if (reduced) {
      setAdditionMotion(null);
      setToast(message);
      return;
    }
    setAdditionMotion({ ...base, phase: ADDITION_PHASES.prepare });
    setToast("Добавление записи в дерево…");
    additionFrameRef.current = window.requestAnimationFrame(() => {
      setAdditionMotion((current) => current?.token === token ? { ...current, phase: ADDITION_PHASES.reveal } : current);
      additionFrameRef.current = 0;
    });
    additionTimerRef.current = window.setTimeout(() => {
      setAdditionMotion((current) => current?.token === token ? { ...current, phase: ADDITION_PHASES.settle } : current);
      additionTimerRef.current = 0;
      additionClearTimerRef.current = window.setTimeout(() => {
        setAdditionMotion((current) => current?.token === token ? null : current);
        setToast(message);
        additionClearTimerRef.current = 0;
      }, durations.settle);
    }, durations.leadIn + durations.reveal);
  };
  useEffect(() => () => cancelAdditionMotion(), []);
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
    if (mode === "branch" && !selectedId) {
      setToast("Сначала выберите человека");
      return;
    }
    setTreeViewMode(mode);
    if (mode === "branch" && selectedId) setFocusRequest((current) => ({ id: selectedId, token: (current?.token || 0) + 1 }));
    setToast(mode === "branch" ? "Показана родственная ветвь" : "Показано всё дерево");
  };
  const changeTreeBranchDepth = (depth) => {
    const normalizedDepth = normalizeTreeBranchDepth(depth);
    setTreeBranchDepth(normalizedDepth);
    setProjectMeta((current) => ({ ...current, settings: normalizeAppSettings({ ...current.settings, branchDepth: normalizedDepth }) }));
    setDirty(true);
    if (treeViewMode === "branch" && selectedId) setFocusRequest((current) => ({ id: selectedId, token: (current?.token || 0) + 1 }));
  };
  const toggleCollapsedBranch = (personId) => setCollapsedBranches((current) => {
    const next = new Set(current);
    if (next.has(personId)) next.delete(personId);
    else next.add(personId);
    return next;
  });
  const resetCollapsedBranches = () => setCollapsedBranches(new Set());
  const applyHistorySnapshot = (snapshot) => {
    setPeople(snapshot.people);
    setPartnerships(snapshot.partnerships);
    const settings = normalizeAppSettings(snapshot.projectMeta.settings);
    setProjectMeta({ ...snapshot.projectMeta, settings });
    setTreeStyle(settings.treeStyle || "classic");
    setTreeBranchDepth(settings.branchDepth);
    setShowPhotos(settings.showPhotos !== false);
    setShowFormerSurnames(settings.showFormerSurnames !== false);
    setLargeText(settings.largeText === true);
    setCardFields(sanitizeCardFields(settings.cardFields));
    setShortcuts(settings.shortcuts);
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
  const saveProjectSettings = ({ title, autoSave, treeStyle: nextTreeStyle, showPhotos: nextShowPhotos, showFormerSurnames: nextShowFormerSurnames, largeText: nextLargeText, cardFields: nextCardFields, shortcuts: nextShortcuts }) => {
    const nextTitle = String(title || "").trim() || "Моё семейное древо";
    const normalizedCardFields = sanitizeCardFields(nextCardFields);
    const normalizedShortcuts = sanitizeShortcutMap(nextShortcuts);
    const nextMeta = { ...projectMeta, title: nextTitle, settings: normalizeAppSettings({ ...projectMeta.settings, autoSave, treeStyle: nextTreeStyle, showPhotos: nextShowPhotos, showFormerSurnames: nextShowFormerSurnames, largeText: nextLargeText, cardFields: normalizedCardFields, shortcuts: normalizedShortcuts }) };
    const payload = createProjectPayload(people, nextMeta, partnerships);
    try {
      writeWorkingCopy(payload);
      setProjectMeta(nextMeta);
      setAutoSaveEnabled(autoSave);
      setTreeStyle(nextTreeStyle);
      setShowPhotos(nextShowPhotos);
      setShowFormerSurnames(nextShowFormerSurnames);
      setLargeText(nextLargeText);
      setCardFields(normalizedCardFields);
      setShortcuts(normalizedShortcuts);
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
    let active = true;
    const getRuntimeStatus = window.familyTreeDesktop?.getRuntimeStatus;
    if (!getRuntimeStatus) return undefined;
    getRuntimeStatus().then((status) => {
      if (active && status?.safeMode) setRuntimeStatus({ safeMode: true });
    }).catch(() => {});
    return () => { active = false; };
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
  const modalOpen = Boolean(updateOpen || qualityOpen || changeLogOpen || pendingUnsavedAction || deleteConfirmId || relationshipDeleteConfirm || newTreeConfirmOpen || exportModalOpen || instructionOpen || settingsOpen || backupOpen || archiveOpen || viewSettingsOpen || relationshipCalculatorOpen || mainMenuOpen);
  const modalReturnFocusRef = useRef(null);
  useEffect(() => {
    if (!modalOpen || typeof document === "undefined") return undefined;
    const getTopDialog = () => [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].filter((dialog) => dialog.getClientRects().length > 0).at(-1);
    const getFocusable = (dialog) => [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')].filter((element) => element.getClientRects().length > 0);
    const focusFirst = (dialog) => {
      const first = getFocusable(dialog)[0];
      if (first) first.focus();
      else { dialog.setAttribute("tabindex", "-1"); dialog.focus(); }
    };
    const frame = window.requestAnimationFrame(() => {
      const dialog = getTopDialog();
      if (!dialog) return;
      modalReturnFocusRef.current = document.activeElement instanceof HTMLElement && !dialog.contains(document.activeElement) ? document.activeElement : null;
      focusFirst(dialog);
    });
    const handleFocusIn = (event) => {
      const dialog = getTopDialog();
      if (dialog && !dialog.contains(event.target)) focusFirst(dialog);
    };
    const handleTab = (event) => {
      if (event.key !== "Tab") return;
      const dialog = getTopDialog();
      if (!dialog) return;
      const focusable = getFocusable(dialog);
      if (!focusable.length) {
        event.preventDefault();
        focusFirst(dialog);
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("keydown", handleTab, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("keydown", handleTab, true);
      if (modalReturnFocusRef.current?.isConnected) modalReturnFocusRef.current.focus();
      modalReturnFocusRef.current = null;
    };
  }, [modalOpen]);
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.target?.closest?.("[data-shortcut-capture]")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (updateOpen) setUpdateOpen(false);
        else if (qualityOpen) setQualityOpen(false);
        else if (changeLogOpen) setChangeLogOpen(false);
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
      const tagName = event.target?.tagName?.toLowerCase();
      if (["button", "a", "input", "textarea", "select", "option"].includes(tagName) || event.target?.isContentEditable) return;
      // Совместимость с проверкой старого обработчика: раньше Ctrl+S распознавался как key === "s".
      const commandId = shortcutCommandId(shortcuts, event);
      if (!commandId) return;
      event.preventDefault();
      if (commandId === "save") void saveProject();
      else if (commandId === "open") void openProject();
      else if (commandId === "saveCopy") saveCopy();
      else if (commandId === "undo") undoAction();
      else if (commandId === "redo") redoAction();
      else if (commandId === "search") searchInputRef.current?.focus();
      else if (commandId === "zoomIn") setZoom((current) => Math.min(MAX_TREE_ZOOM, current + 0.08));
      else if (commandId === "zoomOut") setZoom((current) => Math.max(MIN_TREE_ZOOM, current - 0.08));
      else if (commandId === "panUp") setKeyboardPanRequest((current) => ({ dx: 0, dy: -110, token: (current?.token || 0) + 1 }));
      else if (commandId === "panDown") setKeyboardPanRequest((current) => ({ dx: 0, dy: 110, token: (current?.token || 0) + 1 }));
      else if (commandId === "panLeft") setKeyboardPanRequest((current) => ({ dx: -110, dy: 0, token: (current?.token || 0) + 1 }));
      else if (commandId === "panRight") setKeyboardPanRequest((current) => ({ dx: 110, dy: 0, token: (current?.token || 0) + 1 }));
      else if (commandId === "center") {
        if (selectedId) focusPersonOnMap(selectedId);
        else setToast("Сначала выберите человека");
      } else if (commandId === "showAll") changeTreeViewMode("full");
      else if (commandId === "toggleBranch") changeTreeViewMode(treeViewMode === "branch" ? "full" : "branch");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts, selectedId, treeViewMode, historyStatus, updateOpen, qualityOpen, changeLogOpen, pendingUnsavedAction, deleteConfirmId, relationshipDeleteConfirm, newTreeConfirmOpen, exportModalOpen, instructionOpen, settingsOpen, backupOpen, archiveOpen, viewSettingsOpen, filtersOpen, moreOpen, mainMenuOpen, inspectorOpen, returnToMenuAfterModal]);

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
  const selectPerson = (id) => { if (!setSelectedPerson(id)) return; setQuery(""); setFiltersOpen(false); setEditing(false); setRelationshipEditing(false); setRelationshipInitialKind("parent"); setInspectorOpen(true); };
  const focusPersonOnMap = (id) => { const person = people.find((item) => item.id === id); if (!person || !setSelectedPerson(id)) return; setQuery(""); setInspectorOpen(true); setFocusRequest((current) => ({ id, token: (current?.token || 0) + 1 })); setToast(`Человек показан на карте: ${personDisplayName(person)}`); };
  const moveSiblingOrder = (personId, direction) => {
    const nextPeople = reorderSiblingComponent(people, personId, direction);
    if (nextPeople === people) return;
    setPeople(nextPeople);
    setDirty(true);
    const movedPerson = nextPeople.find((person) => person.id === personId);
    const position = getSiblingComponent(nextPeople, personId).findIndex((person) => person.id === personId) + 1;
    recordChange(`Изменён порядок детей: ${personDisplayName(movedPerson)} — место ${position}`, personId, [personId], "sibling-order");
    setToast(`Порядок изменён: ${personDisplayName(movedPerson)} — место ${position}`);
  };
  const openEditor = (person = null, relation = "") => {
    const contexts = new Set(Array.isArray(person?.familyContext) ? person.familyContext : []);
    const targetId = person ? "" : selectedPerson?.id || people[0]?.id || "";
    const baseDraft = person ? normalizePersonDate({ ...person }) : { ...blankPerson, id: "" };
    const initialSuggestion = !person && relation === "child" ? surnameSuggestionsForChild({ people, parentId: targetId })[0] : null;
    setEditorSessionKey((current) => current + 1);
    setDraft(initialSuggestion ? applySuggestedChildSurname(baseDraft, initialSuggestion) : baseDraft);
    setRelationshipMode(relation);
    setRelationshipType("biological");
    setPartnershipType("marriage");
    setConnectionTargetId(targetId);
    setRelationshipSource("");
    setUnknownParent(false);
    setSingleKnownParent(contexts.has("single-known-parent"));
    setOutOfMarriage(contexts.has("out-of-marriage"));
    setSiblingWithoutParents(contexts.has("sibling-without-parents"));
    setRelationshipEditing(false);
    setInspectorOpen(true);
    setEditing(true);
  };
  const closeInspector = () => { setEditing(false); setRelationshipEditing(false); setRelationshipInitialKind("parent"); setDraft(null); setRelationshipMode(""); setRelationshipType("biological"); setPartnershipType("marriage"); setConnectionTargetId(""); setRelationshipSource(""); setInspectorOpen(false); };
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
    const nextGraph = applyRelationOperation(people, partnerships, { type: "remove-person", personId: deleteConfirmId });
    const nextPeople = nextGraph.people;
    const nextPartnerships = nextGraph.partnerships;
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
    recordChange(`Удалён человек: ${personDisplayName(personToDelete)}`, deleteConfirmId, [deleteConfirmId], "delete");
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
    const nextGraph = applyRelationOperation(people, partnerships, { type: "remove", relationId: relation.id });
    const nextPeople = nextGraph.people;
    const nextPartnerships = nextGraph.partnerships;
    setPeople(nextPeople);
    setPartnerships(nextPartnerships);
    setRelationshipDeleteConfirm(null);
    setRelationshipEditing(false);
    setBackups(readBackups());
    setLastBackupAt(backup?.createdAt || null);
    setDirty(true);
    recordChange(`Удалена связь: ${relation.label}`, relation.id, [relation.parentId, relation.childId, ...(relation.personIds || [])].filter(Boolean), "delete", "relation");
    const message = `Связь удалена: ${relation.label}`;
    setToast(message);
    setToastAction({ message, label: "Отменить связь", onClick: undoAction });
  };
  const saveBasicSection = (personId, draftValue) => {
    const existing = people.find((person) => person.id === personId);
    if (!existing) return;
    const normalizedBirthDate = normalizeDateRecord(getDraftDateRecord(draftValue));
    const normalizedDeathFields = deathFieldsFromDraft(draftValue);
    const isUnknown = Boolean(draftValue.isUnknown);
    const normalizedNameRecord = normalizePersonNames({ ...existing, ...draftValue, isUnknown });
    const normalizedName = isUnknown ? "" : normalizedNameRecord.name || "Человек без имени";
    const nextPerson = { ...withoutDeathDateFields(normalizedNameRecord), isUnknown, name: normalizedName, shortName: normalizedName, recordOrigin: normalizeRecordOrigin(draftValue.recordOrigin), surnameHistory: Array.isArray(draftValue.surnameHistory) ? normalizeSurnameHistory(draftValue.surnameHistory) : normalizeSurnameHistory(undefined, draftValue.maidenName), source: String(draftValue.source || "").trim(), confidence: PERSON_CONFIDENCE_LEVELS.includes(draftValue.confidence) ? draftValue.confidence : "unknown", birthDate: normalizedBirthDate, datePrecision: normalizedBirthDate.precision, year: formatDateRecord(normalizedBirthDate), birthDateFrom: normalizedBirthDate.from, birthDateTo: normalizedBirthDate.to, ...normalizedDeathFields };
    setPeople((current) => current.map((person) => person.id === personId ? nextPerson : person));
    recordChange(`Изменены основные сведения: ${personDisplayName(nextPerson)}`, personId, [personId], "person-update");
    setSelectedPerson(personId);
    setDirty(true);
    setToast("Раздел «Основная информация» сохранён");
  };
  const saveTimelineSection = (personId, events) => {
    const existing = people.find((person) => person.id === personId);
    if (!existing) return;
    const nextEvents = normalizeTimelineEvents(events);
    setPeople((current) => current.map((person) => person.id === personId ? { ...person, timelineEvents: nextEvents } : person));
    recordChange(`Изменена временная шкала: ${personDisplayName(existing)}`, personId, [personId], "timeline-update");
    setDirty(true);
    setToast("Раздел «Временная шкала» сохранён");
  };
  const saveFactSourcesSection = (personId, sources) => {
    const existing = people.find((person) => person.id === personId);
    if (!existing) return;
    const nextSources = normalizeFactSources(sources);
    setPeople((current) => current.map((person) => person.id === personId ? { ...person, factSources: nextSources } : person));
    recordChange(`Изменены источники сведений: ${personDisplayName(existing)}`, personId, [personId], "source-update");
    setDirty(true);
    setToast("Раздел «Источники» сохранён");
  };
  const savePerson = () => {
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
    const normalizedNameRecord = normalizePersonNames({ ...draft, isUnknown: isUnknownRecord });
    const normalizedName = isUnknownRecord ? "" : normalizedNameRecord.name || "Человек без имени";
    const normalizedBirthDate = normalizeDateRecord(getDraftDateRecord(draft));
    const personToSave = { ...withoutDeathDateFields({ ...normalizedNameRecord, ...draft }), isUnknown: isUnknownRecord, name: normalizedName, shortName: normalizedName, nameParts: normalizeNameParts(draft.nameParts), nameOrigin: normalizedNameRecord.nameOrigin, recordOrigin: normalizeRecordOrigin(draft.recordOrigin), surnameHistory: Array.isArray(draft.surnameHistory) ? normalizeSurnameHistory(draft.surnameHistory) : normalizeSurnameHistory(undefined, draft.maidenName), source: String(draft.source || "").trim(), confidence: PERSON_CONFIDENCE_LEVELS.includes(draft.confidence) ? draft.confidence : "unknown", customFields: normalizeCustomFields(draft.customFields), factSources: normalizeFactSources(draft.factSources), timelineEvents: normalizeTimelineEvents(draft.timelineEvents), familyContext: newFamilyContext, birthDate: normalizedBirthDate, datePrecision: normalizedBirthDate.precision, year: formatDateRecord(normalizedBirthDate), birthDateFrom: normalizedBirthDate.from, birthDateTo: normalizedBirthDate.to, ...deathFieldsFromDraft(draft) };
    if (personToSave.id) {
      setPeople((current) => current.map((person) => person.id === personToSave.id ? personToSave : person));
      setSelectedPerson(personToSave.id);
      recordChange(`Изменён человек: ${personDisplayName(personToSave)}`, personToSave.id, [personToSave.id], "person-update");
      setToast("Изменения сохранены");
    } else {
      const newId = makeId();
      const newPerson = { ...personToSave, id: newId };
      const relationTarget = people.find((person) => person.id === connectionTargetId);
      const selectedRelationType = relationshipType || "biological";
      const relation = relationTarget && relationshipMode === "child"
        ? { id: makeParentLinkId(newId, relationTarget.id, selectedRelationType), kind: "parent", parentId: relationTarget.id, childId: newId, type: selectedRelationType, source: normalizeSourceValue(relationshipSource) }
        : relationTarget && relationshipMode === "parent"
          ? { id: makeParentLinkId(relationTarget.id, newId, selectedRelationType), kind: "parent", parentId: newId, childId: relationTarget.id, type: selectedRelationType, source: normalizeSourceValue(relationshipSource) }
          : relationTarget && relationshipMode === "sibling"
            ? { id: makeSiblingLinkId(newId, relationTarget.id, selectedRelationType), kind: "sibling", personIds: [newId, relationTarget.id], type: selectedRelationType, source: normalizeSourceValue(relationshipSource) }
            : relationTarget && relationshipMode === "partner"
              ? { id: `partnership-${relationTarget.id}-${newId}`, kind: "partnership", personIds: [relationTarget.id, newId], type: partnershipType, status: "active", startDate: "", startDatePrecision: "unknown", endDate: "", endDatePrecision: "unknown", source: normalizeSourceValue(relationshipSource) }
              : null;
      let nextGraph;
      try {
        nextGraph = relation ? applyRelationOperation([...people, newPerson], partnerships, { type: "upsert", relation }) : normalizeRelationState([...people, newPerson], partnerships);
      } catch (error) {
        cancelAdditionMotion();
        setAdditionMotion(null);
        setToast(explainUserError(error, { action: "Не удалось добавить человека", next: "проверьте выбранную связь и повторите" }));
        return;
      }
      setPeople(nextGraph.people);
      setPartnerships(nextGraph.partnerships);
      const nextNavigation = visitPerson(personNavigationRef.current, newId);
      personNavigationRef.current = nextNavigation;
      setPersonNavigation(nextNavigation);
      setSelectedId(newId);
      recordChange(`Добавлен человек: ${personDisplayName(newPerson)}`, newId, [newId, relationTarget?.id].filter(Boolean), "create");
      startAdditionMotion({ newPersonId: newId, targetPersonId: relationTarget?.id || "", relationKind: relation?.kind || "", message: "Человек добавлен в дерево" });
    }
    setDirty(true);
    setEditing(false); setDraft(null); setRelationshipMode(""); setRelationshipType("biological"); setPartnershipType("marriage"); setConnectionTargetId(""); setRelationshipSource(""); setUnknownParent(false); setSingleKnownParent(false); setOutOfMarriage(false); setSiblingWithoutParents(false);
  };
  const saveRelationship = ({ kind, targetId, parentType, source, startDate, startDatePrecision, endDate, endDatePrecision }) => {
    if (!selectedPerson || !targetId) return;
    const sourceValue = normalizeSourceValue(source);
    let operation;
    let message;
    if (kind === "parent" || kind === "child") {
      const parentId = kind === "parent" ? targetId : selectedPerson.id;
      const childId = kind === "parent" ? selectedPerson.id : targetId;
      operation = { type: "upsert", relation: { id: makeParentLinkId(childId, parentId, parentType), kind: "parent", parentId, childId, type: parentType, source: sourceValue } };
      message = parentType === "adoptive" ? "Усыновление добавлено" : parentType === "step" ? "Степ-родство добавлено" : parentType === "guardian" ? "Опекунство добавлено" : parentType === "unknown" ? "Связь добавлена без уточнения типа" : "Родственная связь добавлена";
    } else if (kind === "sibling") {
      operation = { type: "upsert", relation: { id: makeSiblingLinkId(selectedPerson.id, targetId, parentType), kind: "sibling", personIds: [selectedPerson.id, targetId], type: parentType, source: sourceValue } };
      message = parentType === "half" ? "Неполнородная связь добавлена" : parentType === "step" ? "Сводная связь добавлена" : parentType === "unknown" ? "Связь братьев и сестёр добавлена без уточнения типа" : "Связь братьев и сестёр добавлена";
    } else if (kind === "marriage" || kind === "engagement" || kind === "partnership") {
      operation = { type: "upsert", relation: { id: `partnership-${makeId()}`, kind: "partnership", personIds: [selectedPerson.id, targetId], type: kind, status: "active", startDate: startDate || "", startDatePrecision: startDatePrecision || "unknown", endDate: "", endDatePrecision: "unknown", source: sourceValue } };
      message = kind === "marriage" ? "Брак добавлен" : kind === "engagement" ? "Помолвка добавлена" : "Партнёрство добавлено";
    } else if (kind === "divorce") {
      const existing = partnerships.find((partnership) => partnership.status === "active" && partnership.personIds.includes(selectedPerson.id) && partnership.personIds.includes(targetId));
      if (!existing) return;
      operation = { type: "update", relationId: existing.id, relation: { ...existing, status: "divorced", endDate: endDate || "", endDatePrecision: endDatePrecision || "unknown", source: sourceValue || existing.source || "" } };
      message = "Развод отмечен в истории семьи";
    } else return;
    try {
      const nextGraph = applyRelationOperation(people, partnerships, operation);
      setPeople(nextGraph.people);
      setPartnerships(nextGraph.partnerships);
    } catch (error) {
      setToast(explainUserError(error, { action: "Не удалось изменить связь", next: "проверьте участников и повторите" }));
      return;
    }
    recordChange(message, operation.relationId || operation.relation?.id || "", [selectedPerson.id, targetId], "relation-update", "relation");
    setToast(message);
    setToastAction({ message, label: "Отменить связь", onClick: undoAction });
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
    let result = await saveWithDesktop(payload, suggestedName, projectMeta.filePath || "");
    if (result?.needsSaveAs && projectMeta.filePath) {
      setToast("Прежнее место сохранения недоступно. Выберите новое место для файла.");
      result = await saveWithDesktop(payload, suggestedName, "");
    }
    if (result?.canceled) return { canceled: true };
    const filePath = result?.filePath || projectMeta.filePath || "";
    const nextProjectMeta = { ...projectMeta, fileName: fileNameFromPath(filePath) || suggestedName, filePath };
    return { canceled: false, payload: createProjectPayload(people, nextProjectMeta, partnerships), projectMeta: nextProjectMeta };
  };
  const saveProject = async () => {
    if (saveInProgressRef.current) return;
    saveInProgressRef.current = true;
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
    } finally {
      saveInProgressRef.current = false;
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
      const restoredSettings = normalizeAppSettings(restoredPayload.project.settings);
      const nextProjectMeta = { ...restoredPayload.project, settings: restoredSettings, filePath: projectMeta.filePath || "" };
      setPeople(restoredPayload.people);
      setPartnerships(restoredPayload.partnerships || []);
      setProjectMeta(nextProjectMeta);
      setCollapsedBranches(new Set());
      setTreeStyle(restoredSettings.treeStyle || "classic");
      setTreeBranchDepth(restoredSettings.branchDepth);
      setShowPhotos(restoredSettings.showPhotos !== false);
      setShowFormerSurnames(restoredSettings.showFormerSurnames !== false);
      setLargeText(restoredSettings.largeText === true);
      setCardFields(sanitizeCardFields(restoredSettings.cardFields));
      setShortcuts(restoredSettings.shortcuts);
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
  const loadProjectContents = ({ fileName, filePath = "", text }) => {
    if (dirty) {
      const backup = addBackup(buildPayload(), "before-open");
      setBackups(readBackups());
      setLastBackupAt(backup?.createdAt || null);
    }
    const payload = normalizeProject(JSON.parse(text));
    const loadedPayload = { ...payload, project: { ...payload.project, fileName: fileName || fileNameFromPath(filePath) || "семейное-древо.familytree" } };
    writeWorkingCopy(loadedPayload);
    const loadedSettings = normalizeAppSettings(loadedPayload.project.settings);
    const nextProjectMeta = { ...loadedPayload.project, settings: loadedSettings, filePath: String(filePath || "") };
    resetHistory(loadedPayload.people, loadedPayload.partnerships || [], nextProjectMeta);
    setPeople(payload.people);
    setPartnerships(loadedPayload.partnerships || []);
    setProjectMeta(nextProjectMeta);
    setCollapsedBranches(new Set());
    setTreeStyle(loadedSettings.treeStyle || "classic");
    setTreeBranchDepth(loadedSettings.branchDepth);
    setShowPhotos(loadedSettings.showPhotos !== false);
    setShowFormerSurnames(loadedSettings.showFormerSurnames !== false);
    setLargeText(loadedSettings.largeText === true);
    setCardFields(sanitizeCardFields(loadedSettings.cardFields));
    setShortcuts(loadedSettings.shortcuts);
    setAutoSaveEnabled(loadedSettings.autoSave !== false);
    const loadedSelectedId = loadedPayload.people.find((person) => person.id === "ivan")?.id || loadedPayload.people[0]?.id || "";
    setSelectedId(loadedSelectedId);
    resetPersonNavigation(loadedSelectedId);
    setEditing(false);
    setDraft(null);
    setLastSavedAt(loadedPayload.manifest.updatedAt);
    setDirty(false);
    setMainMenuOpen(false);
    setToast(loadedPayload.validationWarnings?.length ? `Проект открыт; найдено замечаний: ${loadedPayload.validationWarnings.length}` : `Открыт проект: ${loadedPayload.project.fileName}`);
  };
  const openProject = async (skipPrompt = false) => {
    if (!skipPrompt && dirty) {
      setMainMenuOpen(false);
      setPendingUnsavedAction({ type: "open" });
      return;
    }
    const openWithDesktop = window.familyTreeDesktop?.openProjectFile;
    if (openWithDesktop) {
      try {
        const result = await openWithDesktop();
        if (!result?.canceled) loadProjectContents(result);
      } catch (error) {
        setToast(explainUserError(error, { action: "Не удалось открыть файл проекта", next: "выберите корректный файл .familytree или резервную копию" }));
      }
      return;
    }
    fileInputRef.current?.click();
  };
  const handleFileSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      loadProjectContents({ fileName: file.name, filePath: typeof file.path === "string" ? file.path : "", text: await file.text() });
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
      const restoredSettings = normalizeAppSettings(payload.project.settings);
      setPeople(payload.people);
      setPartnerships(payload.partnerships || []);
      setProjectMeta({ ...payload.project, settings: restoredSettings, filePath: projectMeta.filePath || "" });
      setCollapsedBranches(new Set());
      setTreeStyle(restoredSettings.treeStyle || "classic");
      setTreeBranchDepth(restoredSettings.branchDepth);
      setShowPhotos(restoredSettings.showPhotos !== false);
      setShowFormerSurnames(restoredSettings.showFormerSurnames !== false);
      setLargeText(restoredSettings.largeText === true);
      setCardFields(sanitizeCardFields(restoredSettings.cardFields));
      setShortcuts(restoredSettings.shortcuts);
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
    const newProjectSettings = normalizeAppSettings({ autoSave: autoSaveEnabled, treeStyle, showPhotos, showFormerSurnames, largeText, branchDepth: treeBranchDepth, cardFields: [...cardFields], shortcuts });
    setProjectMeta({ id: "local-family-tree", title: "Моё семейное древо", fileName: "семейное-древо.familytree", filePath: "", settings: newProjectSettings });
    setCollapsedBranches(new Set());
    setSelectedId("");
    resetPersonNavigation("");
    setTreeViewMode("full");
    setTreeBranchDepth(newProjectSettings.branchDepth);
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
       <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{selectedPerson ? `Выбран человек: ${personDisplayName(selectedPerson)}${selectedPerson.year ? `, ${selectedPerson.year}` : ""}.` : "Человек не выбран."}</div>
       <header className="app-header" onClick={(event) => event.stopPropagation()}>
         <button type="button" className="brand brand-button" onClick={() => setMainMenuOpen(true)} aria-label="Открыть главное меню"><BrandMark className="brand-logo" /><span>Семейное древо</span></button>
         <div className="header-divider" />
         <button type="button" className="button button-primary add-person-button" onClick={() => openEditor()}><Plus size={20} weight="bold" /> Добавить человека</button>
          <button type="button" className="button button-secondary file-button" onClick={openProject}><FolderOpen size={18} /> Открыть проект</button>
          <button type="button" className="button button-primary save-project-button" onClick={saveProject}><FloppyDisk size={18} weight="bold" /> Сохранить проект</button>
          <div className="history-actions" aria-label="История действий"><button type="button" className="icon-button history-button" onClick={undoAction} disabled={!historyStatus.canUndo} title={`Отменить действие (${shortcutDisplayName(shortcuts.undo)})`} aria-label="Отменить действие"><ArrowCounterClockwise size={20} /></button><button type="button" className="icon-button history-button" onClick={redoAction} disabled={!historyStatus.canRedo} title={`Повторить действие (${shortcutDisplayName(shortcuts.redo)})`} aria-label="Повторить действие"><ArrowClockwise size={20} /></button></div>
          <div className="search-wrap"><MagnifyingGlass size={19} /><input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по семейным сведениям..." aria-label="Поиск по семейным сведениям" />{query && <button className="clear-search" type="button" onClick={() => setQuery("")} aria-label="Очистить поиск"><X size={16} /></button>}<button className={`filter-button ${filtersOpen || hasActiveSearch && Object.entries(searchFilters).some(([field, value]) => value && value !== DEFAULT_SEARCH_FILTERS[field]) ? "filter-button-active" : ""}`} type="button" onClick={(event) => { event.stopPropagation(); setFiltersOpen((open) => !open); }} aria-label="Открыть фильтры поиска" title="Фильтры поиска"><Funnel size={17} /></button>{filtersOpen && <SearchFilterPanel filters={searchFilters} generations={treeLayout.generations} onChange={(field, value) => setSearchFilters((current) => ({ ...current, [field]: value }))} onReset={() => setSearchFilters({ ...DEFAULT_SEARCH_FILTERS })} />}{hasActiveSearch && !filtersOpen && <SearchResults results={searchResults} onSelect={selectPerson} />}</div>
         <div className="header-actions">
           <button type="button" className="header-action menu-action" onClick={() => setMainMenuOpen(true)}><List size={19} /> Меню</button>
           <button type="button" className="header-action" onClick={() => openExport("pdf")}><Export size={20} /> Экспорт</button>
           <button type="button" className="header-action" onClick={() => openExport("print")}><Printer size={20} /> Печать</button>
           <div className="menu-wrap"><button type="button" className="icon-button more-button" onClick={(event) => { event.stopPropagation(); setMoreOpen((open) => !open); }}><DotsThree size={22} weight="bold" /></button>{moreOpen && <div className="dropdown-menu more-menu" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => { setMoreOpen(false); saveCopy(); }}><Copy size={16} /> Сохранить копию</button><button type="button" onClick={() => { setMoreOpen(false); setArchiveImport(null); setArchiveOpen(true); }}><Copy size={16} /> Архив материалов</button><button type="button" onClick={() => { setMoreOpen(false); setBackupOpen(true); }}><ClockCounterClockwise size={16} /> Резервные копии</button><button type="button" onClick={() => { setMoreOpen(false); setChangeLogOpen(true); }}><ClockCounterClockwise size={16} /> История изменений</button><button type="button" onClick={() => openRelationshipCalculator()} disabled={people.length < 2}><UsersThree size={16} /> Узнать родство</button><button type="button" onClick={openQualityCheck}><Info size={16} /> Проверить данные</button><button type="button" onClick={() => { setMoreOpen(false); setViewSettingsOpen(true); }}><TreeStructure size={16} /> Настроить вид дерева</button><button type="button" onClick={() => openSettings(false)}><Note size={16} /> Настройки проекта</button><button type="button" onClick={() => openInstruction(false)}><Info size={16} /> Как это работает</button><button type="button" onClick={() => { setMoreOpen(false); checkForUpdates(); }}><DownloadSimple size={16} /> Проверить обновления</button></div>}</div>
         </div>
       </header>
       <main className={`workspace ${inspectorOpen ? "" : "workspace-inspector-closed"}`} style={{ "--inspector-width": `${inspectorWidth}px` }}>
         <TreeCanvas people={people} partnerships={partnerships} layout={treeLayout} selectedId={selectedId} onSelect={selectPerson} zoom={zoom} onZoomChange={setZoom} pan={pan} onPanChange={setPan} treeStyle={treeStyle} showPhotos={showPhotos} showFormerSurnames={showFormerSurnames} cardFields={cardFields} focusRequest={focusRequest} keyboardPanRequest={keyboardPanRequest} inspectorOpen={inspectorOpen} onToggleInspector={() => setInspectorOpen(true)} onFocusSelected={() => selectedId ? focusPersonOnMap(selectedId) : setToast("Сначала выберите человека")} viewMode={treeViewMode} branchDepth={treeBranchDepth} branchIds={familyView.bloodIds} contextIds={familyView.contextIds} nearbyIds={nearbyFamilyIds} collapsedIds={collapsedBranches} onToggleCollapse={toggleCollapsedBranch} onResetCollapsedBranches={resetCollapsedBranches} onViewModeChange={changeTreeViewMode} onBranchDepthChange={changeTreeBranchDepth} additionMotion={additionMotion} />
         <aside className={`inspector ${inspectorOpen ? "inspector-open" : "inspector-closed"}`} aria-hidden={!inspectorOpen}>
           <div className="inspector-resize-handle" role="separator" aria-orientation="vertical" aria-label="Изменить ширину правой панели" aria-valuemin="300" aria-valuemax="560" aria-valuenow={Math.round(inspectorWidth)} tabIndex="0" onPointerDown={startInspectorResize} onPointerMove={moveInspectorResize} onPointerUp={endInspectorResize} onPointerCancel={endInspectorResize} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); resizeInspectorBy(16); } else if (event.key === "ArrowRight") { event.preventDefault(); resizeInspectorBy(-16); } else if (event.key === "Home") { event.preventDefault(); setInspectorWidth(560); } else if (event.key === "End") { event.preventDefault(); setInspectorWidth(300); } }} />
           <div className="inspector-header"><span>{editing ? "Редактирование" : relationshipEditing ? "Семейные связи" : "Выбран человек"}</span><IconButton label="Закрыть панель" onClick={closeInspector}><X size={21} /></IconButton></div>
           {editing ? <PersonEditor key={editorSessionKey} draft={draft} isNew={!draft?.id} relationshipMode={relationshipMode} relationshipType={relationshipType} partnershipType={partnershipType} connectionTargetId={connectionTargetId} relationshipSource={relationshipSource} unknownParent={unknownParent} singleKnownParent={singleKnownParent} outOfMarriage={outOfMarriage} siblingWithoutParents={siblingWithoutParents} people={people} onChange={setDraft} onRelationChange={setRelationshipMode} onRelationshipTypeChange={setRelationshipType} onPartnershipTypeChange={setPartnershipType} onConnectionTargetChange={setConnectionTargetId} onRelationshipSourceChange={setRelationshipSource} onUnknownParentChange={setUnknownParent} onSingleKnownParentChange={setSingleKnownParent} onOutOfMarriageChange={setOutOfMarriage} onSiblingWithoutParentsChange={setSiblingWithoutParents} onSave={savePerson} onCancel={() => { setEditing(false); setDraft(null); setRelationshipMode(""); setRelationshipType("biological"); setPartnershipType("marriage"); setConnectionTargetId(""); setRelationshipSource(""); setUnknownParent(false); setSingleKnownParent(false); setOutOfMarriage(false); setSiblingWithoutParents(false); }} /> : relationshipEditing ? <RelationshipEditor person={selectedPerson} people={people} partnerships={partnerships} initialKind={relationshipInitialKind} onSave={saveRelationship} onDeleteRelationship={requestDeleteRelationship} onCancel={() => { setRelationshipEditing(false); setRelationshipInitialKind("parent"); }} /> : <PersonDetail person={selectedPerson} people={people} partnerships={partnerships} onEdit={() => openEditor(selectedPerson)} onSelect={selectPerson} onAddRelative={(relation) => openEditor(null, relation)} onManageRelationships={(kind = "parent") => { setInspectorOpen(true); setRelationshipInitialKind(kind); setRelationshipEditing(true); }} onSaveBasicSection={saveBasicSection} onSaveTimelineSection={saveTimelineSection} onSaveFactSourcesSection={saveFactSourcesSection} onCalculateRelationship={openRelationshipCalculator} onShowOnMap={focusPersonOnMap} onDelete={() => requestDelete(selectedPerson?.id)} onMoveSiblingOrder={moveSiblingOrder} onPreviousPerson={() => navigatePersonHistory(-1)} onNextPerson={() => navigatePersonHistory(1)} canGoPrevious={canMovePersonNavigation(personNavigation, -1)} canGoNext={canMovePersonNavigation(personNavigation, 1)} />}
         </aside>
       </main>
       <footer className="app-footer"><span className="footer-info"><Info size={17} /> Всего людей: {people.length}</span><span className="status-divider" /><span>Поколений: {treeLayout.generations.length}</span><span className="footer-file" title={projectMeta.filePath || `Имя файла: ${projectMeta.fileName || "семейное-древо.familytree"}`}>Файл: {projectMeta.fileName || "семейное-древо.familytree"}</span>{runtimeStatus.safeMode && <span className="footer-safe-mode" title="Аппаратное ускорение отключено, используется программный рендеринг">Безопасный режим</span>}<span className={`footer-save ${dirty ? "footer-save-dirty" : ""}`}><CheckCircle size={19} weight="fill" /> {dirty ? "Есть несохранённые изменения" : lastSavedAt ? `Последнее сохранение: ${formatDateTime(lastSavedAt)}` : "Проект ещё не сохранён"}</span><span className="footer-backup">Автосохранение: {autoSaveEnabled ? (lastBackupAt ? formatDateTime(lastBackupAt) : "включено") : "выключено"}</span></footer>
      <input ref={fileInputRef} className="visually-hidden" type="file" accept=".familytree,.json,application/json" onChange={handleFileSelected} />
       {toast && <div className="toast" role="status" aria-live="polite"><CheckCircle size={19} weight="fill" /> <span>{toast}</span>{toastAction?.message === toast && <button type="button" className="toast-action" onClick={() => { setToastAction(null); toastAction.onClick(); }}>{toastAction.label}</button>}</div>}
       {backupOpen && <BackupModal backups={backups} projectMeta={projectMeta} lastSavedAt={lastSavedAt} lastBackupAt={lastBackupAt} onClose={() => setBackupOpen(false)} onRestore={restoreBackup} onDownload={downloadBackup} />}
       {archiveOpen && <ArchiveModal payload={buildPayload()} importState={archiveImport} onClose={() => { setArchiveOpen(false); setArchiveImport(null); }} onDownload={saveFamilyArchive} onImport={handleArchiveSelected} onRestoreImport={restoreFamilyArchive} onClearImport={() => setArchiveImport(null)} />}
       {viewSettingsOpen && <ViewSettingsModal treeStyle={treeStyle} showPhotos={showPhotos} cardFields={cardFields} onTreeStyleChange={(value) => updateViewSetting("treeStyle", value)} onShowPhotosChange={(value) => updateViewSetting("showPhotos", value)} onCardFieldsChange={(value) => updateViewSetting("cardFields", value)} onClose={() => setViewSettingsOpen(false)} />}
       {instructionOpen && <InstructionModal onClose={closeInstruction} />}
       {exportModalOpen && <Suspense fallback={<div className="backup-modal-backdrop" role="status" aria-live="polite"><section className="backup-modal export-loading" role="dialog" aria-modal="true" aria-label="Открытие экспорта"><strong>Открываю экспорт…</strong></section></div>}><ExportModal initialFormat={exportPreset} people={people} partnerships={partnerships} treeStyle={treeStyle} showPhotos={showPhotos} showFormerSurnames={showFormerSurnames} largeText={largeText} cardFields={cardFields} onClose={() => setExportModalOpen(false)} onToast={setToast} /></Suspense>}
       {relationshipCalculatorOpen && <RelationshipCalculatorModal people={people} partnerships={partnerships} initialSourceId={selectedId} onClose={() => setRelationshipCalculatorOpen(false)} onSelectPerson={selectPerson} onShowOnMap={focusPersonOnMap} />}
       {settingsOpen && <ProjectSettingsModal projectMeta={projectMeta} autoSaveEnabled={autoSaveEnabled} treeStyle={treeStyle} showPhotos={showPhotos} showFormerSurnames={showFormerSurnames} largeText={largeText} cardFields={cardFields} shortcuts={shortcuts} onSave={saveProjectSettings} onClose={closeSettings} />}
       {deleteConfirmId && <ConfirmModal title="Удалить человека?" description="Запись будет удалена из дерева, а её связи с родителями, партнёрами, братьями, сёстрами и детьми будут убраны. Перед этим будет создана резервная копия." confirmLabel="Удалить" onClose={() => setDeleteConfirmId("")} onConfirm={deletePerson} />}
       {relationshipDeleteConfirm && <ConfirmModal title="Удалить связь?" description={`${relationshipDeleteConfirm.label}. Связь будет убрана из дерева, а перед этим будет создана резервная копия. После удаления можно сразу отменить действие.`} confirmLabel="Удалить связь" onClose={() => setRelationshipDeleteConfirm(null)} onConfirm={deleteRelationship} />}
       {newTreeConfirmOpen && <ConfirmModal title="Создать новое дерево?" description="Текущее дерево останется в резервной копии, а рабочее полотно будет очищено." confirmLabel="Создать новое дерево" onClose={cancelNewTree} onConfirm={applyNewTree} />}
       {pendingUnsavedAction && <UnsavedChangesModal onSave={() => continueAfterUnsavedChoice(true)} onDiscard={() => continueAfterUnsavedChoice(false)} onCancel={() => setPendingUnsavedAction(null)} />}
       {mainMenuOpen && <MainMenuModal onCreate={() => createNewTree(true)} onLoad={openProject} onSettings={() => openSettings(true)} onHelp={() => openInstruction(true)} onExit={exitApplication} onClose={() => setMainMenuOpen(false)} safeMode={runtimeStatus.safeMode} />}
       {qualityOpen && <DataQualityModal report={qualityReport} peopleCount={people.length} onClose={() => setQualityOpen(false)} />}
       {changeLogOpen && <Suspense fallback={null}><ChangeLogModal entries={projectMeta.changeLog} onClose={() => setChangeLogOpen(false)} /></Suspense>}
       {updateStatus && updateOpen && ["available", "downloading", "downloaded"].includes(updateStatus.state) && <UpdateModal status={updateStatus} onClose={() => setUpdateOpen(false)} onDownload={downloadUpdate} onInstall={installUpdate} onOpenReleases={openReleasesPage} />}
     </div>
  );
}
