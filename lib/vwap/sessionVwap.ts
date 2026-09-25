/**
 * 세션(UTC 일) 리셋 VWAP — HLC3×volume / Σvolume.
 * Anchored VWAP와 병행. 기존 AVWAP 불변.
 */
import type { Candle } from '@/types';

export type SessionVwapPoint = { time: number; value: number };

function utcDayKey(sec: number): number {
  return Math.floor(sec / 86400);
}

function hlc3(c: Candle): number {
  return (Number(c.high) + Number(c.low) + Number(c.close)) / 3;
}

/** UTC 자정마다 세션 리셋 */
export function computeSessionVwapSeries(candles: Candle[]): SessionVwapPoint[] {
  const out: SessionVwapPoint[] = [];
  let day = -1;
  let pv = 0;
  let vv = 0;
  for (const c of candles) {
    if (!c) continue;
    const t = Number(c.time);
    if (!Number.isFinite(t)) continue;
    const d = utcDayKey(t);
    if (d !== day) {
      day = d;
      pv = 0;
      vv = 0;
    }
    const vol = Math.max(1, Number(c.volume) || 0);
    const src = hlc3(c);
    if (!Number.isFinite(src)) continue;
    pv += src * vol;
    vv += vol;
    if (vv > 0) out.push({ time: t, value: pv / vv });
  }
  return out;
}
