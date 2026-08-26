export const SCHEMA_NODES = Object.freeze([
  { id: "parent", label: "Родитель", note: "старшее поколение", x: 98, y: 68, tone: "sage" },
  { id: "partner", label: "Партнёр", note: "семейная связь", x: 98, y: 242, tone: "rose" },
  { id: "child", label: "Ребёнок", note: "младшее поколение", x: 468, y: 155, tone: "blue" },
]);

export const SCHEMA_RELATIONS = Object.freeze([
  { id: "parent-child", from: "parent", to: "child", kind: "parent", label: "родительская связь", path: "M 208 108 C 296 108 334 169 444 188" },
  { id: "partner-child", from: "partner", to: "child", kind: "partnership", label: "партнёрство", path: "M 208 278 C 296 278 334 212 444 188" },
]);

function escapeXml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" }[character]));
}

export function buildInteractiveFamilySchemaSvg() {
  const nodes = SCHEMA_NODES.map((node) => `<g id="schema-node-${node.id}" inkscape:label="Карточка — ${escapeXml(node.label)}"><rect x="${node.x}" y="${node.y}" width="210" height="80" rx="14" class="schema-card schema-card-${node.tone}"/><text x="${node.x + 18}" y="${node.y + 34}" class="schema-title">${escapeXml(node.label)}</text><text x="${node.x + 18}" y="${node.y + 57}" class="schema-note">${escapeXml(node.note)}</text></g>`).join("");
  const relations = SCHEMA_RELATIONS.map((relation) => `<path id="schema-relation-${relation.id}" d="${relation.path}" class="schema-edge schema-edge-${relation.kind}" marker-end="url(#schema-arrow)" aria-label="${escapeXml(relation.label)}"/><text x="310" y="${relation.kind === "parent" ? 125 : 260}" class="schema-edge-label">${escapeXml(relation.label)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 720 370" role="img" aria-labelledby="schema-title schema-description"><title id="schema-title">Интерактивная схема семейных связей</title><desc id="schema-description">Обезличенная схема родительской и партнёрской связи.</desc><defs><marker id="schema-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#6d8751"/></marker><style>.schema-card{fill:#fffefa;stroke:#d7d4cc;stroke-width:2}.schema-card-sage{stroke:#88a36f}.schema-card-rose{stroke:#c994a6}.schema-card-blue{stroke:#79a6ca}.schema-title{fill:#34312c;font:700 18px sans-serif}.schema-note,.schema-edge-label{fill:#77736b;font:12px sans-serif}.schema-edge{fill:none;stroke:#6d8751;stroke-width:3;stroke-linecap:round}.schema-edge-partnership{stroke:#b5773d;stroke-dasharray:10 6}</style></defs><g id="schema-canvas" inkscape:label="Холст схемы"><g id="schema-relations" inkscape:label="Связи — редактировать отдельно">${relations}</g><g id="schema-nodes" inkscape:label="Карточки — редактировать отдельно">${nodes}</g></g></svg>`;
}
