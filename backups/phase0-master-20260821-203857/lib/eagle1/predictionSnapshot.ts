/**
 * Confirmed prediction freeze. Future candles may add outcome only.
 */
import { EAGLE1_ENGINE_VERSION } from '@/lib/eagle1/rawTypes';
import type { Eagle1Bar } from './structureEngine';
import type { Eagle1MainPlan } from './signalEngine';
import type { SetupOutcome } from './zoneExpectancy';
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';

export type Eagle1FrozenPrediction = {
  signal_id: string;
  timestamp: number;
  engine_version: string;
  price: number;
  timeframe: string;
  symbol: string;
  features: Record<string, unknown>;
  poc: number | null;
  zones: Array<{ id: string; lower: number; upper: number }>;
  scores: { long: number; short: number; confidence: number };
  entry: number | null;
  sl: number | null;
  tp: [number | null, number | null, number | null];
  reasons: string[];
  invalidation: string | null;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  status: string;
};

export type Eagle1OutcomeRecord = {
  signal_id: string;
  mfe: number | null;
  mae: number | null;
  result: 'open' | 'tp' | 'sl' | 'invalid' | 'expired';
  netR?: number | null;
  updated_at: number;
};

export type Eagle1SnapshotStats = {
  sampleSize: number;
  closedN: number;
  tpBeforeSlRate: number | null;
  slFirstRate: number | null;
  medianMfe: number | null;
  medianMae: number | null;
  netExpectancy: number | null;
  label: '통계 부족' | '검증확률';
  note: string;
};

export function freezePrediction(input: Omit<Eagle1FrozenPrediction, 'engine_version' | 'status'> & { engine_version?: string; status?: string }): Eagle1FrozenPrediction {
  const row: Eagle1FrozenPrediction = {
    ...input,
    engine_version: input.engine_version || EAGLE1_ENGINE_VERSION,
    status: input.status || input.direction,
    zones: input.zones.map((z) => ({ ...z })),
    scores: { ...input.scores },
    tp: [...input.tp],
    reasons: [...input.reasons],
    features: { ...input.features },
  };
  return Object.freeze(row) as Eagle1FrozenPrediction;
}

export function attachOutcome(
  prediction: Eagle1FrozenPrediction,
  outcome: Omit<Eagle1OutcomeRecord, 'signal_id'>
): { prediction: Eagle1FrozenPrediction; outcome: Eagle1OutcomeRecord } {
  return {
    prediction,
    outcome: {
      signal_id: prediction.signal_id,
      netR: outcome.netR ?? null,
      ...outcome,
    },
  };
}

export function predictionsEqualFrozen(a: Eagle1FrozenPrediction, b: Eagle1FrozenPrediction): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function planDirection(plan: Eagle1MainPlan): 'LONG' | 'SHORT' | 'WAIT' {
  if (plan.status === 'WAIT') return 'WAIT';
  if (plan.direction === 'LONG' || plan.direction === 'SHORT') return plan.direction;
  if (plan.status === 'CONFIRMED_LONG' || plan.status === 'LONG_WATCH' || plan.status === 'LONG_MISSED') return 'LONG';
  if (plan.status === 'CONFIRMED_SHORT' || plan.status === 'SHORT_WATCH' || plan.status === 'SHORT_MISSED') return 'SHORT';
  return 'WAIT';
}

export function freezeFromPlan(params: {
  candles: Eagle1Bar[];
  endExclusive?: number;
  timeframe: string;
  symbol?: string;
  mainPlan: Eagle1MainPlan;
  poc?: number | null;
  zones?: Array<{ zone_id?: string; id?: string; lower: number; upper: number }>;
  features?: Record<string, unknown>;
}): Eagle1FrozenPrediction {
  const n = Math.min(params.candles.length, params.endExclusive ?? params.candles.length);
  const last = params.candles[n - 1];
  const plan = params.mainPlan;
  const entry =
    plan.entryLow != null && plan.entryHigh != null ? (plan.entryLow + plan.entryHigh) / 2 : plan.entryLow;
  return freezePrediction({
    signal_id: `${params.symbol ?? 'BTCUSDT'}:${params.timeframe}:${last?.time ?? 0}:${n}`,
    timestamp: last?.time ?? 0,
    price: last?.close ?? 0,
    timeframe: params.timeframe,
    symbol: params.symbol ?? 'BTCUSDT',
    features: { ...(params.features ?? {}), freezeIndex: n - 1 },
    poc: params.poc ?? null,
    zones: (params.zones ?? []).slice(0, 12).map((z) => ({
      id: String(z.zone_id || z.id || ''),
      lower: z.lower,
      upper: z.upper,
    })),
    scores: {
      long: plan.longScore,
      short: plan.shortScore,
      confidence: plan.sampleSize,
    },
    entry: entry ?? null,
    sl: plan.sl,
    tp: [plan.tp1, plan.tp2, plan.tp3],
    reasons: [...(plan.reasons ?? [])],
    invalidation: plan.invalidation,
    direction: planDirection(plan),
    status: plan.status,
  });
}

