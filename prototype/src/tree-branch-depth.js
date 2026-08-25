export const MIN_TREE_BRANCH_DEPTH = 1;
export const MAX_TREE_BRANCH_DEPTH = 10;
export const DEFAULT_TREE_BRANCH_DEPTH = MAX_TREE_BRANCH_DEPTH;

export function normalizeTreeBranchDepth(value) {
  if (value === "all" || value === "" || value === null || value === undefined) return String(DEFAULT_TREE_BRANCH_DEPTH);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(DEFAULT_TREE_BRANCH_DEPTH);
  return String(Math.min(MAX_TREE_BRANCH_DEPTH, Math.max(MIN_TREE_BRANCH_DEPTH, Math.round(numeric))));
}
