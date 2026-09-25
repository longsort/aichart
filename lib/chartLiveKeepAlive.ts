/**
 * 차트 실시간 정체 감지 — WS가 닫히지 않고 묵묵히 멈추거나
 * REST tip이 실패해도 봉이 옛시간에 고착되지 않게 복구 임계값 제공.
 */
import { chartTfStepSec } from '@/lib/clientMarketCandleCache';
import { normalizeChartTimeframe } from '@/lib/constants';

/** 마지막 실시간 갱신(WS/tip) 후 이 시간이면 강제 tip·재구독 */
export function chartLiveStaleMs(timeframe: string): number {
  const tf = normalizeChartTimeframe(timeframe) || timeframe;
  const stepMs = Math.max(60_000, chartTfStepSec(tf) * 1000);
  /** LTF: 봉간격의 ~1.8배 + 여유 · HTF: 최대 90초 안에 tip 재시도 */
  if (tf === '1m' || tf === '3m') return Math.min(45_000, Math.floor(stepMs * 1.6) + 12_000);
  if (tf === '5m' || tf === '15m') return Math.min(75_000, Math.floor(stepMs * 1.4) + 15_000);
  if (tf === '1h' || tf === '4h') return Math.min(120_000, Math.floor(stepMs * 0.35) + 40_000);
  return Math.min(180_000, 90_000);
}

/** 타점 데스크 등 REST 폴링 주기 */
export function chartLiveTipPollMs(timeframe: string): number {
  const tf = normalizeChartTimeframe(timeframe) || timeframe;
  if (tf === '1m' || tf === '3m') return 4_000;
  if (tf === '5m') return 5_500;
  if (tf === '15m') return 7_000;
  if (tf === '1h' || tf === '4h') return 12_000;
  return 18_000;
}

/** 마지막 봉 open 시각이 너무 오래됐는지 (초 단위 candle.time) */
export function isChartCandleTipStale(
  lastCandleTimeSec: number | null | undefined,
  timeframe: string,
  nowMs = Date.now()
): boolean {
  const t = Number(lastCandleTimeSec);
  if (!Number.isFinite(t) || t <= 0) return true;
  const step = chartTfStepSec(timeframe);
  const ageSec = nowMs / 1000 - t;
  /** 미완성 현재봉이면 age ≈ 0~step · step*2.2 + 45초 넘으면 끊긴 것 */
  return ageSec > step * 2.2 + 45;
}
