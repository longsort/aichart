/**
 * Setup-family expectancy from causal prefix replay. No shuffle, no future bars at T.
 * Live RR gates stay 1.8 / 2.5 / 3.0 until walk-forward evidence is strong enough.
 *
 * PHASE 12: SetupOutcome → immutable HistoricalEventRecord via
 * `setupOutcomeToHistoricalEvent` in `./historicalEventStore` (outcome MFE/MAE stays in outcome layer).
 */

import { atrAt, detectStructureCausal, type Eagle1Bar } from './structureEngine';
import { detectZonesCausal, type Eagle1Zone } from './zoneEngine';
import { chronologicalSplit } from './chronologicalSplit';

export type SetupFamily =
  | 'poc_hold'
  | 'poc_reclaim'
  | 'ob_retest'
  | 'fvg_retest'
  | 'sweep_reversal'
  | 'pullback';

export type SetupOutcome = {
  family: SetupFamily;
  regime: string;
  direction: 'LONG' | 'SHORT';
  index: number;
  tpFirst: boolean;
  slFirst: boolean;
  mfe: number;
  mae: number;
  netR: number;
  /** Favorable excursion as % of entry. Optional — older stored rows may omit. */
  mfePct?: number;
  maePct?: number;
  /** Bars until TP/SL or horizon end. */
  reactionBars?: number;
  /** |TP-entry| / |entry-SL| on the prefix — used only for RR walk-forward. */
  grossRr: number;
};

export type FamilyStats = {
  family: SetupFamily;
  sampleSize: number;
  tpBeforeSlRate: number | null;
  slFirstRate: number | null;
  medianMfe: number | null;
  medianMae: number | null;
  netExpectancy: number | null;
};

export type RrGateRow = {
  gate: number;
  holdoutN: number;
  netEv: number | null;
};

export type RrWalkForward = {
  defaultMin: number;
  recommendedMin: number;
  /** Never true in this build — live riskEngine constants stay put. */
  applied: false;
  holdoutN: number;
  evByGate: RrGateRow[];
  reason: string;
};

export type ExpectancyCatalog = {
  symbol: string;
  timeframe: string;
  families: FamilyStats[];
  holdoutCalibrationError: number | null;
  rrWalkForward: RrWalkForward;
  calculated_at: number;
  bar_count: number;
};

const MIN_STAT = 30;
const DEFAULT_RR_MIN = 1.8;
const RR_EV_LIFT = 0.05;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function nearZone(bar: Eagle1Bar, z: Eagle1Zone | undefined, atr: number): boolean {
  if (!z) return false;
  const pad = Math.max(atr * 0.25, 0);
  return bar.high >= z.lower - pad && bar.low <= z.upper + pad;
}

export function classifyFamily(params: {
  structureState: string;
  pocState: string;
  nearPoc: boolean;
  inOb: boolean;
  inFvg: boolean;
  recentSweep: boolean;
}): SetupFamily {
  if (params.recentSweep) return 'sweep_reversal';
  if (params.inFvg) return 'fvg_retest';
  if (params.inOb) return 'ob_retest';
  if (params.pocState === 'RECLAIMED' || params.pocState === 'CLOSED_ABOVE' || params.pocState === 'CLOSED_BELOW') {
    return 'poc_reclaim';
  }
  if (
    params.nearPoc ||
    params.pocState === 'APPROACH' ||
    params.pocState === 'RETEST' ||
    params.pocState === 'HOLD_SUCCESS'
  ) {
    return 'poc_hold';
  }
  if (params.structureState === 'SWEEP' || params.structureState === 'SHIFT') return 'sweep_reversal';
  return 'pullback';
}

