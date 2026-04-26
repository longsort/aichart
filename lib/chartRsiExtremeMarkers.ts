/**
 * 가이드: 캔들 위·아래 RSI 과매수(불)·과매도(물) 표시 — `analysis.indicators.rsi`와 캔들 인덱스 정렬 전제.
 */
import type { UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '@/types';

export type RsiExtremeChartMarker = {
  time: UTCTimestamp;
  position: 'aboveBar' | 'belowBar';
  shape: 'circle';
  color: string;
  text: string;
  size?: number;
};

export function buildRsiOverboughtOversoldMarkers(
  candles: Candle[],
  rsi: number[],
  opts?: { ob?: number; os?: number; maxMarkers?: number; lookbackBars?: number }
): RsiExtremeChartMarker[] {
  const ob = opts?.ob ?? 70;
  const os = opts?.os ?? 30;
  const maxM = Math.max(4, opts?.maxMarkers ?? 40);
  const lookback = Math.max(20, opts?.lookbackBars ?? 160);
  const n = Math.min(candles.length, rsi.length);
  if (n < 1) return [];
  const out: RsiExtremeChartMarker[] = [];
  const from = Math.max(0, n - lookback);
  for (let i = n - 1; i >= from && out.length < maxM; i--) {
    const r = rsi[i];
    if (!Number.isFinite(r)) continue;
    const c = candles[i];
    if (!c) continue;
    const t = c.time as number;
    if (r >= ob) {
      out.push({
        time: t as UTCTimestamp,
        position: 'aboveBar',
        shape: 'circle',
        color: '#ea580c',
        text: '🔥',
        size: 1,
      });
    } else if (r <= os) {
      out.push({
        time: t as UTCTimestamp,
        position: 'belowBar',
        shape: 'circle',
        color: '#0ea5e9',
        text: '💧',
        size: 1,
      });
    }
  }
  return out;
}
