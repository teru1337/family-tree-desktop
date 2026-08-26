import { useRef, useState } from "react";
import { SCHEMA_NODES, SCHEMA_RELATIONS, buildInteractiveFamilySchemaSvg } from "./interactive-family-schema.js";

function schemaNode(id) {
  return SCHEMA_NODES.find((node) => node.id === id);
}

function downloadSchemaSvg(svgText) {
  const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "family-tree-interactive-schema.svg";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function SchemaNode({ node, active, onSelect }) {
  const select = () => onSelect(node.id);
  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select();
    }
  };

  return (
    <g
      id={`schema-node-${node.id}`}
      className={`interactive-schema-node schema-node-${node.tone} ${active ? "is-active" : ""}`}
      role="button"
      tabIndex="0"
      aria-pressed={active}
      aria-label={`${node.label}: ${node.note}`}
      transform={`translate(${node.x} ${node.y})`}
      onClick={select}
      onKeyDown={handleKeyDown}
    >
      <rect width="210" height="80" rx="14" />
      <text x="18" y="34">{node.label}</text>
      <text className="interactive-schema-note" x="18" y="57">{node.note}</text>
    </g>
  );
}

export function InteractiveFamilySchema() {
  const svgRef = useRef(null);
  const [activeNodeId, setActiveNodeId] = useState("parent");
  const [activeRelationId, setActiveRelationId] = useState("");
  const activeNode = schemaNode(activeNodeId);
  const activeRelation = SCHEMA_RELATIONS.find((relation) => relation.id === activeRelationId);
  const status = activeRelation
    ? `Выбрана ${activeRelation.label}.`
    : `Выбрана карточка «${activeNode?.label || "связь"}».`;
  const selectRelation = (relation) => {
    setActiveRelationId(relation.id);
    setActiveNodeId(relation.to);
  };

  return (
    <section className="interactive-schema" aria-labelledby="interactive-schema-title">
      <div className="interactive-schema-heading">
        <div>
          <span className="eyebrow">Интерактивная схема</span>
          <h4 id="interactive-schema-title">Нажмите на карточку или связь</h4>
          <p>Схема обезличена и не изменяет текущее дерево.</p>
        </div>
        <button
          type="button"
          className="button button-secondary interactive-schema-export"
          onClick={() => downloadSchemaSvg(buildInteractiveFamilySchemaSvg())}
        >
          Скачать SVG
        </button>
      </div>
      <svg
        ref={svgRef}
        className="interactive-schema-canvas"
        viewBox="0 0 720 370"
        role="img"
        aria-labelledby="interactive-schema-title interactive-schema-description"
      >
        <desc id="interactive-schema-description">
          Кликабельные карточки родителя, партнёра и ребёнка, соединённые двумя типами связей.
        </desc>
        <defs>
          <marker id="interactive-schema-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>
        <g id="schema-canvas" className="interactive-schema-layer" data-layer="canvas">
          <g id="schema-relations" className="interactive-schema-layer" data-layer="relations" aria-label="Связи">
            <g className="interactive-schema-visible-relations">
              {SCHEMA_RELATIONS.map((relation) => (
                <g key={relation.id}>
                  <path
                    id={`schema-relation-${relation.id}`}
                    className={`interactive-schema-edge interactive-schema-edge-${relation.kind} ${activeRelationId === relation.id ? "is-active" : ""}`}
                    d={relation.path}
                    markerEnd="url(#interactive-schema-arrow)"
                    role="button"
                    tabIndex="0"
                    aria-label={relation.label}
                    onClick={() => selectRelation(relation)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectRelation(relation);
                      }
                    }}
                  />
                  <path className="interactive-schema-edge-hit" d={relation.path} aria-hidden="true" />
                </g>
              ))}
            </g>
          </g>
          <g id="schema-edge-labels" className="interactive-schema-layer" data-layer="labels">
            {SCHEMA_RELATIONS.map((relation) => (
              <text
                key={relation.id}
                x="310"
                y={relation.kind === "parent" ? 125 : 260}
                className={`interactive-schema-edge-label ${activeRelationId === relation.id ? "is-active" : ""}`}
              >
                {relation.label}
              </text>
            ))}
          </g>
          <g id="schema-nodes" className="interactive-schema-layer" data-layer="nodes" aria-label="Карточки">
            {SCHEMA_NODES.map((node) => (
              <SchemaNode
                key={node.id}
                node={node}
                active={activeNodeId === node.id}
                onSelect={(id) => {
                  setActiveNodeId(id);
                  setActiveRelationId("");
                }}
              />
            ))}
          </g>
        </g>
      </svg>
      <div className="interactive-schema-status" role="status" aria-live="polite">
        {status}
      </div>
    </section>
  );
}
