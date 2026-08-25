export const MIN_TREE_ZOOM = 0.55;
export const MAX_TREE_ZOOM = 1.35;

export function clampTreeZoom(value) {
  const numericValue = Number(value);
  const safeValue = Number.isFinite(numericValue) ? numericValue : 1;
  return Math.max(MIN_TREE_ZOOM, Math.min(MAX_TREE_ZOOM, safeValue));
}

export function zoomAtPoint({ zoom = 1, pan = { x: 0, y: 0 }, point = { x: 0, y: 0 }, wheelDelta = 0 }) {
  const currentZoom = clampTreeZoom(zoom);
  const nextZoom = clampTreeZoom(currentZoom * (1.08 ** (-Number(wheelDelta || 0) / 100)));
  const worldPoint = {
    x: (point.x - pan.x) / currentZoom,
    y: (point.y - pan.y) / currentZoom,
  };
  return {
    zoom: nextZoom,
    pan: {
      x: point.x - worldPoint.x * nextZoom,
      y: point.y - worldPoint.y * nextZoom,
    },
  };
}
