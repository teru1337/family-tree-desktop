import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { layoutDelta, motionDurationMs, prefersReducedMotion } from "./motion.js";

function getCollapseMotionIds(previous, previousHiddenIds, hiddenIds, positions) {
  const enteringIds = new Set();
  const exitingIds = new Set();
  Object.keys(positions).forEach((id) => {
    if (!previous[id] || previousHiddenIds.has(id) && !hiddenIds.has(id)) enteringIds.add(id);
    if (!previousHiddenIds.has(id) && hiddenIds.has(id)) exitingIds.add(id);
  });
  return { enteringIds, exitingIds };
}

export function useCollapseMotion({ renderedPositions, hiddenIds, personDraggingId }) {
  const [cardMotion, setCardMotion] = useState({ transforms: {}, enteringIds: new Set() });
  const [connectionMotion, setConnectionMotion] = useState(null);
  const previousPositionsRef = useRef(null);
  const previousHiddenIdsRef = useRef(new Set());
  const motionFrameRef = useRef(0);
  const motionTimerRef = useRef(0);
  const motionTokenRef = useRef(0);
  useLayoutEffect(() => {
    const previous = previousPositionsRef.current;
    const previousHiddenIds = previousHiddenIdsRef.current;
    previousPositionsRef.current = renderedPositions;
    previousHiddenIdsRef.current = hiddenIds;
    if (!previous || personDraggingId || prefersReducedMotion()) return;
    const transforms = {};
    const { enteringIds, exitingIds } = getCollapseMotionIds(previous, previousHiddenIds, hiddenIds, renderedPositions);
    Object.entries(renderedPositions).forEach(([id, position]) => {
      const delta = layoutDelta(previous[id], position);
      if (delta) transforms[id] = `translate(${delta.x}px, ${delta.y}px)`;
    });
    if (!Object.keys(transforms).length && !enteringIds.size && !exitingIds.size) return;
    if (motionFrameRef.current) window.cancelAnimationFrame(motionFrameRef.current);
    if (motionTimerRef.current) window.clearTimeout(motionTimerRef.current);
    const token = motionTokenRef.current + 1;
    motionTokenRef.current = token;
    setCardMotion({ transforms, enteringIds });
    setConnectionMotion({ previousPositions: previous, previousHiddenIds, exitingIds, phase: "from", token });
    motionFrameRef.current = window.requestAnimationFrame(() => {
      setCardMotion({ transforms: {}, enteringIds: new Set() });
      setConnectionMotion((current) => current?.token === token ? { ...current, phase: "to" } : current);
    });
    motionTimerRef.current = window.setTimeout(() => {
      setConnectionMotion((current) => current?.token === token ? null : current);
      motionFrameRef.current = 0;
      motionTimerRef.current = 0;
    }, motionDurationMs() + 40);
  }, [renderedPositions, hiddenIds, personDraggingId]);
  useEffect(() => () => {
    if (motionFrameRef.current) window.cancelAnimationFrame(motionFrameRef.current);
    if (motionTimerRef.current) window.clearTimeout(motionTimerRef.current);
  }, []);
  const exitingIds = connectionMotion?.exitingIds || new Set();
  return { cardMotion, connectionMotion, exitingIds };
}

export function includeExitingPeople(visiblePeople, people, exitingIds, positions) {
  return exitingIds.size ? [...visiblePeople, ...people.filter((person) => exitingIds.has(person.id) && positions[person.id])] : visiblePeople;
}
