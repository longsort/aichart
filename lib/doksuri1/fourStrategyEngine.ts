/**
 * 4전략 합류·충돌·게이트 → TradeCandidate.
 * Paper 경쟁 허용 · Live는 ACTIVE만 · 중복 방향은 confluence 1건.
 */
import type { Candle } from '@/types';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import type { AutoScalpPaperTrade } from '@/lib/mergedDeskAutoScalpEngine';
import {
  detectAllFourStrategies,
  inferMarketRegime,
  type FourDetectContext,
} from '@/lib/doksuri1/fourStrategyDetect';
import {
  getFourStrategyBucket,
  strategyAllowsLive,
  strategyAllowsPaper,
} from '@/lib/doksuri1/fourStrategyStats';
import type {
  FourStrategySignal,
  FourStrategyTradeCandidate,
  FourStrategyId,
} from '@/lib/doksuri1/fourStrategyTypes';
import { FOUR_STRATEGY_KO } from '@/lib/doksuri1/fourStrategyTypes';
import { isUltraScalpCoreTf, ultraScalpCostGatePass } from '@/lib/doksuri1/ultraScalpEngine';
import { normalizeChartTimeframe } from '@/lib/constants';

const MIN_SCORE_PAPER = 60;
const MIN_SCORE_LIVE = 72;
const CONFLICT_GAP = 8;

export type FourStrategyEnginePack = {
  signals: FourStrategySignal[];
  candidate: FourStrategyTradeCandidate | null;
  regime: ReturnType<typeof inferMarketRegime>;
  stripKo: string;
  detailKo: string;
};

function waitCandidate(
  symbol: string,
  timeframe: string,
  reason: FourStrategyTradeCandidate['rejectReason'],
  waitKo: string,
  regime: FourStrategyTradeCandidate['regime']
): FourStrategyTradeCandidate {
  return {
    symbol,
    timeframe,
    side: 'LONG',
    primaryStrategy: 'SWEEP_REVERSAL',
    supportingStrategies: [],
    entry: 0,
    stop: 0,
    tp1: 0,
    tp2: 0,
    tp3: 0,
    score: 0,
    mandatoryCount: 0,
    bonusScore: 0,
    grade: 'WAIT',
    mandatory: [],
    bonusItems: [],
    expectedNetRoiPct: 0,
    failureRisk: 100,
    evidence: [],
    entryReason: 'WAIT',
    regime,
    status: 'LEARNING',
    sampleCount: 0,
    netEv: 0,
    profitFactor: 0,
    allowPaper: false,
    allowLive: false,
    rejectReason: reason,
    waitKo,
  };
}

function mergeSameSide(sigs: FourStrategySignal[]): {
  primary: FourStrategySignal;
  support: FourStrategyId[];
  score: number;
  evidence: string[];
} | null {
  if (!sigs.length) return null;
  const primary = sigs[0]!;
  const same = sigs.filter((s) => s.side === primary.side);
  const support = same.slice(1).map((s) => s.strategyId);
  /** 중복 evidence 1회만 */
  const ev = new Set<string>();
  for (const s of same) for (const e of s.evidence) ev.add(e);
  let score = primary.score;
  if (support.length === 1) score = Math.min(100, score + 6);
  if (support.length >= 2) score = Math.min(100, score + 10);
  return { primary, support, score, evidence: [...ev] };
}

