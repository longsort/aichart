'use client';

/**
 * 첫 HTML 직후 차트·데스크 청크를 병렬 컴파일하고,
 * 로그인된 경우 캔들·분석 API도 워밍한다. 기능 삭제 아님.
 */
if (typeof window !== 'undefined') {
  void import('./HomePageContent');
  void import('./components/ChartView');
  void import('./components/mergedAnalysis/MergedAnalysisDeskView');
  void import('./components/eagle1/Eagle1StructureDesk');
  void import('./components/eagle1/Eagle1AiHud');
  void fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
    .then((r) => r.json().catch(() => ({})))
    .then((d: { authenticated?: boolean }) => {
      if (!d?.authenticated) return;
      const q = 'symbol=BTCUSDT';
      void fetch(`/api/market?${q}&timeframe=15m&depth=recent`, {
        credentials: 'same-origin',
        cache: 'no-store',
      }).catch(() => {});
      void fetch(`/api/market?${q}&timeframe=4h&depth=recent`, {
        credentials: 'same-origin',
        cache: 'no-store',
      }).catch(() => {});
      window.setTimeout(() => {
        void fetch(`/api/analyze?${q}&timeframe=15m&collect=0`, {
          credentials: 'same-origin',
          cache: 'no-store',
        }).catch(() => {});
      }, 250);
    })
    .catch(() => {});
}

export default function BootWarmup() {
  return null;
}
