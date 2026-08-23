export const MAX_HISTORY_ENTRIES = 50;

export function createSnapshot(people, partnerships, projectMeta) {
  return { people, partnerships, projectMeta };
}

export function snapshotsEqual(left, right) {
  return Boolean(left && right)
    && left.people === right.people
    && left.partnerships === right.partnerships
    && left.projectMeta === right.projectMeta;
}

export function createHistory(present, limit = MAX_HISTORY_ENTRIES) {
  return { past: [], present, future: [], limit };
}

export function recordHistory(history, next) {
  if (snapshotsEqual(history.present, next)) return history;
  return {
    ...history,
    past: [...history.past, history.present].slice(-history.limit),
    present: next,
    future: [],
  };
}

export function undoHistory(history) {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1];
  return {
    ...history,
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future].slice(0, history.limit),
  };
}

export function redoHistory(history) {
  if (!history.future.length) return history;
  const next = history.future[0];
  return {
    ...history,
    past: [...history.past, history.present].slice(-history.limit),
    present: next,
    future: history.future.slice(1),
  };
}

export function getHistoryStatus(history) {
  return { canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
}
