/**
 * Outcomes, first-touch (AMBIGUOUS if same bar unless lower TF resolves), MFE/MAE, time-to-target, EV.
 * Future bars used ONLY after T. Features never read these.
 */
import type { Eagle1Bar } from '@/lib/eagle1/structureEngine';
import { OUTCOME_HORIZONS, ROUND_TRIP_COST, type FirstTouchResult, type HorizonOutcome, type StoredCandle } from '@/lib/patternMemory/types';

function toBars(c: StoredCandle[]): Eagle1Bar[] {
  return c.map((x) => ({
    time: Math.floor(x.openTime / 1000),
    open: x.open,
    high: x.high,
    low: x.low,
    close: x.close,
    volume: x.baseVolume,
  }));
}

export function horizonOutcomes(candles: StoredCandle[], index: number): HorizonOutcome[] {
  const c0 = candles[index];
  if (!c0) return [];
  const px = c0.close;
  if (!(px > 0)) return [];
  const out: HorizonOutcome[] = [];
  for (const h of OUTCOME_HORIZONS) {
    const end = Math.min(candles.length - 1, index + h);
    if (end <= index) continue;
    let maxH = c0.close;
    let minL = c0.close;
    for (let i = index + 1; i <= end; i++) {
      maxH = Math.max(maxH, candles[i]!.high);
      minL = Math.min(minL, candles[i]!.low);
    }
    out.push({
      horizon: h,
      closeReturn: (candles[end]!.close - px) / px,
      maxHighReturn: (maxH - px) / px,
      maxLowReturn: (minL - px) / px,
    });
  }
  return out;
}

export type TouchPlan = { slAtr: number; tpAtr: number };

export const DEFAULT_PLANS: TouchPlan[] = [
  { slAtr: 1.0, tpAtr: 1.5 },
  { slAtr: 1.0, tpAtr: 2.0 },
  { slAtr: 1.2, tpAtr: 2.5 },
  { slAtr: 1.5, tpAtr: 3.0 },
];

function resolveSameBar(params: {
  direction: 'LONG' | 'SHORT';
  bar: Eagle1Bar;
  sl: number;
  tp: number;
  lower?: Eagle1Bar[];
}): FirstTouchResult {
  const { direction, bar, sl, tp, lower } = params;
  const hitSl = direction === 'LONG' ? bar.low <= sl : bar.high >= sl;
  const hitTp = direction === 'LONG' ? bar.high >= tp : bar.low <= tp;
  if (hitSl && hitTp) {
    if (lower && lower.length) {
      for (const b of lower) {
        const s = direction === 'LONG' ? b.low <= sl : b.high >= sl;
        const t = direction === 'LONG' ? b.high >= tp : b.low <= tp;
        if (s && t) return 'AMBIGUOUS';
        if (s) return 'SL';
        if (t) return 'TP';
      }
    }
    return 'AMBIGUOUS';
  }
  if (hitSl) return 'SL';
  if (hitTp) return 'TP';
  return 'NONE';
}

export type FirstTouchWalk = {
  result: FirstTouchResult;
  bars: number;
  mfe: number;
  mae: number;
  mfePct: number;
  maePct: number;
  netRGross: number;
  netRNet: number;
};

export function walkFirstTouch(params: {
  candles: StoredCandle[];
  index: number;
  direction: 'LONG' | 'SHORT';
  atr: number;
  plan: TouchPlan;
  horizon?: number;
  lowerTf?: StoredCandle[];
}): FirstTouchWalk {
  const { candles, index, direction, atr, plan } = params;
  const entry = candles[index]!.close;
  const risk = Math.max(atr * plan.slAtr, entry * 0.0008);
  const sl = direction === 'LONG' ? entry - risk : entry + risk;
  const tp = direction === 'LONG' ? entry + risk * (plan.tpAtr / plan.slAtr) : entry - risk * (plan.tpAtr / plan.slAtr);
  const horizon = params.horizon ?? 20;
  const bars = toBars(candles);
  let mfe = 0;
  let mae = 0;
  const end = Math.min(candles.length, index + 1 + horizon);
  for (let i = index + 1; i < end; i++) {
    const b = bars[i]!;
    if (direction === 'LONG') {
      mae = Math.max(mae, Math.max(0, entry - b.low) / risk);
      mfe = Math.max(mfe, Math.max(0, b.high - entry) / risk);
    } else {
      mae = Math.max(mae, Math.max(0, b.high - entry) / risk);
      mfe = Math.max(mfe, Math.max(0, entry - b.low) / risk);
    }
    const lower =
      params.lowerTf?.filter((x) => x.openTime >= candles[i]!.openTime && x.closeTime <= candles[i]!.closeTime).map((x) => ({
        time: Math.floor(x.openTime / 1000),
        open: x.open,
        high: x.high,
        low: x.low,
        close: x.close,
        volume: x.baseVolume,
      })) || undefined;
    const touch = resolveSameBar({ direction, bar: b, sl, tp, lower });
    if (touch === 'TP' || touch === 'SL' || touch === 'AMBIGUOUS') {
      const rr = plan.tpAtr / plan.slAtr;
      const gross = touch === 'TP' ? rr : touch === 'SL' ? -1 : 0;
      const costR = (ROUND_TRIP_COST * entry) / risk;
      return {
        result: touch,
        bars: i - index,
        mfe,
        mae,
        mfePct: (mfe * risk * 100) / entry,
        maePct: (mae * risk * 100) / entry,
        netRGross: gross,
        netRNet: gross - costR,
      };
    }
  }
  const costR = (ROUND_TRIP_COST * entry) / risk;
  return {
    result: 'NONE',
    bars: Math.max(0, end - index - 1),
    mfe,
    mae,
    mfePct: (mfe * risk * 100) / entry,
    maePct: (mae * risk * 100) / entry,
    netRGross: 0,
    netRNet: -costR,
  };
}

