/**
 * 타점 누적 dirty 훅 — scorecard↔accumClient 순환 import 방지.
 */
let dirtyHandler: ((delayMs?: number) => void) | null = null;

export function setTapointAccumDirtyHandler(
  fn: ((delayMs?: number) => void) | null
): void {
  dirtyHandler = fn;
}

export function markTapointAccumDirty(delayMs = 1200): void {
  try {
    dirtyHandler?.(delayMs);
  } catch {
    /* ignore */
  }
}
