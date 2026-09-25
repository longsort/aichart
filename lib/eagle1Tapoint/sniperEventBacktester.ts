/**
 * SNIPER / QUICK SCALP 이벤트 백테스트.
 * 인과 prefix · 동일봉 TP+SL = AMBIGUOUS · 수수료 차감 · 시간순 split.
 * 승률 조작·LIVE 자동승격 없음. n<30 이면 숫자 대신 통계 부족.
 */
import { chronologicalSplit, rejectShuffledSplit } from '@/lib/eagle1/chronologicalSplit';
import { EAGLE1_MIN_STAT_SAMPLE } from '@/lib/eagle1/noFakeNumbers';
import { detectStructureCausal, type Eagle1Bar, type StructureSnapshot } from '@/lib/eagle1/structureEngine';
import { walkForwardBacktest } from '@/lib/eagle1/walkForwardBacktest';
import type { SetupOutcome } from '@/lib/eagle1/zoneExpectancy';
import { buildTapLiquidityMap } from '@/lib/eagle1Tapoint/liquidityMap';
import { computeTapMetrics, type TapMetricsPack } from '@/lib/eagle1Tapoint/metricsTap';
import { evaluateTapOverfitGuard } from '@/lib/eagle1Tapoint/overfitGuardTap';
import { evaluateQuickScalpAutoEngine } from '@/lib/eagle1Tapoint/quickScalpAutoEngine';
import { evaluateSniperScalpAutoEngine } from '@/lib/eagle1Tapoint/sniperScalpAutoEngine';

export const SNIPER_EVENT_BT_FEE_FRAC = 0.0008;
export const SNIPER_EVENT_BT_HORIZON = 20;
export const SNIPER_EVENT_BT_COOLDOWN = 8;

export type EventPath = 'TP' | 'SL' | 'AMBIGUOUS' | 'TIMEOUT';
export type EventEngineKind = 'SNIPER' | 'QUICK_SCALP';

export type EventSimResult = {
  path: EventPath;
  netR: number;
  mfe: number;
  mae: number;
  barsHeld: number;
  tpFirst: boolean;
  slFirst: boolean;
};

export type SniperEventTrade = {
  engine: EventEngineKind;
  symbol: string;
  timeframe: string;
  index: number;
  time: number;
  eventId: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number;
  grade: string;
  path: EventPath;
  netR: number;
  mfe: number;
  mae: number;
  barsHeld: number;
  tpFirst: boolean;
  slFirst: boolean;
};

export type SplitMetrics = {
  n: number;
  ambiguousN: number;
  timeoutN: number;
  metrics: TapMetricsPack;
};

export type SniperEventBacktestReport = {
  engine: EventEngineKind;
  symbol: string;
  timeframe: string;
  bars: number;
  fireN: number;
  noteKo: string;
  livePromote: false;
  train: SplitMetrics;
  validation: SplitMetrics;
  holdout: SplitMetrics;
  holdoutUsedForWeights: false;
  walkForwardLabel: string;
  walkForwardNote: string;
  overfitOk: boolean;
  overfitNoteKo: string;
  waitReasonCounts: Record<string, number>;
  gradeCounts: Record<string, number>;
  trades: SniperEventTrade[];
};

function dummyForming(bar: Eagle1Bar): Eagle1Bar {
  const px = Number(bar.close);
  return {
    time: Number(bar.time) + 1,
    open: px,
    high: px,
    low: px,
    close: px,
    volume: 0,
  };
}

