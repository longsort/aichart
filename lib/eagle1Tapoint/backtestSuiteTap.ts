/**
 * §29 백테스트 패밀리 A–H 독립 비교 + §31 WF 연결.
 * 인과 endExclusive · 미래봉 금지 · 가짜 승률 금지.
 */
import { detectStructureCausal, atrAt, type Eagle1Bar } from '@/lib/eagle1/structureEngine';
import { walkForwardBacktest } from '@/lib/eagle1/walkForwardBacktest';
import type { SetupOutcome } from '@/lib/eagle1/zoneExpectancy';
import { computeTapMetrics, type TapMetricsPack, type TapTradeOutcomeLite } from './metricsTap';
import { evaluateTapOverfitGuard } from './overfitGuardTap';

export const TAP_BT_FAMILIES = [
  { id: 'A', labelKo: 'HTF+Zone' },
  { id: 'B', labelKo: 'HTF+Zone+Sweep' },
  { id: 'C', labelKo: '…+Reclaim' },
  { id: 'D', labelKo: '…+MSS/CHoCH' },
  { id: 'E', labelKo: '…+Displacement' },
  { id: 'F', labelKo: '…+CVD(거래량대리)' },
  { id: 'G', labelKo: '…+Absorption' },
  { id: 'H', labelKo: '…+FirstRetest' },
] as const;

export type TapBtFamilyId = (typeof TAP_BT_FAMILIES)[number]['id'];

export type TapStrategyFamily =
  | 'NORMAL'
  | 'SFP'
  | 'BREAKOUT'
  | 'EVENT'
  | 'SCALP'
  | 'SNIPER';

export type TapFamilyResult = {
  id: TapBtFamilyId;
  labelKo: string;
  metrics: TapMetricsPack;
  holdoutNetEv: number | null;
  holdoutPf: number | null;
  sampleSize: number;
};

export type TapBacktestSuiteReport = {
  families: TapFamilyResult[];
  bestFamilyId: TapBtFamilyId | null;
  overfitOk: boolean;
  overfitNoteKo: string;
  summaryKo: string;
  ranAt: number;
};

export function pickTapStrategyFamily(params: {
  sfpActive?: boolean;
  breakoutActive?: boolean;
  eventPath?: boolean;
  execKind?: string;
}): TapStrategyFamily {
  if (params.execKind === 'MARKET_SCALP') return 'SCALP';
  if (params.execKind === 'ZONE_SNIPER') return 'SNIPER';
  if (params.sfpActive) return 'SFP';
  if (params.breakoutActive) return 'BREAKOUT';
  if (params.eventPath) return 'EVENT';
  return 'NORMAL';
}

function toBars(
  c: Array<{ time: number; open: number; high: number; low: number; close: number; volume?: number }>
): Eagle1Bar[] {
  return c.map((x) => ({
    time: Number(x.time),
    open: Number(x.open),
    high: Number(x.high),
    low: Number(x.low),
    close: Number(x.close),
    volume: Number(x.volume) || 0,
  }));
}

function simTrade(
  bars: Eagle1Bar[],
  i: number,
  dir: 'LONG' | 'SHORT',
  atr: number,
  horizon = 12
): TapTradeOutcomeLite | null {
  const entry = bars[i]?.close;
  if (!(entry > 0) || !(atr > 0)) return null;
  const sl = dir === 'LONG' ? entry - atr * 1.2 : entry + atr * 1.2;
  const tp = dir === 'LONG' ? entry + atr * 1.8 : entry - atr * 1.8;
  let mfe = 0;
  let mae = 0;
  let tpFirst = false;
  let slFirst = false;
  const end = Math.min(bars.length - 1, i + horizon);
  for (let j = i + 1; j <= end; j++) {
    const b = bars[j]!;
    if (dir === 'LONG') {
      mfe = Math.max(mfe, (b.high - entry) / entry);
      mae = Math.max(mae, (entry - b.low) / entry);
      if (b.low <= sl) {
        slFirst = true;
        break;
      }
      if (b.high >= tp) {
        tpFirst = true;
        break;
      }
    } else {
      mfe = Math.max(mfe, (entry - b.low) / entry);
      mae = Math.max(mae, (b.high - entry) / entry);
      if (b.high >= sl) {
        slFirst = true;
        break;
      }
      if (b.low <= tp) {
        tpFirst = true;
        break;
      }
    }
  }
  const risk = atr * 1.2;
  let netR = 0;
  if (tpFirst) netR = (atr * 1.8) / risk;
  else if (slFirst) netR = -1;
  else {
    const last = bars[end]!.close;
    netR = dir === 'LONG' ? (last - entry) / risk : (entry - last) / risk;
  }
  return { netR, tpFirst, slFirst, mfe, mae };
}