function simulateForward(params: {
  candles: Eagle1Bar[];
  start: number;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number;
  horizon: number;
}): { tpFirst: boolean; slFirst: boolean; mfe: number; mae: number; netR: number; mfePct: number; maePct: number; reactionBars: number } {
  const { candles, start, direction, entry, sl, tp, horizon } = params;
  const risk = Math.abs(entry - sl) || 1;
  let mfe = 0;
  let mae = 0;
  let tpFirst = false;
  let slFirst = false;
  let reactionBars = 0;
  const end = Math.min(candles.length, start + 1 + horizon);
  for (let i = start + 1; i < end; i++) {
    const b = candles[i]!;
    if (direction === 'LONG') {
      mae = Math.max(mae, Math.max(0, entry - b.low) / risk);
      mfe = Math.max(mfe, Math.max(0, b.high - entry) / risk);
      const hitSl = b.low <= sl;
      const hitTp = b.high >= tp;
      if (hitSl && hitTp) {
        slFirst = true;
        reactionBars = i - start;
        break;
      }
      if (hitSl) {
        slFirst = true;
        reactionBars = i - start;
        break;
      }
      if (hitTp) {
        tpFirst = true;
        reactionBars = i - start;
        break;
      }
    } else {
      mae = Math.max(mae, Math.max(0, b.high - entry) / risk);
      mfe = Math.max(mfe, Math.max(0, entry - b.low) / risk);
      const hitSl = b.high >= sl;
      const hitTp = b.low <= tp;
      if (hitSl && hitTp) {
        slFirst = true;
        reactionBars = i - start;
        break;
      }
      if (hitSl) {
        slFirst = true;
        reactionBars = i - start;
        break;
      }
      if (hitTp) {
        tpFirst = true;
        reactionBars = i - start;
        break;
      }
    }
  }
  if (!reactionBars) reactionBars = Math.max(0, end - start - 1);
  const netR = tpFirst ? mfe - 0.04 : slFirst ? -mae - 0.04 : 0;
  const mfePct = entry > 0 ? (mfe * risk * 100) / entry : 0;
  const maePct = entry > 0 ? (mae * risk * 100) / entry : 0;
  return { tpFirst, slFirst, mfe, mae, netR, mfePct, maePct, reactionBars };
}

function harvestRareEnds(params: {
  candles: Eagle1Bar[];
  t: number;
  stride: number;
  start: number;
  last: number;
  structure: ReturnType<typeof detectStructureCausal>;
  poc: number | null;
}): number[] {
  const { candles, t, stride, start, last, structure, poc } = params;
  const lo = Math.max(start, t - stride);
  const extra: number[] = [];
  let sweepN = 0;
  for (const e of structure.events) {
    if (e.kind !== 'SWEEP') continue;
    if (e.known_at < lo || e.known_at >= t) continue;
    const endEx = e.known_at + 1;
    if (endEx >= start && endEx < last && endEx !== t) {
      extra.push(endEx);
      sweepN += 1;
      if (sweepN >= 2) break;
    }
  }
  const atr = atrAt(candles, t) || 0;
  if (poc != null && atr > 0) {
    let holdN = 0;
    let recN = 0;
    for (let i = lo; i < t; i++) {
      const bar = candles[i];
      const prev = candles[i - 1];
      if (!bar) continue;
      const endEx = i + 1;
      if (endEx === t || endEx < start || endEx >= last) continue;
      if (holdN < 1 && Math.abs(bar.close - poc) <= atr * 0.55) {
        extra.push(endEx);
        holdN += 1;
      }
      if (prev && recN < 1 && ((prev.close < poc && bar.close > poc) || (prev.close > poc && bar.close < poc))) {
        extra.push(endEx);
        recN += 1;
      }
      if (holdN >= 1 && recN >= 1 && sweepN >= 2) break;
    }
  }
  return extra;
}

