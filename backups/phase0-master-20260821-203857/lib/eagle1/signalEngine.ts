/**
 * Eagle1 signal-engine — one MainPlan. WAIT is the default.
 * Does not recompute indicators; consumes structure/zone/risk/quality.
 */

import type { StructureSnapshot } from './structureEngine';
import { atrAt, type Eagle1Bar } from './structureEngine';
import type { ZoneEngineResult } from './zoneEngine';
import type { Eagle1RiskPlan } from './riskEngine';
import type { SimilarityReport } from './historicalSimilarity';
import { matchSimilarOutcomes } from './historicalSimilarity';
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';
import type { MtfSequenceReport } from './mtfSequence';
import type { FrozenTrade } from './tradeManage';
import type { SetupFamily, SetupOutcome } from './zoneExpectancy';
import type { Eagle1MoneyPressure } from './moneyPressureBand';
import { moneyFlowSide } from './moneyPressureBand';
import { smcWyckoffConfluence } from './smcConfluence';
import { runInternalMl, type Eagle1MlReport } from './internalMl';
import { voteExperts } from './expertModels';
import { runConsensus, type Eagle1ConsensusReport } from './consensusEngine';
import type { Eagle1SmartPath } from './smartPath';

export type Eagle1DecisionState =
  | 'WAIT'
  | 'LONG_WATCH'
  | 'SHORT_WATCH'
  | 'CONFIRMED_LONG'
  | 'CONFIRMED_SHORT'
  | 'LONG_MISSED'
  | 'SHORT_MISSED';

export type Eagle1MainPlan = {
  status: Eagle1DecisionState;
  direction: 'LONG' | 'SHORT' | null;
  entryLow: number | null;
  entryHigh: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  netRr: number | null;
  rrGate: Eagle1RiskPlan['rrGate'];
  calibratedProbability: number | null;
  calibratedLabel: '검증확률' | '통계 부족';
  sampleSize: number;
  longScore: number;
  shortScore: number;
  confidence: 'low' | 'medium' | 'heuristic';
  entryQuality: 'poor' | 'ok' | 'good';
  reasons: string[];
  opposing: string[];
  invalidation: string;
  expectedPath: string;
  altPath: string;
  dataQuality: 'ok' | '신뢰도 낮음' | '데이터 없음';
  noTradeGates: string[];
  structureState: StructureSnapshot['state'];
  regime: StructureSnapshot['regime'];
  stats: SimilarityReport | null;
  mtf: MtfSequenceReport | null;
  trade: FrozenTrade | null;
  sizeUnits: number | null;
  sizeNote: string;
  moneyFlow: {
    stateKo: string;
    note: string;
    evidence: Eagle1MoneyPressure['evidence'];
  } | null;
  ml: Eagle1MlReport | null;
  consensus: Eagle1ConsensusReport | null;
  smartPath: Eagle1SmartPath | null;
  agreementScore: number;
  aiScore: number | null;
};

function familyFromKind(kind: Eagle1RiskPlan['candidateKind']): SetupFamily {
  if (kind === 'poc_retest') return 'poc_hold';
  if (kind === 'ob_retest') return 'ob_retest';
  if (kind === 'fvg_retest') return 'fvg_retest';
  if (kind === 'breaker_retest') return 'ob_retest';
  if (kind === 'sweep_reversal') return 'sweep_reversal';
  return 'pullback';
}

const SCORE_GAP_MIN = 12;

function clamp(n: number, a = 0, b = 100): number {
  return Math.max(a, Math.min(b, n));
}

function locationScore(lastClose: number, lastHigh: number, lastLow: number): { long: number; short: number; mid: boolean } {
  const span = lastHigh - lastLow;
  if (!(span > 0)) return { long: 50, short: 50, mid: true };
  const pos = (lastClose - lastLow) / span;
  return {
    long: clamp((1 - pos) * 100),
    short: clamp(pos * 100),
    mid: pos > 0.38 && pos < 0.62,
  };
}