type FamFlags = {
  nearZone: boolean;
  sweep: boolean;
  reclaim: boolean;
  choch: boolean;
  displacement: boolean;
  volSpike: boolean;
  absorption: boolean;
  retest: boolean;
  dir: 'LONG' | 'SHORT' | null;
};

function flagsAt(bars: Eagle1Bar[], i: number): FamFlags {
  const prefix = bars.slice(0, i + 1);
  if (prefix.length < 40) {
    return {
      nearZone: false,
      sweep: false,
      reclaim: false,
      choch: false,
      displacement: false,
      volSpike: false,
      absorption: false,
      retest: false,
      dir: null,
    };
  }
  const st = detectStructureCausal(prefix);
  const atr = atrAt(prefix, prefix.length) || prefix[prefix.length - 1]!.close * 0.003;
  const px = prefix[prefix.length - 1]!.close;
  const lo = st.lastSwingLow?.price;
  const hi = st.lastSwingHigh?.price;
  const nearLo = lo != null && Math.abs(px - lo) / px < 0.006;
  const nearHi = hi != null && Math.abs(px - hi) / px < 0.006;
  const nearZone = nearLo || nearHi;
  const lastEv = [...st.events].reverse().find((e) => e.kind !== 'SWING');
  const sweep = st.events.some((e) => e.kind === 'SWEEP' && e.index >= i - 8);
  const choch = st.events.some(
    (e) => (e.kind === 'CHOCH' || e.kind === 'BOS') && e.index >= i - 8
  );
  const reclaim =
    st.state === 'RETEST' ||
    st.state === 'CONFIRMED' ||
    st.state === 'SHIFT' ||
    st.events.some((e) => e.kind === 'FAILED_BREAK' && e.index >= i - 6);
  const c = prefix[prefix.length - 1]!;
  const body = Math.abs(c.close - c.open);
  const displacement = body >= atr * 0.65;
  const vols = prefix.slice(-20).map((b) => b.volume || 0);
  const avg = vols.reduce((a, b) => a + b, 0) / Math.max(1, vols.length);
  const volSpike = (c.volume || 0) > avg * 1.6;
  const range = c.high - c.low || 1e-9;
  const absorption = volSpike && body / range < 0.35;
  const retest = st.state === 'RETEST' || st.state === 'CONFIRMED';
  let dir: 'LONG' | 'SHORT' | null = null;
  if (lastEv?.bias === 'bullish' || nearLo) dir = 'LONG';
  if (lastEv?.bias === 'bearish' || nearHi) dir = dir === 'LONG' ? dir : 'SHORT';
  if (nearLo && !nearHi) dir = 'LONG';
  if (nearHi && !nearLo) dir = 'SHORT';
  return {
    nearZone,
    sweep,
    reclaim,
    choch,
    displacement,
    volSpike,
    absorption,
    retest,
    dir,
  };
}

function familyPass(id: TapBtFamilyId, f: FamFlags): boolean {
  if (!f.dir || !f.nearZone) return false;
  if (id === 'A') return true;
  if (id === 'B') return f.sweep;
  if (id === 'C') return f.sweep && f.reclaim;
  if (id === 'D') return f.sweep && f.reclaim && f.choch;
  if (id === 'E') return f.sweep && f.reclaim && f.choch && f.displacement;
  if (id === 'F') return f.sweep && f.reclaim && f.choch && f.displacement && f.volSpike;
  if (id === 'G')
    return f.sweep && f.reclaim && f.choch && f.displacement && f.volSpike && f.absorption;
  if (id === 'H')
    return (
      f.sweep &&
      f.reclaim &&
      f.choch &&
      f.displacement &&
      f.volSpike &&
      f.absorption &&
      f.retest
    );
  return false;
}

function toSetupOutcomes(
  lite: Array<TapTradeOutcomeLite & { index: number; dir: 'LONG' | 'SHORT'; regime: string }>
): SetupOutcome[] {
  return lite.map((r) => ({
    family: 'sweep_reversal' as const,
    regime: r.regime,
    direction: r.dir,
    index: r.index,
    tpFirst: r.tpFirst,
    slFirst: r.slFirst,
    mfe: r.mfe,
    mae: r.mae,
    netR: r.netR,
    grossRr: r.tpFirst ? 1.5 : r.slFirst ? 1 : Math.max(0.1, Math.abs(r.netR)),
  }));
}