export function evaluateFourStrategyPack(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  dumpZones?: MtfDumpZoneSpec[] | null;
  rocketDir?: 'LONG' | 'SHORT' | null;
  sfp?: { side: 'bull' | 'bear'; price: number } | null;
  leverage: number;
  tp1RoePct?: number;
  tp2RoePct?: number;
  tp3RoePct?: number;
  /** 라이브: 미완성봉 제외 */
  treatLastClosed?: boolean;
}): FourStrategyEnginePack {
  const tf = normalizeChartTimeframe(params.timeframe);
  const n = params.candles.length;
  const iClosed = params.treatLastClosed ? n - 1 : Math.max(0, n - 2);
  const closedCandles = params.candles.slice(0, iClosed + 1);
  const regime = inferMarketRegime(closedCandles);

  if (!isUltraScalpCoreTf(tf)) {
    const w = waitCandidate(params.symbol, tf, 'TF_BLOCK', `4전략은 1·3·5·15분 · 현재 ${tf}`, regime);
    return { signals: [], candidate: w, regime, stripKo: '4전략 · TF대기', detailKo: w.waitKo };
  }
  if (closedCandles.length < 16) {
    const w = waitCandidate(params.symbol, tf, 'BAD_DATA', '데이터부족', regime);
    return { signals: [], candidate: w, regime, stripKo: '4전략 · 데이터', detailKo: w.waitKo };
  }

  const ctx: FourDetectContext = {
    symbol: params.symbol,
    timeframe: tf,
    closedCandles,
    dumpZones: params.dumpZones,
    rocketDir: params.rocketDir,
    sfp: params.sfp,
    leverage: params.leverage,
    tp1RoePct: params.tp1RoePct,
    tp2RoePct: params.tp2RoePct,
    tp3RoePct: params.tp3RoePct,
  };

  const signals = detectAllFourStrategies(ctx);
  if (!signals.length) {
    const w = waitCandidate(params.symbol, tf, 'NO_SETUP', '유효 Setup 없음 · WAIT', regime);
    return {
      signals,
      candidate: w,
      regime,
      stripKo: '4전략 · 스캔중',
      detailKo: w.waitKo,
    };
  }

  const longs = signals.filter((s) => s.side === 'LONG');
  const shorts = signals.filter((s) => s.side === 'SHORT');
  const bestL = longs[0]?.score ?? 0;
  const bestS = shorts[0]?.score ?? 0;
  if (longs.length && shorts.length && Math.abs(bestL - bestS) < CONFLICT_GAP) {
    const w = waitCandidate(
      params.symbol,
      tf,
      'CONFLICT',
      `충돌 LONG${bestL}/SHORT${bestS} · WAIT`,
      regime
    );
    return {
      signals,
      candidate: w,
      regime,
      stripKo: '4전략 · 충돌',
      detailKo: w.waitKo,
    };
  }

  const sidePool = bestL >= bestS ? longs : shorts;
  const merged = mergeSameSide(sidePool);
  if (!merged) {
    const w = waitCandidate(params.symbol, tf, 'NO_SETUP', '합류 실패', regime);
    return { signals, candidate: w, regime, stripKo: '4전략 · WAIT', detailKo: w.waitKo };
  }

  const { primary, support, score, evidence } = merged;
  const bucket = getFourStrategyBucket(primary.strategyId, params.symbol, tf, primary.regime);
  if (!strategyAllowsPaper(bucket.status)) {
    const w = waitCandidate(
      params.symbol,
      tf,
      'STRATEGY_DISABLED',
      `${FOUR_STRATEGY_KO[primary.strategyId]} DISABLED · 페이퍼도 중지`,
      regime
    );
    return { signals, candidate: { ...w, status: 'DISABLED' }, regime, stripKo: '4전략 · 비활성', detailKo: w.waitKo };
  }

  if (score < MIN_SCORE_PAPER) {
    const w = waitCandidate(params.symbol, tf, 'LOW_SCORE', `점수 ${score} < ${MIN_SCORE_PAPER}`, regime);
    return { signals, candidate: w, regime, stripKo: '4전략 · 점수미달', detailKo: w.waitKo };
  }

  const cost = ultraScalpCostGatePass({
    leverage: params.leverage,
    tp1RoePct: params.tp1RoePct ?? 5,
  });
  if (!cost.ok) {
    const w = waitCandidate(params.symbol, tf, 'COST', cost.reasonKo, regime);
    return { signals, candidate: w, regime, stripKo: '4전략 · 비용', detailKo: w.waitKo };
  }

  const risk = Math.abs(primary.entry - primary.stop);
  const reward = Math.abs(primary.tp1 - primary.entry);
  if (!(risk > 0) || reward / risk < 1.1) {
    const w = waitCandidate(params.symbol, tf, 'RR_FAIL', 'RR부족', regime);
    return { signals, candidate: w, regime, stripKo: '4전략 · RR', detailKo: w.waitKo };
  }

  const allowLive =
    strategyAllowsLive(bucket.status) &&
    score >= MIN_SCORE_LIVE &&
    bucket.netEv > 0 &&
    bucket.profitFactor >= 1.1;

  const candidate: FourStrategyTradeCandidate = {
    symbol: params.symbol,
    timeframe: tf,
    side: primary.side,
    primaryStrategy: primary.strategyId,
    supportingStrategies: support,
    entry: primary.entry,
    stop: primary.stop,
    tp1: primary.tp1,
    tp2: primary.tp2,
    tp3: primary.tp3,
    score,
    mandatoryCount: primary.mandatoryCount,
    bonusScore: primary.bonusScore,
    grade: primary.grade,
    mandatory: primary.mandatory,
    bonusItems: primary.bonusItems,
    expectedNetRoiPct: primary.expectedNetRoiPct,
    failureRisk: primary.failureRisk,
    evidence,
    entryReason: primary.entryReason,
    regime: primary.regime,
    status: bucket.status,
    sampleCount: bucket.tradeCount,
    netEv: bucket.netEv,
    profitFactor: bucket.profitFactor,
    allowPaper: true,
    allowLive,
    rejectReason: null,
    waitKo: '',
  };

  const supportKo = support.length
    ? `+${support.map((id) => FOUR_STRATEGY_KO[id]).join('+')}`
    : '';
  const mandKo = primary.mandatory.map((m) => (m.ok ? '✓' : '✗') + m.labelKo).join(' ');
  return {
    signals,
    candidate,
    regime,
    stripKo: `4전략 · ${FOUR_STRATEGY_KO[primary.strategyId]}${supportKo} ${primary.side} · ${primary.grade}`,
    detailKo: `${mandKo} · score${score}/100 · bonus${primary.bonusScore} · ${bucket.status} · n=${bucket.tradeCount} · ${primary.entryReason}`,
  };
}

