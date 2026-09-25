import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { wadBuyVolume, wadSellVolume } from '@/lib/volumeHistogramIntelligence';
import { scoreGreenTrapSegment } from '@/lib/volumeCandleJoint';

export type VolumeRangePhaseKind = 'accumulation' | 'distribution' | 'neutral';

export type VolumeRangePhase = {
  fromIdx: number;
  toIdx: number;
  phase: VolumeRangePhaseKind;
  bars: number;
  sellPct: number;
  buyPct: number;
  compression: number;
  score: number;
  /** 구간 종료 후 +breakBars 실제 변화 (있을 때) */
  breakUsd?: number;
  breakPct?: number;
};

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((s, x) => s + x, 0) / nums.length;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function windowForTf(tf: string): { win: number; maxSpanPct: number; maxNetPct: number } {
  const n = normalizeChartTimeframe(tf);
  /** 횡보 감지 창 — sidewaysBreakForecast 와 정합 (짧게 잡히던 5~8봉 문제 완화) */
  const map: Record<string, { win: number; maxSpanPct: number; maxNetPct: number }> = {
    '1m': { win: 28, maxSpanPct: 0.014, maxNetPct: 0.009 },
    '5m': { win: 24, maxSpanPct: 0.016, maxNetPct: 0.01 },
    '15m': { win: 22, maxSpanPct: 0.022, maxNetPct: 0.014 },
    '1h': { win: 18, maxSpanPct: 0.028, maxNetPct: 0.016 },
    '4h': { win: 14, maxSpanPct: 0.042, maxNetPct: 0.024 },
    '1d': { win: 12, maxSpanPct: 0.06, maxNetPct: 0.032 },
    '1w': { win: 9, maxSpanPct: 0.09, maxNetPct: 0.045 },
    '1M': { win: 7, maxSpanPct: 0.13, maxNetPct: 0.06 },
    '1Y': { win: 5, maxSpanPct: 0.18, maxNetPct: 0.07 },
  };
  return map[n] ?? { win: 18, maxSpanPct: 0.03, maxNetPct: 0.018 };
}

function flowInSegment(seg: Candle[]): { buy: number; sell: number; sellPct: number } {
  let buy = 0;
  let sell = 0;
  for (const c of seg) {
    buy += wadBuyVolume(c);
    sell += wadSellVolume(c);
  }
  const t = buy + sell;
  const sellPct = t > 0 ? sell / t : 0.5;
  return { buy, sell, sellPct };
}

function isRangeSegment(
  arr: Candle[],
  from: number,
  to: number,
  ranges: number[],
  cfg: { maxSpanPct: number; maxNetPct: number }
): { ok: boolean; compression: number } {
  const seg = arr.slice(from, to + 1);
  if (seg.length < 6) return { ok: false, compression: 0 };
  const hi = Math.max(...seg.map((c) => c.high));
  const lo = Math.min(...seg.map((c) => c.low));
  const mid = (hi + lo) / 2;
  if (mid <= 0) return { ok: false, compression: 0 };
  const spanPct = (hi - lo) / mid;
  const open0 = seg[0].open ?? seg[0].close;
  const close1 = seg[seg.length - 1].close;
  const netPct = open0 > 0 ? Math.abs(close1 - open0) / open0 : 1;
  const avgR = avg(ranges.slice(from, to + 1));
  const ctxFrom = Math.max(0, from - 28);
  const ctxR = avg(ranges.slice(ctxFrom, from + 1));
  const compression = clamp(1 - avgR / Math.max(1e-9, ctxR), 0, 1);
  const ok = spanPct <= cfg.maxSpanPct && netPct <= cfg.maxNetPct && compression >= 0.08;
  return { ok, compression };
}

/**
 * 횡보 + 매수/매도 거래량 우세 구간 (RVOL 폭증 없어도 분산·매집 감지)
 */
export function detectVolumeRangePhases(
  candles: Candle[],
  timeframe: string,
  lookbackBars = 90,
  breakBars = 6
): VolumeRangePhase[] {
  const arr = candles.filter((c) => c && Number.isFinite(c.close));
  const n = arr.length;
  const cfg = windowForTf(timeframe);
  if (n < cfg.win + breakBars + 4) return [];

  const ranges = arr.map((c) => Math.max(1e-9, c.high - c.low));
  const start = Math.max(cfg.win, n - lookbackBars);
  const raw: VolumeRangePhase[] = [];

  for (let end = start; end < n - 1; end++) {
    const from = end - cfg.win + 1;
    const { ok, compression } = isRangeSegment(arr, from, end, ranges, cfg);
    if (!ok) continue;
    const seg = arr.slice(from, end + 1);
    const { sellPct } = flowInSegment(seg);
    const buyPct = 1 - sellPct;
    const trap = scoreGreenTrapSegment(seg);
    let phase: VolumeRangePhaseKind = 'neutral';
    if (sellPct >= 0.56) phase = 'distribution';
    else if (trap.isTrap) phase = 'distribution';
    else if (sellPct <= 0.44) phase = 'accumulation';
    else phase = 'neutral';

    /** 중립 횡보도 점수 통과 시 유지 (돌파 방향 분석용) */
    const edge =
      phase === 'distribution'
        ? sellPct - 0.5
        : phase === 'accumulation'
          ? 0.5 - sellPct
          : compression * 0.2;
    const score = edge * 0.55 + compression * 0.35 + cfg.win / 40;
    if (score < 0.12) continue;
    if (phase === 'neutral' && compression < 0.12) continue;

    let breakUsd: number | undefined;
    let breakPct: number | undefined;
    const bEnd = Math.min(n - 1, end + breakBars);
    if (bEnd > end) {
      const c0 = arr[end];
      const c1 = arr[bEnd];
      if (c0?.close > 0) {
        breakUsd = c1.close - c0.close;
        breakPct = ((c1.close / c0.close) - 1) * 100;
      }
    }

    raw.push({
      fromIdx: from,
      toIdx: end,
      phase,
      bars: cfg.win,
      sellPct,
      buyPct,
      compression,
      score,
      breakUsd,
      breakPct,
    });
  }

  raw.sort((a, b) => b.score - a.score || b.toIdx - a.toIdx);
  const merged: VolumeRangePhase[] = [];
  for (const p of raw) {
    const overlap = merged.some(
      (m) =>
        m.phase === p.phase &&
        !(p.toIdx < m.fromIdx - 3 || p.fromIdx > m.toIdx + 3)
    );
    if (!overlap) merged.push(p);
    if (merged.length >= 14) break;
  }
  return merged.sort((a, b) => a.toIdx - b.toIdx);
}

export function getVolumeRangePhaseAt(
  phases: VolumeRangePhase[],
  idx: number
): VolumeRangePhase | null {
  for (const p of phases) {
    if (idx >= p.fromIdx && idx <= p.toIdx) return p;
  }
  return null;
}

/** 구간 끝(이탈 직전) + 진행 중 마지막 봉 라벨 */
export function phaseMarkerScore(p: VolumeRangePhase, atEnd: boolean): number {
  let s = p.score * 10;
  if (p.phase === 'distribution') s += 2;
  if (atEnd) s += 1.5;
  if (p.breakUsd != null && p.phase === 'distribution' && p.breakUsd < 0) s += 3;
  if (p.breakUsd != null && p.phase === 'accumulation' && p.breakUsd > 0) s += 2;
  return s;
}
