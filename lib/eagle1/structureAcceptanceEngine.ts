/**
 * StructureAcceptanceEngine — causal state machine for zone/level acceptance.
 * Maps live candles + structure events. Does not invent probabilities.
 */
import { atrAt, type Eagle1Bar, type StructureEvent, type StructureSnapshot } from './structureEngine';
import type { PocState } from './zoneEngine';
import type { Eagle1MoneyPressure, Eagle1MoneyPressureLive } from './moneyPressureBand';
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';

export const ACCEPTANCE_FLOW = [
  'APPROACH',
  'TOUCH',
  'WICK_BREAK',
  'BODY_BREAK',
  'CLOSE_CONFIRM',
  'RETEST',
  'HOLD',
  'ACCEPTED',
] as const;

export type AcceptanceStep = (typeof ACCEPTANCE_FLOW)[number];

export type AcceptanceFail = 'FAILED_RECLAIM' | 'FAKE_BREAKOUT' | 'FAKE_BREAKDOWN';

export type AcceptanceState = AcceptanceStep | AcceptanceFail | 'IDLE';

export type AcceptanceUiLabel =
  | '상방 안착확정'
  | '하방 안착확정'
  | '재확인 대기'
  | '가짜돌파'
  | '가짜이탈'
  | '대기';

export type BreakQualityFactorId =
  | 'closeDistance'
  | 'bodyRatio'
  | 'displacementAtr'
  | 'relativeVolume'
  | 'aggressiveFlow'
  | 'cvd'
  | 'oiChange'
  | 'orderbookImbalance'
  | 'liquidityDepletion'
  | 'replenishment'
  | 'retestHold';

export type BreakQualityFactor = {
  id: BreakQualityFactorId;
  labelKo: string;
  score: number | null;
  note: string;
};

export type MtfBiasRow = {
  id: 'internal' | 'swing' | 'external';
  labelKo: string;
  tfs: string;
  bias: 'up' | 'down' | null;
  note: string;
};

export type StructureAcceptanceReport = {
  state: AcceptanceState;
  uiLabel: AcceptanceUiLabel;
  bias: 'bullish' | 'bearish' | null;
  level: number | null;
  breakQualityScore: number | null;
  breakQualityNote: string;
  factors: BreakQualityFactor[];
  flow: AcceptanceStep[];
  failBranches: AcceptanceFail[];
  activeFail: AcceptanceFail | null;
  historicalSample: number;
  calibratedProbability: number | null;
  calibratedLabel: '검증확률' | '통계 부족' | '데이터 없음';
  mtfBias: MtfBiasRow[];
};

const FACTOR_LABEL: Record<BreakQualityFactorId, string> = {
  closeDistance: 'Close Distance',
  bodyRatio: 'Body Ratio',
  displacementAtr: 'Displacement/ATR',
  relativeVolume: 'Relative Volume',
  aggressiveFlow: 'Aggressive Buy/Sell',
  cvd: 'CVD',
  oiChange: 'OI Change',
  orderbookImbalance: 'Orderbook Imbalance',
  liquidityDepletion: 'Liquidity Depletion',
  replenishment: 'Replenishment',
  retestHold: 'Retest Hold',
};

function clamp(n: number, a = 0, b = 100): number {
  return Math.max(a, Math.min(b, n));
}