const g = globalThis as unknown as {
  __tapBtCache?: Map<string, TapBacktestSuiteReport>;
};

/**
 * A–H 독립 백테스트. 호출당 캐시(심볼·TF·마지막확정봉).
 */
export function runTapBacktestSuite(params: {
  symbol: string;
  timeframe: string;
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>;
}): TapBacktestSuiteReport {
  const barsAll = toBars(params.candles || []);
  /** 미완 봉 제외 */
  const bars = barsAll.length > 2 ? barsAll.slice(0, -1) : barsAll;
  const lastT = bars[bars.length - 1]?.time || 0;
  const key = `${params.symbol}|${params.timeframe}|${lastT}`;
  if (!g.__tapBtCache) g.__tapBtCache = new Map();
  const hit = g.__tapBtCache.get(key);
  if (hit) return hit;

  const empty: TapBacktestSuiteReport = {
    families: TAP_BT_FAMILIES.map((f) => ({
      id: f.id,
      labelKo: f.labelKo,
      metrics: computeTapMetrics([]),
      holdoutNetEv: null,
      holdoutPf: null,
      sampleSize: 0,
    })),
    bestFamilyId: null,
    overfitOk: false,
    overfitNoteKo: '표본부족',
    summaryKo: '백테스트 통계 부족',
    ranAt: Date.now(),
  };

  if (bars.length < 100) {
    g.__tapBtCache.set(key, empty);
    return empty;
  }

  const families: TapFamilyResult[] = [];
  let bestId: TapBtFamilyId | null = null;
  let bestEv = -Infinity;

  /** 전 패밀리 공용 플래그 캐시 */
  const flagCache = new Map<number, FamFlags>();
  const step = 5;
  const start = 60;
  const endI = bars.length - 14;
  for (let i = start; i < endI; i += step) {
    flagCache.set(i, flagsAt(bars, i));
  }

  for (const fam of TAP_BT_FAMILIES) {
    const collected: Array<
      TapTradeOutcomeLite & { index: number; dir: 'LONG' | 'SHORT'; regime: string }
    > = [];
    for (let i = start; i < endI; i += step) {
      const f = flagCache.get(i)!;
      if (!familyPass(fam.id, f) || !f.dir) continue;
      const atr = atrAt(bars.slice(0, i + 1), i + 1) || bars[i]!.close * 0.003;
      const sim = simTrade(bars, i, f.dir, atr);
      if (!sim) continue;
      collected.push({
        ...sim,
        index: i,
        dir: f.dir,
        regime: 'UNKNOWN',
      });
      if (collected.length >= 60) break;
    }
    const metrics = computeTapMetrics(collected);
    const outcomes = toSetupOutcomes(collected);
    const wf = walkForwardBacktest(outcomes);
    const holdEv = wf.holdoutNetEv;
    const holdPf = wf.holdoutPf;
    families.push({
      id: fam.id,
      labelKo: fam.labelKo,
      metrics,
      holdoutNetEv: holdEv,
      holdoutPf: holdPf,
      sampleSize: collected.length,
    });
    if (metrics.netEv != null && metrics.n >= 30 && metrics.netEv > bestEv) {
      bestEv = metrics.netEv;
      bestId = fam.id;
    }
  }

  const totalN = families.reduce((a, f) => a + f.sampleSize, 0);
  const og = evaluateTapOverfitGuard({
    sampleN: totalN,
    inSampleOnly: families.every((f) => f.holdoutNetEv == null),
  });

  const lines = families
    .filter((f) => f.sampleSize > 0)
    .map(
      (f) =>
        `${f.id}:${f.sampleSize} EV=${f.metrics.netEv != null ? f.metrics.netEv.toFixed(2) : '—'}`
    )
    .slice(0, 6);

  const report: TapBacktestSuiteReport = {
    families,
    bestFamilyId: bestId,
    overfitOk: og.ok,
    overfitNoteKo: og.noteKo,
    summaryKo:
      lines.length > 0
        ? `A–H ${lines.join(' · ')} · best=${bestId || '—'} · ${og.noteKo}`
        : 'A–H 신호표본 없음 · 통계 부족',
    ranAt: Date.now(),
  };
  g.__tapBtCache.set(key, report);
  if (g.__tapBtCache.size > 40) {
    const first = g.__tapBtCache.keys().next().value;
    if (first) g.__tapBtCache.delete(first);
  }
  return report;
}

export function tapBacktestSuiteStatusKo(r?: TapBacktestSuiteReport | null): string {
  if (!r) return '백테스트 미실행';
  return r.summaryKo;
}
