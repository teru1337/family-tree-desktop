import { useCallback, useEffect, useRef, useState } from "react";
import { motionDurationMs, prefersReducedMotion } from "./motion.js";

export function easeViewportProgress(value) {
  const progress = Math.max(0, Math.min(1, Number(value) || 0));
  return 1 - ((1 - progress) ** 3);
}

export function interpolateViewport(from, to, progress) {
  const eased = easeViewportProgress(progress);
  return {
    zoom: from.zoom + (to.zoom - from.zoom) * eased,
    pan: {
      x: from.pan.x + (to.pan.x - from.pan.x) * eased,
      y: from.pan.y + (to.pan.y - from.pan.y) * eased,
    },
  };
}

export function viewportMotionDuration(reduced = prefersReducedMotion()) {
  return reduced ? 0 : motionDurationMs("220ms");
}

export function useViewportMotion({ zoom, pan, onZoomChange, onPanChange }) {
  const animationRef = useRef(null);
  const tokenRef = useRef(0);
  const [active, setActive] = useState(false);

  const cancel = useCallback(() => {
    tokenRef.current += 1;
    if (animationRef.current) window.cancelAnimationFrame(animationRef.current.frame);
    animationRef.current = null;
    setActive(false);
  }, []);

  const apply = useCallback((viewport) => {
    onZoomChange(viewport.zoom);
    onPanChange(viewport.pan);
  }, [onPanChange, onZoomChange]);

  const animateTo = useCallback((target, { duration = viewportMotionDuration(), immediate = false } = {}) => {
    cancel();
    const from = { zoom, pan: { ...pan } };
    const to = { zoom: target.zoom, pan: { ...target.pan } };
    if (immediate || duration <= 0 || (from.zoom === to.zoom && from.pan.x === to.pan.x && from.pan.y === to.pan.y)) {
      apply(to);
      return;
    }
    const token = tokenRef.current;
    const startedAt = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
    setActive(true);
    const tick = (now) => {
      if (tokenRef.current !== token) return;
      const elapsed = now - startedAt;
      apply(interpolateViewport(from, to, elapsed / duration));
      if (elapsed >= duration) {
        animationRef.current = null;
        setActive(false);
        apply(to);
        return;
      }
      animationRef.current = { frame: window.requestAnimationFrame(tick), token };
    };
    animationRef.current = { frame: window.requestAnimationFrame(tick), token };
  }, [apply, cancel, pan, zoom]);

  useEffect(() => () => {
    tokenRef.current += 1;
    if (animationRef.current) window.cancelAnimationFrame(animationRef.current.frame);
  }, []);

  return { active, animateTo, cancel };
}