export function formatEagle1SnapshotClock(ts: number | null | undefined): string {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return '데이터 없음';
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime()) || d.getUTCFullYear() < 2015) return '데이터 없음';
  return d.toLocaleString('ko-KR');
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Future bars only (index > freezeIndex). Never writes back into the frozen prediction. */
export function resolvePredictionOutcome(params: {
  prediction: Eagle1FrozenPrediction;
  candles: Eagle1Bar[];
  freezeIndex: number;
  horizon?: number;
}): Eagle1OutcomeRecord {
  const pred = params.prediction;
  const freezeIndex = Math.max(0, Math.floor(params.freezeIndex));
  const horizon = params.horizon ?? 24;
  const updated_at = params.candles[Math.min(params.candles.length, freezeIndex + 1 + horizon) - 1]?.time ?? pred.timestamp;
  if (pred.direction === 'WAIT' || pred.entry == null || pred.sl == null || pred.tp[0] == null) {
    const remaining = params.candles.length - freezeIndex - 1;
    return {
      signal_id: pred.signal_id,
      mfe: null,
      mae: null,
      result: remaining >= horizon ? 'expired' : 'open',
      netR: null,
      updated_at,
    };
  }
  const entry = pred.entry;
  const sl = pred.sl;
  const tp = pred.tp[0];
  const risk = Math.abs(entry - sl) || 1;
  let mfe = 0;
  let mae = 0;
  let result: Eagle1OutcomeRecord['result'] = 'open';
  const end = Math.min(params.candles.length, freezeIndex + 1 + horizon);
  for (let i = freezeIndex + 1; i < end; i++) {
    const b = params.candles[i]!;
    if (pred.direction === 'LONG') {
      mae = Math.max(mae, Math.max(0, entry - b.low) / risk);
      mfe = Math.max(mfe, Math.max(0, b.high - entry) / risk);
      const hitSl = b.low <= sl;
      const hitTp = b.high >= tp;
      if (hitSl && hitTp) {
        result = 'sl';
        break;
      }
      if (hitSl) {
        result = 'sl';
        break;
      }
      if (hitTp) {
        result = 'tp';
        break;
      }
    } else {
      mae = Math.max(mae, Math.max(0, b.high - entry) / risk);
      mfe = Math.max(mfe, Math.max(0, entry - b.low) / risk);
      const hitSl = b.high >= sl;
      const hitTp = b.low <= tp;
      if (hitSl && hitTp) {
        result = 'sl';
        break;
      }
      if (hitSl) {
        result = 'sl';
        break;
      }
      if (hitTp) {
        result = 'tp';
        break;
      }
    }
  }
  if (result === 'open' && params.candles.length - freezeIndex - 1 >= horizon) result = 'expired';
  const netR = result === 'tp' ? mfe - 0.04 : result === 'sl' ? -mae - 0.04 : null;
  return {
    signal_id: pred.signal_id,
    mfe,
    mae,
    result,
    netR,
    updated_at,
  };
}

export function incrementalSnapshotStats(outcomes: Eagle1OutcomeRecord[]): Eagle1SnapshotStats {
  const closed = outcomes.filter((o) => o.result === 'tp' || o.result === 'sl');
  const n = closed.length;
  const empty = (note: string): Eagle1SnapshotStats => ({
    sampleSize: n,
    closedN: n,
    tpBeforeSlRate: null,
    slFirstRate: null,
    medianMfe: null,
    medianMae: null,
    netExpectancy: null,
    label: '통계 부족',
    note,
  });
  if (n < EAGLE1_MIN_STAT_SAMPLE) {
    return empty(n <= 0 ? '데이터 없음' : '통계 부족');
  }
  const tp = closed.filter((o) => o.result === 'tp').length;
  const sl = closed.filter((o) => o.result === 'sl').length;
  const nets = closed.map((o) => o.netR).filter((x): x is number => x != null);
  return {
    sampleSize: n,
    closedN: n,
    tpBeforeSlRate: tp / n,
    slFirstRate: sl / n,
    medianMfe: median(closed.map((o) => o.mfe ?? 0)),
    medianMae: median(closed.map((o) => o.mae ?? 0)),
    netExpectancy: nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : null,
    label: '검증확률',
    note: `표본 ${n}`,
  };
}

/** Past setup outcomes → incremental catalog. No shuffle. n<30 hides rates. */
export function incrementalStatsFromSetupOutcomes(rows: SetupOutcome[]): Eagle1SnapshotStats {
  const ordered = [...rows].sort((a, b) => a.index - b.index);
  const asOutcomes: Eagle1OutcomeRecord[] = ordered.map((r, i) => ({
    signal_id: `setup:${r.index}:${i}`,
    mfe: r.mfe,
    mae: r.mae,
    result: r.tpFirst ? 'tp' : r.slFirst ? 'sl' : 'expired',
    netR: r.netR,
    updated_at: r.index,
  }));
  return incrementalSnapshotStats(asOutcomes);
}
