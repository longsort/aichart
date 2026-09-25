/**
 * 15m 기관밴드1·2 정렬 + READY 이벤트 백테스트.
 * 스윕 2회는 합류 집계만(주문 본체 아님). 확정 수익 아님.
 */
import { chronologicalSplit, rejectShuffledSplit } from '@/lib/eagle1/chronologicalSplit';
import { EAGLE1_MIN_STAT_SAMPLE } from '@/lib/eagle1/noFakeNumbers';
import { detectStructureCausal, type Eagle1Bar } from '@/lib/eagle1/structureEngine';
import { computeTapMetrics, type TapMetricsPack } from '@/lib/eagle1Tapoint/metricsTap';
import { evaluateTapOverfitGuard } from '@/lib/eagle1Tapoint/overfitGuardTap';
import { buildInstitutionalBandTapPlan } from '@/lib/eagle1Tapoint/institutionalBandTapPlan';
import { governIdeaRisk, MAX_TOTAL_TRADE_RISK_PCT } from '@/lib/eagle1Tapoint/aiAutopilotRiskGovernor';
import {
  simulateTpSlEvent,
  SNIPER_EVENT_BT_FEE_FRAC,
  type EventPath,
  type EventSimResult,
} from '@/lib/eagle1Tapoint/sniperEventBacktester';
import { SWEEP_CONSEC_MAX_GAP } from '@/lib/eagle1Tapoint/sweepLiveSignalTap';
import type { Candle } from '@/types';

export const INST_BAND_15M_ENGINE_ID = 'INST_BAND_15M_PAPER' as const;
export const INST_BAND_15M_HORIZON = 16;
export const INST_BAND_15M_COOLDOWN = 12;

export type InstBand15mTrade = {
  engine: 'BAND12' | 'SWEEP2';
  index: number;
  time: number;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number;
  path: EventPath;
  netR: number;
  tpFirst: boolean;
  slFirst: boolean;
  status: string;
};

export type InstBand15mReport = {
  symbol: string;
  timeframe: '15m';
  bars: number;
  livePromote: false;
  noteKo: string;
  bandFireN: number;
  sweep2N: number;
  band: { n: number; ambiguousN: number; timeoutN: number; metrics: TapMetricsPack };
  sweep2: { n: number; tpN: number; slN: number; ambN: number; metrics: TapMetricsPack };
  holdout: { n: number; ambiguousN: number; timeoutN: number; metrics: TapMetricsPack };
  overfitOk: boolean;
  overfitNoteKo: string;
  maxRiskPct: typeof MAX_TOTAL_TRADE_RISK_PCT;
  waitCounts: Record<string, number>;
  trades: InstBand15mTrade[];
};

function toCandle(b: Eagle1Bar): Candle {
  return {
    time: Number(b.time),
    open: Number(b.open),
    high: Number(b.high),
    low: Number(b.low),
    close: Number(b.close),
    volume: Number(b.volume) || 0,
  };
}

function pack(rows: InstBand15mTrade[]): {
  n: number;
  ambiguousN: number;
  timeoutN: number;
  metrics: TapMetricsPack;
} {
  const scored = rows.filter((r) => r.path === 'TP' || r.path === 'SL');
  return {
    n: rows.length,
    ambiguousN: rows.filter((r) => r.path === 'AMBIGUOUS').length,
    timeoutN: rows.filter((r) => r.path === 'TIMEOUT').length,
    metrics: computeTapMetrics(
      scored.map((r) => ({
        netR: r.netR,
        tpFirst: r.tpFirst,
        slFirst: r.slFirst,
        mfe: 0,
        mae: 0,
      }))
    ),
  };
}

function asTrade(
  engine: InstBand15mTrade['engine'],
  t: number,
  time: number,
  dir: 'LONG' | 'SHORT',
  entry: number,
  sl: number,
  tp: number,
  sim: EventSimResult,
  status: string
): InstBand15mTrade {
  return {
    engine,
    index: t,
    time,
    direction: dir,
    entry,
    sl,
    tp,
    path: sim.path,
    netR: sim.netR,
    tpFirst: sim.tpFirst,
    slFirst: sim.slFirst,
    status,
  };
}

function sweep2At(bars: Eagle1Bar[], t: number): { dir: 'LONG' | 'SHORT'; eventId: string } | null {
  const st = detectStructureCausal(bars, t + 1);
  const sweeps = [...(st.events || [])]
    .filter((e) => String(e.kind).toUpperCase() === 'SWEEP')
    .map((e) => ({
      i: Number.isFinite(Number(e.known_at)) ? Number(e.known_at) : Number(e.index),
      bias: e.bias,
    }))
    .filter((e) => e.i >= 0 && e.i <= t)
    .sort((a, b) => a.i - b.i);
  if (sweeps.length < 2) return null;
  const newest = sweeps[sweeps.length - 1]!;
  if (newest.i !== t) return null;
  const prev = [...sweeps].reverse().find((s) => {
    if (s.bias !== newest.bias) return false;
    const g = t - s.i;
    return g >= 1 && g <= SWEEP_CONSEC_MAX_GAP;
  });
  if (!prev) return null;
  const dir: 'LONG' | 'SHORT' = newest.bias === 'bearish' ? 'SHORT' : 'LONG';
  return { dir, eventId: `sw2-${t}` };
}

