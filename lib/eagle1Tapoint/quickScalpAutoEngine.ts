/**
 * QUICK_SCALP_AUTO_ENGINE — BTC 3m 초단타 · TP1 전량.
 * 신호 품질(0~100) 보강. 기존 타점·밴드·스윕 재사용. 확정 수익 아님.
 * 미마감 봉 확정 금지. 미래 피벗으로 과거 수정 금지.
 */
import { atrAt, type Eagle1Bar, type StructureSnapshot } from '@/lib/eagle1/structureEngine';
import type { TapLiquidityMap } from '@/lib/eagle1Tapoint/liquidityMap';
import type { TapSfpQuality } from '@/lib/eagle1Tapoint/sfpQualityTap';
import { recordQuickScalpPaperSignal } from '@/lib/eagle1Tapoint/quickScalpPaperLog';

export const QUICK_SCALP_ENGINE_ID = 'QUICK_SCALP_AUTO_ENGINE' as const;
export const QUICK_SCALP_SKILL_ID = 'btcQuickScalp' as const;
export const QUICK_SCALP_SKILL_TAG = 'skill:btc-quick-scalp';
export const QUICK_SCALP_DEFAULT_TP_PCT = 0.5;
export const QUICK_SCALP_AUTO_SCORE_MIN = 80;
/** 스펙: ImmediateAdverseRisk > 30 → WAIT 후보(기존 35에서 보강) */
export const QUICK_SCALP_ADVERSE_MAX = 30;
export const QUICK_SCALP_ULTRA_ADVERSE_MAX = 20;
export const QUICK_SCALP_CHASE_ATR = 0.6;
export const QUICK_SCALP_EXPIRY_BARS = 5;

export type QuickScalpWaitReason =
  | 'NO_LIQUIDITY'
  | 'NO_SWEEP'
  | 'NO_RECLAIM'
  | 'NO_STRUCTURE_SHIFT'
  | 'NO_DISPLACEMENT'
  | 'NO_RETEST'
  | 'REPEATED_RETEST'
  | 'TARGET_TOO_CLOSE'
  | 'HIGH_ADVERSE_RISK'
  | 'CHASE'
  | 'RANGE_CENTER'
  | 'LOW_HISTORICAL_EDGE'
  | 'DATA_BAD'
  | 'VALID_RISK_FAIL'
  | 'SCORE_WAIT'
  | 'VOLATILITY_EXTREME'
  | 'SIGNAL_EXPIRED'
  | 'WICK_TOUCH_ONLY'
  | 'NOT_BTC'
  | 'OK';

export type QuickScalpGrade = 'ULTRA' | 'A+' | 'A' | 'WATCH' | 'WAIT';

export type QuickScalpMachineState =
  | 'IDLE'
  | 'LIQUIDITY_FOUND'
  | 'SWEEP'
  | 'RECLAIM'
  | 'STRUCTURE_SHIFT'
  | 'DISPLACEMENT'
  | 'RETEST_WAIT'
  | 'RETEST_CONFIRM'
  | 'SIGNAL_READY'
  | 'SIGNAL_EXPIRED'
  | 'INVALIDATED'
  | 'WAIT';

export type QuickScalpQualities = {
  liquidity: number;
  sweep: number;
  reclaim: number;
  structure: number;
  displacement: number;
  retest: number;
  absorption: number;
  targetSpace: number;
  historical: number;
};