/** 4전략 후보 → 페이퍼 OPEN 스냅샷 (기존 포지션 없을 때) */
export function buildFourStrategyPaperOpen(params: {
  candidate: FourStrategyTradeCandidate;
  leverage: number;
  maxBars: number;
  entryBarTime?: number;
}): AutoScalpPaperTrade | null {
  const c = params.candidate;
  if (!c.allowPaper || c.rejectReason || !(c.entry > 0)) return null;
  const id = `fs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    symbol: c.symbol,
    timeframe: c.timeframe,
    direction: c.side,
    phase: 'OPEN',
    armedAt: Date.now(),
    armedZoneId: `four:${c.primaryStrategy}`,
    armedZoneMid: c.entry,
    sfpAt: Date.now(),
    sfpPrice: c.stop,
    rocketAt: Date.now(),
    entryBarTime: params.entryBarTime ?? Date.now() / 1000,
    entry: c.entry,
    sl: c.stop,
    activeSl: c.stop,
    tp1: c.tp1,
    tp2: c.tp2,
    tp3: c.tp3 ?? null,
    leverage: params.leverage,
    tp1Frac: 0.5,
    tp2Frac: 0,
    realizedRoePct: 0,
    remainingFrac: 1,
    barsHeld: 0,
    maxBars: params.maxBars,
    closeReason: null,
    closedAt: null,
    noteKo: `4전략 FIRE ${FOUR_STRATEGY_KO[c.primaryStrategy]} ${c.side} · ${c.entryReason} · score${c.score}`,
    mfeRoePct: 0,
    maeRoePct: 0,
    fourStrategyId: c.primaryStrategy,
    fourSupporting: c.supportingStrategies,
    fourEntryScore: c.score,
    fourRegime: c.regime,
  };
}