export function runInstBand15mEventBacktest(params: {
  symbol: string;
  candles: Eagle1Bar[];
  equityUsdt?: number;
}): InstBand15mReport {
  const symbol = String(params.symbol || '').toUpperCase();
  const bars = params.candles || [];
  const equity = Math.max(50, Number(params.equityUsdt) || 1000);
  const waitCounts: Record<string, number> = {};
  const bandTrades: InstBand15mTrade[] = [];
  const sweepTrades: InstBand15mTrade[] = [];
  let lastBand = -9999;
  let lastSw = -9999;
  const tMax = bars.length - 2;

  for (let t = 80; t < tMax; t += 1) {
    const closed = bars.slice(0, t + 1);
    const last = closed[closed.length - 1];
    if (!last) continue;
    const prefix = closed.map(toCandle);
    const plan = buildInstitutionalBandTapPlan(prefix, '15m');
    const b1 = plan.band1Dir;
    const b2 = plan.band2Dir;
    const aligned = Boolean(b1 && b2 && b1 === b2);
    const tag = !aligned
      ? 'BAND_MISALIGN'
      : plan.actionable
        ? 'READY'
        : plan.status || 'WAIT';
    waitCounts[tag] = (waitCounts[tag] || 0) + 1;

    if (aligned && plan.actionable && plan.direction && plan.entry && plan.sl && plan.tp1) {
      const gov = governIdeaRisk({
        equityUsdt: equity,
        worstCaseLossUsdt: equity * 0.005,
        requestedRiskPct: 0.5,
        slWidenRequested: false,
      });
      if (gov.ok && t - lastBand >= INST_BAND_15M_COOLDOWN) {
        const sim = simulateTpSlEvent({
          bars,
          fromIndex: t + 1,
          direction: plan.direction,
          entry: plan.entry,
          sl: plan.sl,
          tp: plan.tp1,
          horizon: INST_BAND_15M_HORIZON,
          feeFrac: SNIPER_EVENT_BT_FEE_FRAC,
        });
        if (sim) {
          lastBand = t;
          bandTrades.push(
            asTrade(
              'BAND12',
              t,
              Number(last.time),
              plan.direction,
              plan.entry,
              plan.sl,
              plan.tp1,
              sim,
              plan.status
            )
          );
        }
      } else if (!gov.ok) {
        waitCounts['RISK5'] = (waitCounts['RISK5'] || 0) + 1;
      }
    }

    const sw = sweep2At(bars, t);
    if (sw && t - lastSw >= INST_BAND_15M_COOLDOWN) {
      const entry = Number(last.close);
      const sl =
        sw.dir === 'LONG' ? entry * (1 - 0.004) : entry * (1 + 0.004);
      const tp =
        sw.dir === 'LONG' ? entry * (1 + 0.004) : entry * (1 - 0.004);
      const sim = simulateTpSlEvent({
        bars,
        fromIndex: t + 1,
        direction: sw.dir,
        entry,
        sl,
        tp,
        horizon: INST_BAND_15M_HORIZON,
        feeFrac: SNIPER_EVENT_BT_FEE_FRAC,
      });
      if (sim) {
        lastSw = t;
        sweepTrades.push(
          asTrade('SWEEP2', t, Number(last.time), sw.dir, entry, sl, tp, sim, 'SWEEP2_CONFLUENCE')
        );
      }
    }
  }

  const split = chronologicalSplit(bandTrades.length);
  const bad = rejectShuffledSplit(split);
  const holdRows = split.holdout.map((i) => bandTrades[i]!).filter(Boolean);
  const hold = pack(holdRows);
  const overfit = evaluateTapOverfitGuard({
    inSampleOnly: hold.metrics.n < EAGLE1_MIN_STAT_SAMPLE,
    sampleN: hold.metrics.n,
  });
  const swPack = pack(sweepTrades);
  const noteKo = bad
    ? '분할 오류'
    : hold.metrics.n < EAGLE1_MIN_STAT_SAMPLE
      ? `OOS 통계 부족 (밴드 FIRE ${bandTrades.length} · OOS ${hold.metrics.n}) · LIVE 승격 안 함 · 스윕2는 합류집계 n=${sweepTrades.length}`
      : `OOS n=${hold.metrics.n} · Paper 유지 · 스윕2 n=${sweepTrades.length} (주문아님)`;

  return {
    symbol,
    timeframe: '15m',
    bars: bars.length,
    livePromote: false,
    noteKo,
    bandFireN: bandTrades.length,
    sweep2N: sweepTrades.length,
    band: pack(bandTrades),
    sweep2: {
      n: sweepTrades.length,
      tpN: sweepTrades.filter((r) => r.path === 'TP').length,
      slN: sweepTrades.filter((r) => r.path === 'SL').length,
      ambN: sweepTrades.filter((r) => r.path === 'AMBIGUOUS').length,
      metrics: swPack.metrics,
    },
    holdout: hold,
    overfitOk: overfit.ok && hold.metrics.n >= EAGLE1_MIN_STAT_SAMPLE,
    overfitNoteKo: overfit.noteKo,
    maxRiskPct: MAX_TOTAL_TRADE_RISK_PCT,
    waitCounts,
    trades: [...bandTrades, ...sweepTrades],
  };
}
