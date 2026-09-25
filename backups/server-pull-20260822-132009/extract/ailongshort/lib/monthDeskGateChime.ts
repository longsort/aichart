/** 마감·안착 HUD — 게이트·확정 짧은 비프 (Web Audio) */
export type MonthDeskChimeKind = 'gate' | 'confirm' | 'full' | 'invalid';

export function playMonthDeskChime(kind: MonthDeskChimeKind, enabled = true): void {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const beep = (t: number, d: number, f: number, g: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.value = g;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + d);
    };
    if (kind === 'full') {
      beep(0, 0.12, 880, 0.07);
      beep(0.14, 0.12, 1100, 0.06);
      beep(0.28, 0.16, 1320, 0.05);
    } else if (kind === 'confirm') {
      beep(0, 0.1, 720, 0.06);
      beep(0.12, 0.14, 960, 0.055);
    } else if (kind === 'gate') {
      beep(0, 0.08, 620, 0.045);
      beep(0.09, 0.1, 780, 0.04);
    } else {
      beep(0, 0.14, 280, 0.05);
      beep(0.16, 0.12, 220, 0.04);
    }
    window.setTimeout(() => void ctx.close(), 800);
  } catch {
    /* ignore */
  }
  try {
    if ('vibrate' in navigator) {
      const pattern =
        kind === 'full'
          ? [120, 50, 120, 50, 160]
          : kind === 'confirm'
            ? [100, 60, 140]
            : kind === 'gate'
              ? [60, 40, 80]
              : [80, 40, 80];
      navigator.vibrate(pattern);
    }
  } catch {
    /* ignore */
  }
}
