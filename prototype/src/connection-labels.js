function safeText(value) {
  return String(value || "").trim() || "Связь";
}

function cardRect(position) {
  const left = Number(position?.left) || 0;
  const top = Number(position?.top) || 0;
  const width = Math.max(0, Number(position?.width) || 0);
  const height = Math.max(0, Number(position?.height) || 0);
  return { left, top, right: left + width, bottom: top + height };
}

function labelRect(left, top, width, height) {
  return { left: left - width / 2, top: top - height / 2, right: left + width / 2, bottom: top + height / 2 };
}

function overlaps(first, second, gap = 0) {
  return first.left < second.right + gap && first.right > second.left - gap && first.top < second.bottom + gap && first.bottom > second.top - gap;
}

function overlapArea(first, second, gap = 0) {
  const width = Math.max(0, Math.min(first.right, second.right + gap) - Math.max(first.left, second.left - gap));
  const height = Math.max(0, Math.min(first.bottom, second.bottom + gap) - Math.max(first.top, second.top - gap));
  return width * height;
}

export function estimateConnectionLabel(text, { fontScale = 1 } = {}) {
  const scale = Math.max(0.8, Number(fontScale) || 1);
  const value = safeText(text);
  return {
    width: Math.min(220, Math.max(42, Math.ceil(value.length * 6.35 * scale + 12))),
    height: Math.ceil(19 * scale),
  };
}

function candidateOffsets(maxLanes) {
  const offsets = [0];
  for (let lane = 1; lane <= maxLanes; lane += 1) offsets.push(-lane, lane);
  return offsets;
}

export function layoutConnectionLabels(candidates = [], { positions = [], labelGap = 8, channelGap = 24, maxLanes = 8, fontScale = 1 } = {}) {
  const peoplePositions = Array.isArray(positions) ? positions : Object.values(positions || {});
  const cards = peoplePositions.map(cardRect);
  const occupied = [];
  const ordered = [...candidates].sort((first, second) => Number(first.top || 0) - Number(second.top || 0) || Number(first.left || 0) - Number(second.left || 0) || String(first.id).localeCompare(String(second.id)));

  return ordered.map((candidate) => {
    const size = estimateConnectionLabel(candidate.short, { fontScale });
    const orientation = candidate.orientation === "horizontal" ? "horizontal" : "vertical";
    const offsets = candidateOffsets(maxLanes);
    let selected = null;
    let best = null;
    offsets.forEach((offset) => {
      const left = Number(candidate.left) + (orientation === "vertical" ? offset * channelGap : 0);
      const top = Number(candidate.top) + (orientation === "horizontal" ? offset * channelGap : 0);
      const rect = labelRect(left, top, size.width, size.height);
      const cardPenalty = cards.reduce((total, card) => total + overlapArea(rect, card, 3), 0);
      const labelPenalty = occupied.reduce((total, other) => total + overlapArea(rect, other, labelGap), 0);
      const score = cardPenalty * 1000 + labelPenalty;
      if (!best || score < best.score) best = { left, top, rect, score };
      if (!selected && cardPenalty === 0 && labelPenalty === 0) selected = { left, top, rect };
    });
    const result = { ...candidate, left: selected?.left ?? best.left, top: selected?.top ?? best.top, width: size.width, height: size.height };
    occupied.push(selected?.rect ?? best.rect);
    return result;
  });
}