function sampleAt(params: {
  candles: Eagle1Bar[];
  endExclusive: number;
  swingLeft: number;
  horizon: number;
  harvest?: { stride: number; start: number; last: number };
}): { outcome: SetupOutcome | null; harvest: number[] } {
  const { candles, endExclusive: t, swingLeft, horizon } = params;
  const structure = detectStructureCausal(candles, t, swingLeft);
  const zones = detectZonesCausal({ candles, timeframe: 'walk', structure, endExclusive: t });
  const harvest = params.harvest
    ? harvestRareEnds({
        candles,
        t,
        stride: params.harvest.stride,
        start: params.harvest.start,
        last: params.harvest.last,
        structure,
        poc: zones.profile.poc,
      })
    : [];
  const lastBar = candles[t - 1];
  if (!lastBar) return { outcome: null, harvest };
  const atr = atrAt(candles, t) || lastBar.close * 0.002;
  const locHigh = Math.max(...candles.slice(Math.max(0, t - 20), t).map((c) => c.high));
  const locLow = Math.min(...candles.slice(Math.max(0, t - 20), t).map((c) => c.low));
  const span = locHigh - locLow;
  if (!(span > 0)) return { outcome: null, harvest };
  const pos = (lastBar.close - locLow) / span;
  const preferLong =
    pos < 0.45 || (structure.state === 'SHIFT' && structure.events.slice(-1)[0]?.bias === 'bullish');
  const shift = [...structure.events].reverse().find((e) => e.kind === 'CHOCH' || e.kind === 'BOS');
  const direction: 'LONG' | 'SHORT' =
    shift?.bias === 'bearish' ? 'SHORT' : shift?.bias === 'bullish' ? 'LONG' : preferLong ? 'LONG' : 'SHORT';
  const ob = zones.zones.find((z) => z.source_type === 'ob' && z.bias === (direction === 'LONG' ? 'bullish' : 'bearish'));
  const fvg = zones.zones.find((z) => z.source_type === 'fvg' && z.bias === (direction === 'LONG' ? 'bullish' : 'bearish'));
  const poc = zones.profile.poc;
  const nearPoc = poc != null && Math.abs(lastBar.close - poc) <= atr * 0.6;
  const recentSweep = structure.events.some((e) => e.kind === 'SWEEP' && e.known_at >= t - 2);
  const family = classifyFamily({
    structureState: structure.state,
    pocState: zones.profile.pocState,
    nearPoc,
    inOb: nearZone(lastBar, ob, atr),
    inFvg: nearZone(lastBar, fvg, atr),
    recentSweep,
  });
  const entry = lastBar.close;
  const sl =
    direction === 'LONG'
      ? structure.lastSwingLow?.price ?? lastBar.low
      : structure.lastSwingHigh?.price ?? lastBar.high;
  const tp =
    direction === 'LONG'
      ? structure.lastSwingHigh?.price ?? lastBar.high
      : structure.lastSwingLow?.price ?? lastBar.low;
  if (direction === 'LONG' && !(tp > entry && sl < entry)) return { outcome: null, harvest };
  if (direction === 'SHORT' && !(tp < entry && sl > entry)) return { outcome: null, harvest };
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  if (!(risk > 0)) return { outcome: null, harvest };
  const sim = simulateForward({ candles, start: t - 1, direction, entry, sl, tp, horizon });
  return {
    harvest,
    outcome: {
      family,
      regime: structure.regime,
      direction,
      index: t - 1,
      grossRr: reward / risk,
      ...sim,
    },
  };
}

export function walkSetupOutcomes(params: {
  candles: Eagle1Bar[];
  stride?: number;
  horizon?: number;
  maxPrefixes?: number;
  swingLeft?: number;
}): SetupOutcome[] {
  const candles = params.candles;
  const stride = Math.max(8, params.stride ?? 24);
  const horizon = params.horizon ?? 24;
  const swingLeft = params.swingLeft ?? 3;
  const maxPrefixes = params.maxPrefixes ?? 80;
  const out: SetupOutcome[] = [];
  if (candles.length < 80) return out;
  const start = 60;
  const last = candles.length - horizon - 2;
  const indices: number[] = [];
  for (let i = start; i < last; i += stride) indices.push(i);
  const picked = indices.length > maxPrefixes ? indices.slice(-maxPrefixes) : indices;
  const seen = new Set<number>();
  const extra: number[] = [];
  for (const t of picked) {
    if (seen.has(t)) continue;
    seen.add(t);
    const { outcome, harvest } = sampleAt({
      candles,
      endExclusive: t,
      swingLeft,
      horizon,
      harvest: { stride, start, last },
    });
    if (outcome) out.push(outcome);
    for (const h of harvest) extra.push(h);
  }
  for (const t of extra) {
    if (seen.has(t) || t < start || t >= last) continue;
    if (out.length >= maxPrefixes * 2) break;
    seen.add(t);
    const { outcome } = sampleAt({ candles, endExclusive: t, swingLeft, horizon });
    if (outcome) out.push(outcome);
  }
  return out;
}