function meanScores(xs: Array<number | null>): number | null {
  const v = xs.filter((n): n is number => n != null && Number.isFinite(n));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function uiLabel(state: AcceptanceState, bias: 'bullish' | 'bearish' | null): AcceptanceUiLabel {
  if (state === 'FAKE_BREAKOUT') return '가짜돌파';
  if (state === 'FAKE_BREAKDOWN') return '가짜이탈';
  if (state === 'ACCEPTED') return bias === 'bearish' ? '하방 안착확정' : '상방 안착확정';
  if (state === 'RETEST' || state === 'HOLD' || state === 'CLOSE_CONFIRM') return '재확인 대기';
  return '대기';
}

function lastFail(events: StructureEvent[]): StructureEvent | undefined {
  return [...events].reverse().find((e) => e.kind === 'FAILED_BREAK');
}

function lastSweep(events: StructureEvent[]): StructureEvent | undefined {
  return [...events].reverse().find((e) => e.kind === 'SWEEP');
}

function lastShift(events: StructureEvent[]): StructureEvent | undefined {
  return [...events].reverse().find((e) => e.kind === 'CHOCH' || e.kind === 'BOS');
}

function classifyState(params: {
  last: Eagle1Bar;
  atr: number;
  structure: StructureSnapshot;
}): { state: AcceptanceState; bias: 'bullish' | 'bearish' | null; level: number | null; fail: AcceptanceFail | null } {
  const { last, atr, structure } = params;
  const failEv = lastFail(structure.events);
  if (failEv) {
    const fail: AcceptanceFail = failEv.bias === 'bearish' ? 'FAKE_BREAKOUT' : 'FAKE_BREAKDOWN';
    return { state: fail, bias: failEv.bias, level: failEv.level, fail };
  }
  const high = structure.lastSwingHigh?.price ?? structure.rangeHigh;
  const low = structure.lastSwingLow?.price ?? structure.rangeLow;
  const shift = lastShift(structure.events);
  const sweep = lastSweep(structure.events);
  const resist = high != null && Number.isFinite(high) ? high : null;
  const supp = low != null && Number.isFinite(low) ? low : null;

  const bodyHi = Math.max(last.open, last.close);
  const bodyLo = Math.min(last.open, last.close);
  const buf = atr * 0.15;

  const wickAbove = resist != null && last.high > resist + buf;
  const bodyAbove = resist != null && bodyHi > resist + buf;
  const closeAbove = resist != null && last.close > resist + buf;
  const wickBelow = supp != null && last.low < supp - buf;
  const bodyBelow = supp != null && bodyLo < supp - buf;
  const closeBelow = supp != null && last.close < supp - buf;
  const touchHigh = resist != null && last.high >= resist - buf;
  const touchLow = supp != null && last.low <= supp + buf;
  const nearHigh = resist != null && Math.abs(last.close - resist) <= atr * 1.5;
  const nearLow = supp != null && Math.abs(last.close - supp) <= atr * 1.5;

  const bullBreak = closeAbove || (structure.state === 'CONFIRMED' && shift?.bias === 'bullish');
  const bearBreak = closeBelow || (structure.state === 'CONFIRMED' && shift?.bias === 'bearish');

  if (structure.state === 'INVALID' && failEv) {
    const fail: AcceptanceFail = failEv.bias === 'bearish' ? 'FAKE_BREAKOUT' : 'FAKE_BREAKDOWN';
    return { state: fail, bias: failEv.bias, level: failEv.level, fail };
  }

  if (structure.state === 'CONFIRMED' && (bullBreak || bearBreak)) {
    const bias: 'bullish' | 'bearish' = bearBreak && !bullBreak ? 'bearish' : 'bullish';
    const level = bias === 'bullish' ? resist : supp;
    return { state: 'ACCEPTED', bias, level, fail: null };
  }

  if (structure.state === 'RETEST' || structure.state === 'SHIFT') {
    const bias = shift?.bias ?? sweep?.bias ?? null;
    const level = bias === 'bearish' ? supp : resist;
    const held =
      bias === 'bullish' && resist != null
        ? last.close >= resist - atr * 0.35
        : bias === 'bearish' && supp != null
          ? last.close <= supp + atr * 0.35
          : false;
    if (structure.state === 'RETEST' && held) {
      return { state: 'HOLD', bias, level, fail: null };
    }
    if (structure.state === 'RETEST') return { state: 'RETEST', bias, level, fail: null };
    if (closeAbove || closeBelow) return { state: 'CLOSE_CONFIRM', bias, level, fail: null };
    if (bodyAbove || bodyBelow) return { state: 'BODY_BREAK', bias, level, fail: null };
    if (wickAbove || wickBelow) return { state: 'WICK_BREAK', bias, level, fail: null };
    return { state: 'TOUCH', bias, level, fail: null };
  }

  if (closeAbove && resist != null && last.close < resist) {
    return { state: 'FAILED_RECLAIM', bias: 'bullish', level: resist, fail: 'FAILED_RECLAIM' };
  }
  if (closeBelow && supp != null && last.close > supp) {
    return { state: 'FAILED_RECLAIM', bias: 'bearish', level: supp, fail: 'FAILED_RECLAIM' };
  }

  if (closeAbove) return { state: 'CLOSE_CONFIRM', bias: 'bullish', level: resist, fail: null };
  if (closeBelow) return { state: 'CLOSE_CONFIRM', bias: 'bearish', level: supp, fail: null };
  if (bodyAbove) return { state: 'BODY_BREAK', bias: 'bullish', level: resist, fail: null };
  if (bodyBelow) return { state: 'BODY_BREAK', bias: 'bearish', level: supp, fail: null };
  if (wickAbove) return { state: 'WICK_BREAK', bias: 'bullish', level: resist, fail: null };
  if (wickBelow) return { state: 'WICK_BREAK', bias: 'bearish', level: supp, fail: null };
  if (touchHigh) return { state: 'TOUCH', bias: 'bullish', level: resist, fail: null };
  if (touchLow) return { state: 'TOUCH', bias: 'bearish', level: supp, fail: null };
  if (nearHigh) return { state: 'APPROACH', bias: 'bullish', level: resist, fail: null };
  if (nearLow) return { state: 'APPROACH', bias: 'bearish', level: supp, fail: null };
  if (structure.state === 'SETUP' || structure.state === 'SWEEP') {
    return { state: 'APPROACH', bias: sweep?.bias ?? shift?.bias ?? null, level: sweep?.level ?? null, fail: null };
  }
  return { state: 'IDLE', bias: null, level: null, fail: null };
}

function factor(
  id: BreakQualityFactorId,
  score: number | null,
  missing: 'none' | 'short' = 'none'
): BreakQualityFactor {
  return {
    id,
    labelKo: FACTOR_LABEL[id],
    score: score != null && Number.isFinite(score) ? clamp(score) : null,
    note: score != null && Number.isFinite(score) ? '' : missing === 'short' ? '통계 부족' : '데이터 없음',
  };
}

export function runStructureAcceptance(params: {
  candles: Eagle1Bar[];
  structure: StructureSnapshot;
  endExclusive?: number;
  pocState?: PocState | null;
  money?: Eagle1MoneyPressure | null;
  live?: Eagle1MoneyPressureLive | null;
  oiState?: 'increasing' | 'decreasing' | 'neutral' | null;
  sampleSize?: number;
  calibratedProbability?: number | null;
  mtfFrames?: Array<{ tf: string; bias: 'bullish' | 'bearish' | null; state?: string }>;
}): StructureAcceptanceReport {
  const n = Math.min(params.candles.length, params.endExclusive ?? params.candles.length);
  const prefix = params.candles.slice(0, n);
  const last = prefix[n - 1];
  const emptyFactors = (Object.keys(FACTOR_LABEL) as BreakQualityFactorId[]).map((id) => factor(id, null));
  if (!last || n < 8) {
    return {
      state: 'IDLE',
      uiLabel: '대기',
      bias: null,
      level: null,
      breakQualityScore: null,
      breakQualityNote: '데이터 없음',
      factors: emptyFactors,
      flow: [...ACCEPTANCE_FLOW],
      failBranches: ['FAILED_RECLAIM', 'FAKE_BREAKOUT', 'FAKE_BREAKDOWN'],
      activeFail: null,
      historicalSample: params.sampleSize ?? 0,
      calibratedProbability: null,
      calibratedLabel: '데이터 없음',
      mtfBias: [
        { id: 'internal', labelKo: 'Internal', tfs: '1m~5m', bias: null, note: '데이터 없음' },
        { id: 'swing', labelKo: 'Swing', tfs: '15m~1H', bias: null, note: '데이터 없음' },
        { id: 'external', labelKo: 'External', tfs: '4H~1D', bias: null, note: '데이터 없음' },
      ],
    };
  }
  const atr = atrAt(prefix, n) || last.close * 0.002;
  const { state, bias, level, fail } = classifyState({ last, atr, structure: params.structure });

  const range = Math.max(last.high - last.low, 1e-9);
  const body = Math.abs(last.close - last.open);
  const closeDist =
    level != null ? clamp(100 - (Math.abs(last.close - level) / (atr * 1.2)) * 100) : null;
  const bodyRatio = clamp((body / range) * 100);
  const disp = clamp((range / atr) * 45);
  const vols = prefix.slice(-21, -1).map((b) => Number(b.volume) || 0);
  const vAvg = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : 0;
  const relVol = vAvg > 0 ? clamp(((Number(last.volume) || 0) / vAvg) * 50) : null;

  const buyShare = params.money?.buyShare;
  const aggressive =
    buyShare != null
      ? clamp(bias === 'bearish' ? (1 - buyShare) * 100 : buyShare * 100)
      : last.takerBuyBaseVolume != null && (Number(last.volume) || 0) > 0
        ? clamp(
            bias === 'bearish'
              ? (1 - last.takerBuyBaseVolume / (Number(last.volume) || 1)) * 100
              : (last.takerBuyBaseVolume / (Number(last.volume) || 1)) * 100
          )
        : null;

  const cvd =
    params.live?.has_cvd && typeof params.live.volumeDelta === 'number'
      ? clamp(50 + params.live.volumeDelta * 8)
      : typeof params.live?.volumeDelta === 'number'
        ? clamp(50 + params.live.volumeDelta * 8)
        : null;

  const oi =
    params.oiState === 'increasing' ? (bias === 'bullish' ? 72 : 38) : params.oiState === 'decreasing' ? (bias === 'bearish' ? 72 : 38) : null;

  const ob =
    params.live?.has_orderbook && typeof params.live.orderbookImbalance === 'number'
      ? clamp(50 + params.live.orderbookImbalance * 50)
      : null;

  const liq =
    (params.live?.liqSeriesPoints ?? 0) >= 2
      ? params.live?.liqAccel === true
        ? 78
        : params.live?.liqAccel === false
          ? 36
          : null
      : null;
  const replenish =
    (params.live?.bookSeriesPoints ?? 0) >= 2 && params.live?.replenishScore != null && Number.isFinite(params.live.replenishScore)
      ? clamp(params.live.replenishScore)
      : null;
  const retestHold =
    state === 'HOLD' || state === 'ACCEPTED' ? 82 : state === 'RETEST' ? 58 : state === 'CLOSE_CONFIRM' ? 48 : null;

  const factors: BreakQualityFactor[] = [
    factor('closeDistance', closeDist),
    factor('bodyRatio', bodyRatio),
    factor('displacementAtr', disp),
    factor('relativeVolume', relVol),
    factor('aggressiveFlow', aggressive),
    factor('cvd', cvd),
    factor('oiChange', oi),
    factor('orderbookImbalance', ob),
    factor('liquidityDepletion', liq),
    factor('replenishment', replenish),
    factor('retestHold', retestHold),
  ];
  const breakQualityScore = meanScores(factors.map((f) => f.score));
  const sample = params.sampleSize ?? 0;
  const cal =
    sample >= EAGLE1_MIN_STAT_SAMPLE && params.calibratedProbability != null && Number.isFinite(params.calibratedProbability)
      ? params.calibratedProbability
      : null;

  const frames = params.mtfFrames ?? [];
  const pick = (tfs: string[]): MtfBiasRow['bias'] => {
    const hit = frames.filter((f) => tfs.includes(f.tf) && f.state !== '데이터 없음');
    if (!hit.length) return null;
    const up = hit.filter((f) => f.bias === 'bullish').length;
    const dn = hit.filter((f) => f.bias === 'bearish').length;
    if (up > dn) return 'up';
    if (dn > up) return 'down';
    return null;
  };
  const mtfBias: MtfBiasRow[] = [
    {
      id: 'internal',
      labelKo: 'Internal',
      tfs: '1m~5m',
      bias: pick(['1m', '5m']),
      note: pick(['1m', '5m']) == null ? '데이터 없음' : '',
    },
    {
      id: 'swing',
      labelKo: 'Swing',
      tfs: '15m~1H',
      bias: pick(['15m', '1H']),
      note: pick(['15m', '1H']) == null ? '데이터 없음' : '',
    },
    {
      id: 'external',
      labelKo: 'External',
      tfs: '4H~1D',
      bias: pick(['4H', '1D']),
      note: pick(['4H', '1D']) == null ? '데이터 없음' : '',
    },
  ];

  return {
    state,
    uiLabel: uiLabel(state, bias),
    bias,
    level,
    breakQualityScore,
    breakQualityNote: breakQualityScore == null ? '데이터 없음' : '',
    factors,
    flow: [...ACCEPTANCE_FLOW],
    failBranches: ['FAILED_RECLAIM', 'FAKE_BREAKOUT', 'FAKE_BREAKDOWN'],
    activeFail: fail,
    historicalSample: sample,
    calibratedProbability: cal,
    calibratedLabel: sample <= 0 ? '데이터 없음' : cal == null ? '통계 부족' : '검증확률',
    mtfBias,
  };
}
