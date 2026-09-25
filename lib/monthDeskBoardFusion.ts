/**
 * 마감·안착 핵심보드 — 판정·타점·구조 융합 (교육·참고, 확정 수익 아님).
 */
import type { AnalyzeResponse, Candle } from '@/types';
import type { TfCloseSettleBoard } from '@/lib/tfCloseSettleAssessment';
import type { MonthDeskMtfFusionBoost } from '@/lib/monthDeskMtfFusionBoost';
import type { MonthDeskUnifiedCoreMoney } from '@/lib/monthDeskUnifiedCoreMoney';
import type { MonthDeskCoreLevels } from '@/lib/monthDeskCoreLevels';
import { loadSettings } from '@/lib/settings';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';
import { structureMarksFu } from '@/lib/smcDeskOverlay';
import {
  pickMonthDeskStructureHighlight,
  describeMonthDeskStructureKo,
} from '@/lib/monthDeskStructureHud';

export type MonthDeskStructureBoardContext = {
  tag: string | null;
  phase: string | null;
  bias: 'bullish' | 'bearish' | null;
  scoreLong: number;
  scoreShort: number;
  summaryKo: string | null;
  alignedWithVerdict: boolean | null;
};

export type MonthDeskRefinedVerdict = {
  verdict: 'LONG' | 'SHORT' | 'WAIT';
  longScore: number;
  shortScore: number;
  confidence: number | null;
  structure: MonthDeskStructureBoardContext;
  verdictReasonKo: string;
  entryGrade: 'A' | 'B' | 'C' | '—';
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function rawVerdictOf(analysis: AnalyzeResponse | null): 'LONG' | 'SHORT' | 'WAIT' {
  const v = analysis?.verdict;
  return v === 'LONG' ? 'LONG' : v === 'SHORT' ? 'SHORT' : 'WAIT';
}

/** SMC 구조 마크 + 마감표 + 확정 게이트 가중 판정 */
export function refineMonthDeskBoardVerdict(params: {
  analysis: AnalyzeResponse | null;
  candles: Candle[] | null;
  board: TfCloseSettleBoard | null;
  timeframe: string;
  mtfBoost: MonthDeskMtfFusionBoost | null;
}): MonthDeskRefinedVerdict {
  const { analysis, board, timeframe, mtfBoost } = params;
  const settings = loadSettings();
  const safe = params.candles?.length ? sanitizeChartCandlesForSeries(params.candles) : [];

  let longScore = Number(analysis?.longScore ?? 0);
  let shortScore = Number(analysis?.shortScore ?? 0);
  const reasons: string[] = [];

  if (mtfBoost) {
    longScore += mtfBoost.scoreLong * 2.8;
    shortScore += mtfBoost.scoreShort * 2.8;
    if (mtfBoost.conflict) reasons.push('MTF 혼조');
  }

  const cs = analysis?.confirmedSignal;
  if (cs?.direction === 'LONG' && (cs.gatesPassCount ?? 0) >= 4) {
    longScore += 14;
    reasons.push(`확정 롱 ${cs.gatesPassCount}/5`);
  } else if (cs?.direction === 'SHORT' && (cs.gatesPassCount ?? 0) >= 4) {
    shortScore += 14;
    reasons.push(`확정 숏 ${cs.gatesPassCount}/5`);
  } else if ((cs?.gatesPassCount ?? 0) >= 3) {
    const g = cs!.gatesPassCount!;
    if (cs?.direction === 'LONG') longScore += 6;
    if (cs?.direction === 'SHORT') shortScore += 6;
    reasons.push(`게이트 ${g}/5`);
  }

  if (cs?.mtfBlocked || cs?.readinessTier === 'mtf_veto') {
    longScore *= 0.88;
    shortScore *= 0.88;
    reasons.push('MTF 보류');
  }

  const af = analysis?.aiFusionSignal;
  if (af?.verdict === 'LONG') longScore += (af.longHits ?? 0) * 1.4;
  if (af?.verdict === 'SHORT') shortScore += (af.shortHits ?? 0) * 1.4;

  const prob = analysis?.probability;
  if (prob && typeof prob.longProbability === 'number' && typeof prob.shortProbability === 'number') {
    const d = prob.longProbability - prob.shortProbability;
    if (d >= 10) longScore += 4;
    else if (d <= -10) shortScore += 4;
  }

  let structureLong = 0;
  let structureShort = 0;
  let structureSummary: string | null = null;
  let structTag: string | null = null;
  let structPhase: string | null = null;
  let structBias: 'bullish' | 'bearish' | null = null;

  if (safe.length >= 12) {
    const pick = pickMonthDeskStructureHighlight(
      safe,
      settings.smcDeskSwingPivot,
      settings.chartSmcStructureTraceBars ?? 14,
      72
    );
    if (pick) {
      structTag = pick.highlight.tag;
      structPhase = pick.highlight.phase;
      structBias = pick.highlight.bias;
      structureSummary = describeMonthDeskStructureKo(pick)[0] ?? null;

      const ph = pick.highlight.phase;
      const bull = pick.highlight.bias === 'bullish';
      if (ph === 'confirmed') {
        if (bull) {
          structureLong += 12;
          reasons.push('구조 확정·상방');
        } else {
          structureShort += 12;
          reasons.push('구조 확정·하방');
        }
      } else if (ph === 'settling' || ph === 'breakout') {
        if (bull) structureLong += 7;
        else structureShort += 7;
        reasons.push(`구조 ${ph === 'breakout' ? '돌파' : '안착중'}`);
      } else if (ph === 'failed') {
        if (bull) structureShort += 6;
        else structureLong += 6;
        reasons.push('구조 실패·역방향');
      }

      const marks = structureMarksFu(safe, Math.max(2, Math.min(4, settings.smcDeskSwingPivot)), 6);
      const lastMk = marks.length ? marks[marks.length - 1] : null;
      if (lastMk?.bias === 'bullish') structureLong += 3;
      if (lastMk?.bias === 'bearish') structureShort += 3;
    }
  }

  longScore += structureLong;
  shortScore += structureShort;

  const sum = Math.max(0.01, longScore + shortScore);
  const domPct = Math.abs(longScore - shortScore) / sum;
  const minDom = cs?.mtfBlocked ? 0.14 : mtfBoost?.conflict ? 0.12 : 0.09;

  let verdict: 'LONG' | 'SHORT' | 'WAIT' = rawVerdictOf(analysis);
  if (domPct < minDom) {
    verdict = 'WAIT';
    reasons.push('롱·숏 점수 근접');
  } else if (longScore > shortScore * 1.06) {
    verdict = 'LONG';
  } else if (shortScore > longScore * 1.06) {
    verdict = 'SHORT';
  } else {
    verdict = 'WAIT';
  }

  if (cs?.confirmed && cs.direction && (cs.gatesPassCount ?? 0) >= 5 && !cs.mtfBlocked) {
    verdict = cs.direction;
    reasons.push('5/5 확정 우선');
  }

  const raw = rawVerdictOf(analysis);
  if (verdict !== raw && raw !== 'WAIT') {
    reasons.push(`엔진 ${raw === 'LONG' ? '롱' : '숏'} → 보드 ${verdict === 'LONG' ? '롱' : verdict === 'SHORT' ? '숏' : '관망'}`);
  }

  const gates = cs?.gatesPassCount ?? 0;
  const mtfW = mtfBoost && !mtfBoost.conflict ? Math.min(18, mtfBoost.alignedTfCount * 4) : 0;
  const structW = structPhase === 'confirmed' ? 12 : structPhase === 'settling' ? 6 : 0;
  const baseConf = typeof analysis?.confidence === 'number' ? analysis.confidence : 50;
  const confidence = clamp(
    Math.round(baseConf * 0.55 + domPct * 100 * 0.22 + gates * 5 + mtfW + structW),
    0,
    96
  );

  let entryGrade: MonthDeskRefinedVerdict['entryGrade'] = '—';
  if (verdict !== 'WAIT') {
    const gradeScore = confidence + (gates >= 4 ? 8 : 0) + (structPhase === 'confirmed' ? 6 : 0);
    entryGrade = gradeScore >= 78 ? 'A' : gradeScore >= 58 ? 'B' : 'C';
  }

  const alignedWithVerdict =
    verdict === 'WAIT' || structBias == null
      ? null
      : (verdict === 'LONG' && structBias === 'bullish') || (verdict === 'SHORT' && structBias === 'bearish');

  const verdictReasonKo = [...new Set(reasons)].slice(0, 6).join(' · ') || '엔진·MTF·구조 종합';

  return {
    verdict,
    longScore: Math.round(longScore * 10) / 10,
    shortScore: Math.round(shortScore * 10) / 10,
    confidence,
    structure: {
      tag: structTag,
      phase: structPhase,
      bias: structBias,
      scoreLong: structureLong,
      scoreShort: structureShort,
      summaryKo: structureSummary,
      alignedWithVerdict: alignedWithVerdict,
    },
    verdictReasonKo,
    entryGrade,
  };
}

function atr14(candles: Candle[]): number {
  const n = candles.length;
  if (n < 15) {
    const last = candles[n - 1];
    return Math.max((last?.high ?? 0) - (last?.low ?? 0), (last?.close ?? 1) * 0.004);
  }
  let sum = 0;
  for (let i = n - 14; i < n; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    sum += tr;
  }
  return sum / 14;
}

/** 타점 — 방향·구조·존에 맞게 진입대 재배치 */
export function refineMonthDeskEntryLevels(
  base: MonthDeskCoreLevels,
  params: {
    verdict: 'LONG' | 'SHORT' | 'WAIT';
    candles: Candle[] | null;
    analysis: AnalyzeResponse | null;
    ucm: MonthDeskUnifiedCoreMoney | null;
    structure?: MonthDeskStructureBoardContext | null;
  }
): MonthDeskCoreLevels {
  const { verdict, analysis, ucm, structure } = params;
  const safe = params.candles?.length ? sanitizeChartCandlesForSeries(params.candles) : [];
  const close = base.close;
  if (verdict === 'WAIT' || close == null || close <= 0) return base;

  let entryLow = base.entryLow;
  let entryHigh = base.entryHigh;
  let entryMid = base.entryMid;
  let invalidation = base.invalidation;
  let support = base.support;
  let resistance = base.resistance;
  const targets = [...base.targets];

  const fr = analysis?.frontRunSignal;
  if (
    fr &&
    (fr.state === 'READY' || fr.state === 'TRIGGERED') &&
    fr.direction === verdict &&
    Number.isFinite(fr.entry)
  ) {
    const e = Number(fr.entry);
    const span = Math.max(Math.abs(close) * 0.0012, atr14(safe.length >= 14 ? safe : [{ open: e, high: e, low: e, close: e, volume: 0, time: 0 } as Candle]) * 0.35);
    entryMid = e;
    entryLow = e - span * 0.45;
    entryHigh = e + span * 0.45;
    if (Number.isFinite(fr.stop)) invalidation = Number(fr.stop);
  }

  if (ucm && ucm.priceMid > 0) {
    entryLow = Math.min(ucm.priceBot, ucm.priceTop);
    entryHigh = Math.max(ucm.priceBot, ucm.priceTop);
    entryMid = ucm.priceMid;
  }

  if (entryLow != null && entryHigh != null && entryLow < entryHigh) {
    const span = entryHigh - entryLow;
    const atr = safe.length >= 14 ? atr14(safe) : span * 0.5;
    if (verdict === 'LONG') {
      const ideal = entryLow + span * 0.38;
      entryMid = close >= entryLow && close <= entryHigh ? close * 0.55 + ideal * 0.45 : ideal;
      entryMid = Math.max(entryLow, Math.min(entryHigh, entryMid));
      if (support != null && support < entryMid && support >= entryLow - atr * 0.15) {
        entryMid = support * 0.4 + entryMid * 0.6;
      }
      if (structure?.bias === 'bullish' && structure.phase === 'confirmed') {
        entryMid = entryLow + span * 0.42;
      }
    } else {
      const ideal = entryHigh - span * 0.38;
      entryMid = close >= entryLow && close <= entryHigh ? close * 0.55 + ideal * 0.45 : ideal;
      entryMid = Math.max(entryLow, Math.min(entryHigh, entryMid));
      if (resistance != null && resistance > entryMid && resistance <= entryHigh + atr * 0.15) {
        entryMid = resistance * 0.4 + entryMid * 0.6;
      }
      if (structure?.bias === 'bearish' && structure.phase === 'confirmed') {
        entryMid = entryHigh - span * 0.42;
      }
    }
  }

  if (safe.length >= 20 && invalidation != null) {
    const atr = atr14(safe);
    const swing = safe.slice(-48);
    let swingLo = Infinity;
    let swingHi = -Infinity;
    for (const c of swing) {
      swingLo = Math.min(swingLo, c.low);
      swingHi = Math.max(swingHi, c.high);
    }
    if (verdict === 'LONG') {
      const structSl = swingLo - atr * 0.28;
      invalidation = Math.min(invalidation, structSl);
      if (entryLow != null) invalidation = Math.min(invalidation, entryLow - atr * 0.22);
    } else {
      const structSl = swingHi + atr * 0.28;
      invalidation = Math.max(invalidation, structSl);
      if (entryHigh != null) invalidation = Math.max(invalidation, entryHigh + atr * 0.22);
    }
  }

  const uniqTargets = [...new Set(targets.filter((p) => Number.isFinite(p) && p > 0))];
  const sorted =
    verdict === 'LONG'
      ? uniqTargets.filter((p) => p > close).sort((a, b) => a - b)
      : uniqTargets.filter((p) => p < close).sort((a, b) => b - a);

  return {
    ...base,
    support,
    resistance,
    invalidation,
    entryLow,
    entryHigh,
    entryMid,
    targets: sorted.slice(0, 3),
  };
}