export function summarizeFamilies(rows: SetupOutcome[]): FamilyStats[] {
  const names: SetupFamily[] = ['poc_hold', 'poc_reclaim', 'ob_retest', 'fvg_retest', 'sweep_reversal', 'pullback'];
  return names.map((family) => {
    const xs = rows.filter((r) => r.family === family);
    const n = xs.length;
    const tp = xs.filter((r) => r.tpFirst).length;
    const sl = xs.filter((r) => r.slFirst).length;
    return {
      family,
      sampleSize: n,
      tpBeforeSlRate: n >= MIN_STAT ? tp / n : null,
      slFirstRate: n >= MIN_STAT ? sl / n : null,
      medianMfe: n >= MIN_STAT ? median(xs.map((r) => r.mfe)) : null,
      medianMae: n >= MIN_STAT ? median(xs.map((r) => r.mae)) : null,
      netExpectancy: n >= MIN_STAT ? xs.reduce((a, r) => a + r.netR, 0) / n : null,
    };
  });
}

export function pickFamilyStats(catalog: ExpectancyCatalog | null | undefined, family: SetupFamily): FamilyStats | null {
  return catalog?.families.find((f) => f.family === family) ?? null;
}

export function calibrationError(rows: SetupOutcome[]): number | null {
  if (rows.length < MIN_STAT) return null;
  const split = chronologicalSplit(rows.length);
  const train = split.train.map((i) => rows[i]!).filter(Boolean);
  const hold = split.holdout.map((i) => rows[i]!).filter(Boolean);
  if (train.length < MIN_STAT || hold.length < 10) return null;
  const pTrain = train.filter((r) => r.tpFirst).length / train.length;
  const pHold = hold.filter((r) => r.tpFirst).length / hold.length;
  return Math.abs(pTrain - pHold);
}

/**
 * Compare net EV on chronological holdout at RR floors.
 * Does not mutate live EAGLE1_RR_* constants.
 */
export function walkForwardRrGates(rows: SetupOutcome[]): RrWalkForward {
  const gates = [1.5, 1.8, 2.0, 2.2, 2.5];
  const split = chronologicalSplit(rows.length);
  const hold = split.holdout.map((i) => rows[i]!).filter(Boolean);
  const evByGate: RrGateRow[] = gates.map((gate) => {
    const xs = hold.filter((r) => r.grossRr >= gate);
    const n = xs.length;
    return {
      gate,
      holdoutN: n,
      netEv: n >= MIN_STAT ? xs.reduce((a, r) => a + r.netR, 0) / n : null,
    };
  });
  const base = evByGate.find((r) => r.gate === DEFAULT_RR_MIN);
  let recommendedMin = DEFAULT_RR_MIN;
  let reason = '홀드아웃 근거 부족 — 기본 1.8 유지, 실전 게이트 미변경';
  if (base?.netEv != null) {
    let best = base;
    for (const row of evByGate) {
      if (row.netEv != null && row.holdoutN >= MIN_STAT && row.netEv > (best.netEv ?? -Infinity) + 1e-12) {
        best = row;
      }
    }
    if (
      best.gate !== DEFAULT_RR_MIN &&
      best.netEv != null &&
      best.netEv > 0 &&
      base.netEv != null &&
      best.netEv >= base.netEv + RR_EV_LIFT
    ) {
      recommendedMin = best.gate;
      reason = `홀드아웃 EV ${best.netEv.toFixed(3)} ≥ 기본 ${base.netEv.toFixed(3)}+0.05 — 권고만, 실전 1.8 미적용`;
    } else {
      reason = '홀드아웃 EV 개선 미달 — 기본 1.8 유지';
    }
  }
  return {
    defaultMin: DEFAULT_RR_MIN,
    recommendedMin,
    applied: false,
    holdoutN: hold.length,
    evByGate,
    reason,
  };
}

export function buildExpectancyCatalog(params: {
  candles: Eagle1Bar[];
  symbol: string;
  timeframe: string;
  stride?: number;
  maxPrefixes?: number;
}): ExpectancyCatalog {
  const rows = walkSetupOutcomes({
    candles: params.candles,
    stride: params.stride,
    maxPrefixes: params.maxPrefixes,
  });
  return {
    symbol: params.symbol,
    timeframe: params.timeframe,
    families: summarizeFamilies(rows),
    holdoutCalibrationError: calibrationError(rows),
    rrWalkForward: walkForwardRrGates(rows),
    calculated_at: Date.now(),
    bar_count: params.candles.length,
  };
}
