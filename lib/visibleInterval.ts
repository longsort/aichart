/**
 * 탭이 보일 때만 도는 interval — 백그라운드 폴링·버벅임 완화.
 * 기능 삭제가 아니라 실행 타이밍만 조절.
 */
export function setVisibleInterval(fn: () => void, ms: number): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const period = Math.max(1000, Math.floor(ms));
  const tick = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    try {
      fn();
    } catch {
      /* ignore */
    }
  };
  const id = window.setInterval(tick, period);
  const onVis = () => {
    if (document.visibilityState === 'visible') tick();
  };
  document.addEventListener('visibilitychange', onVis);
  return () => {
    window.clearInterval(id);
    document.removeEventListener('visibilitychange', onVis);
  };
}

/** 마운트 시 동시 폭주 방지용 지연 */
export function delayMs(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, Math.max(0, ms)));
}
