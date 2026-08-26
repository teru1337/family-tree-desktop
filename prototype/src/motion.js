export const MOTION = Object.freeze({
  duration: Object.freeze({
    micro: "120ms",
    fast: "160ms",
    standard: "180ms",
    emphasis: "220ms",
    entrance: "700ms",
    scene: "1500ms",
    backgroundSlow: "9s",
    backgroundMedium: "6.5s",
    backgroundFast: "2.4s",
  }),
  easing: Object.freeze({
    standard: "ease",
    emphasis: "cubic-bezier(.2, .75, .25, 1)",
    entrance: "cubic-bezier(.16, 1, .3, 1)",
  }),
  opacity: Object.freeze({ enter: 0, rest: 1 }),
  scale: Object.freeze({ enter: 0.98, rest: 1 }),
});

export function prefersReducedMotion(matchMedia = globalThis.matchMedia) {
  return typeof matchMedia === "function"
    && Boolean(matchMedia("(prefers-reduced-motion: reduce)")?.matches);
}

export function ambientMotionVisible(visibilityState = typeof document === "undefined" ? "visible" : document.visibilityState) {
  return visibilityState !== "hidden" && visibilityState !== "prerender";
}

export function motionDurationMs(value = MOTION.duration.emphasis) {
  const milliseconds = Number.parseFloat(value);
  return Number.isFinite(milliseconds) ? milliseconds : 0;
}

export function layoutDelta(previous, next) {
  if (!previous || !next) return null;
  const x = previous.left - next.left;
  const y = previous.top - next.top;
  return x || y ? { x, y } : null;
}

export function restartAnimation(element, className) {
  if (!element?.classList || !className) return element;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  return element;
}