export function buildMainPlan(params: {
  candles: Eagle1Bar[];
  timeframe: string;
  structure: StructureSnapshot;
  zones: ZoneEngineResult;
  riskLong: Eagle1RiskPlan;
  riskShort: Eagle1RiskPlan;
  qualityBlocked?: boolean;
  qualityCode?: string;
  repaintBlocked?: boolean;
  htfBias?: 'bullish' | 'bearish' | 'range' | string | null;
  endExclusive?: number;
  historicalSampleSize?: number;
  similarity?: SimilarityReport | null;
  outcomes?: SetupOutcome[];
  setupFamily?: SetupFamily;
  mtf?: MtfSequenceReport | null;
  moneyPressure?: Eagle1MoneyPressure | null;
  spreadBps?: number | null;
}): Eagle1MainPlan {
  const n = Math.min(params.candles.length, params.endExclusive ?? params.candles.length);
  const last = params.candles[n - 1];
  const noTrade: string[] = [];
  const reasons: string[] = [];
  const opposing: string[] = [];
  const flowView = params.moneyPressure
    ? {
        stateKo: params.moneyPressure.stateKo,
        note: params.moneyPressure.note,
        evidence: params.moneyPressure.evidence,
      }
    : null;

  const wait = (extra: Partial<Eagle1MainPlan> = {}): Eagle1MainPlan => {
    const { status: extraStatus, longScore: ls, shortScore: ss, reasons: rs, opposing: op, invalidation: inv, noTradeGates: gates, ...rest } = extra;
    return {
      status: extraStatus ?? 'WAIT',
      direction: null,
      entryLow: null,
      entryHigh: null,
      sl: null,
      tp1: null,
      tp2: null,
      tp3: null,
      netRr: null,
      rrGate: 'none',
      calibratedProbability: null,
      calibratedLabel: '통계 부족',
      sampleSize: params.historicalSampleSize ?? 0,
      longScore: ls ?? 0,
      shortScore: ss ?? 0,
      confidence: 'low',
      entryQuality: 'poor',
      reasons: rs ?? reasons,
      opposing: op ?? opposing,
      invalidation: inv ?? '대기 — 무효 조건 없음',
      expectedPath: '주경로: 대기',
      altPath: '대체경로: 반대 셋업 확정 전까지 방향 전환 없음',
      dataQuality: params.qualityBlocked ? '신뢰도 낮음' : n < 8 ? '데이터 없음' : 'ok',
      noTradeGates: gates ?? noTrade,
      structureState: params.structure.state,
      regime: params.structure.regime,
      stats: params.similarity ?? null,
      mtf: params.mtf ?? null,
      trade: null,
      sizeUnits: extra.sizeUnits ?? null,
      sizeNote: extra.sizeNote ?? '사이즈는 계좌위험·손절폭으로만 — 확신도와 무관',
      moneyFlow: extra.moneyFlow ?? flowView,
      ml: extra.ml ?? null,
      consensus: extra.consensus ?? null,
      smartPath: extra.smartPath ?? null,
      agreementScore: extra.agreementScore ?? 0,
      aiScore: extra.aiScore ?? null,
      ...rest,
    };
  };

  if (!last || n < 12) {
    noTrade.push('데이터 없음');
    return wait({ reasons: ['표본 봉 부족'], noTradeGates: noTrade });
  }
  if (params.qualityBlocked) {
    noTrade.push(params.qualityCode || 'DATA_QUALITY_WARNING');
  }
  if (params.repaintBlocked) noTrade.push('REPAINT_AUDIT_FAIL');
  if (params.structure.regime === 'UNKNOWN') noTrade.push('unknown regime');

  const loc = locationScore(
    last.close,
    Math.max(...params.candles.slice(Math.max(0, n - 20), n).map((c) => c.high)),
    Math.min(...params.candles.slice(Math.max(0, n - 20), n).map((c) => c.low))
  );
  if (loc.mid) noTrade.push('range midpoint / poor location');

  const htf = String(params.htfBias || '');
  const htfBull = htf === 'bullish';
  const htfBear = htf === 'bearish';

  let longScore = loc.long * 0.25;
  let shortScore = loc.short * 0.25;

  const lastShift = [...params.structure.events].reverse().find((e) => e.kind === 'CHOCH' || e.kind === 'BOS');
  if (lastShift?.bias === 'bullish') longScore += 22;
  if (lastShift?.bias === 'bearish') shortScore += 22;
  if (params.structure.state === 'SWEEP' || params.structure.state === 'SHIFT' || params.structure.state === 'RETEST') {
    const sw = [...params.structure.events].reverse().find((e) => e.kind === 'SWEEP');
    if (sw?.bias === 'bullish') longScore += 14;
    if (sw?.bias === 'bearish') shortScore += 14;
  }
  if (params.zones.profile.pocState === 'RECLAIMED' || params.zones.profile.pocState === 'CLOSED_ABOVE') longScore += 10;
  if (params.zones.profile.pocState === 'LOST' || params.zones.profile.pocState === 'CLOSED_BELOW') shortScore += 10;
  if (params.zones.profile.pocState === 'BREAK_ATTEMPT') noTrade.push('unresolved POC state');
  const flowSide = moneyFlowSide(params.moneyPressure?.state);
  if (flowSide === 'long') longScore += params.moneyPressure?.absorbed ? 12 : 10;
  if (flowSide === 'short') shortScore += params.moneyPressure?.absorbed ? 12 : 10;
  if (flowSide === 'chase') noTrade.push('low volume or contradictory flow');
  if (lastShift?.bias === 'bullish' && flowSide === 'short') {
    noTrade.push('low volume or contradictory flow');
    opposing.push(`구조 상승 vs 수급 ${params.moneyPressure?.stateKo ?? '매도'}`);
  }
  if (lastShift?.bias === 'bearish' && flowSide === 'long') {
    noTrade.push('low volume or contradictory flow');
    opposing.push(`구조 하락 vs 수급 ${params.moneyPressure?.stateKo ?? '매수'}`);
  }
  if (
    (params.zones.profile.pocState === 'RECLAIMED' || params.zones.profile.pocState === 'CLOSED_ABOVE') &&
    flowSide === 'short'
  ) {
    noTrade.push('low volume or contradictory flow');
    opposing.push('최다거래 재탈환 vs 매도 압력');
  }
  if ((params.zones.profile.pocState === 'LOST' || params.zones.profile.pocState === 'CLOSED_BELOW') && flowSide === 'long') {
    noTrade.push('low volume or contradictory flow');
    opposing.push('최다거래 상실 vs 매수 압력');
  }
  if (params.moneyPressure && params.moneyPressure.note !== '데이터 없음') {
    reasons.push(`수급 ${params.moneyPressure.stateKo} · ${params.moneyPressure.note}`);
  }
  const smc = smcWyckoffConfluence({
    structure: params.structure,
    pocState: params.zones.profile.pocState,
    candles: params.candles,
    endExclusive: n,
  });
  longScore += smc.longAdd;
  shortScore += smc.shortAdd;
  for (const note of smc.notes) {
    if (!reasons.includes(note)) reasons.push(note);
  }

  const rec = params.zones.recommended;
  const recAlive = rec && rec.components.some((z) => z.status !== 'WEAK' && z.status !== 'BROKEN');
  if (recAlive && rec.tier === 'S' && rec.bias === 'bullish') longScore += 8;
  if (recAlive && rec.tier === 'S' && rec.bias === 'bearish') shortScore += 8;
  if (rec) reasons.push(`진입존 ${rec.labelKo}`);

  const rx = params.zones.reaction;
  if (rx && rx.kind !== 'NONE') {
    reasons.push(`존반응 ${rx.kindKo}`);
    if (rx.kind === 'TOUCH') reasons.push('접촉은 성공이 아님 — 종가 확인 필요');
  }
  if (rx && (rx.kind === 'TOUCH' || rx.kind === 'BREAK_ATTEMPT' || rx.kind === 'APPROACH')) {
    noTrade.push('unresolved zone reaction');
  }
  if (rx?.kind === 'HOLD' || rx?.kind === 'RECLAIM' || rx?.kind === 'RETEST') {
    if (rx.bias === 'bearish') shortScore += 12;
    else longScore += 12;
  }
  if (rx?.kind === 'REJECT' || rx?.kind === 'LOST') {
    if (rx.bias === 'bullish') {
      shortScore += 10;
      opposing.push('매수구간 거절/상실');
    } else if (rx.bias === 'bearish') {
      longScore += 10;
      opposing.push('매도구간 거절/상실');
    } else {
      shortScore += 8;
    }
  }

  if (params.structure.regime === 'BULL' || params.structure.regime === 'STRONG_BULL') longScore += 8;
  if (params.structure.regime === 'BEAR' || params.structure.regime === 'STRONG_BEAR') shortScore += 8;
  if (htfBull) longScore += 8;
  if (htfBear) shortScore += 8;
  if (htfBull && lastShift?.bias === 'bearish') {
    noTrade.push('strong HTF conflict');
    opposing.push('상위 타임프레임 상승 vs 단기 하락 전환');
  }
  if (htfBear && lastShift?.bias === 'bullish') {
    noTrade.push('strong HTF conflict');
    opposing.push('상위 타임프레임 하락 vs 단기 상승 전환');
  }

  longScore = clamp(longScore);
  shortScore = clamp(shortScore);
  const gap = Math.abs(longScore - shortScore);
  if (gap < SCORE_GAP_MIN) noTrade.push('small long-vs-short score gap');

  const preferLong = longScore > shortScore;
  const risk = preferLong ? params.riskLong : params.riskShort;
  const sim =
    params.outcomes && params.outcomes.length
      ? matchSimilarOutcomes(params.outcomes, {
          regime: params.structure.regime,
          state: params.structure.state,
          family: params.setupFamily ?? familyFromKind(risk.candidateKind),
          direction: preferLong ? 'LONG' : 'SHORT',
          asOfIndex: Math.max(0, n - 1),
        })
      : params.similarity ?? null;
  const sample = sim?.sampleSize ?? params.historicalSampleSize ?? 0;
  if (sim) {
    reasons.push(`유사국면 ${sim.filter} · ${sim.calibratedLabel}`);
    if (sim.expectedMoveR != null && sim.sampleSize >= EAGLE1_MIN_STAT_SAMPLE) {
      reasons.push(`기대변동 ${sim.expectedMoveR.toFixed(2)}R`);
    }
  }
  if (sample < 30) {
    reasons.push('통계 부족 — 원점 확률을 확정 확률로 표시하지 않음');
  }
  const ml = runInternalMl(params.outcomes ?? [], {
    regime: params.structure.regime,
    family: params.setupFamily ?? familyFromKind(risk.candidateKind),
    direction: preferLong ? 'LONG' : 'SHORT',
    grossRr: risk.grossRrTp1,
    asOfIndex: Math.max(0, n - 1),
  });
  const votes = voteExperts({
    structure: params.structure,
    zones: params.zones,
    risk,
    moneyPressure: params.moneyPressure,
    similarity: sim,
    ml,
    hasDerivatives: false,
  });
  const consensus = runConsensus({
    votes,
    outcomes: params.outcomes,
    asOfIndex: Math.max(0, n - 1),
    similarity: sim,
    ml,
    regime: params.structure.regime,
    spreadBps: params.spreadBps,
    qualityBlocked: params.qualityBlocked,
  });
  reasons.push(consensus.note);
  if (ml.available) reasons.push(`내부ML ${ml.calibratedLabel}`);
  if (consensus.ood.reasons.some((r) => r !== '표본 부족' && r !== '유사국면 표본 부족')) {
    noTrade.push('UNKNOWN MARKET');
    opposing.push(consensus.ood.reasons[0] || 'UNKNOWN MARKET');
  }
  if (consensus.agreementScore < 12) noTrade.push('small long-vs-short score gap');
  const aiBundle = {
    ml,
    consensus,
    agreementScore: consensus.agreementScore,
    aiScore: consensus.aiScore,
    calibratedProbability: consensus.calibratedProbability,
    calibratedLabel: consensus.calibratedLabel,
  };
  if (sim?.netExpectancy != null && sim.netExpectancy <= 0) {
    noTrade.push('low RR or non-positive net expectancy');
  }
  if (params.mtf?.aligned === false) {
    noTrade.push('strong HTF conflict');
    opposing.push(params.mtf.note);
  }
  if (risk.rrGate === 'reject' || risk.netRrTp1 == null) noTrade.push('low RR or non-positive net expectancy');
  if (params.structure.regime === 'VOLATILITY_EXPANSION') noTrade.push('abnormal volatility');
  if (params.structure.regime === 'UNKNOWN') noTrade.push('unknown regime');

  const atr = atrAt(params.candles, n) || last.close * 0.002;
  const entryMid =
    risk.entryLow != null && risk.entryHigh != null ? (risk.entryLow + risk.entryHigh) / 2 : last.close;
  const away = Math.abs(last.close - entryMid);
  const missed = away > atr * 0.85;

  if (noTrade.length) {
    reasons.push(...noTrade);
    if (preferLong && lastShift?.bias === 'bearish') opposing.push('단기 하락 구조 잔존');
    if (!preferLong && lastShift?.bias === 'bullish') opposing.push('단기 상승 구조 잔존');
    const hasWatch =
      risk.entryLow != null &&
      risk.entryHigh != null &&
      risk.executableSl != null &&
      risk.tp1 != null;
    return wait({
      longScore,
      shortScore,
      reasons,
      opposing,
      noTradeGates: noTrade,
      invalidation: hasWatch
        ? preferLong
          ? `${params.timeframe} 종가 ${risk.executableSl!.toFixed(2)} 아래 마감 시 감시시나리오 무효`
          : `${params.timeframe} 종가 ${risk.executableSl!.toFixed(2)} 위 마감 시 감시시나리오 무효`
        : '대기 유지 — 반대 셋업 확정 전까지 방향 전환 없음',
      stats: sim,
      sampleSize: sample,
      calibratedProbability: sim?.calibratedProbability ?? null,
      calibratedLabel: sim?.calibratedLabel ?? '통계 부족',
      sizeUnits: risk.sizeUnits,
      sizeNote: risk.sizeNote,
      /** 확정 아님. HUD/차트에 리스크 엔진 감시 레벨만 표시. */
      ...(hasWatch
        ? {
            direction: preferLong ? ('LONG' as const) : ('SHORT' as const),
            entryLow: risk.entryLow,
            entryHigh: risk.entryHigh,
            sl: risk.executableSl,
            tp1: risk.tp1,
            tp2: risk.tp2,
            tp3: risk.tp3,
            netRr: risk.netRrTp1,
            rrGate: risk.rrGate,
            entryQuality:
              risk.rrGate === 'prioritize' || risk.rrGate === 'confirm_candidate' ? 'ok' : 'poor',
          }
        : {}),
      ...aiBundle,
    });
  }

  const watchStatus: Eagle1DecisionState = preferLong ? 'LONG_WATCH' : 'SHORT_WATCH';
  const missedStatus: Eagle1DecisionState = preferLong ? 'LONG_MISSED' : 'SHORT_MISSED';
  const confStatus: Eagle1DecisionState = preferLong ? 'CONFIRMED_LONG' : 'CONFIRMED_SHORT';

  if (missed) {
    reasons.push('가격이 검증 진입에서 이탈 — 추격 금지');
    return wait({
      status: missedStatus,
      direction: preferLong ? 'LONG' : 'SHORT',
      longScore,
      shortScore,
      reasons,
      opposing,
      entryLow: risk.entryLow,
      entryHigh: risk.entryHigh,
      sl: risk.executableSl,
      tp1: risk.tp1,
      tp2: risk.tp2,
      tp3: risk.tp3,
      netRr: risk.netRrTp1,
      rrGate: risk.rrGate,
      invalidation: preferLong
        ? `무효가격: 종가 ${risk.executableSl?.toFixed(2)} 아래`
        : `무효가격: 종가 ${risk.executableSl?.toFixed(2)} 위`,
      sizeUnits: risk.sizeUnits,
      sizeNote: risk.sizeNote,
      stats: sim,
      sampleSize: sample,
      ...aiBundle,
    });
  }

  const sequenceReady =
    params.structure.state === 'RETEST' ||
    params.structure.state === 'CONFIRMED' ||
    (params.structure.state === 'SHIFT' &&
      (risk.candidateKind === 'ob_retest' || risk.candidateKind === 'fvg_retest' || risk.candidateKind === 'breaker_retest'));

  if (params.mtf?.sequence?.length) {
    reasons.push(`MTF ${params.mtf.sequence.join(' → ')}`);
  }
  reasons.push(`구조상태 ${params.structure.state}`, `레짐 ${params.structure.regime} (${params.structure.regimeConfidence})`);
  opposing.push(
    preferLong
      ? `숏 점수 ${shortScore.toFixed(0)}`
      : `롱 점수 ${longScore.toFixed(0)}`
  );

  const canConfirm =
    sequenceReady &&
    (risk.rrGate === 'confirm_candidate' || risk.rrGate === 'prioritize') &&
    gap >= SCORE_GAP_MIN &&
    sample >= 30 &&
    params.mtf?.aligned !== false &&
    risk.execution !== 'SIGNAL_VALID_EXECUTION_WAIT' &&
    (rx == null || rx.kind === 'NONE' || rx.resolved) &&
    !consensus.ood.flagged &&
    consensus.agreementScore >= SCORE_GAP_MIN;

  if (risk.execution === 'SIGNAL_VALID_EXECUTION_WAIT') {
    reasons.push('셋업 유효 · 체결 대기');
  }

  const status = canConfirm ? confStatus : watchStatus;
  const inv =
    preferLong
      ? `${params.timeframe} 종가 ${risk.executableSl?.toFixed(2)} 아래 마감`
      : `${params.timeframe} 종가 ${risk.executableSl?.toFixed(2)} 위 마감`;

  return {
    status,
    direction: preferLong ? 'LONG' : 'SHORT',
    entryLow: risk.entryLow,
    entryHigh: risk.entryHigh,
    sl: risk.executableSl,
    tp1: risk.tp1,
    tp2: risk.tp2,
    tp3: risk.tp3,
    netRr: risk.netRrTp1,
    rrGate: risk.rrGate,
    calibratedProbability: consensus.calibratedProbability,
    calibratedLabel: consensus.calibratedLabel,
    sampleSize: sample,
    longScore,
    shortScore,
    confidence: 'heuristic',
    entryQuality: canConfirm ? 'good' : 'ok',
    reasons,
    opposing,
    invalidation: `무효: ${inv}`,
    expectedPath: preferLong
      ? `주경로: 진입 재확인 → 목표1 ${risk.tp1?.toFixed(0)} → 위쪽 유동성`
      : `주경로: 진입 재확인 → 목표1 ${risk.tp1?.toFixed(0)} → 아래쪽 유동성`,
    altPath: '대체경로: 무효 후에도 반대 셋업이 따로 확정되기 전엔 대기',
    dataQuality: 'ok',
    noTradeGates: [],
    structureState: params.structure.state,
    regime: params.structure.regime,
    stats: sim,
    mtf: params.mtf ?? null,
    trade: null,
    sizeUnits: risk.sizeUnits,
    sizeNote: risk.sizeNote,
    moneyFlow: flowView,
    ml,
    consensus,
    smartPath: null,
    agreementScore: consensus.agreementScore,
    aiScore: consensus.aiScore,
  };
}
