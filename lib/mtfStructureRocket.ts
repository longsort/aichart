import type { AnalyzeResponse } from '@/types';

/** 차트 마커와 동일: 마지막 봉 구간 [lastOpen, lastOpen+period) 안의 구조 로켓만 해당 봉에 표시 */
const TF_PERIOD_SECONDS: Record<string, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
  '1w': 604800,
  '1M': 2592000,
  '1Y': 31536000,
};

export type StructureRocketLastHit = {
  direction: 'LONG' | 'SHORT';
  /** analyze 구조 손절(신호봉 고/저·존 바깥 ± ATR) — 없으면 null */
  stopLoss: number | null;
  entryPrice: number | null;
  source: string | null;
  time: number;
  /** 로켓이 찍힌 봉이 끝에서 몇 봉 전인지 (0=진행봉) */
  barsAgo?: number;
};

type RocketRow = NonNullable<AnalyzeResponse['structureRocketSignals']>[number];

function hitFromRow(best: RocketRow, barsAgo?: number): StructureRocketLastHit {
  const sl =
    typeof best.stopLoss === 'number' && Number.isFinite(best.stopLoss) && best.stopLoss > 0
      ? best.stopLoss
      : null;
  const ep =
    typeof best.entryPrice === 'number' && Number.isFinite(best.entryPrice) && best.entryPrice > 0
      ? best.entryPrice
      : null;
  return {
    direction: best.direction as 'LONG' | 'SHORT',
    stopLoss: sl,
    entryPrice: ep,
    source: typeof best.source === 'string' ? best.source : null,
    time: best.time,
    barsAgo,
  };
}

/**
 * 해당 TF analyze의 **마지막 캔들**에 그려지는 구조 로켓 행(방향·손절 포함).
 * `candles`는 /api/analyze 응답의 `visible` 캔들과 동일해야 함.
 */
export function structureRocketRowOnLastCandle(
  rockets: AnalyzeResponse['structureRocketSignals'] | undefined,
  candles: Array<{ time?: number }> | undefined,
  tf: string
): StructureRocketLastHit | null {
  if (!Array.isArray(candles) || candles.length === 0) return null;
  const last = candles[candles.length - 1];
  const lastT = typeof last?.time === 'number' && Number.isFinite(last.time) ? last.time : null;
  if (lastT == null) return null;
  const period = TF_PERIOD_SECONDS[tf] ?? 60;
  const rangeEnd = lastT + period;
  let bestT = -Infinity;
  let best: RocketRow | null = null;
  for (const r of rockets ?? []) {
    const dir = r?.direction;
    if (dir !== 'LONG' && dir !== 'SHORT') continue;
    const rt = typeof r.time === 'number' && Number.isFinite(r.time) ? r.time : NaN;
    if (!Number.isFinite(rt)) continue;
    if (lastT <= rt && rt < rangeEnd) {
      if (rt >= bestT) {
        bestT = rt;
        best = r;
      }
    }
  }
  if (!best || (best.direction !== 'LONG' && best.direction !== 'SHORT')) return null;
  return hitFromRow(best, 0);
}

/**
 * 후반영 로켓 — 최근 N봉(마감 우선)에 찍힌 구조 로켓.
 * 차트에 📉/🚀가 이미 마감된 봉에 뒤늦게 생기는 경우 대응.
 * `preferClosed`: true면 진행봉(마지막)보다 마감봉 히트를 우선.
 */
export function structureRocketRowOnRecentBars(
  rockets: AnalyzeResponse['structureRocketSignals'] | undefined,
  candles: Array<{ time?: number }> | undefined,
  tf: string,
  opts?: { lookbackBars?: number; preferClosed?: boolean }
): StructureRocketLastHit | null {
  if (!Array.isArray(candles) || candles.length === 0) return null;
  const lookback = Math.max(1, Math.min(8, opts?.lookbackBars ?? 4));
  const preferClosed = opts?.preferClosed !== false;
  const period = TF_PERIOD_SECONDS[tf] ?? 60;
  const n = candles.length;
  const from = Math.max(0, n - lookback);

  type Cand = { row: RocketRow; barsAgo: number; closed: boolean; t: number };
  const hits: Cand[] = [];

  for (let i = from; i < n; i++) {
    const barT = Number(candles[i]?.time);
    if (!Number.isFinite(barT)) continue;
    const rangeEnd = barT + period;
    const barsAgo = n - 1 - i;
    const closed = i < n - 1;
    for (const r of rockets ?? []) {
      const dir = r?.direction;
      if (dir !== 'LONG' && dir !== 'SHORT') continue;
      const rt = typeof r.time === 'number' && Number.isFinite(r.time) ? r.time : NaN;
      if (!Number.isFinite(rt)) continue;
      if (barT <= rt && rt < rangeEnd) {
        hits.push({ row: r, barsAgo, closed, t: rt });
      }
    }
  }
  if (!hits.length) return null;

  hits.sort((a, b) => {
    if (preferClosed && a.closed !== b.closed) return a.closed ? -1 : 1;
    if (a.t !== b.t) return b.t - a.t;
    return a.barsAgo - b.barsAgo;
  });

  const best = hits[0]!;
  if (best.row.direction !== 'LONG' && best.row.direction !== 'SHORT') return null;
  return hitFromRow(best.row, best.barsAgo);
}

/**
 * 해당 TF analyze의 **마지막 캔들**에 그려지는 구조 방향(롱 🚀 / 숏 ↓ HUD 기준).
 */
export function structureRocketDirectionOnLastCandle(
  rockets: AnalyzeResponse['structureRocketSignals'] | undefined,
  candles: Array<{ time?: number }> | undefined,
  tf: string
): 'LONG' | 'SHORT' | null {
  return structureRocketRowOnLastCandle(rockets, candles, tf)?.direction ?? null;
}
