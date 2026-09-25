/**
 * Replay speed constants — client-safe (no pipeline / fs).
 */
export const EAGLE1_REPLAY_SPEEDS = [1, 5, 20, 100] as const;
export type Eagle1ReplaySpeed = (typeof EAGLE1_REPLAY_SPEEDS)[number];
