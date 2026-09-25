'use client';

/**
 * 첫 HTML 직후 ChartView만 병렬 컴파일.
 * 데스크·HUD는 page에서 정적 로드 — "올리는 중…" 대기 제거.
 * 인증 후 무거운 /api/analyze 워밍은 하지 않음.
 */
if (typeof window !== 'undefined') {
  void import('./components/ChartView');
  void fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
    .then((r) => r.json().catch(() => ({})))
    .then((d: { authenticated?: boolean }) => {
      if (!d?.authenticated) return;
      const q = 'symbol=BTCUSDT';
      window.setTimeout(() => {
        void fetch(`/api/market?${q}&timeframe=15m&depth=recent`, {
          credentials: 'same-origin',
          cache: 'no-store',
        }).catch(() => {});
      }, 800);
      window.setTimeout(() => {
        void fetch(`/api/market?${q}&timeframe=4h&depth=recent`, {
          credentials: 'same-origin',
          cache: 'no-store',
        }).catch(() => {});
      }, 1600);
    })
    .catch(() => {});
}

export default function BootWarmup() {
  return null;
}