export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.floor((s.length - 1) * p)));
  return s[i]!;
}

export function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs: number[]): number | null {
  return percentile(xs, 0.5);
}

export type DistStats = {
  mean: number | null;
  median: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
};

export function distStats(xs: number[]): DistStats {
  return {
    mean: mean(xs),
    median: median(xs),
    p25: percentile(xs, 0.25),
    p50: percentile(xs, 0.5),
    p75: percentile(xs, 0.75),
    p90: percentile(xs, 0.9),
  };
}

export type TimeToTarget = {
  meanBars: number | null;
  medianBars: number | null;
  p25: number | null;
  p75: number | null;
  missRate: number | null;
  sample: number;
};

export function timeToTarget(rows: FirstTouchWalk[]): TimeToTarget {
  const hits = rows.filter((r) => r.result === 'TP');
  const miss = rows.filter((r) => r.result !== 'TP').length;
  const bars = hits.map((r) => r.bars);
  return {
    meanBars: mean(bars),
    medianBars: median(bars),
    p25: percentile(bars, 0.25),
    p75: percentile(bars, 0.75),
    missRate: rows.length ? miss / rows.length : null,
    sample: rows.length,
  };
}

export type PlanScore = {
  plan: TouchPlan;
  sampleCount: number;
  winRate: number | null;
  evGross: number | null;
  evNet: number | null;
  profitFactor: number | null;
  averageR: number | null;
  stability: number | null;
  mfe: number | null;
  mae: number | null;
};

export function scorePlans(walks: { plan: TouchPlan; walk: FirstTouchWalk }[]): PlanScore[] {
  const groups = new Map<string, { plan: TouchPlan; walks: FirstTouchWalk[] }>();
  for (const row of walks) {
    const k = `${row.plan.slAtr}:${row.plan.tpAtr}`;
    const g = groups.get(k) || { plan: row.plan, walks: [] };
    g.walks.push(row.walk);
    groups.set(k, g);
  }
  const out: PlanScore[] = [];
  for (const g of groups.values()) {
    const nets = g.walks.filter((w) => w.result !== 'AMBIGUOUS').map((w) => w.netRNet);
    const wins = nets.filter((x) => x > 0);
    const losses = nets.filter((x) => x < 0);
    const pf = losses.length ? Math.abs(wins.reduce((a, b) => a + b, 0) / losses.reduce((a, b) => a + b, 0)) : wins.length ? null : null;
    const half = Math.floor(nets.length / 2);
    const ev1 = mean(nets.slice(0, half));
    const ev2 = mean(nets.slice(half));
    const stability = ev1 != null && ev2 != null ? 1 - Math.min(1, Math.abs(ev1 - ev2) / (Math.abs(ev1) + Math.abs(ev2) + 0.2)) : null;
    const tp = g.walks.filter((w) => w.result === 'TP').length;
    const decided = g.walks.filter((w) => w.result === 'TP' || w.result === 'SL').length;
    out.push({
      plan: g.plan,
      sampleCount: g.walks.length,
      winRate: decided >= 30 ? tp / decided : null,
      evGross: mean(g.walks.map((w) => w.netRGross)),
      evNet: mean(nets),
      profitFactor: pf,
      averageR: mean(nets),
      stability,
      mfe: mean(g.walks.map((w) => w.mfe)),
      mae: mean(g.walks.map((w) => w.mae)),
    });
  }
  out.sort((a, b) => (b.evNet ?? -999) - (a.evNet ?? -999));
  return out;
}