export type QuickScalpAutoResult = {
  engine: typeof QUICK_SCALP_ENGINE_ID;
  ok: boolean;
  autoReady: boolean;
  direction: 'LONG' | 'SHORT' | null;
  entry: number | null;
  sl: number | null;
  tp: number | null;
  tpPct: number;
  slPct: number;
  quickProfitScore: number;
  immediateAdverseRisk: number;
  profitFirstProbability: number | null;
  sampleN: number;
  sampleLabel: 'INSUFFICIENT' | 'PRELIMINARY' | 'CALIBRATION';
  grade: QuickScalpGrade;
  expectedTpMinLo: number;
  expectedTpMinHi: number;
  waitReason: QuickScalpWaitReason;
  stateKo: string;
  reasonKo: string;
  whyKo: string;
  machineState: QuickScalpMachineState;
  eventId: string | null;
  qualities: QuickScalpQualities;
  structureShift: 'NONE' | 'WEAK' | 'CONFIRMED';
  atrPercentile: number;
  retestTouches: number;
  gates: {
    liquidity: boolean;
    sweep: boolean;
    reclaim: boolean;
    sweepReclaim: boolean;
    structure: boolean;
    firstRetest: boolean;
    risk: boolean;
    targetSpace: boolean;
    dataQuality: boolean;
  };
};

const ZERO_Q: QuickScalpQualities = {
  liquidity: 0,
  sweep: 0,
  reclaim: 0,
  structure: 0,
  displacement: 0,
  retest: 0,
  absorption: 0,
  targetSpace: 0,
  historical: 0,
};