export function htfEndExclusive(bars: Eagle1Bar[], asOfTime: number): number {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (Number(bars[mid]!.time) <= asOfTime) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function simulateTpSlEvent(params: {
  bars: Eagle1Bar[];
  fromIndex: number;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number;
  horizon?: number;
  feeFrac?: number;
}): EventSimResult | null {
  const { bars, direction, entry, sl, tp } = params;
  const from = Math.max(0, Math.floor(params.fromIndex));
  if (!(entry > 0) || !(sl > 0) || !(tp > 0)) return null;
  if (direction === 'LONG' && !(sl < entry && tp > entry)) return null;
  if (direction === 'SHORT' && !(sl > entry && tp < entry)) return null;
  const horizon = Math.max(1, Math.floor(params.horizon ?? SNIPER_EVENT_BT_HORIZON));
  const fee = entry * (params.feeFrac ?? SNIPER_EVENT_BT_FEE_FRAC);
  const risk = Math.abs(entry - sl);
  const denom = risk + fee;
  if (!(denom > 0)) return null;

  let mfe = 0;
  let mae = 0;
  const last = Math.min(bars.length - 1, from + horizon - 1);
  if (from >= bars.length || last < from) {
    return {
      path: 'TIMEOUT',
      netR: -fee / denom,
      mfe: 0,
      mae: 0,
      barsHeld: 0,
      tpFirst: false,
      slFirst: false,
    };
  }

  for (let j = from; j <= last; j++) {
    const b = bars[j]!;
    if (direction === 'LONG') {
      mfe = Math.max(mfe, (Number(b.high) - entry) / entry);
      mae = Math.max(mae, (entry - Number(b.low)) / entry);
      const hitSl = Number(b.low) <= sl;
      const hitTp = Number(b.high) >= tp;
      if (hitSl && hitTp) {
        return {
          path: 'AMBIGUOUS',
          netR: 0,
          mfe,
          mae,
          barsHeld: j - from + 1,
          tpFirst: false,
          slFirst: false,
        };
      }
      if (hitTp) {
        return {
          path: 'TP',
          netR: (Math.abs(tp - entry) - fee) / denom,
          mfe,
          mae,
          barsHeld: j - from + 1,
          tpFirst: true,
          slFirst: false,
        };
      }
      if (hitSl) {
        return {
          path: 'SL',
          netR: -(risk + fee) / denom,
          mfe,
          mae,
          barsHeld: j - from + 1,
          tpFirst: false,
          slFirst: true,
        };
      }
    } else {
      mfe = Math.max(mfe, (entry - Number(b.low)) / entry);
      mae = Math.max(mae, (Number(b.high) - entry) / entry);
      const hitSl = Number(b.high) >= sl;
      const hitTp = Number(b.low) <= tp;
      if (hitSl && hitTp) {
        return {
          path: 'AMBIGUOUS',
          netR: 0,
          mfe,
          mae,
          barsHeld: j - from + 1,
          tpFirst: false,
          slFirst: false,
        };
      }
      if (hitTp) {
        return {
          path: 'TP',
          netR: (Math.abs(tp - entry) - fee) / denom,
          mfe,
          mae,
          barsHeld: j - from + 1,
          tpFirst: true,
          slFirst: false,
        };
      }
      if (hitSl) {
        return {
          path: 'SL',
          netR: -(risk + fee) / denom,
          mfe,
          mae,
          barsHeld: j - from + 1,
          tpFirst: false,
          slFirst: true,
        };
      }
    }
  }

  const exit = Number(bars[last]!.close);
  const pnl = direction === 'LONG' ? exit - entry : entry - exit;
  return {
    path: 'TIMEOUT',
    netR: (pnl - fee) / denom,
    mfe,
    mae,
    barsHeld: last - from + 1,
    tpFirst: false,
    slFirst: false,
  };
}

function packSplit(rows: SniperEventTrade[]): SplitMetrics {
  const ambiguousN = rows.filter((r) => r.path === 'AMBIGUOUS').length;
  const timeoutN = rows.filter((r) => r.path === 'TIMEOUT').length;
  const scored = rows.filter((r) => r.path === 'TP' || r.path === 'SL');
  return {
    n: rows.length,
    ambiguousN,
    timeoutN,
    metrics: computeTapMetrics(
      scored.map((r) => ({
        netR: r.netR,
        tpFirst: r.tpFirst,
        slFirst: r.slFirst,
        mfe: r.mfe,
        mae: r.mae,
      }))
    ),
  };
}

function toSetupOutcomes(trades: SniperEventTrade[]): SetupOutcome[] {
  return trades
    .filter((t) => t.path === 'TP' || t.path === 'SL')
    .map((t) => ({
      family: 'sweep_reversal' as const,
      regime: 'RANGE',
      direction: t.direction,
      index: t.index,
      tpFirst: t.tpFirst,
      slFirst: t.slFirst,
      mfe: t.mfe,
      mae: t.mae,
      netR: t.netR,
      grossRr: Math.abs(t.tp - t.entry) / Math.max(Math.abs(t.entry - t.sl), 1e-9),
      reactionBars: t.barsHeld,
    }));
}

export function runSniperEventBacktest(params: {
  engine: EventEngineKind;
  symbol: string;
  timeframe: string;
  candles: Eagle1Bar[];
  structuresHtf?: Partial<Record<string, Eagle1Bar[]>>;
  stride?: number;
  cooldownBars?: number;
  horizon?: number;
  feeFrac?: number;
}): SniperEventBacktestReport {
  const bars = params.candles || [];
  const engine = params.engine;
  const symbol = String(params.symbol || '').toUpperCase();
  const timeframe = String(params.timeframe || '3m');
  const stride = Math.max(1, Math.floor(params.stride ?? 1));
  const cooldown = Math.max(1, Math.floor(params.cooldownBars ?? SNIPER_EVENT_BT_COOLDOWN));
  const horizon = Math.max(1, Math.floor(params.horizon ?? SNIPER_EVENT_BT_HORIZON));
  const feeFrac = params.feeFrac ?? SNIPER_EVENT_BT_FEE_FRAC;
  const trades: SniperEventTrade[] = [];
  const seen = new Set<string>();
  const waitReasonCounts: Record<string, number> = {};
  const gradeCounts: Record<string, number> = {};
  let lastFire = -9999;
  const h1 = params.structuresHtf?.['1H'] || params.structuresHtf?.['1h'] || [];
  const h4 = params.structuresHtf?.['4H'] || params.structuresHtf?.['4h'] || [];
  const d1 = params.structuresHtf?.['1D'] || params.structuresHtf?.['1d'] || [];
  const htfCache = new Map<string, StructureSnapshot>();

  const tMax = bars.length - 2;
  for (let t = 80; t < tMax; t += stride) {
    if (t - lastFire < cooldown) continue;
    const closed = bars.slice(0, t + 1);
    const last = closed[closed.length - 1];
    if (!last) continue;
    const structure = detectStructureCausal(bars, t + 1);
    const asOfTime = Number(last.time);
    const structures: Partial<Record<string, StructureSnapshot | null>> = {};
    const htfSnap = (tf: string, series: Eagle1Bar[]) => {
      if (!series.length) return;
      const end = htfEndExclusive(series, asOfTime);
      const key = `${tf}:${end}`;
      let snap = htfCache.get(key);
      if (!snap) {
        snap = detectStructureCausal(series, end);
        htfCache.set(key, snap);
      }
      structures[tf] = snap;
    };
    htfSnap('1H', h1);
    htfSnap('4H', h4);
    htfSnap('1D', d1);

    const engineBars = closed.concat(dummyForming(last));
    let fire = false;
    let direction: 'LONG' | 'SHORT' | null = null;
    let entry: number | null = null;
    let sl: number | null = null;
    let tp: number | null = null;
    let eventId = '';
    let grade = '';

    if (engine === 'SNIPER') {
      const liq = lastSweepLiquiditySafe(structure);
      const sn = evaluateSniperScalpAutoEngine({
        symbol,
        timeframe,
        candles: engineBars,
        structure,
        structures,
        liqBelow: liq.ssl,
        liqAbove: liq.bsl,
        qualityOk: true,
      });
      fire = Boolean(sn.fire && sn.direction && sn.entry && sn.executionSl && sn.tp);
      direction = sn.direction;
      entry = sn.entry;
      sl = sn.executionSl;
      tp = sn.tp;
      eventId = sn.eventId || `sn-${t}`;
      grade = sn.grade;
      waitReasonCounts[sn.waitReason] = (waitReasonCounts[sn.waitReason] || 0) + 1;
      gradeCounts[sn.grade] = (gradeCounts[sn.grade] || 0) + 1;
    } else {
      const liqMap = buildTapLiquidityMap({
        price: Number(last.close),
        structure,
        bars: closed,
      });
      const qs = evaluateQuickScalpAutoEngine({
        symbol,
        timeframe,
        candles: engineBars,
        structure,
        liqMap,
        qualityOk: true,
      });
      fire = Boolean(qs.autoReady && qs.direction && qs.entry && qs.sl && qs.tp);
      direction = qs.direction;
      entry = qs.entry;
      sl = qs.sl;
      tp = qs.tp;
      eventId = qs.eventId || `qs-${t}`;
      grade = qs.grade;
      waitReasonCounts[qs.waitReason] = (waitReasonCounts[qs.waitReason] || 0) + 1;
      gradeCounts[qs.grade] = (gradeCounts[qs.grade] || 0) + 1;
    }

    if (!fire || !direction || entry == null || sl == null || tp == null) continue;
    const key = `${engine}-${eventId}-${direction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sim = simulateTpSlEvent({
      bars,
      fromIndex: t + 1,
      direction,
      entry,
      sl,
      tp,
      horizon,
      feeFrac,
    });
    if (!sim) continue;
    lastFire = t;
    trades.push({
      engine,
      symbol,
      timeframe,
      index: t,
      time: asOfTime,
      eventId,
      direction,
      entry,
      sl,
      tp,
      grade,
      path: sim.path,
      netR: sim.netR,
      mfe: sim.mfe,
      mae: sim.mae,
      barsHeld: sim.barsHeld,
      tpFirst: sim.tpFirst,
      slFirst: sim.slFirst,
    });
  }

  const split = chronologicalSplit(trades.length);
  const bad = rejectShuffledSplit(split);
  const train = packSplit(split.train.map((i) => trades[i]!).filter(Boolean));
  const validation = packSplit(split.validation.map((i) => trades[i]!).filter(Boolean));
  const holdout = packSplit(split.holdout.map((i) => trades[i]!).filter(Boolean));
  const wf = walkForwardBacktest(toSetupOutcomes(trades));
  const overfit = evaluateTapOverfitGuard({
    inSampleOnly: holdout.n < EAGLE1_MIN_STAT_SAMPLE,
    sampleN: holdout.metrics.n,
  });
  const noteKo = bad
    ? '분할 오류 · 결과 폐기'
    : holdout.metrics.labelKo === '통계 부족'
      ? `OOS 통계 부족 (FIRE ${trades.length} · OOS 청산표본 ${holdout.metrics.n}) · LIVE 승격 안 함 · 70% 아님`
      : `OOS n=${holdout.metrics.n} · TP-first는 청산표본만 · Paper 유지 · LIVE 자동승격 없음`;

  return {
    engine,
    symbol,
    timeframe,
    bars: bars.length,
    fireN: trades.length,
    noteKo,
    livePromote: false,
    train,
    validation,
    holdout,
    holdoutUsedForWeights: false,
    walkForwardLabel: wf.label,
    walkForwardNote: wf.note,
    overfitOk: overfit.ok && holdout.metrics.n >= EAGLE1_MIN_STAT_SAMPLE,
    overfitNoteKo: overfit.noteKo,
    waitReasonCounts,
    gradeCounts,
    trades,
  };
}

function lastSweepLiquiditySafe(st: StructureSnapshot | null): { ssl: number | null; bsl: number | null } {
  const list = st?.events || [];
  const ssl = [...list].reverse().find((e) => e.kind === 'SWEEP' && e.bias === 'bullish');
  const bsl = [...list].reverse().find((e) => e.kind === 'SWEEP' && e.bias === 'bearish');
  return { ssl: ssl?.level ?? null, bsl: bsl?.level ?? null };
}
