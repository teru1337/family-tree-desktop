import { MOTION, motionDurationMs } from "./motion.js";

export const ADDITION_PHASES = Object.freeze({
  prepare: "prepare",
  reveal: "reveal",
  settle: "settle",
});

export function additionSequenceDurations(reduced = false) {
  if (reduced) return { leadIn: 0, reveal: 0, settle: 0 };
  return {
    leadIn: motionDurationMs(MOTION.duration.micro),
    reveal: motionDurationMs(MOTION.duration.emphasis),
    settle: motionDurationMs(MOTION.duration.standard),
  };
}

export function additionRole(personId, motion) {
  if (!motion || !personId) return "";
  if (motion.newPersonId === personId) return "new";
  if (motion.targetPersonId === personId) return "target";
  return "";
}

export function additionEdgeMatches(edge, motion) {
  if (!edge || !motion?.newPersonId || !motion?.targetPersonId) return false;
  return edge.personIds?.length === 2
    && edge.personIds.includes(motion.newPersonId)
    && edge.personIds.includes(motion.targetPersonId);
}