function clip(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function empty(
  reasonKo: string,
  wait: QuickScalpWaitReason,
  extra?: Partial<QuickScalpAutoResult>
): QuickScalpAutoResult {
  const machine: QuickScalpMachineState =
    wait === 'SIGNAL_EXPIRED'
      ? 'SIGNAL_EXPIRED'
      : wait === 'DATA_BAD' || wait === 'NOT_BTC'
        ? 'WAIT'
        : wait === 'NO_LIQUIDITY'
          ? 'IDLE'
          : wait === 'NO_SWEEP' || wait === 'WICK_TOUCH_ONLY'
            ? 'LIQUIDITY_FOUND'
            : wait === 'NO_RECLAIM'
              ? 'SWEEP'
              : wait === 'NO_STRUCTURE_SHIFT'
                ? 'RECLAIM'
                : wait === 'NO_DISPLACEMENT'
                  ? 'STRUCTURE_SHIFT'
                  : wait === 'NO_RETEST' || wait === 'REPEATED_RETEST' || wait === 'CHASE'
                    ? 'RETEST_WAIT'
                    : 'WAIT';
  return {
    engine: QUICK_SCALP_ENGINE_ID,
    ok: false,
    autoReady: false,
    direction: extra?.direction ?? null,
    entry: extra?.entry ?? null,
    sl: extra?.sl ?? null,
    tp: extra?.tp ?? null,
    tpPct: QUICK_SCALP_DEFAULT_TP_PCT,
    slPct: 0,
    quickProfitScore: extra?.quickProfitScore ?? 0,
    immediateAdverseRisk: extra?.immediateAdverseRisk ?? 100,
    profitFirstProbability: null,
    sampleN: 0,
    sampleLabel: 'INSUFFICIENT',
    grade: 'WAIT',
    expectedTpMinLo: 6,
    expectedTpMinHi: 12,
    waitReason: wait,
    stateKo: wait === 'SIGNAL_EXPIRED' ? 'EXPIRED' : 'WAIT',
    reasonKo,
    whyKo: reasonKo,
    machineState: extra?.machineState ?? machine,
    eventId: extra?.eventId ?? null,
    qualities: extra?.qualities ?? ZERO_Q,
    structureShift: extra?.structureShift ?? 'NONE',
    atrPercentile: extra?.atrPercentile ?? 50,
    retestTouches: extra?.retestTouches ?? 0,
    gates: {
      liquidity: false,
      sweep: false,
      reclaim: false,
      sweepReclaim: false,
      structure: false,
      firstRetest: false,
      risk: false,
      targetSpace: false,
      dataQuality: wait !== 'DATA_BAD' && wait !== 'NOT_BTC',
      ...extra?.gates,
    },
  };
}

function gradeOf(score: number, adverse: number): QuickScalpGrade {
  if (score >= 90 && adverse <= QUICK_SCALP_ULTRA_ADVERSE_MAX) return 'ULTRA';
  if (score >= 80) return 'A+';
  if (score >= 72) return 'A';
  if (score >= 65) return 'WATCH';
  return 'WAIT';
}

function closedIdx(n: number): number {
  return Math.max(0, n - 2);
}

function lastEvent(
  st: StructureSnapshot | null | undefined,
  kinds: string[],
  asOf: number
) {
  const want = new Set(kinds.map((k) => k.toUpperCase()));
  return [...(st?.events || [])]
    .reverse()
    .find((e) => {
      const k = String(e.kind || '').toUpperCase();
      if (!want.has(k)) return false;
      const i = Number.isFinite(Number(e.known_at)) ? Number(e.known_at) : Number(e.index);
      return i <= asOf;
    });
}

function atrPercentileAt(bars: Eagle1Bar[], asOf: number): number {
  const vals: number[] = [];
  const from = Math.max(16, asOf - 79);
  for (let i = from; i <= asOf; i++) {
    const a = atrAt(bars, i + 1, 14);
    if (a > 0) vals.push(a);
  }
  const cur = atrAt(bars, asOf + 1, 14);
  if (!vals.length || !(cur > 0)) return 50;
  const below = vals.filter((v) => v <= cur).length;
  return clip((below / vals.length) * 100, 1, 99);
}

function sessionVwap(bars: Eagle1Bar[], asOf: number): number {
  const slice = bars.slice(Math.max(0, asOf - 79), asOf + 1);
  let pv = 0;
  let vol = 0;
  for (const b of slice) {
    const v = Number(b.volume) || 0;
    const tp = (Number(b.high) + Number(b.low) + Number(b.close)) / 3;
    pv += tp * v;
    vol += v;
  }
  return vol > 0 ? pv / vol : Number(bars[asOf]?.close) || 0;
}

function countOriginTouches(
  bars: Eagle1Bar[],
  asOf: number,
  fromIdx: number,
  origin: number,
  atr: number,
  dir: 'LONG' | 'SHORT'
): number {
  const band = Math.max(atr * 0.18, origin * 0.00025);
  let n = 0;
  const start = Math.max(0, fromIdx);
  for (let i = start; i <= asOf; i++) {
    const b = bars[i];
    if (!b) continue;
    const inZone =
      dir === 'LONG'
        ? Number(b.low) <= origin + band && Number(b.high) >= origin - band
        : Number(b.high) >= origin - band && Number(b.low) <= origin + band;
    if (inZone) n += 1;
  }
  return n;
}

function weightedScore(q: QuickScalpQualities): number {
  const s =
    q.liquidity * 0.1 +
    q.sweep * 0.15 +
    q.reclaim * 0.15 +
    q.structure * 0.15 +
    q.displacement * 0.1 +
    q.retest * 0.15 +
    q.absorption * 0.05 +
    q.targetSpace * 0.05 +
    q.historical * 0.1;
  return clip(s, 0, 99);
}

export function evaluateQuickScalpAutoEngine(params: {
  symbol: string;
  timeframe: string;
  candles: Eagle1Bar[];
  structure: StructureSnapshot | null | undefined;
  liqMap?: TapLiquidityMap | null;
  sfp?: TapSfpQuality | null;
  qualityOk: boolean;
  htfBias?: 'bullish' | 'bearish' | 'neutral' | null;
}): QuickScalpAutoResult {
  const symbol = String(params.symbol || '').toUpperCase();
  if (!symbol.startsWith('BTC')) {
    return empty('BTC 전용 1순위 스킬', 'NOT_BTC');
  }
  const bars = params.candles || [];
  const n = bars.length;
  if (!params.qualityOk || n < 48) {
    return empty('데이터품질불량 · 초단타 대기', 'DATA_BAD', {
      gates: { dataQuality: false } as QuickScalpAutoResult['gates'],
    });
  }

  const asOf = closedIdx(n);
  const bar = bars[asOf];
  if (!bar) return empty('마감봉 없음', 'DATA_BAD');
  const entry = Number(bar.close);
  if (!(entry > 0)) return empty('가격 무효', 'DATA_BAD');

  const atr = atrAt(bars, asOf + 1, 14) || entry * 0.0025;
  const atrPct = atrPercentileAt(bars, asOf);
  const atrWin: number[] = [];
  for (let i = Math.max(16, asOf - 79); i <= asOf; i++) {
    const a = atrAt(bars, i + 1, 14);
    if (a > 0) atrWin.push(a);
  }
  const atrMean = atrWin.length ? atrWin.reduce((s, v) => s + v, 0) / atrWin.length : atr;
  if (atrPct >= 93 && atr > atrMean * 1.55) {
    return empty('변동성 극단 · 신규진입 억제', 'VOLATILITY_EXTREME', {
      atrPercentile: atrPct,
    });
  }

  const st = params.structure || null;
  const sweep = lastEvent(st, ['SWEEP', 'FAILED_BREAK'], asOf);
  const shift = lastEvent(st, ['CHOCH', 'BOS'], asOf);

  const eqh = (st?.equalHighs || []).slice(-1)[0];
  const eql = (st?.equalLows || []).slice(-1)[0];
  const swingHi = st?.lastSwingHigh?.price ?? null;
  const swingLo = st?.lastSwingLow?.price ?? null;
  const liqBelow =
    params.liqMap?.below?.[0]?.price ||
    (eql != null ? Number(eql) : null) ||
    swingLo;
  const liqAbove =
    params.liqMap?.above?.[0]?.price ||
    (eqh != null ? Number(eqh) : null) ||
    swingHi;

  const hi = Number(bar.high);
  const lo = Number(bar.low);
  const cl = Number(bar.close);
  const op = Number(bar.open);
  const range = Math.max(hi - lo, entry * 1e-8);
  const body = Math.abs(cl - op);
  const wickLo = Math.min(op, cl) - lo;
  const wickHi = hi - Math.max(op, cl);
  const bodyRatio = body / range;
  const vwap = sessionVwap(bars, asOf);

  const sellLiq = Number(liqBelow) > 0 ? Number(liqBelow) : null;
  const buyLiq = Number(liqAbove) > 0 ? Number(liqAbove) : null;
  const liquidityOk = Boolean(sellLiq || buyLiq || sweep);
  const liqQ = clip(
    (sellLiq ? 40 : 0) + (buyLiq ? 40 : 0) + (sweep ? 30 : 0) + (eql || eqh ? 15 : 0),
    0,
    100
  );
  if (!liquidityOk) {
    return empty('유동성 후보 없음', 'NO_LIQUIDITY', {
      qualities: { ...ZERO_Q, liquidity: liqQ },
      atrPercentile: atrPct,
      gates: {
        dataQuality: true,
        liquidity: false,
        sweep: false,
        reclaim: false,
        sweepReclaim: false,
        structure: false,
        firstRetest: false,
        risk: false,
        targetSpace: false,
      },
    });
  }

  const sweepIdx = sweep
    ? Number.isFinite(Number(sweep.known_at))
      ? Number(sweep.known_at)
      : Number(sweep.index)
    : asOf;
  const sweepAge = sweep != null ? asOf - sweepIdx : 99;
  const sweepFresh = sweep != null && sweepAge >= 0 && sweepAge <= 8;

  const longDepth = sellLiq != null ? Math.max(0, sellLiq - lo) : 0;
  const shortDepth = buyLiq != null ? Math.max(0, hi - buyLiq) : 0;
  const longWickTouchOnly =
    sellLiq != null &&
    lo < sellLiq &&
    longDepth < atr * 0.08 &&
    wickLo / range < 0.32 &&
    !sweepFresh;
  const shortWickTouchOnly =
    buyLiq != null &&
    hi > buyLiq &&
    shortDepth < atr * 0.08 &&
    wickHi / range < 0.32 &&
    !sweepFresh;

  const longSweepRaw =
    (sweepFresh && (sweep!.bias === 'bullish' || String(sweep!.kind).toUpperCase() === 'FAILED_BREAK')) ||
    (sellLiq != null && lo < sellLiq && cl > sellLiq && longDepth >= atr * 0.08);
  const shortSweepRaw =
    (sweepFresh && sweep!.bias === 'bearish') ||
    (buyLiq != null && hi > buyLiq && cl < buyLiq && shortDepth >= atr * 0.08);

  if ((longWickTouchOnly || shortWickTouchOnly) && !longSweepRaw && !shortSweepRaw) {
    return empty('윅 터치만 · 스윕 아님', 'WICK_TOUCH_ONLY', {
      qualities: { ...ZERO_Q, liquidity: liqQ, sweep: 12 },
      atrPercentile: atrPct,
      gates: {
        dataQuality: true,
        liquidity: true,
        sweep: false,
        reclaim: false,
        sweepReclaim: false,
        structure: false,
        firstRetest: false,
        risk: false,
        targetSpace: false,
      },
    });
  }

  const longSweep = longSweepRaw && !longWickTouchOnly;
  const shortSweep = shortSweepRaw && !shortWickTouchOnly;

  const sweepLevel = Number(sweep?.level || sweep?.price) || null;
  const longReclaim =
    longSweep &&
    ((sweepLevel != null && cl > sweepLevel) || (sellLiq != null && cl > sellLiq));
  const shortReclaim =
    shortSweep &&
    ((sweepLevel != null && cl < sweepLevel) || (buyLiq != null && cl < buyLiq));

  let direction: 'LONG' | 'SHORT' | null = null;
  if (longReclaim && !shortReclaim) direction = 'LONG';
  else if (shortReclaim && !longReclaim) direction = 'SHORT';
  else if (longReclaim && shortReclaim) {
    direction = cl >= op ? 'LONG' : 'SHORT';
  }

  const eventId =
    sweep != null && Number.isFinite(sweepIdx)
      ? `e${sweepIdx}`
      : `b${asOf}`;

  if (!direction) {
    const noSweep = !sweepFresh && !longSweep && !shortSweep;
    return empty(
      noSweep ? '스윕 없음' : '회수 미완 · 마감봉 기준',
      noSweep ? 'NO_SWEEP' : 'NO_RECLAIM',
      {
        eventId,
        atrPercentile: atrPct,
        qualities: { ...ZERO_Q, liquidity: liqQ, sweep: noSweep ? 8 : 48 },
        gates: {
          dataQuality: true,
          liquidity: true,
          sweep: !noSweep,
          reclaim: false,
          sweepReclaim: false,
          structure: false,
          firstRetest: false,
          risk: false,
          targetSpace: false,
        },
      }
    );
  }

  if (sweepFresh && sweepAge > QUICK_SCALP_EXPIRY_BARS) {
    const shiftAgePre = shift
      ? asOf -
        (Number.isFinite(Number(shift.known_at)) ? Number(shift.known_at) : Number(shift.index))
      : 99;
    if (shiftAgePre > QUICK_SCALP_EXPIRY_BARS) {
      return empty('3~5봉 내 미완성 · 신호만료', 'SIGNAL_EXPIRED', {
        direction,
        eventId,
        atrPercentile: atrPct,
        machineState: 'SIGNAL_EXPIRED',
      });
    }
  }

  const shiftOk =
    shift != null &&
    ((direction === 'LONG' && shift.bias === 'bullish') ||
      (direction === 'SHORT' && shift.bias === 'bearish'));
  const shiftIdx = shift
    ? Number.isFinite(Number(shift.known_at))
      ? Number(shift.known_at)
      : Number(shift.index)
    : -1;
  const shiftAge = shiftOk ? asOf - shiftIdx : 99;
  if (shiftOk && shiftAge > QUICK_SCALP_EXPIRY_BARS) {
    return empty('구조전환 후 5봉 초과 · EXPIRED', 'SIGNAL_EXPIRED', {
      direction,
      eventId,
      atrPercentile: atrPct,
      machineState: 'SIGNAL_EXPIRED',
    });
  }
  const shiftRecent = shiftOk && shiftAge >= 0 && shiftAge <= QUICK_SCALP_EXPIRY_BARS;
  const wickOnlyShift = shiftRecent && bodyRatio < 0.28;
  const weakShift = shiftRecent && bodyRatio >= 0.28 && bodyRatio < 0.38;
  const structureShift: 'NONE' | 'WEAK' | 'CONFIRMED' = wickOnlyShift
    ? 'WEAK'
    : weakShift
      ? 'WEAK'
      : shiftRecent
        ? 'CONFIRMED'
        : 'NONE';
  const structureOk = structureShift === 'CONFIRMED';

  if (!structureOk) {
    return empty(
      structureShift === 'WEAK' ? '구조전환 WEAK · CONFIRMED만 진입' : '구조전환 없음',
      'NO_STRUCTURE_SHIFT',
      {
        direction,
        eventId,
        structureShift,
        atrPercentile: atrPct,
        qualities: { ...ZERO_Q, liquidity: liqQ, sweep: 55, reclaim: 50, structure: structureShift === 'WEAK' ? 42 : 10 },
        gates: {
          dataQuality: true,
          liquidity: true,
          sweep: true,
          reclaim: true,
          sweepReclaim: true,
          structure: false,
          firstRetest: false,
          risk: false,
          targetSpace: false,
        },
      }
    );
  }

  const disp = body / Math.max(atr, 1e-9);
  const displacementOk = disp >= 0.55 || (bodyRatio >= 0.55 && disp >= 0.35);
  const dispQ = clip(disp * 55 + bodyRatio * 40, 0, 100);
  if (!displacementOk) {
    return empty('변위 부족 · 대기', 'NO_DISPLACEMENT', {
      direction,
      eventId,
      structureShift,
      atrPercentile: atrPct,
      qualities: { ...ZERO_Q, liquidity: liqQ, sweep: 60, reclaim: 58, structure: 70, displacement: dispQ },
      gates: {
        dataQuality: true,
        liquidity: true,
        sweep: true,
        reclaim: true,
        sweepReclaim: true,
        structure: true,
        firstRetest: false,
        risk: false,
        targetSpace: false,
      },
    });
  }

  const origin =
    Number(shift?.level || shift?.price) ||
    sweepLevel ||
    (direction === 'LONG' ? sellLiq : buyLiq) ||
    entry;
  const distAtr = Math.abs(entry - origin) / Math.max(atr, 1e-9);
  const touches = countOriginTouches(
    bars,
    asOf,
    Math.max(0, shiftIdx >= 0 ? shiftIdx : asOf - 6),
    origin,
    atr,
    direction
  );
  if (touches >= 3) {
    return empty('반복 리테스트 · 피로 대기', 'REPEATED_RETEST', {
      direction,
      eventId,
      structureShift,
      atrPercentile: atrPct,
      retestTouches: touches,
      qualities: { ...ZERO_Q, liquidity: liqQ, sweep: 62, reclaim: 60, structure: 72, displacement: dispQ, retest: 28 },
    });
  }
  const retestOk = distAtr <= 0.55 && touches <= 2;
  if (!retestOk) {
    return empty(
      distAtr > QUICK_SCALP_CHASE_ATR ? '이상진입에서 0.6ATR 초과 · MISSED' : '첫 리테스트 아님 · 추격 금지',
      distAtr > QUICK_SCALP_CHASE_ATR ? 'CHASE' : 'NO_RETEST',
      {
        direction,
        eventId,
        structureShift,
        atrPercentile: atrPct,
        retestTouches: touches,
      }
    );
  }

  const win = bars.slice(Math.max(0, asOf - 39), asOf + 1);
  const rh = Math.max(...win.map((b) => Number(b.high)));
  const rl = Math.min(...win.map((b) => Number(b.low)));
  const loc = (entry - rl) / Math.max(rh - rl, 1e-9);
  if (direction === 'LONG' && loc > 0.42 && loc < 0.62) {
    return empty('레인지 중앙 · 가장자리 대기', 'RANGE_CENTER', {
      direction,
      eventId,
      structureShift,
      atrPercentile: atrPct,
    });
  }
  if (direction === 'SHORT' && loc > 0.38 && loc < 0.58) {
    return empty('레인지 중앙 · 가장자리 대기', 'RANGE_CENTER', {
      direction,
      eventId,
      structureShift,
      atrPercentile: atrPct,
    });
  }

  const extreme =
    direction === 'LONG'
      ? Math.min(lo, Number(sweep?.price) || lo, sellLiq || lo)
      : Math.max(hi, Number(sweep?.price) || hi, buyLiq || hi);
  const buf = Math.max(atr * 0.25, entry * 0.00035);
  const sl = direction === 'LONG' ? extreme - buf : extreme + buf;
  const slPct = (Math.abs(entry - sl) / entry) * 100;
  if (!(slPct > 0.08) || slPct > 0.95) {
    return empty(`손절거리 ${slPct.toFixed(2)}% · 초단타 부적합`, 'VALID_RISK_FAIL', {
      direction,
      eventId,
      structureShift,
      atrPercentile: atrPct,
    });
  }

  const opp = direction === 'LONG' ? buyLiq : sellLiq;
  let tpPct = QUICK_SCALP_DEFAULT_TP_PCT;
  let spaceQ = 70;
  if (opp != null && opp > 0) {
    const spacePct = (Math.abs(opp - entry) / entry) * 100;
    spaceQ = clip((spacePct / 0.5) * 70, 5, 100);
    if (spacePct < 0.22) {
      return empty('목표공간 부족 · 강한 반대유동성', 'TARGET_TOO_CLOSE', {
        direction,
        eventId,
        structureShift,
        atrPercentile: atrPct,
        qualities: { ...ZERO_Q, targetSpace: spaceQ },
        gates: {
          dataQuality: true,
          liquidity: true,
          sweep: true,
          reclaim: true,
          sweepReclaim: true,
          structure: true,
          firstRetest: true,
          risk: true,
          targetSpace: false,
        },
      });
    }
    if (spacePct < tpPct) tpPct = Math.max(0.3, spacePct * 0.82);
  }
  const tp =
    direction === 'LONG' ? entry * (1 + tpPct / 100) : entry * (1 - tpPct / 100);
  if (direction === 'LONG' && !(tp > entry && sl < entry)) {
    return empty('손익 자리 불일치', 'VALID_RISK_FAIL');
  }
  if (direction === 'SHORT' && !(tp < entry && sl > entry)) {
    return empty('손익 자리 불일치', 'VALID_RISK_FAIL');
  }

  const sfpBoost =
    params.sfp?.active &&
    ((direction === 'LONG' && params.sfp.kind === 'LONG_SFP') ||
      (direction === 'SHORT' && params.sfp.kind === 'SHORT_SFP'))
      ? Math.min(12, Math.round((params.sfp.score || 0) / 10))
      : 0;
  const htfOpp =
    (direction === 'LONG' && params.htfBias === 'bearish') ||
    (direction === 'SHORT' && params.htfBias === 'bullish');
  const wickRatio = direction === 'LONG' ? wickLo / range : wickHi / range;
  const sweepQ = clip(
    (sweepFresh ? 40 : 18) +
      Math.min(35, ((direction === 'LONG' ? longDepth : shortDepth) / Math.max(atr, 1e-9)) * 40) +
      wickRatio * 30,
    0,
    100
  );
  const reclaimQ = clip(bodyRatio * 55 + (cl - Math.min(op, cl) > 0 ? 20 : 0) + 20, 0, 100);
  const retestQ = clip(80 - distAtr * 28 - Math.max(0, touches - 1) * 14, 20, 100);
  const absorbQ = clip(40 + sfpBoost * 3, 0, 70);

  let adverse = 10;
  adverse += distAtr * 8;
  adverse += htfOpp ? 10 : 0;
  adverse += wickRatio < 0.25 ? 8 : 0;
  adverse += slPct * 6;
  adverse += touches >= 2 ? 8 : 0;
  adverse = clip(adverse, 4, 92);
  if (adverse > QUICK_SCALP_ADVERSE_MAX) {
    return empty(`즉시역행위험 ${adverse} · ${QUICK_SCALP_ADVERSE_MAX}초과`, 'HIGH_ADVERSE_RISK', {
      direction,
      eventId,
      structureShift,
      atrPercentile: atrPct,
      retestTouches: touches,
      immediateAdverseRisk: adverse,
      gates: {
        dataQuality: true,
        liquidity: true,
        sweep: true,
        reclaim: true,
        sweepReclaim: true,
        structure: true,
        firstRetest: true,
        risk: true,
        targetSpace: true,
      },
    });
  }

  const vwapBoost =
    (direction === 'LONG' && entry >= vwap) || (direction === 'SHORT' && entry <= vwap) ? 4 : 0;

  const qualities: QuickScalpQualities = {
    liquidity: liqQ,
    sweep: sweepQ,
    reclaim: reclaimQ,
    structure: 82,
    displacement: dispQ,
    retest: retestQ,
    absorption: absorbQ,
    targetSpace: spaceQ,
    historical: 0,
  };
  let score = weightedScore(qualities) + sfpBoost + vwapBoost;
  score -= htfOpp ? 4 : 0;
  score -= touches >= 2 ? 6 : 0;
  score = clip(score, 0, 99);
  const grade = gradeOf(score, adverse);
  const autoReady =
    (grade === 'ULTRA' || grade === 'A+') &&
    score >= QUICK_SCALP_AUTO_SCORE_MIN &&
    adverse <= QUICK_SCALP_ADVERSE_MAX;

  const dirKo = direction === 'LONG' ? '롱' : '숏';
  const whyKo = autoReady
    ? `${dirKo} · 유동성${qualities.liquidity} 스윕${qualities.sweep} 회수${qualities.reclaim} 구조${qualities.structure} 리테스트${qualities.retest} · 표본없음`
    : `관망 · 점수${score}<${QUICK_SCALP_AUTO_SCORE_MIN} 또는 등급 ${grade}`;
  const reasonKo = autoReady
    ? `QUICK SCALP ${dirKo} · TP1 ${tpPct.toFixed(2)}% 전량 · SL ${slPct.toFixed(2)}% · 점수${score} · 역행${adverse}`
    : `QUICK SCALP 관망 · 점수${score} · ${dirKo} · ${grade}`;

  const result: QuickScalpAutoResult = {
    engine: QUICK_SCALP_ENGINE_ID,
    ok: autoReady,
    autoReady,
    direction,
    entry,
    sl,
    tp,
    tpPct,
    slPct,
    quickProfitScore: score,
    immediateAdverseRisk: adverse,
    profitFirstProbability: null,
    sampleN: 0,
    sampleLabel: 'INSUFFICIENT',
    grade,
    expectedTpMinLo: 6,
    expectedTpMinHi: 12,
    waitReason: autoReady ? 'OK' : 'SCORE_WAIT',
    stateKo: autoReady ? 'AUTO READY' : grade === 'WATCH' || grade === 'A' ? 'WATCH' : 'WAIT',
    reasonKo,
    whyKo,
    machineState: autoReady ? 'SIGNAL_READY' : 'RETEST_CONFIRM',
    eventId,
    qualities,
    structureShift,
    atrPercentile: atrPct,
    retestTouches: touches,
    gates: {
      dataQuality: true,
      liquidity: true,
      sweep: true,
      reclaim: true,
      sweepReclaim: true,
      structure: true,
      firstRetest: true,
      risk: true,
      targetSpace: true,
    },
  };

  if (autoReady && eventId) {
    recordQuickScalpPaperSignal({
      signalId: `qs-paper-${symbol}-${eventId}-${direction}`,
      ts: Date.now(),
      symbol,
      side: direction,
      entry,
      tp,
      sl,
      score,
      adverse,
      grade,
      waitReason: 'OK',
      whyKo,
    });
  }

  return result;
}
