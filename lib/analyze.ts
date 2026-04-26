import { AnalyzeResponse, Candle, OverlayItem, Verdict, type StrongZoneOutput } from '@/types';
import {
  visibleLimit,
  structureRocketBuilderBudget,
  structureRocketSourceAllowedForTimeframe,
  timeframeRank,
  normalizeChartTimeframe,
} from './constants';
import { matchTopReferences } from './referenceMatcherAdvanced';
import { normalizeCurrentPattern } from './recall/patternNormalizer';
import { recallTopPatterns, buildRecallSummary } from './recall/patternRecallEngine';
import { detectPatterns } from './patterns';
import { computeFuturePaths, computeBeamPathForecast } from './prediction/futurePathEngine';
import { computeMTF } from './multiTimeframe';
import { computeTradeProbability } from './probabilityEngine';
import { analyzeSmartMoney } from './smartMoney';
import { fibLevels } from './fibonacci';
import { detectAllHarmonics } from './harmonic';
import { detectNenStarHarmonics, nenStarHitsToEngineMarkers, nenStarHitsToOverlays } from './nenStarHarmonic';
import {
  computeChartPrimeTrendChannelOverlays,
  computeSuggestedChartPrimePivotLength,
} from './chartPrimeTrendChannels';
import { detectBPR } from './bpr';
import { detectFalseBreakout, detectPO3Phase, isKillZone } from './smc';
import { rsi, ema, stochRsi, macd, bollingerBands, atrSeries } from './indicators';
import { runPatternVision, getDominantPattern, getPatternVisionSummary } from './patternVision/patternVisionEngine';
import { visionResultsToOverlays } from './patternVision/patternLabeler';
import { computeRegime } from './regimeEngine';
import { computeSignalScore } from './signalScoreEngine';
import { computeTradePlan } from './tradePlanner';
import { computeConfidence } from './confidenceEngine';
import { computeLevels } from './levelEngine';
import { computeScenarios } from './scenarioEngine';
import { computeTailong } from './tailongEngine';
import { detectTailongCloseSignals } from './tailongCloseEngine';
import { OVERLAY_COLORS } from './overlayColors';
import { computeDivergenceSignal, type DivergenceSignalResult } from './divergenceSignalEngine';
import { detectTriplePattern } from './tripleTopBottomEngine';
import { runZoneTrendlineEngine, zoneTrendlineToOverlays } from './zoneTrendlineEngine';
import type { ParkfTrendlineColorHex } from './chartHexColor';
import type { LuxTrendlineEngineResult } from './luxAlgoTrendlineEngine';
import {
  computeParkfTrendlineOverlays,
  computeParkfLinRegBandSnapshot,
  type ParkfTrendlineOpts,
  DEFAULT_PARKF_TRENDLINE_OPTS,
} from './parkfLinregTrendlineEngine';
import { computeSmcDeskConfluenceLsMeta } from './smcDeskConfluenceLsPack';
import { computeLvrbOverlays } from './lvrbEngine';
import {
  computeVolatilityTrendScoreOverlays,
  type VolatilityTrendScoreParams,
  DEFAULT_VOLATILITY_TREND_SCORE_PARAMS,
} from './volatilityTrendScoreEngine';
import { computeVolumeFlowSummary } from './volumeHistogramIntelligence';
import { computeVolumeWhaleZoneConfluence } from './volumeWhaleZoneConfluence';
import { computePre3SparkleFromMemory, computePre3SparkleHistoryFromMemory } from './pre3PatternMemory';
import { computeDepthDeltaContext } from './depthDeltaContext';
import { buildPre3MatchZoneOverlay } from './pre3MatchZone';
import {
  buildAiModeAutoAnalysis,
  evaluateLiveCompression,
  findLatestCompressionImpulse,
  mergeCompressionThresholds,
  obProbabilityFromPastTouches,
  type CompressionThresholds,
} from './aiModeAutoAnalysis';
import { AI_COMPRESSION_PRESETS } from './aiCompressionPresets';
import {
  buildHtfConvictionOverlays,
  computeHtfConvictionDivergenceMatrix,
  type HtfConvictionMatrixResult,
} from './htfConvictionDivergenceMatrix';

function pivotHigh(candles: Candle[], index: number, left = 2, right = 2) {
  if (index - left < 0 || index + right >= candles.length) return false;
  const v = candles[index].high;
  for (let i = index - left; i <= index + right; i++) {
    if (i !== index && candles[i].high >= v) return false;
  }
  return true;
}

function pivotLow(candles: Candle[], index: number, left = 2, right = 2) {
  if (index - left < 0 || index + right >= candles.length) return false;
  const v = candles[index].low;
  for (let i = index - left; i <= index + right; i++) {
    if (i !== index && candles[i].low <= v) return false;
  }
  return true;
}

/**
 * FluidTrades S/D 피벗 좌우 봉 수. 15m 이하=10 유지, 굵은 TF는 피벗이 드물어 짧게(HTF에서 존 0에 가까워지는 것 방지).
 */
function fluidTradesSwingLen(timeframe: string): number {
  switch (timeframe) {
    case '1m':
    case '3m':
    case '5m':
    case '15m':
      return 10;
    case '1h':
      return 7;
    case '4h':
      return 6;
    case '1d':
      return 5;
    case '1w':
      return 4;
    case '1M':
      return 3;
    case '1Y':
      return 2;
    default:
      return 8;
  }
}

/**
 * S/D 존 POI 간 최소 간격. 순수 ATR*1.5만 쓰면 일·주봉에서 임계가 과대해 한두 개만 남거나 전부 탈락할 수 있음 → 가시 구간 대비 상한.
 */
function fluidSdOverlapThreshold(atrVal: number, rangeHigh: number, rangeLow: number): number {
  const span = Math.max(1e-9, rangeHigh - rangeLow);
  const atrBased = atrVal * 1.5;
  const spanCap = span / 20;
  return Math.max(atrVal * 0.22, Math.min(atrBased, spanCap));
}

function atr(candles: Candle[], period = 50) {
  if (candles.length < period + 1) return (Math.max(...candles.map(c => c.high)) - Math.min(...candles.map(c => c.low))) / period;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    sum += tr;
  }
  return sum / period;
}


function toRatio(price: number, min: number, max: number) {
  const range = Math.max(1e-9, max - min);
  return (max - price) / range;
}

/** visible 창 안 캔들 인덱스 — 경계 클램프 */
function visIdx(visible: Candle[], i: number): number {
  if (!visible.length) return 0;
  return Math.max(0, Math.min(visible.length - 1, Math.floor(i)));
}

/** 차트 timeScale과 동일한 UTC 초 — 오버레이를 실제 봉에 밀착 */
function visTime(visible: Candle[], i: number): number {
  return visible[visIdx(visible, i)].time as number;
}

/**
 * EQH/EQL: 동일 고저 페어가 많을 때 전부 그리면 잡음 → 현재가 근처·최근 형성 우선 1개만.
 */
function selectCoreEqPairs(
  pairs: Array<{ a: number; b: number; price: number }>,
  visible: Candle[],
  atrV: number,
  maxOut: number
): Array<{ a: number; b: number; price: number }> {
  if (!pairs.length || maxOut < 1) return [];
  const last = visible[visible.length - 1];
  if (!last) return [];
  const lastClose = last.close;
  const lastIdx = Math.max(1, visible.length - 1);
  const band = Math.max(atrV * 2.5, lastClose * 0.0015);

  const scored = pairs.map((p) => {
    const dist = Math.abs(p.price - lastClose);
    const recency = p.b / lastIdx;
    const near = dist <= band * 5;
    const score = (near ? 1000 : 0) + recency * 100 - (dist / Math.max(lastClose, 1e-12)) * 50;
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const picked = scored.slice(0, maxOut).map((s) => s.p);
  if (picked.length > 0) return picked;
  const recent = [...pairs].sort((a, b) => b.b - a.b)[0];
  return recent ? [recent] : [];
}

/**
 * 오버레이 상한(other 슬라이스) 적용 시, 앞쪽(균형선·타이롱 등)만 남고 FVG·BOS·OB·Major 존이 잘리는 문제 방지.
 * 월봉은 전체 개수가 적어 덜 드러나고, 4h·분봉에서만 “LinReg만 남는” 현상이 나기 쉬움 → 핵심 SMC는 슬롯을 따로 확보.
 */
function isCoreStructureOverlayForCap(o: OverlayItem): boolean {
  const k = o.kind;
  const id = String(o.id || '');
  const cat = String(o.category || '');
  if (k === 'bos' || k === 'choch' || k === 'fvg' || k === 'ob') return true;
  if (k === 'liquiditySweep' || k === 'eqh' || k === 'eql') return true;
  if (id.startsWith('major-support-') || id.startsWith('major-resistance-')) return true;
  if (k === 'harmonic' || k === 'harmonicLeg') return true;
  if (cat === 'rsi' && (k === 'rsiDivergenceLine' || k === 'rsiSignal')) return true;
  if (id.startsWith('triple-')) return true;
  if (id.startsWith('bpr-')) return true;
  if (id.startsWith('cptc-')) return true;
  return false;
}

/** 원 순서 유지: 최근 쪽 핵심 구조(최대 maxCore개 인덱스) + 나머지 슬롯은 앞에서부터 채움 */
function takeOtherOverlaysWithinCap(other: OverlayItem[], maxOther: number): OverlayItem[] {
  if (maxOther <= 0) return [];
  if (other.length <= maxOther) return other;
  const coreIdx: number[] = [];
  for (let i = 0; i < other.length; i++) {
    if (isCoreStructureOverlayForCap(other[i])) coreIdx.push(i);
  }
  const maxCore = Math.min(coreIdx.length, 52, maxOther);
  const coreKeep = new Set(coreIdx.slice(-maxCore));
  const restBudget = Math.max(0, maxOther - coreKeep.size);
  let restTaken = 0;
  const out: OverlayItem[] = [];
  for (let i = 0; i < other.length; i++) {
    if (coreKeep.has(i)) out.push(other[i]);
    else if (restTaken < restBudget) {
      out.push(other[i]);
      restTaken++;
    }
  }
  return out;
}

function buildImageChannelOverlays(
  visible: Candle[],
  min: number,
  max: number,
  trendHint: 'bullish' | 'bearish' | 'range' = 'range',
  spanRatio = 0.92,
  stylePreset: 'classic' | 'contrast' | 'soft' = 'classic'
): OverlayItem[] {
  return [];
}

function buildMajorSupportResistanceOverlays(
  visible: Candle[],
  min: number,
  max: number,
  zoneWidthScale = 1,
  zoneOpacity = 0.24,
  minTouches = 2,
  trendHint: 'bullish' | 'bearish' | 'range' = 'range',
  lastPrice?: number,
  mtfAgreeCount = 0
): OverlayItem[] {
  if (visible.length < 28) return [];
  const pivots: Array<{ i: number; p: number; side: 'support' | 'resistance' }> = [];
  for (let i = 3; i < visible.length - 3; i += 1) {
    if (pivotLow(visible, i, 3, 3)) pivots.push({ i, p: visible[i].low, side: 'support' });
    if (pivotHigh(visible, i, 3, 3)) pivots.push({ i, p: visible[i].high, side: 'resistance' });
  }
  const parts = 3;
  const partSize = Math.max(12, Math.floor(visible.length / parts));
  const minTouchThreshold = Math.max(2, Math.min(6, Math.round(minTouches)));
  const buildForSide = (side: 'support' | 'resistance') => {
    const rows = pivots.filter((p) => p.side === side);
    if (!rows.length) return [] as Array<{ level: number; count: number; lastI: number }>;
    const tolRate = 0.0032;
    const out: Array<{ level: number; count: number; lastI: number }> = [];
    for (let part = 0; part < parts; part += 1) {
      const start = part * partSize;
      const end = part === parts - 1 ? visible.length - 1 : Math.min(visible.length - 1, (part + 1) * partSize - 1);
      const segRows = rows.filter((r) => r.i >= start && r.i <= end);
      if (!segRows.length) continue;
      const bins: Array<{ level: number; count: number; lastI: number; sum: number }> = [];
      for (const r of segRows) {
        const hit = bins.find((b) => Math.abs(b.level - r.p) / Math.max(1, r.p) <= tolRate);
        if (hit) {
          hit.sum += r.p;
          hit.count += 1;
          hit.level = hit.sum / hit.count;
          hit.lastI = Math.max(hit.lastI, r.i);
        } else {
          bins.push({ level: r.p, count: 1, lastI: r.i, sum: r.p });
        }
      }
      bins.sort((a, b) => (b.count !== a.count ? b.count - a.count : b.lastI - a.lastI));
      const strong = bins.find((b) => b.count >= minTouchThreshold);
      const fallback = bins[0];
      const chosen = strong ?? fallback;
      if (chosen) out.push({ level: chosen.level, count: chosen.count, lastI: chosen.lastI });
    }
    return out
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : b.lastI - a.lastI))
      .slice(0, parts);
  };
  const supports = buildForSide('support');
  const resistances = buildForSide('resistance');
  const out: OverlayItem[] = [];
  const supportPriority = new Map<number, 'PRIMARY' | 'BACKUP'>();
  let primarySupportLevel: number | null = null;
  let backupSupportLevel: number | null = null;
  if (trendHint === 'bearish' && supports.length) {
    const ref = Number.isFinite(lastPrice as number) ? (lastPrice as number) : visible[visible.length - 1]?.close;
    const below = supports
      .filter((s) => Number.isFinite(ref) ? s.level <= (ref as number) : true)
      .sort((a, b) => b.level - a.level);
    const src = below.length ? below : [...supports].sort((a, b) => b.level - a.level);
    if (src[0]) {
      supportPriority.set(src[0].level, 'PRIMARY');
      primarySupportLevel = src[0].level;
    }
    if (src[1]) {
      supportPriority.set(src[1].level, 'BACKUP');
      backupSupportLevel = src[1].level;
    }
  }
  const primaryBroken =
    trendHint === 'bearish' &&
    primarySupportLevel != null &&
    Number.isFinite(lastPrice as number) &&
    (lastPrice as number) < primarySupportLevel;

  const pushZone = (
    id: string,
    side: 'support' | 'resistance',
    level: number,
    count: number,
    lastI: number
  ) => {
    const width = Math.max(0.6, Math.min(2.0, zoneWidthScale));
    const pad = Math.max(level * 0.0012, (max - min) * 0.008) * width;
    const alpha = Math.max(0.08, Math.min(0.55, zoneOpacity));
    const recency = Math.max(0, Math.min(1, lastI / Math.max(1, visible.length - 1)));
    const recencyBonus = Math.round(recency * 12);
    const mtfBonus = Math.max(0, Math.min(9, mtfAgreeCount * 3));
    const probability = Math.max(55, Math.min(98, 48 + count * 8 + recencyBonus + mtfBonus));
    const role = side === 'support' ? supportPriority.get(level) : undefined;
    const escalated = side === 'support' && role === 'BACKUP' && primaryBroken;
    const roleLabel = role ? (role === 'PRIMARY' ? '1차' : escalated ? '2차(격상)' : '2차') : '';
    const mtfLabel = mtfAgreeCount >= 2 ? ` · TF합의 ${mtfAgreeCount}/3` : '';
    const ultraTag = probability >= 85 ? ' [초고확률]' : '';
    const zoneAlpha = escalated ? Math.min(0.62, alpha + 0.10) : alpha;
    const zoneColor = side === 'support'
      ? `rgba(56,189,248,${zoneAlpha})`
      : `rgba(248,113,113,${zoneAlpha})`;
    const lineColor = side === 'support'
      ? (escalated ? 'rgba(34,211,238,1)' : 'rgba(14,165,233,0.94)')
      : 'rgba(239,68,68,0.94)';
    const tStart = visTime(visible, 0);
    const tEnd = visTime(visible, visible.length - 1);
    out.push({
      id: `${id}-zone`,
      kind: side === 'support' ? 'demandZone' : 'supplyZone',
      label: side === 'support'
        ? `${roleLabel ? `${roleLabel} ` : ''}핵심 지지 ${probability}% (${count}x)${ultraTag}`
        : `핵심 저항 ${probability}% (${count}x)${ultraTag}`,
      x1: 0.10,
      y1: toRatio(level + pad, min, max),
      x2: 0.98,
      y2: toRatio(level - pad, min, max),
      time1: tStart,
      time2: tEnd,
      /** 화면 우측 빈 축까지 임의 연장하지 않고, time1~time2(가시 캔들 구간)에만 면을 맞춤 */
      zoneSpanOnly: true,
      confidence: Math.min(95, 70 + count * 6),
      color: zoneColor,
      category: 'zones',
      price1: level + pad,
      price2: level - pad,
    });
    out.push({
      id: `${id}-line`,
      kind: 'keyLevel',
      label: side === 'support'
        ? `${roleLabel ? `${roleLabel} 지지` : '지지'} ${count}회 · 확률 ${probability}%${ultraTag}${mtfLabel}`
        : `저항 ${count}회 · 확률 ${probability}%${ultraTag}${mtfLabel}`,
      x1: 0.10,
      y1: toRatio(level, min, max),
      x2: 0.98,
      y2: toRatio(level, min, max),
      time1: tStart,
      time2: tEnd,
      /** ChartView: 우측 빈 시간축까지 선 연장 금지 — time1~time2 구간만 가로선 */
      noProject: true,
      confidence: Math.min(95, 70 + count * 6),
      color: lineColor,
      category: 'keyLevel',
      price1: level,
      price2: level,
    });
  };
  supports.forEach((s, i) => pushZone(`major-support-${i + 1}`, 'support', s.level, s.count, s.lastI));
  resistances.forEach((r, i) => pushZone(`major-resistance-${i + 1}`, 'resistance', r.level, r.count, r.lastI));
  return out;
}

type SettlementState = 'none' | 'candidate' | 'confirmed' | 'failed';
type SettlementDirection = 'LONG' | 'SHORT' | 'NONE';
type SettlementGrade = 'A' | 'B' | 'C';

function computeSettlementZoneState(params: {
  candles: Candle[];
  direction: SettlementDirection;
  levelPrice: number | null;
  timeframe: string;
}): {
  state: SettlementState;
  score: number;
  grade: SettlementGrade;
  direction: SettlementDirection;
  level: number | null;
  breakIndex?: number;
  retestIndex?: number;
  reasons: string[];
} {
  const { candles, direction, levelPrice, timeframe } = params;
  if (!candles.length || (direction !== 'LONG' && direction !== 'SHORT') || !levelPrice || !isFinite(levelPrice)) {
    return { state: 'none', score: 0, grade: 'C', direction: 'NONE', level: null, reasons: [] };
  }
  const reasons: string[] = [];
  const eps = Math.max(levelPrice * 0.0003, 1e-8);
  const broke = (c: Candle) => direction === 'LONG' ? c.close >= levelPrice - eps : c.close <= levelPrice + eps;
  const brokenPrev = (c: Candle) => direction === 'LONG' ? c.close < levelPrice - eps : c.close > levelPrice + eps;
  let breakIndex = -1;
  for (let i = 1; i < candles.length; i++) {
    if (brokenPrev(candles[i - 1]) && broke(candles[i])) breakIndex = i;
  }
  if (breakIndex < 0) return { state: 'none', score: 0, grade: 'C', direction, level: levelPrice, reasons: ['브레이크 미발생'] };
  reasons.push('브레이크 발생');
  const ttlBarsByTf: Record<string, number> = {
    '1m': 180, '3m': 180, '5m': 160, '15m': 140,
    '1h': 120, '4h': 100, '1d': 80, '1w': 52, '1M': 24, '1Y': 12,
  };
  const ttlBars = ttlBarsByTf[timeframe] ?? 120;
  const ageBars = (candles.length - 1) - breakIndex;
  if (ageBars > ttlBars) {
    return { state: 'none', score: 0, grade: 'C', direction, level: levelPrice, breakIndex, reasons: [`TTL 만료 (${ageBars}봉 경과)`] };
  }
  let holdCount = 0;
  for (let i = breakIndex; i < candles.length; i++) {
    if (broke(candles[i])) holdCount++;
    else break;
  }
  const hold2 = holdCount >= 2;
  if (hold2) reasons.push('2봉 종가 유지');
  let retestIndex: number | undefined;
  let retestViolation = false;
  for (let i = breakIndex + 1; i < candles.length; i++) {
    const c = candles[i];
    const touched = direction === 'LONG' ? c.low <= levelPrice + eps : c.high >= levelPrice - eps;
    if (touched) {
      retestIndex = i;
      const violated = direction === 'LONG' ? c.low < levelPrice - eps : c.high > levelPrice + eps;
      if (violated) retestViolation = true;
      break;
    }
  }
  let retestVolOk = false;
  if (typeof retestIndex === 'number') {
    const start = Math.max(0, retestIndex - 20);
    const base = candles.slice(start, retestIndex);
    const avgVol = base.length ? base.reduce((s, x) => s + (x.volume || 0), 0) / base.length : 0;
    retestVolOk = avgVol > 0 && (candles[retestIndex].volume || 0) >= avgVol;
    if (!retestViolation) reasons.push('리테스트 유지');
    if (retestVolOk) reasons.push('리테스트 거래량 확인');
  }
  let state: SettlementState = 'candidate';
  if (retestViolation) state = 'failed';
  else if (hold2 && (retestIndex == null || retestVolOk)) state = 'confirmed';
  let score = 40;
  if (hold2) score += 25;
  if (retestIndex != null && !retestViolation) score += 20;
  if (retestVolOk) score += 15;
  if (state === 'failed') score = Math.max(20, score - 35);
  const grade: SettlementGrade = score >= 85 ? 'A' : score >= 70 ? 'B' : 'C';
  return { state, score, grade, direction, level: levelPrice, breakIndex, retestIndex, reasons };
}

/** FVG 갭(가격) / ATR — OB 검증 시 '강한 이격' 최소 비율 */
const FVG_GAP_MIN_ATR_RATIO = 0.12;

function dimOverlayColor(color: string | undefined, alphaFactor: number): string {
  if (!color) return `rgba(120,120,120,${0.14 * alphaFactor})`;
  const m = color.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/i);
  if (m) {
    const a = Math.min(1, parseFloat(m[4]) * alphaFactor);
    return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
  }
  return color;
}

function candleTouchesObZone(c: Candle, obLow: number, obHigh: number): boolean {
  return c.low <= obHigh && c.high >= obLow;
}

/** OB 형성 캔들 이후, 이후 봉이 구간과 겹치면 완화(Mitigated) */
function isObMitigated(ob: { index: number; low: number; high: number }, candles: Candle[]): boolean {
  for (let j = ob.index + 1; j < candles.length; j++) {
    if (candleTouchesObZone(candles[j], ob.low, ob.high)) return true;
  }
  return false;
}

/**
 * 차트 OB 라벨 — 한눈에 방향·상태
 * - 롱대기/숏대기: 아직 구조 확정 전 후보 구간(선포착)
 * - 롱확인/숏확인: 일반 OB로 인정된 구간
 * - 롱약함/숏약함: 이미 가격이 구간을 건드려 힘이 빠진 상태(완화)
 */
function obChartLabel(bias: 'bullish' | 'bearish', mitigated: boolean, early: boolean): string {
  const bull = bias === 'bullish';
  if (mitigated) return bull ? '롱약함' : '숏약함';
  if (early) return bull ? '롱대기' : '숏대기';
  return bull ? '롱확인' : '숏확인';
}

/** mitigated OB를 '약함' 대신 롱확인/숏확인 라벨로 올릴 최소 지속 확률(%) */
const OB_STRONG_CONTINUATION_MIN = 80;

/**
 * 최근 봉·추세 기반 상·하방 지속 확률(0~100) + 롱빔/숏빔 여부.
 * 완화된 OB라도 강한 추진 봉이면 롱확인/숏확인으로 선반영.
 */
function computeObMomentumContext(
  visible: Candle[],
  atrVal: number,
  trend: 'bullish' | 'bearish' | 'range'
): { longProb: number; shortProb: number; longBeam: boolean; shortBeam: boolean } {
  const n = visible.length;
  if (n < 2) {
    return { longProb: 50, shortProb: 50, longBeam: false, shortBeam: false };
  }
  const last = visible[n - 1];
  const prev = visible[n - 2];
  const rng = Math.max(1e-9, last.high - last.low);
  const body = Math.abs(last.close - last.open);
  const bodyPct = body / rng;
  const bull = last.close > last.open;
  const bear = last.close < last.open;
  const closeFromLow = (last.close - last.low) / rng;
  const closeFromHigh = (last.high - last.close) / rng;
  const bodyAtr = body / Math.max(atrVal, 1e-9);

  const longBeam = bull && bodyPct >= 0.5 && (closeFromLow >= 0.65 || bodyAtr >= 0.72);
  const shortBeam = bear && bodyPct >= 0.5 && (closeFromHigh >= 0.65 || bodyAtr >= 0.72);

  let lp = 45;
  let sp = 45;
  if (trend === 'bullish') {
    lp += 24;
    sp -= 8;
  } else if (trend === 'bearish') {
    sp += 24;
    lp -= 8;
  }
  let greens = 0;
  for (let i = Math.max(0, n - 5); i < n; i++) {
    if (visible[i].close > visible[i].open) greens++;
  }
  lp += greens * 6;
  sp += (5 - greens) * 6;
  if (longBeam) lp += 24;
  if (shortBeam) sp += 24;
  if (last.close > prev.high) lp += 14;
  else if (last.close < prev.low) sp += 14;

  lp = Math.max(0, Math.min(100, Math.round(lp)));
  sp = Math.max(0, Math.min(100, Math.round(sp)));
  return { longProb: lp, shortProb: sp, longBeam, shortBeam };
}

/** mitigated + 모멘텀 80%+면 롱약함/숏약함 → 롱확인/숏확인(선반영), 색상도 진하게 */
function resolveObMitigatedUpgrade(
  bias: 'bullish' | 'bearish',
  mitigated: boolean,
  early: boolean,
  ctx: ReturnType<typeof computeObMomentumContext>,
  trend: 'bullish' | 'bearish' | 'range'
): { label: string; treatAsMitigated: boolean } {
  if (!mitigated) {
    return { label: obChartLabel(bias, false, early), treatAsMitigated: false };
  }
  if (bias === 'bullish') {
    const upgrade =
      ctx.longProb >= OB_STRONG_CONTINUATION_MIN &&
      (trend !== 'bearish' || ctx.longBeam) &&
      (ctx.longBeam || trend === 'bullish' || ctx.longProb >= 92);
    if (upgrade) return { label: '롱확인', treatAsMitigated: false };
  } else {
    const upgrade =
      ctx.shortProb >= OB_STRONG_CONTINUATION_MIN &&
      (trend !== 'bullish' || ctx.shortBeam) &&
      (ctx.shortBeam || trend === 'bearish' || ctx.shortProb >= 92);
    if (upgrade) return { label: '숏확인', treatAsMitigated: false };
  }
  return { label: obChartLabel(bias, true, early), treatAsMitigated: true };
}

/** 현재 모멘텀을 N캔들 선행 빔 확률로 변환 (차트 선반영 라벨용) */
function computeForwardBeamForecasts(
  ctx: ReturnType<typeof computeObMomentumContext>,
  trend: 'bullish' | 'bearish' | 'range',
  horizons: number[]
): Array<{ horizon: number; longProb: number; shortProb: number }> {
  const clamp = (v: number) => Math.max(1, Math.min(99, Math.round(v)));
  return horizons.map((h) => {
    // 멀수록 확률을 조금 깎고, 빔이 이미 나온 방향은 가산
    let longProb = ctx.longProb - h * 2.8 + (ctx.longBeam ? 8 : 0);
    let shortProb = ctx.shortProb - h * 2.8 + (ctx.shortBeam ? 8 : 0);
    if (trend === 'bullish') longProb += 4;
    if (trend === 'bearish') shortProb += 4;
    return { horizon: h, longProb: clamp(longProb), shortProb: clamp(shortProb) };
  });
}

type SettlementZoneRocket = {
  state: 'none' | 'candidate' | 'confirmed' | 'failed';
  direction: 'LONG' | 'SHORT' | 'NONE';
};

/** 구조 로켓용: 다이버 라인 끝점(또는 시점)이 리테스트·돌파 봉과 TF별 허용 봉 수 안에서만 RSI 정렬로 인정 */
function rsiDivProximityBarsForRocket(tf: string): number {
  if (tf === '1m') return 9;
  if (tf === '3m' || tf === '5m') return 11;
  if (tf === '15m') return 13;
  if (tf === '1h') return 15;
  if (tf === '4h') return 11;
  if (tf === '1d') return 9;
  if (tf === '1w') return 3;
  /** 달/연: 선이 여러 개일 때 index1(과거)까지 쓰면 “어느 선”에도 근접이 계속 참이 되어 🚀/📉 과다 */
  if (tf === '1M' || tf === '1Y') return 2;
  return 12;
}

function divBarNearDivergenceEnd(
  lineIndex1: number,
  lineIndex2: number,
  barIndex: number,
  w: number,
  useSignalEndOnly: boolean
): boolean {
  if (useSignalEndOnly) return Math.abs(lineIndex2 - barIndex) <= w;
  return Math.abs(lineIndex2 - barIndex) <= w || Math.abs(lineIndex1 - barIndex) <= w;
}

function divAlignsShort(div: DivergenceSignalResult, barIndex: number, timeframe: string): boolean {
  const w = rsiDivProximityBarsForRocket(timeframe);
  const tf = normalizeChartTimeframe(timeframe);
  const useSignalEndOnly = tf === '1M' || tf === '1Y' || tf === '1w';
  return Boolean(
    div.divergenceLines?.some(
      (l) =>
        l.type === 'bearish' && divBarNearDivergenceEnd(l.index1, l.index2, barIndex, w, useSignalEndOnly)
    )
  );
}

function divAlignsLong(div: DivergenceSignalResult, barIndex: number, timeframe: string): boolean {
  const w = rsiDivProximityBarsForRocket(timeframe);
  const tf = normalizeChartTimeframe(timeframe);
  const useSignalEndOnly = tf === '1M' || tf === '1Y' || tf === '1w';
  return Boolean(
    div.divergenceLines?.some(
      (l) =>
        l.type === 'bullish' && divBarNearDivergenceEnd(l.index1, l.index2, barIndex, w, useSignalEndOnly)
    )
  );
}

function settlementMatches(sz: SettlementZoneRocket, dir: 'LONG' | 'SHORT'): boolean {
  return sz.state === 'confirmed' && sz.direction === dir;
}

/**
 * BOS 구조 로켓 게이트: (RSI) OR (안착).
 * 안착은 `computeSettlementZoneState`가 **시리즈당 하나**라 `confirmed`면 `stOk`가 매 리테스트에 켜져
 * 월·주봉에서 BOS가 연속이면 로켓이 **매 봉** 수준으로 찍힘 → 굵은 TF는 RSI 정렬만 본다.
 */
function structureRocketConfirmGate(rsiOk: boolean, stOk: boolean, timeframe: string): boolean {
  const tf = normalizeChartTimeframe(timeframe);
  if (tf === '1M' || tf === '1Y' || tf === '1w') return rsiOk;
  return rsiOk || stOk;
}

type StructureRocketSource =
  | 'bos_retest_rsi'
  | 'bos_retest_settlement'
  | 'bos_retest_both'
  /** CHOCH 구조 뚫림 + 하·상방 삠(임펄스) — RSI/안착 없이 표시 */
  | 'struct_choch_break'
  /** 깬 스윙가 되돌림 거절만 (기존 BOS 리테스트에서 RSI/안착 게이트 제외) */
  | 'struct_retest_only'
  /** 수요 존(지지)에서 망치·반등 종가 — 위쪽 로켓 */
  | 'zone_support_bounce'
  /** 수요 존 아래 종가 마감(지지 붕괴) — 아래쪽 로켓 */
  | 'zone_support_break'
  /** 공급 존(저항)에서 윗꼬리·거절 종가 — 아래쪽 로켓 */
  | 'zone_resist_reject'
  /** 공급 존 위 종가 마감(저항 돌파) — 위쪽 로켓 */
  | 'zone_resist_break';

type StructureRocketRow = {
  time: number;
  direction: 'LONG' | 'SHORT';
  source: StructureRocketSource;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  /** 다음 스윙·2차 존까지 확장 TP (없으면 생략) */
  takeProfit2?: number;
  setupKind: 'retrace_long' | 'breakdown_retest' | 'breakdown_breakout' | 'retrace_breakout';
};

type ZonePoi = { top: number; bottom: number; poi: number };

/** 숏 TP: 진입 아래 첫 스윙 저점·수요존 POI와 ATR 폴백 중, 진입에 가장 가까운 목표(보수 1차) */
function computeTpShort(entry: number, barIndex: number, swings: Array<{ type: 'high' | 'low'; index: number; price: number }>, demandZones: ZonePoi[], atr: number): number {
  const parts: number[] = [entry - atr * 2.4];
  const lows = swings.filter((s) => s.type === 'low' && s.index >= barIndex && s.price < entry);
  if (lows.length) parts.push(Math.max(...lows.map((l) => l.price)) - atr * 0.12);
  const dBelow = demandZones.filter((z) => z.poi < entry).sort((a, b) => b.poi - a.poi)[0];
  if (dBelow) parts.push(dBelow.poi - atr * 0.1);
  const valid = parts.filter((p) => p < entry && isFinite(p));
  return valid.length ? Math.max(...valid) : entry - atr * 2.4;
}

/** 롱 TP: 진입 위 첫 스윙 고점·공급존 POI와 ATR 폴백 중 가장 가까운 목표 */
function computeTpLong(entry: number, barIndex: number, swings: Array<{ type: 'high' | 'low'; index: number; price: number }>, supplyZones: ZonePoi[], atr: number): number {
  const parts: number[] = [entry + atr * 2.4];
  const highs = swings.filter((s) => s.type === 'high' && s.index >= barIndex && s.price > entry);
  if (highs.length) parts.push(Math.min(...highs.map((h) => h.price)) + atr * 0.12);
  const sAbove = supplyZones.filter((z) => z.poi > entry).sort((a, b) => a.poi - b.poi)[0];
  if (sAbove) parts.push(sAbove.poi + atr * 0.1);
  const valid = parts.filter((p) => p > entry && isFinite(p));
  return valid.length ? Math.min(...valid) : entry + atr * 2.4;
}

/** 숏 TP2: TP1보다 한 단계 더 아래 스윙·차순 수요존 */
function computeTp2Short(entry: number, barIndex: number, swings: Array<{ type: 'high' | 'low'; index: number; price: number }>, demandZones: ZonePoi[], atr: number, tp1: number): number | undefined {
  const minGap = Math.max(entry * 0.00035, atr * 0.22, (entry - tp1) * 0.06);
  const cand: number[] = [];
  const lows = swings.filter((s) => s.type === 'low' && s.index >= barIndex && s.price < tp1 - minGap);
  if (lows.length) cand.push(Math.max(...lows.map((l) => l.price)) - atr * 0.1);
  const dems = demandZones.filter((z) => z.poi < tp1 - minGap).sort((a, b) => b.poi - a.poi);
  if (dems.length >= 2) cand.push(dems[1].poi - atr * 0.08);
  const valid = cand.filter((p) => p < tp1 - minGap * 0.2 && p > 0 && isFinite(p));
  if (!valid.length) return undefined;
  return Math.max(...valid);
}

/** 롱 TP2: TP1보다 한 단계 더 위 스윙·차순 공급존 */
function computeTp2Long(entry: number, barIndex: number, swings: Array<{ type: 'high' | 'low'; index: number; price: number }>, supplyZones: ZonePoi[], atr: number, tp1: number): number | undefined {
  const minGap = Math.max(entry * 0.00035, atr * 0.22, (tp1 - entry) * 0.06);
  const cand: number[] = [];
  const highs = swings.filter((s) => s.type === 'high' && s.index >= barIndex && s.price > tp1 + minGap);
  if (highs.length) cand.push(Math.min(...highs.map((h) => h.price)) + atr * 0.1);
  const sups = supplyZones.filter((z) => z.poi > tp1 + minGap).sort((a, b) => a.poi - b.poi);
  if (sups.length >= 2) cand.push(sups[1].poi + atr * 0.08);
  const valid = cand.filter((p) => p > tp1 + minGap * 0.2 && isFinite(p));
  if (!valid.length) return undefined;
  return Math.min(...valid);
}

function mergeDedupeStructureRockets(rows: StructureRocketRow[], maxOut: number): StructureRocketRow[] {
  const rankSrc = (s: StructureRocketSource) => {
    if (s === 'bos_retest_both') return 5;
    if (s === 'bos_retest_rsi') return 4;
    if (s === 'struct_choch_break') return 4;
    if (s === 'zone_support_bounce' || s === 'zone_resist_reject') return 3.7;
    if (s === 'zone_support_break' || s === 'zone_resist_break') return 3.6;
    if (s === 'struct_retest_only') return 3;
    if (s === 'bos_retest_settlement') return 2;
    return 1;
  };
  const rankKind = (k: StructureRocketRow['setupKind']) =>
    k === 'breakdown_retest' || k === 'retrace_long' ? 2 : 1;
  const byKey = new Map<string, StructureRocketRow>();
  for (const x of [...rows].sort((a, b) => a.time - b.time)) {
    const k = `${x.time}|${x.direction}`;
    const prev = byKey.get(k);
    if (!prev) byKey.set(k, x);
    else {
      const rs = rankSrc(x.source) - rankSrc(prev.source);
      const rk = rankKind(x.setupKind) - rankKind(prev.setupKind);
      if (rs > 0 || (rs === 0 && rk > 0)) byKey.set(k, x);
    }
  }
  const afterDirDedupe = [...byKey.values()];
  /**
   * 동일 `time`(= 동일 캔들)에 LONG·SHORT가 둘 다 있으면 차트에 🚀+📉가 동시에 뜬다.
   * (키가 time|direction 이라서 방향별로 따로 머지됨) — 랭크 1건만 남긴다.
   */
  const byTime = new Map<number, StructureRocketRow[]>();
  for (const v of afterDirDedupe) {
    const list = byTime.get(v.time) ?? [];
    list.push(v);
    byTime.set(v.time, list);
  }
  const onePerCandle: StructureRocketRow[] = [];
  for (const t of [...byTime.keys()].sort((a, b) => a - b)) {
    const list = byTime.get(t) ?? [];
    if (list.length === 1) {
      onePerCandle.push(list[0]!);
      continue;
    }
    list.sort((a, b) => {
      const rs = rankSrc(b.source) - rankSrc(a.source);
      if (rs !== 0) return rs;
      return rankKind(b.setupKind) - rankKind(a.setupKind);
    });
    onePerCandle.push(list[0]!);
  }
  return onePerCandle.sort((a, b) => a.time - b.time).slice(-maxOut);
}

type ZoneRect = { left: number; right: number; top: number; bottom: number; poi: number };

/**
 * 차트에 그려지는 수요/공급 존(지지·저항 박스) 기준: 존 터치 후 반등/거절, 존 위·아래 종가 뚫림 → 롱/숏 로켓.
 * LS 다이버·BOS 리테스트 로직과 별도로 합쳐짐.
 */
function buildSupplyDemandZoneRockets(
  visible: Candle[],
  demandZones: ZoneRect[],
  supplyZones: ZoneRect[],
  atrVal: number,
  swings: Array<{ type: 'high' | 'low'; index: number; price: number }>,
  demandPoi: ZonePoi[],
  supplyPoi: ZonePoi[],
  maxCand = 42
): StructureRocketRow[] {
  const n = visible.length;
  if (n < 5) return [];
  const atr = Math.max(
    atrVal,
    (Math.max(...visible.map((c) => c.high)) - Math.min(...visible.map((c) => c.low))) * 0.00025
  );
  const band = (z: { top: number; bottom: number; poi: number }) =>
    Math.max(atr * 0.45, (z.top - z.bottom) * 0.4, Math.abs(z.poi) * 0.00085);
  const cand: StructureRocketRow[] = [];
  const recent = (z: { left: number }) => z.left >= Math.max(0, n - 420);

  for (const z of demandZones.filter(recent).slice(-16)) {
    const pad = band(z);
    const start = Math.max(2, z.left);
    let gotBounce = false;
    let gotBreak = false;
    for (let i = start; i < n; i++) {
      const c = visible[i];
      const rng = Math.max(1e-12, c.high - c.low);
      const wickIntoSupport = c.low <= z.top + pad && c.low >= z.bottom - pad * 2.8;
      const bull = c.close > c.open;
      const closeHeld = c.close >= z.bottom - pad * 0.55;

      if (!gotBounce && wickIntoSupport && bull && closeHeld) {
        const closeFromLow = (c.close - c.low) / rng;
        if (closeFromLow >= 0.35) {
          const entry = c.close;
          const stop = Math.min(c.low, z.bottom) - atr * 0.28;
          const tp = computeTpLong(entry, i, swings, supplyPoi, atr);
          const tp2 = computeTp2Long(entry, i, swings, supplyPoi, atr, tp);
          cand.push({
            time: c.time as number,
            direction: 'LONG',
            source: 'zone_support_bounce',
            entryPrice: entry,
            stopLoss: stop,
            takeProfit: tp,
            takeProfit2: tp2,
            setupKind: 'retrace_long',
          });
          gotBounce = true;
        }
      }

      const breakEps = Math.max(atr * 0.24, z.bottom * 0.00055);
      if (!gotBreak && c.close < z.bottom - breakEps) {
        const prev = visible[i - 1];
        if (prev.close >= z.bottom - pad * 1.8 || prev.low >= z.bottom - pad * 2) {
          const entry = c.close;
          const stop = Math.max(c.high, z.top + pad * 0.4) + atr * 0.22;
          const tp = computeTpShort(entry, i, swings, demandPoi, atr);
          const tp2 = computeTp2Short(entry, i, swings, demandPoi, atr, tp);
          cand.push({
            time: c.time as number,
            direction: 'SHORT',
            source: 'zone_support_break',
            entryPrice: entry,
            stopLoss: stop,
            takeProfit: tp,
            takeProfit2: tp2,
            setupKind: 'breakdown_breakout',
          });
          gotBreak = true;
        }
      }
      if (gotBounce && gotBreak) break;
    }
  }

  for (const z of supplyZones.filter(recent).slice(-16)) {
    const pad = band(z);
    const start = Math.max(2, z.left);
    let gotReject = false;
    let gotBreak = false;
    for (let i = start; i < n; i++) {
      const c = visible[i];
      const rng = Math.max(1e-12, c.high - c.low);
      const wickIntoResist = c.high >= z.bottom - pad && c.high <= z.top + pad * 2.2;
      const bear = c.close < c.open;
      const upperWickRatio = (c.high - Math.max(c.open, c.close)) / rng;

      if (
        !gotReject &&
        wickIntoResist &&
        (bear || upperWickRatio >= 0.32) &&
        c.close < z.poi + pad * 0.35
      ) {
        const entry = c.close;
        const stop = Math.max(c.high, z.top) + atr * 0.25;
        const tp = computeTpShort(entry, i, swings, demandPoi, atr);
        const tp2 = computeTp2Short(entry, i, swings, demandPoi, atr, tp);
        cand.push({
          time: c.time as number,
          direction: 'SHORT',
          source: 'zone_resist_reject',
          entryPrice: entry,
          stopLoss: stop,
          takeProfit: tp,
          takeProfit2: tp2,
          setupKind: 'breakdown_retest',
        });
        gotReject = true;
      }

      const breakEps = Math.max(atr * 0.24, z.top * 0.00055);
      if (!gotBreak && c.close > z.top + breakEps && c.close > c.open) {
        const body = c.close - c.open;
        if (body / rng >= 0.28) {
          const prev = visible[i - 1];
          if (prev.close <= z.top + pad * 1.2 || prev.high <= z.top + pad * 1.5) {
            const entry = c.close;
            const stop = Math.min(c.low, z.bottom - pad * 0.4) - atr * 0.22;
            const tp = computeTpLong(entry, i, swings, supplyPoi, atr);
            const tp2 = computeTp2Long(entry, i, swings, supplyPoi, atr, tp);
            cand.push({
              time: c.time as number,
              direction: 'LONG',
              source: 'zone_resist_break',
              entryPrice: entry,
              stopLoss: stop,
              takeProfit: tp,
              takeProfit2: tp2,
              setupKind: 'retrace_breakout',
            });
            gotBreak = true;
          }
        }
      }
      if (gotReject && gotBreak) break;
    }
  }

  return cand.sort((a, b) => a.time - b.time).slice(-maxCand);
}

/**
 * CHOCH 구조 뚫림(삠) + BOS 스윙가 되돌림 — RSI/종가안착 필터 없음. 기존 LS 다이버 기반 로켓과 병합.
 */
function buildCandleStructureRockets(
  visible: Candle[],
  choch: Array<{ bias: 'bullish' | 'bearish'; index: number; price: number; brokenLevel?: number }>,
  bosList: Array<{ bias: 'bullish' | 'bearish'; index: number; price: number; brokenLevel?: number }>,
  atrVal: number,
  swings: Array<{ type: 'high' | 'low'; index: number; price: number }>,
  allDemand: ZonePoi[],
  allSupply: ZonePoi[],
  maxCand = 24
): StructureRocketRow[] {
  const cand: StructureRocketRow[] = [];
  const RETEST_MAX = 40;
  const epsPct = 0.0022;
  const atr = Math.max(
    atrVal,
    visible.length ? (Math.max(...visible.map((c) => c.high)) - Math.min(...visible.map((c) => c.low))) * 0.0002 : 1e-8
  );

  const impulseBreakIdxBearish = (centerIdx: number, brokenLevel: number): number => {
    const eps = Math.max(brokenLevel * epsPct, atr * 0.12);
    const lo = Math.max(0, centerIdx - 10);
    const hi = Math.min(visible.length - 1, centerIdx + 24);
    for (let i = lo; i <= hi; i++) {
      const c = visible[i];
      const rng = c.high - c.low;
      if (rng < 1e-12) continue;
      const body = c.open - c.close;
      if (body <= 0) continue;
      const bodyPct = body / rng;
      if (c.close >= brokenLevel - eps * 0.15) continue;
      if (bodyPct < 0.46) continue;
      if (rng < atr * 0.58) continue;
      const closeFromHigh = (c.high - c.close) / rng;
      if (closeFromHigh < 0.42) continue;
      return i;
    }
    return -1;
  };

  const impulseBreakIdxBullish = (centerIdx: number, brokenLevel: number): number => {
    const eps = Math.max(brokenLevel * epsPct, atr * 0.12);
    const lo = Math.max(0, centerIdx - 10);
    const hi = Math.min(visible.length - 1, centerIdx + 24);
    for (let i = lo; i <= hi; i++) {
      const c = visible[i];
      const rng = c.high - c.low;
      if (rng < 1e-12) continue;
      const body = c.close - c.open;
      if (body <= 0) continue;
      const bodyPct = body / rng;
      if (c.close <= brokenLevel + eps * 0.15) continue;
      if (bodyPct < 0.46) continue;
      if (rng < atr * 0.58) continue;
      const closeFromLow = (c.close - c.low) / rng;
      if (closeFromLow < 0.42) continue;
      return i;
    }
    return -1;
  };

  for (const ch of choch.filter((x) => x.brokenLevel != null && isFinite(Number(x.brokenLevel))).slice(-8)) {
    if (ch.bias === 'bearish') {
      const L = ch.brokenLevel as number;
      const bi = impulseBreakIdxBearish(ch.index, L);
      if (bi >= 0) {
        const bc = visible[bi];
        const eps = Math.max(L * epsPct, 1e-8);
        const entry = bc.close;
        const stop = Math.max(bc.high, L + eps * 0.5) + atr * 0.2;
        const tp = computeTpShort(entry, bi, swings, allDemand, atr);
        const tp2 = computeTp2Short(entry, bi, swings, allDemand, atr, tp);
        cand.push({
          time: bc.time as number,
          direction: 'SHORT',
          source: 'struct_choch_break',
          entryPrice: entry,
          stopLoss: stop,
          takeProfit: tp,
          takeProfit2: tp2,
          setupKind: 'breakdown_breakout',
        });
      }
    } else {
      const H = ch.brokenLevel as number;
      const bi = impulseBreakIdxBullish(ch.index, H);
      if (bi >= 0) {
        const bc = visible[bi];
        const eps = Math.max(H * epsPct, 1e-8);
        const entry = bc.close;
        const stop = Math.min(bc.low, H - eps * 0.5) - atr * 0.2;
        const tp = computeTpLong(entry, bi, swings, allSupply, atr);
        const tp2 = computeTp2Long(entry, bi, swings, allSupply, atr, tp);
        cand.push({
          time: bc.time as number,
          direction: 'LONG',
          source: 'struct_choch_break',
          entryPrice: entry,
          stopLoss: stop,
          takeProfit: tp,
          takeProfit2: tp2,
          setupKind: 'retrace_breakout',
        });
      }
    }
  }

  for (const b of bosList.slice(-22)) {
    const broken = b.brokenLevel;
    if (broken == null || !isFinite(broken)) continue;
    const bi = b.index;
    if (bi < 0 || bi >= visible.length) continue;
    const eps = Math.max(broken * epsPct, 1e-8);

    if (b.bias === 'bearish') {
      for (let j = bi + 1; j <= Math.min(bi + RETEST_MAX, visible.length - 1); j++) {
        const c = visible[j];
        const touched = c.high >= broken - eps;
        const reject = c.close < broken - eps * 0.35;
        if (touched && reject) {
          const entry = c.close;
          const stop = Math.max(c.high, broken + eps * 0.5) + atr * 0.2;
          const tp = computeTpShort(entry, j, swings, allDemand, atr);
          const tp2 = computeTp2Short(entry, j, swings, allDemand, atr, tp);
          cand.push({
            time: c.time as number,
            direction: 'SHORT',
            source: 'struct_retest_only',
            entryPrice: entry,
            stopLoss: stop,
            takeProfit: tp,
            takeProfit2: tp2,
            setupKind: 'breakdown_retest',
          });
          break;
        }
      }
    } else {
      for (let j = bi + 1; j <= Math.min(bi + RETEST_MAX, visible.length - 1); j++) {
        const c = visible[j];
        const touched = c.low <= broken + eps;
        const reject = c.close > broken + eps * 0.35;
        if (touched && reject) {
          const entry = c.close;
          const stop = Math.min(c.low, broken - eps * 0.5) - atr * 0.2;
          const tp = computeTpLong(entry, j, swings, allSupply, atr);
          const tp2 = computeTp2Long(entry, j, swings, allSupply, atr, tp);
          cand.push({
            time: c.time as number,
            direction: 'LONG',
            source: 'struct_retest_only',
            entryPrice: entry,
            stopLoss: stop,
            takeProfit: tp,
            takeProfit2: tp2,
            setupKind: 'retrace_long',
          });
          break;
        }
      }
    }
  }

  return cand.sort((a, b) => a.time - b.time).slice(-maxCand);
}

/**
 * 구조 확정: BOS + (리테스트 거절 봉) 또는 옵션 시 돌파 봉 즉시.
 * RSI 다이버전스 방향 또는 settlement 안착확인 중 하나 이상 필요. TP는 다음 스윙/유동 존까지 확장.
 */
function buildStructureRocketSignals(
  visible: Candle[],
  bosList: Array<{ bias: 'bullish' | 'bearish'; index: number; price: number; brokenLevel?: number }>,
  div: DivergenceSignalResult,
  settlementZone: SettlementZoneRocket,
  atrVal: number,
  swings: Array<{ type: 'high' | 'low'; index: number; price: number }>,
  allDemand: ZonePoi[],
  allSupply: ZonePoi[],
  timeframe: string,
  opts?: { allowBreakoutWithoutRetest?: boolean },
  maxOut = 22
): StructureRocketRow[] {
  const RETEST_MAX = 40;
  const epsPct = 0.0022;
  const atr = Math.max(atrVal, visible.length ? (Math.max(...visible.map((c) => c.high)) - Math.min(...visible.map((c) => c.low))) * 0.0002 : 1e-8);
  const cand: StructureRocketRow[] = [];
  const allowBo = opts?.allowBreakoutWithoutRetest === true;

  for (const b of bosList) {
    const broken = b.brokenLevel;
    if (broken == null || !isFinite(broken)) continue;
    const bi = b.index;
    if (bi < 0 || bi >= visible.length) continue;
    const eps = Math.max(broken * epsPct, 1e-8);

    if (b.bias === 'bearish') {
      let retestJ = -1;
      for (let j = bi + 1; j <= Math.min(bi + RETEST_MAX, visible.length - 1); j++) {
        const c = visible[j];
        const touched = c.high >= broken - eps;
        const reject = c.close < broken - eps * 0.35;
        if (touched && reject) {
          retestJ = j;
          break;
        }
      }
      if (retestJ >= 0) {
        const rsiOk = divAlignsShort(div, retestJ, timeframe);
        const stOk = settlementMatches(settlementZone, 'SHORT');
        if (structureRocketConfirmGate(rsiOk, stOk, timeframe)) {
          const source: StructureRocketRow['source'] =
            rsiOk && stOk ? 'bos_retest_both' : stOk ? 'bos_retest_settlement' : 'bos_retest_rsi';
          const entry = visible[retestJ].close;
          const stop = Math.max(visible[retestJ].high, broken + eps * 0.5) + atr * 0.2;
          const tp = computeTpShort(entry, retestJ, swings, allDemand, atr);
          const tp2 = computeTp2Short(entry, retestJ, swings, allDemand, atr, tp);
          cand.push({
            time: visible[retestJ].time as number,
            direction: 'SHORT',
            source,
            entryPrice: entry,
            stopLoss: stop,
            takeProfit: tp,
            takeProfit2: tp2,
            setupKind: 'breakdown_retest',
          });
        }
      }
      if (allowBo) {
        const bc = visible[bi];
        const brokeBar = bc.close < broken - eps * 0.25;
        if (brokeBar) {
          const rsiOkB = divAlignsShort(div, bi, timeframe);
          const stOkB = settlementMatches(settlementZone, 'SHORT');
          if (structureRocketConfirmGate(rsiOkB, stOkB, timeframe)) {
            const source: StructureRocketRow['source'] =
              rsiOkB && stOkB ? 'bos_retest_both' : stOkB ? 'bos_retest_settlement' : 'bos_retest_rsi';
            const entry = bc.close;
            const stop = Math.max(bc.high, broken + eps * 0.5) + atr * 0.2;
            const tp = computeTpShort(entry, bi, swings, allDemand, atr);
            const tp2 = computeTp2Short(entry, bi, swings, allDemand, atr, tp);
            cand.push({
              time: bc.time as number,
              direction: 'SHORT',
              source,
              entryPrice: entry,
              stopLoss: stop,
              takeProfit: tp,
              takeProfit2: tp2,
              setupKind: 'breakdown_breakout',
            });
          }
        }
      }
    } else {
      let retestJ = -1;
      for (let j = bi + 1; j <= Math.min(bi + RETEST_MAX, visible.length - 1); j++) {
        const c = visible[j];
        const touched = c.low <= broken + eps;
        const reject = c.close > broken + eps * 0.35;
        if (touched && reject) {
          retestJ = j;
          break;
        }
      }
      if (retestJ >= 0) {
        const rsiOk = divAlignsLong(div, retestJ, timeframe);
        const stOk = settlementMatches(settlementZone, 'LONG');
        if (structureRocketConfirmGate(rsiOk, stOk, timeframe)) {
          const source: StructureRocketRow['source'] =
            rsiOk && stOk ? 'bos_retest_both' : stOk ? 'bos_retest_settlement' : 'bos_retest_rsi';
          const entry = visible[retestJ].close;
          const stop = Math.min(visible[retestJ].low, broken - eps * 0.5) - atr * 0.2;
          const tp = computeTpLong(entry, retestJ, swings, allSupply, atr);
          const tp2 = computeTp2Long(entry, retestJ, swings, allSupply, atr, tp);
          cand.push({
            time: visible[retestJ].time as number,
            direction: 'LONG',
            source,
            entryPrice: entry,
            stopLoss: stop,
            takeProfit: tp,
            takeProfit2: tp2,
            setupKind: 'retrace_long',
          });
        }
      }
      if (allowBo) {
        const bc = visible[bi];
        const brokeBar = bc.close > broken + eps * 0.25;
        if (brokeBar) {
          const rsiOkB = divAlignsLong(div, bi, timeframe);
          const stOkB = settlementMatches(settlementZone, 'LONG');
          if (structureRocketConfirmGate(rsiOkB, stOkB, timeframe)) {
            const source: StructureRocketRow['source'] =
              rsiOkB && stOkB ? 'bos_retest_both' : stOkB ? 'bos_retest_settlement' : 'bos_retest_rsi';
            const entry = bc.close;
            const stop = Math.min(bc.low, broken - eps * 0.5) - atr * 0.2;
            const tp = computeTpLong(entry, bi, swings, allSupply, atr);
            const tp2 = computeTp2Long(entry, bi, swings, allSupply, atr, tp);
            cand.push({
              time: bc.time as number,
              direction: 'LONG',
              source,
              entryPrice: entry,
              stopLoss: stop,
              takeProfit: tp,
              takeProfit2: tp2,
              setupKind: 'retrace_breakout',
            });
          }
        }
      }
    }
  }

  return mergeDedupeStructureRockets(cand, maxOut);
}

export function analyzeCandles(symbol: string, timeframe: string, candles: Candle[], options?: {
  htfTrend?: 'bullish' | 'bearish' | 'range';
  trend1M?: 'bullish' | 'bearish' | 'range' | null;
  majorZoneWidthScale?: number;
  majorZoneOpacity?: number;
  majorZoneMinTouches?: number;
  /** API/설정: BOS 돌파 봉 즉시 구조 마커(리테스트 별도) */
  structureBreakoutWithoutRetest?: boolean;
  /** 장대봉 직전 3캔 vs 기록 패턴 코사인 유사도 하한(0.55~0.98) */
  pre3SimilarityThreshold?: number;
  /** true: 마지막 봉 마감 후에만 pre3 matched(기본) */
  pre3ConfirmOnCloseOnly?: boolean;
  /** LuxAlgo 스타일 피벗 추세선 좌우 봉 수 (2~15, 기본 3) */
  trendlineLookback?: number;
  /** ParkF LinReg·피벗 추세선 색 (#RRGGBB, 부분만 넘겨도 나머지 기본값) */
  parkfTrendlineColors?: Partial<ParkfTrendlineColorHex>;
  /** ParkF LinReg·추세선 스타일·굵기·배수 등 (Pine 입력 대응, 부분 병합) */
  parkfTrendlineOpts?: Partial<ParkfTrendlineOpts>;
  /** Volatility Trend Score [BackQuant] — L/S 삼각 마커 (캔들 색칠은 앱 기본 유지) */
  volatilityTrendScore?: Partial<VolatilityTrendScoreParams>;
  /** 호가·체결 고래 존 — WAD 급증과 합쳐 신뢰도·확률·거래량 라벨 보정 */
  whaleZones?: { buyZones: StrongZoneOutput[]; sellZones: StrongZoneOutput[] };
  /** collect=1 시 체결 비율 0~1 — AI 자동 요약 플로우 문구 */
  buyPressure?: number;
  sellPressure?: number;
  volumeDelta?: number;
  /** AI 모드 압축→장대 ATR 배수 (미지정 시 기본값) */
  aiCompression?: Partial<CompressionThresholds>;
  /** AI 모드: 압축에 거래량 축소 요구 */
  aiCompressionVolumeFilter?: boolean;
  /** AI·고래 UI: 신뢰·압축·Pre3·확률 파이프라인 최강 프로파일 */
  aiModeMax?: boolean;
  /** HTF Conviction Divergence Matrix (ChartPrime) — 상위 TF 캔들 */
  htfCandles?: Candle[];
  htfLabel?: string;
  /** ChartPrime 채널: Pine Volume BG — 바깥 면 색을 정규화 거래량에 연동 */
  chartPrimeVolumeBg?: boolean;
  /** false면 chartPrimeLength 수동, undefined·true면 캔들·TF 기반 자동 */
  chartPrimeAutoLength?: boolean;
  chartPrimeLength?: number;
  chartPrimeWait?: boolean;
  chartPrimeExtend?: boolean;
  /** Pine Show Last Channel */
  chartPrimeShowLast?: boolean;
  /** Pine linefill */
  chartPrimeShowFills?: boolean;
  chartPrimeTopHex?: string;
  chartPrimeCenterHex?: string;
  chartPrimeBottomHex?: string;
  /** CP 채널 폭(ATR) 배율 — `chartPrimeTrendChannels.ts` channelWidthScale */
  chartPrimeChannelWidthScale?: number;
}): AnalyzeResponse {
  const aiModeMax = options?.aiModeMax === true;
  const visible = candles.slice(-visibleLimit(timeframe));
  /** 달·연봉은 봉 수가 적어 기존 상한 유지, 그 외 TF는 BOS/FVG/OB 등을 월봉과 비슷한 “풀 세트”로 맞춤 */
  const structDraw = (() => {
    const coarse = timeframe === '1M' || timeframe === '1Y';
    return {
      bos: coarse ? 3 : 6,
      choch: coarse ? 2 : 4,
      /** EQH/EQL: 핵심 1쌍만(스코어는 selectCoreEqPairs) */
      eqh: 1,
      eql: 1,
      sweep: coarse ? 2 : 4,
      fvg: coarse ? 3 : 7,
      ob: coarse ? 3 : 6,
    };
  })();
  const min = Math.min(...visible.map(c => c.low));
  const max = Math.max(...visible.map(c => c.high));
  const range = Math.max(1e-9, max - min);
  const swings: Array<{ type: 'high' | 'low'; index: number; price: number }> = [];

  for (let i = 2; i < visible.length - 2; i++) {
    if (pivotHigh(visible, i)) swings.push({ type: 'high', index: i, price: visible[i].high });
    if (pivotLow(visible, i)) swings.push({ type: 'low', index: i, price: visible[i].low });
  }
  swings.sort((a, b) => a.index - b.index);

  const bos: Array<{ bias: 'bullish' | 'bearish'; index: number; price: number; brokenLevel?: number }> = [];
  const choch: Array<{ bias: 'bullish' | 'bearish'; index: number; price: number; brokenLevel?: number }> = [];
  let trend: 'bullish' | 'bearish' | 'range' = 'range';

  for (let i = 2; i < swings.length; i++) {
    const a = swings[i - 2];
    const c = swings[i];
    if (c.type === 'high' && a.type === 'high' && c.price > a.price) {
      bos.push({ bias: 'bullish', index: c.index, price: c.price, brokenLevel: a.price });
      if (trend === 'bearish') choch.push({ bias: 'bullish', index: c.index, price: c.price, brokenLevel: a.price });
      trend = 'bullish';
    }
    if (c.type === 'low' && a.type === 'low' && c.price < a.price) {
      bos.push({ bias: 'bearish', index: c.index, price: c.price, brokenLevel: a.price });
      if (trend === 'bullish') choch.push({ bias: 'bearish', index: c.index, price: c.price, brokenLevel: a.price });
      trend = 'bearish';
    }
  }

  const eqh: Array<{ a: number; b: number; price: number }> = [];
  const eql: Array<{ a: number; b: number; price: number }> = [];
  const sweeps: Array<{ side: 'buy' | 'sell'; index: number; price: number }> = [];
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');
  const tol = 0.0025;

  for (let i = 1; i < highs.length; i++) {
    const prev = highs[i - 1], cur = highs[i];
    if (Math.abs(cur.price - prev.price) / prev.price <= tol) {
      eqh.push({ a: prev.index, b: cur.index, price: Math.max(prev.price, cur.price) });
      for (let j = cur.index + 1; j <= Math.min(cur.index + 8, visible.length - 1); j++) {
        if (visible[j].high > cur.price && visible[j].close < cur.price) {
          sweeps.push({ side: 'buy', index: j, price: visible[j].high });
          break;
        }
      }
    }
  }

  for (let i = 1; i < lows.length; i++) {
    const prev = lows[i - 1], cur = lows[i];
    if (Math.abs(cur.price - prev.price) / prev.price <= tol) {
      eql.push({ a: prev.index, b: cur.index, price: Math.min(prev.price, cur.price) });
      for (let j = cur.index + 1; j <= Math.min(cur.index + 8, visible.length - 1); j++) {
        if (visible[j].low < cur.price && visible[j].close > cur.price) {
          sweeps.push({ side: 'sell', index: j, price: visible[j].low });
          break;
        }
      }
    }
  }

  const atrVal = atr(visible, Math.min(50, Math.max(5, visible.length - 2)));
  const atr200 = atr(visible, Math.min(200, visible.length - 1));

  const simpleBos: Array<{ bias: 'bullish' | 'bearish'; index: number; price: number }> = [];
  for (let i = 1; i < visible.length; i++) {
    if (visible[i].close > visible[i - 1].high) simpleBos.push({ bias: 'bullish', index: i, price: visible[i].close });
    if (visible[i].close < visible[i - 1].low) simpleBos.push({ bias: 'bearish', index: i, price: visible[i].close });
  }
  const bosForObKey = (b: { index: number; bias: string }) => `${b.index}:${b.bias}`;
  const bosForObMap = new Map<string, { bias: 'bullish' | 'bearish'; index: number; price: number }>();
  for (const b of bos) bosForObMap.set(bosForObKey(b), b);
  for (const b of simpleBos) {
    if (!bosForObMap.has(bosForObKey(b))) bosForObMap.set(bosForObKey(b), b);
  }
  const bosSortedForOb = Array.from(bosForObMap.values()).sort((a, b) => a.index - b.index);

  /** FVG: 3캔들(i-2,i-1,i)에서 갭 [low,high] 가격대. 이후 봉이 갭과 겹치면(터치·체결) 사용됨 → 차트에서 숨김(valid=false). */
  const fvg: Array<{ bias: 'bullish' | 'bearish'; index: number; low: number; high: number; valid: boolean }> = [];
  const rangeOverlapsGap = (c: { low: number; high: number }, gapLo: number, gapHi: number) =>
    c.low <= gapHi && c.high >= gapLo;
  for (let i = 2; i < visible.length; i++) {
    const c1 = visible[i - 2], c3 = visible[i];
    if (c1.high < c3.low) {
      const gapLo = c1.high;
      const gapHi = c3.low;
      let mitigated = false;
      for (let j = i + 1; j < visible.length; j++) {
        if (rangeOverlapsGap(visible[j], gapLo, gapHi)) {
          mitigated = true;
          break;
        }
      }
      fvg.push({ bias: 'bullish', index: i, low: gapLo, high: gapHi, valid: !mitigated });
    }
    if (c1.low > c3.high) {
      const gapLo = c3.high;
      const gapHi = c1.low;
      let mitigated = false;
      for (let j = i + 1; j < visible.length; j++) {
        if (rangeOverlapsGap(visible[j], gapLo, gapHi)) {
          mitigated = true;
          break;
        }
      }
      fvg.push({ bias: 'bearish', index: i, low: gapLo, high: gapHi, valid: !mitigated });
    }
  }

  const obs: Array<{ bias: 'bullish' | 'bearish'; index: number; low: number; high: number }> = [];
  for (const x of bosSortedForOb.slice(-14)) {
    const start = Math.max(1, x.index - 6);
    const end = x.index - 1;
    if (end <= start) continue;
    if (x.bias === 'bullish') {
      for (let i = end; i >= start; i--) {
        if (visible[i].close < visible[i].open) {
          obs.push({ bias: 'bullish', index: i, low: Math.min(visible[i].open, visible[i].close), high: visible[i].high });
          break;
        }
      }
    } else {
      for (let i = end; i >= start; i--) {
        if (visible[i].close > visible[i].open) {
          obs.push({ bias: 'bearish', index: i, low: visible[i].low, high: Math.max(visible[i].open, visible[i].close) });
          break;
        }
      }
    }
  }

  const rangeLow = Math.min(...visible.map(c => c.low));
  const rangeHigh = Math.max(...visible.map(c => c.high));
  const eq = (rangeLow + rangeHigh) / 2;
  const patterns = detectPatterns(visible, swings);

  // FluidTrades: Supply/Demand — TF별 피벗 길이 + 겹침 임계(HTF ATR 과대 방지)
  let swingLen = fluidTradesSwingLen(timeframe);
  const minBarsForSwing = swingLen * 2 + 3;
  if (visible.length < minBarsForSwing && visible.length >= 7) {
    swingLen = Math.max(2, Math.floor((visible.length - 3) / 2));
  }
  const fluidSwings: Array<{ type: 'high' | 'low'; index: number; price: number }> = [];
  for (let i = swingLen; i < visible.length - swingLen; i++) {
    if (pivotHigh(visible, i, swingLen, swingLen)) fluidSwings.push({ type: 'high', index: i, price: visible[i].high });
    if (pivotLow(visible, i, swingLen, swingLen)) fluidSwings.push({ type: 'low', index: i, price: visible[i].low });
  }
  fluidSwings.sort((a, b) => a.index - b.index);

  const supplyZones: Array<{ left: number; right: number; top: number; bottom: number; poi: number }> = [];
  const demandZones: Array<{ left: number; right: number; top: number; bottom: number; poi: number }> = [];
  const overlapThreshold = fluidSdOverlapThreshold(atrVal, rangeHigh, rangeLow);
  const fluidSwingTail = timeframeRank(timeframe) >= timeframeRank('1h') ? 140 : 50;
  const zoneHeightAtr = 0.5;

  function checkOverlap(poi: number, zones: Array<{ poi: number }>) {
    for (const z of zones) {
      if (poi >= z.poi - overlapThreshold && poi <= z.poi + overlapThreshold) return false;
    }
    return true;
  }

  const allSupply: Array<{ left: number; right: number; top: number; bottom: number; poi: number }> = [];
  const allDemand: Array<{ left: number; right: number; top: number; bottom: number; poi: number }> = [];

  for (const s of fluidSwings.slice(-fluidSwingTail)) {
    const c = visible[s.index];
    if (!c) continue;
    const poi = (c.high + c.low) / 2;
    const halfH = Math.min((c.high - c.low) / 2, atrVal * zoneHeightAtr);
    const top = poi + halfH;
    const bottom = poi - halfH;
    if (s.type === 'high' && checkOverlap(poi, allSupply)) {
      allSupply.push({ left: s.index, right: visible.length - 1, top, bottom, poi });
    } else if (s.type === 'low' && checkOverlap(poi, allDemand)) {
      allDemand.push({ left: s.index, right: visible.length - 1, top, bottom, poi });
    }
  }

  allSupply.sort((a, b) => b.poi - a.poi);
  allDemand.sort((a, b) => a.poi - b.poi);
  for (let i = 0; i < allSupply.length && supplyZones.length < 4; i++) {
    const z = allSupply[i];
    if (checkOverlap(z.poi, supplyZones)) supplyZones.push(z);
  }
  for (let i = 0; i < allDemand.length && demandZones.length < 4; i++) {
    const z = allDemand[i];
    if (checkOverlap(z.poi, demandZones)) demandZones.push(z);
  }

  // LuxAlgo: Trailing extremes (Strong/Weak High/Low)
  let trailTop = rangeHigh;
  let trailBottom = rangeLow;
  let trailTopIdx = 0;
  let trailBottomIdx = 0;
  for (let i = Math.max(0, visible.length - 150); i < visible.length; i++) {
    if (visible[i].high >= trailTop) {
      trailTop = visible[i].high;
      trailTopIdx = i;
    }
    if (visible[i].low <= trailBottom) {
      trailBottom = visible[i].low;
      trailBottomIdx = i;
    }
  }

  // LuxAlgo: EQH/EQL with 0.1*ATR threshold
  const eqhLux: Array<{ a: number; b: number; price: number }> = [];
  const eqlLux: Array<{ a: number; b: number; price: number }> = [];
  const tolLux = 0.1 * atr200;
  for (let i = 1; i < highs.length; i++) {
    const prev = highs[i - 1], cur = highs[i];
    if (Math.abs(cur.price - prev.price) <= tolLux) {
      eqhLux.push({ a: prev.index, b: cur.index, price: Math.max(prev.price, cur.price) });
    }
  }
  for (let i = 1; i < lows.length; i++) {
    const prev = lows[i - 1], cur = lows[i];
    if (Math.abs(cur.price - prev.price) <= tolLux) {
      eqlLux.push({ a: prev.index, b: cur.index, price: Math.min(prev.price, cur.price) });
    }
  }

  // HH/LH/HL/LL from last swing points
  // 과거 L/S 히스토리 복원을 위해 스윙 샘플을 충분히 유지
  const lastHighs = swings.filter(s => s.type === 'high').slice(-160);
  const lastLows = swings.filter(s => s.type === 'low').slice(-160);

  let luxTrendlineEngineOut: LuxTrendlineEngineResult = {
    overlays: [],
    meta: {
      resistBrokenUp: false,
      supportBrokenDown: false,
      bouncedSupport: false,
      rejectedResistance: false,
    },
  };

  const overlays: OverlayItem[] = [];

  const C = OVERLAY_COLORS;
  overlays.push({
    id: 'eq-line',
    kind: 'supportLine',
    label: '균형(EQ)',
    x1: 0.04,
    y1: toRatio(eq, min, max),
    x2: 0.96,
    y2: toRatio(eq, min, max),
    time1: visTime(visible, 0),
    time2: visTime(visible, visible.length - 1),
    price1: eq,
    price2: eq,
    confidence: 65,
    color: C.eqLine,
  });

  // Tailong candle-close overlays (image-based rule implementation)
  const tailongCloseSignals = detectTailongCloseSignals(visible, atrVal, timeframe);
  const tailongAnchorT = visTime(visible, visible.length - 1);
  tailongCloseSignals.forEach((s, i) => {
    const lineColor =
      s.bias === 'bullish'
        ? 'rgba(34,197,94,0.92)'
        : s.bias === 'bearish'
          ? 'rgba(239,68,68,0.92)'
          : 'rgba(251,191,36,0.92)';
    const isAbsorb = s.id.includes('wick-absorb');
    const isBreak = s.id.includes('breakout') || s.id.includes('breakdown');
    if (isAbsorb) {
      const pad = Math.max(atrVal * 0.08, s.price * 0.0008);
      const zoneKind: OverlayItem['kind'] = s.bias === 'bearish' ? 'supplyZone' : 'demandZone';
      overlays.push({
        id: `${s.id}-zone`,
        kind: zoneKind,
        label: s.label,
        x1: Math.max(0.02, 0.72 - i * 0.02),
        y1: toRatio(s.price + pad, min, max),
        x2: 0.98,
        y2: toRatio(s.price - pad, min, max),
        time1: tailongAnchorT,
        time2: tailongAnchorT,
        price1: s.price + pad,
        price2: s.price - pad,
        confidence: s.confidence,
        color: lineColor,
        category: 'zones',
      });
    } else {
      const lineCategory: OverlayItem['category'] = isBreak ? 'keyLevel' : 'structure';
      overlays.push({
        id: `${s.id}-line`,
        kind: 'keyLevel',
        label: s.label,
        x1: Math.max(0.02, 0.70 - i * 0.03),
        y1: toRatio(s.price, min, max),
        x2: 0.98,
        y2: toRatio(s.price, min, max),
        time1: tailongAnchorT,
        time2: tailongAnchorT,
        price1: s.price,
        price2: s.price,
        confidence: s.confidence,
        color: lineColor,
        category: lineCategory,
      });
    }
  });

  const nVis = Math.max(1, visible.length - 1);
  for (const x of bos.slice(-structDraw.bos)) {
    const i2 = Math.min(visible.length - 1, x.index + 6);
    overlays.push({
      id: `bos-${x.index}`,
      kind: 'bos',
      label: '구조돌파(BOS)',
      x1: x.index / nVis,
      y1: toRatio(x.price, min, max),
      x2: Math.min(0.98, i2 / nVis),
      y2: toRatio(x.price, min, max),
      time1: visTime(visible, x.index),
      time2: visTime(visible, i2),
      price1: x.price,
      price2: x.price,
      confidence: 80,
      color: x.bias === 'bullish' ? C.bosBullish : C.bosBearish,
      category: 'structure',
      structureBias: x.bias,
    });
  }
  for (const x of choch.slice(-structDraw.choch)) {
    const i2c = Math.min(visible.length - 1, x.index + 6);
    overlays.push({
      id: `choch-${x.index}`,
      kind: 'choch',
      label: '추세전환(CHOCH)',
      x1: x.index / nVis,
      y1: toRatio(x.price, min, max),
      x2: Math.min(0.98, i2c / nVis),
      y2: toRatio(x.price, min, max),
      time1: visTime(visible, x.index),
      time2: visTime(visible, i2c),
      price1: x.price,
      price2: x.price,
      confidence: 78,
      color: x.bias === 'bullish' ? C.chochBullish : C.chochBearish,
      category: 'structure',
      structureBias: x.bias,
    });
  }
  const coreEqh = selectCoreEqPairs(eqh, visible, atrVal, structDraw.eqh);
  const coreEql = selectCoreEqPairs(eql, visible, atrVal, structDraw.eql);
  const eqhToDraw = coreEqh.length > 0 ? coreEqh : eqhLux.slice(-structDraw.eqh);
  const eqlToDraw = coreEql.length > 0 ? coreEql : eqlLux.slice(-structDraw.eql);
  for (const x of eqhToDraw) {
    const useLux = coreEqh.length === 0;
    overlays.push({
      id: useLux ? `eqhl-${x.a}` : `eqh-${x.a}`,
      kind: 'eqh',
      label: '균형고점(EQH)',
      x1: x.a / nVis,
      y1: toRatio(x.price, min, max),
      x2: x.b / nVis,
      y2: toRatio(x.price, min, max),
      time1: visTime(visible, x.a),
      time2: visTime(visible, x.b),
      price1: x.price,
      price2: x.price,
      confidence: useLux ? 72 : 74,
      color: useLux ? C.eqhLux : C.eqh,
    });
  }
  for (const x of eqlToDraw) {
    const useLux = coreEql.length === 0;
    overlays.push({
      id: useLux ? `eqll-${x.a}` : `eql-${x.a}`,
      kind: 'eql',
      label: '균형저점(EQL)',
      x1: x.a / nVis,
      y1: toRatio(x.price, min, max),
      x2: x.b / nVis,
      y2: toRatio(x.price, min, max),
      time1: visTime(visible, x.a),
      time2: visTime(visible, x.b),
      price1: x.price,
      price2: x.price,
      confidence: useLux ? 72 : 74,
      color: useLux ? C.eqlLux : C.eql,
    });
  }
  for (const x of sweeps.slice(-structDraw.sweep)) {
    const i2s = Math.min(visible.length - 1, x.index + 3);
    overlays.push({
      id: `sweep-${x.index}`,
      kind: 'liquiditySweep',
      label: '유동성 스윕',
      x1: x.index / nVis,
      y1: toRatio(x.price, min, max),
      x2: Math.min(0.98, i2s / nVis),
      y2: toRatio(x.price, min, max),
      time1: visTime(visible, x.index),
      time2: visTime(visible, i2s),
      price1: x.price,
      price2: x.price,
      confidence: 76,
      color: C.sweep,
    });
  }

  // 라이트 화면 예시처럼 큰 구간 major support/resistance zone 추가
  overlays.push(...buildMajorSupportResistanceOverlays(
    visible,
    min,
    max,
    options?.majorZoneWidthScale ?? 1,
    options?.majorZoneOpacity ?? 0.24,
    options?.majorZoneMinTouches ?? 2,
    trend,
    visible[visible.length - 1]?.close,
    [
      options?.htfTrend === trend ? 1 : 0,
      options?.trend1M === trend ? 1 : 0,
      1, // current timeframe trend agreement
    ].reduce((a, b) => a + b, 0)
  ));

  // Triple Top / Triple Bottom — Underneath Support, Overhead Support (분·시간·일·주 각 TF 자동 분석)
  const triplePattern = detectTriplePattern(visible);
  if (triplePattern) {
    if (triplePattern.type === 'triple_top') {
      overlays.push({
        id: 'triple-top-resistance',
        kind: 'keyLevel',
        label: '저항선',
        x1: 0.02,
        y1: toRatio(triplePattern.resistancePrice, min, max),
        x2: 0.98,
        y2: toRatio(triplePattern.resistancePrice, min, max),
        confidence: 76,
        color: C.tripleResistance,
        category: 'structure',
      });
      overlays.push({
        id: 'triple-top-underneath',
        kind: 'supportLine',
        label: '하단지지선',
        x1: 0.02,
        y1: toRatio(triplePattern.underneathSupportPrice, min, max),
        x2: 0.98,
        y2: toRatio(triplePattern.underneathSupportPrice, min, max),
        confidence: 78,
        color: C.tripleUnderneath,
        category: 'structure',
        lineDash: '6 5',
      });
      if (triplePattern.breakout === 'DOWN_BREAK') {
        overlays.push({
          id: 'triple-top-breakout',
          kind: 'label',
          label: '↓ 패턴 완성',
          x1: 0.88,
          y1: toRatio(triplePattern.underneathSupportPrice, min, max),
          confidence: 82,
          color: C.tripleResistance,
          category: 'structure',
        });
      }
    } else {
      overlays.push({
        id: 'triple-bottom-support',
        kind: 'keyLevel',
        label: '지지선',
        x1: 0.02,
        y1: toRatio(triplePattern.supportPrice, min, max),
        x2: 0.98,
        y2: toRatio(triplePattern.supportPrice, min, max),
        confidence: 76,
        color: C.tripleSupport,
        category: 'structure',
      });
      overlays.push({
        id: 'triple-bottom-overhead',
        kind: 'resistanceLine',
        label: '상단저항선',
        x1: 0.02,
        y1: toRatio(triplePattern.overheadSupportPrice, min, max),
        x2: 0.98,
        y2: toRatio(triplePattern.overheadSupportPrice, min, max),
        confidence: 78,
        color: C.tripleOverhead,
        category: 'structure',
        lineDash: '6 5',
      });
      if (triplePattern.breakout === 'UP_BREAK') {
        overlays.push({
          id: 'triple-bottom-breakout',
          kind: 'label',
          label: '↑ 패턴 완성',
          x1: 0.88,
          y1: toRatio(triplePattern.overheadSupportPrice, min, max),
          confidence: 82,
          color: C.tripleSupport,
          category: 'structure',
        });
      }
    }
  }

  // Zone & Trendline Engine — Support/Resistance Zone, Underneath/Overhead, Retest, Breakout, Double Top/Bottom
  const zoneResult = runZoneTrendlineEngine(visible);
  const zoneOverlays = zoneTrendlineToOverlays(
    zoneResult,
    visible,
    min,
    max,
    {
      support: C.zoneSupport,
      resistance: C.zoneResistance,
      underneath: C.zoneUnderneath,
      overhead: C.zoneOverhead,
      retest: C.zoneRetest,
      breakout: C.zoneBreakout,
    }
  );
  overlays.push(...zoneOverlays.filter((o) => o.kind !== 'trendLine').slice(0, 12));

  const tlLb = options?.trendlineLookback ?? 3;
  const primaryPivotLen = Math.max(15, Math.min(32, 9 + tlLb * 3));
  const secondaryPivotLen = Math.max(6, Math.min(14, 3 + tlLb * 2));
  const parkfPartial = options?.parkfTrendlineOpts;
  const lrClamp = Math.min(
    5000,
    Math.max(2, Math.min(parkfPartial?.linregLength ?? DEFAULT_PARKF_TRENDLINE_OPTS.linregLength, visible.length))
  );
  luxTrendlineEngineOut = computeParkfTrendlineOverlays(visible, min, max, {
    ...DEFAULT_PARKF_TRENDLINE_OPTS,
    ...parkfPartial,
    linregLength: lrClamp,
    primaryPivotLen: parkfPartial?.primaryPivotLen ?? primaryPivotLen,
    secondaryPivotLen: parkfPartial?.secondaryPivotLen ?? secondaryPivotLen,
    colors: options?.parkfTrendlineColors,
  });
  overlays.push(...luxTrendlineEngineOut.overlays);

  /** FVG ZONE: 상승 FVG 확정 / 하락 FVG 확정 (갭 미채움 = 아직 유효한 존) */
  const fvgZoneLabel = (bias: 'bullish' | 'bearish') => (bias === 'bullish' ? '상승 FVG' : '하락 FVG');
  const validFvg = fvg.filter(x => x.valid);
  for (const x of validFvg.slice(-structDraw.fvg)) {
    const iLeft = Math.max(0, x.index - 2);
    const iRight = visible.length - 1;
    overlays.push({
      id: `fvg-${x.index}`,
      kind: 'fvg',
      label: fvgZoneLabel(x.bias),
      x1: iLeft / nVis,
      y1: toRatio(x.high, min, max),
      x2: Math.min(0.98, iRight / nVis),
      y2: toRatio(x.low, min, max),
      time1: visTime(visible, iLeft),
      time2: visTime(visible, iRight),
      price1: x.high,
      price2: x.low,
      confidence: 76,
      color: x.bias === 'bullish' ? C.fvgBullish : C.fvgBearish,
      category: 'zones',
    });
  }

  const hasSimpleBreakoutAfter = (idx: number, bias: 'bullish' | 'bearish') =>
    simpleBos.some(b => b.bias === bias && b.index > idx && b.index - idx <= 14);
  const hasStructureBreak = (idx: number, bias: 'bullish' | 'bearish') =>
    bos.some(b => b.bias === bias && Math.abs(b.index - idx) <= 8) ||
    choch.some(c => c.bias === bias && Math.abs(c.index - idx) <= 8) ||
    hasSimpleBreakoutAfter(idx, bias);
  /** OB 검증: 동일 방향 FVG + 갭 크기 ≥ ATR×비율 (약한 이격 제외) */
  const hasStrongFvgSameDirection = (idx: number, bias: 'bullish' | 'bearish') =>
    validFvg.some(f => {
      if (f.bias !== bias || f.index < idx - 2 || f.index > idx + 15) return false;
      const gap = f.high - f.low;
      return gap / Math.max(atrVal, 1e-12) >= FVG_GAP_MIN_ATR_RATIO;
    });
  const validObs = obs.filter(o => hasStructureBreak(o.index, o.bias) && hasStrongFvgSameDirection(o.index, o.bias));
  const obMomCtx = computeObMomentumContext(visible, atrVal, trend);
  const beamForecasts = computeForwardBeamForecasts(obMomCtx, trend, [3, 5, 8]);
  for (const x of validObs.slice(-structDraw.ob)) {
    const mitigated = isObMitigated(x, visible);
    const baseColor = x.bias === 'bullish' ? C.obBullish : C.obBearish;
    const { label, treatAsMitigated } = resolveObMitigatedUpgrade(x.bias, mitigated, false, obMomCtx, trend);
    const color = treatAsMitigated ? dimOverlayColor(baseColor, 0.42) : baseColor;
    const conf = !mitigated
      ? 78
      : treatAsMitigated
        ? 68
        : Math.min(
            94,
            76 +
              Math.round(
                ((x.bias === 'bullish' ? obMomCtx.longProb : obMomCtx.shortProb) - OB_STRONG_CONTINUATION_MIN) / 2
              )
          );
    const i2o = Math.min(visible.length - 1, x.index + 10);
    overlays.push({
      id: `ob-${x.index}`,
      kind: 'ob',
      label,
      x1: x.index / nVis,
      y1: toRatio(x.high, min, max),
      x2: Math.min(0.98, i2o / nVis),
      y2: toRatio(x.low, min, max),
      time1: visTime(visible, x.index),
      time2: visTime(visible, i2o),
      price1: x.high,
      price2: x.low,
      confidence: conf,
      color,
      obMitigated: treatAsMitigated,
    });
  }

  // 선포착 OB: BOS/FVG 확인 전, 반대 봉이 나온 직후부터 후보로 표시 (OB 만든 봉을 먼저 포착)
  const confirmedIdxSet = new Set(validObs.map(o => o.index));
  const earlyObs: Array<{ bias: 'bullish' | 'bearish'; index: number; low: number; high: number }> = [];
  const lookBack = Math.min(20, visible.length - 2);
  for (let i = visible.length - 1; i >= Math.max(0, visible.length - lookBack); i--) {
    if (confirmedIdxSet.has(i)) continue;
    const c = visible[i];
    const next = visible[i + 1];
    if (!next) continue;
    const bodyPct = Math.abs(c.close - c.open) / (c.high - c.low || 1e-9);
    if (bodyPct < 0.3) continue; // 몸통이 너무 작으면 스킵
    if (c.close < c.open && next.close > next.open) {
      earlyObs.push({ bias: 'bullish', index: i, low: Math.min(c.open, c.close), high: c.high });
    } else if (c.close > c.open && next.close < next.open) {
      earlyObs.push({ bias: 'bearish', index: i, low: c.low, high: Math.max(c.open, c.close) });
    }
  }
  const earlyObsDedup = earlyObs.slice(0, 2);
  for (const x of earlyObsDedup) {
    const mitigated = isObMitigated(x, visible);
    const baseEarly = x.bias === 'bullish' ? C.obEarlyBullish : C.obEarlyBearish;
    const { label, treatAsMitigated } = resolveObMitigatedUpgrade(x.bias, mitigated, true, obMomCtx, trend);
    const color = treatAsMitigated ? dimOverlayColor(baseEarly, 0.42) : baseEarly;
    const conf = !mitigated
      ? 65
      : treatAsMitigated
        ? 58
        : Math.min(
            90,
            62 +
              Math.round(
                ((x.bias === 'bullish' ? obMomCtx.longProb : obMomCtx.shortProb) - OB_STRONG_CONTINUATION_MIN) / 2
              )
          );
    const i2e = Math.min(visible.length - 1, x.index + 10);
    overlays.push({
      id: `ob-early-${x.index}`,
      kind: 'ob',
      label,
      x1: x.index / nVis,
      y1: toRatio(x.high, min, max),
      x2: Math.min(0.98, i2e / nVis),
      y2: toRatio(x.low, min, max),
      time1: visTime(visible, x.index),
      time2: visTime(visible, i2e),
      price1: x.high,
      price2: x.low,
      confidence: conf,
      color,
      category: 'zones',
      obMitigated: treatAsMitigated,
    });
  }

  // 선행 빔 예측: "N캔들 후 롱빔/숏빔" 확률을 마지막 캔들 근처에 핀 라벨로 표시
  // - 너무 약한 수치는 노이즈가 커서 제외(68% 미만)
  // - 각 horizon마다 우세 방향 1개만 표시해 화면 과밀 방지
  const lastCandle = visible[visible.length - 1];
  if (lastCandle) {
    const minForecastLabelProb = trend === 'range' ? 60 : 55;
    beamForecasts.forEach((f, i) => {
      const pickLong = f.longProb >= f.shortProb;
      const chosenProb = pickLong ? f.longProb : f.shortProb;
      if (chosenProb < minForecastLabelProb) return;
      const watchOnly = chosenProb < 68;
      const yPrice = pickLong
        ? Math.min(max, lastCandle.high + atrVal * (0.12 + i * 0.06))
        : Math.max(min, lastCandle.low - atrVal * (0.12 + i * 0.06));
      overlays.push({
        id: `beam-forecast-${f.horizon}`,
        kind: 'label',
        label: `${f.horizon}캔들후 ${pickLong ? '롱빔' : '숏빔'} ${chosenProb}%${watchOnly ? ' · 관찰' : ''}`,
        x1: Math.min(0.975, 0.90 + i * 0.035),
        y1: toRatio(yPrice, min, max),
        time1: lastCandle.time as number,
        price1: yPrice,
        confidence: Math.min(95, watchOnly ? Math.max(60, chosenProb) : chosenProb),
        color: pickLong
          ? (watchOnly ? 'rgba(34,197,94,0.72)' : 'rgba(34,197,94,0.95)')
          : (watchOnly ? 'rgba(239,68,68,0.72)' : 'rgba(239,68,68,0.95)'),
        category: 'labels',
      });
    });

    // 3/5/8 캔들 예측이 같은 방향으로 기준 이상이면 "빔확정" 뱃지 표시
    // - 기본 보수형: 3·5캔들 80%+, 8캔들 70%+
    // - 횡보장(range): 노이즈가 커서 85/85/75로 자동 상향
    const f3 = beamForecasts.find((x) => x.horizon === 3);
    const f5 = beamForecasts.find((x) => x.horizon === 5);
    const f8 = beamForecasts.find((x) => x.horizon === 8);
    if (f3 && f5 && f8) {
      const t3 = trend === 'range' ? 85 : 80;
      const t5 = trend === 'range' ? 85 : 80;
      const t8 = trend === 'range' ? 75 : 70;
      const longQualified = f3.longProb >= t3 && f5.longProb >= t5 && f8.longProb >= t8;
      const shortQualified = f3.shortProb >= t3 && f5.shortProb >= t5 && f8.shortProb >= t8;
      if (longQualified || shortQualified) {
        const longSide = longQualified && !shortQualified;
        const shortSide = shortQualified && !longQualified;
        if (longSide || shortSide) {
          const badgeProb = longSide
            ? Math.round((f3.longProb + f5.longProb + f8.longProb) / 3)
            : Math.round((f3.shortProb + f5.shortProb + f8.shortProb) / 3);
          const yPrice = longSide
            ? Math.min(max, lastCandle.high + atrVal * 0.34)
            : Math.max(min, lastCandle.low - atrVal * 0.34);
          overlays.push({
            id: `beam-confirm-${longSide ? 'long' : 'short'}`,
            kind: 'label',
            label: `${longSide ? '롱빔확정' : '숏빔확정'} ${badgeProb}%`,
            x1: 0.935,
            y1: toRatio(yPrice, min, max),
            time1: lastCandle.time as number,
            price1: yPrice,
            confidence: Math.min(98, badgeProb + 6),
            color: longSide ? 'rgba(16,185,129,0.98)' : 'rgba(239,68,68,0.98)',
            category: 'labels',
          });
        }
      }
    }
  }

  // BPR (Balance Price Range)
  const bprZones = detectBPR(fvg, atrVal);
  for (const z of bprZones.slice(0, 2)) {
    const i2b = Math.min(visible.length - 1, z.index + 12);
    overlays.push({
      id: `bpr-${z.index}`,
      kind: 'bprZone',
      label: '균형가격구간(BPR)',
      x1: z.index / nVis,
      y1: toRatio(z.top, min, max),
      x2: Math.min(0.98, i2b / nVis),
      y2: toRatio(z.bottom, min, max),
      time1: visTime(visible, z.index),
      time2: visTime(visible, i2b),
      price1: z.top,
      price2: z.bottom,
      confidence: 70,
      color: C.bpr,
      category: 'bpr',
    });
  }

  // Fibonacci: EQ, Golden Pocket (0.382–0.618) on last swing
  const lastSwingHigh = lastHighs[lastHighs.length - 1]?.price ?? rangeHigh;
  const lastSwingLow = lastLows[lastLows.length - 1]?.price ?? rangeLow;
  const fibs = fibLevels(lastSwingHigh, lastSwingLow);
  for (const r of [0.5, 0.382, 0.618]) {
    const p = fibs[r];
    if (p != null) {
      overlays.push({
        id: `fib-${r}`,
        kind: 'fibLine',
        label: r === 0.5 ? 'EQ 0.5' : r === 0.382 ? 'GP 0.382' : 'GP 0.618',
        x1: 0.02,
        y1: toRatio(p, min, max),
        x2: 0.98,
        y2: toRatio(p, min, max),
        time1: visTime(visible, 0),
        time2: visTime(visible, visible.length - 1),
        price1: p,
        price2: p,
        confidence: 68,
        color: r === 0.5 ? C.fibEq : C.fibGp,
        category: 'fib',
      });
    }
  }

  // RSI/StochRSI (indicators 반환용 — 라벨은 rsiDivergenceLine 대각선으로 대체)
  const rsiVals = rsi(visible, 14);
  const rsiMaVals = ema(rsiVals, 12);
  const { k: stochK, d: stochD } = stochRsi(visible, 14, 14, 3, 3);

  // Harmonic (Butterfly, Bat, Gartley, Crab, etc.)
  const harmonics = detectAllHarmonics(visible, swings);
  const harmNames: Record<string, string> = { butterfly: '나비', bat: '박쥐', gartley: 'Gartley', crab: '크랩', altBat: 'Alt Bat', deepCrab: 'DCrab' };
  const lastVi = Math.max(1, visible.length - 1);
  const xiNorm = (idx: number) => Math.max(0, Math.min(idx, lastVi)) / lastVi;
  const harmonicSignals = harmonics.slice(0, 4).map((b) => ({
    pattern: b.pattern,
    bias: b.bias,
    xIndex: b.x,
    aIndex: b.a,
    bIndex: b.b,
    cIndex: b.c,
    dIndex: b.d,
    xPrice: b.xPrice,
    aPrice: b.aPrice,
    bPrice: b.bPrice,
    cPrice: b.cPrice,
    dPrice: b.dPrice,
  }));
  for (const b of harmonics.slice(0, 2)) {
    const name = harmNames[b.pattern] || b.pattern;
    const col = b.bias === 'bullish' ? C.harmonicBullish : C.harmonicBearish;
    const dIdxClamped = Math.max(0, Math.min(b.d, lastVi));
    const pathPts = [
      { idx: b.x, price: b.xPrice, L: 'X' as const },
      { idx: b.a, price: b.aPrice, L: 'A' as const },
      { idx: b.b, price: b.bPrice, L: 'B' as const },
      { idx: b.c, price: b.cPrice, L: 'C' as const },
      { idx: dIdxClamped, price: b.dPrice, L: 'D' as const },
    ];
    for (let k = 0; k < pathPts.length - 1; k++) {
      const u = pathPts[k];
      const v = pathPts[k + 1];
      const ui = visIdx(visible, u.idx);
      const vi = visIdx(visible, v.idx);
      overlays.push({
        id: `harm-${b.pattern}-leg${k}-${b.x}-${b.a}-${b.b}-${b.c}`,
        kind: 'harmonicLeg',
        label: '',
        x1: xiNorm(u.idx),
        y1: toRatio(u.price, min, max),
        x2: xiNorm(v.idx),
        y2: toRatio(v.price, min, max),
        time1: visTime(visible, ui),
        time2: visTime(visible, vi),
        confidence: 71,
        color: col,
        category: 'harmonic',
        price1: u.price,
        price2: v.price,
      });
    }
    for (const pt of pathPts) {
      const pi = visIdx(visible, pt.idx);
      overlays.push({
        id: `harm-${b.pattern}-pt${pt.L}-${b.x}-${b.a}-${b.b}-${b.c}`,
        kind: 'label',
        label: pt.L,
        x1: xiNorm(pt.idx),
        y1: toRatio(pt.price, min, max),
        time1: visTime(visible, pi),
        price1: pt.price,
        confidence: 73,
        color: col,
        category: 'harmonic',
      });
    }
    const di = visIdx(visible, dIdxClamped);
    const d2i = Math.min(visible.length - 1, di + Math.max(1, Math.round(visible.length * 0.04)));
    overlays.push({
      id: `harm-${b.pattern}-${b.d}`,
      kind: 'harmonic',
      label: `${name} D (진입)`,
      x1: xiNorm(dIdxClamped),
      y1: toRatio(b.dPrice, min, max),
      x2: Math.min(0.98, xiNorm(dIdxClamped) + 0.06),
      y2: toRatio(b.dPrice, min, max),
      time1: visTime(visible, di),
      time2: visTime(visible, d2i),
      price1: b.dPrice,
      price2: b.dPrice,
      confidence: 72,
      color: col,
      category: 'harmonic',
    });
  }

  const nenStarHits = detectNenStarHarmonics(visible, 3, 2);
  overlays.push(
    ...nenStarHitsToOverlays(visible, nenStarHits, min, max, {
      visTime,
      visIdx,
      xiNorm: (idx: number, lv: number) => Math.max(0, Math.min(idx, lv)) / lv,
    })
  );
  const nenStarChartMarkers = nenStarHitsToEngineMarkers(visible, nenStarHits);

  const chartPrimeAutoLen = options?.chartPrimeAutoLength !== false;
  const chartPrimeLenResolved = chartPrimeAutoLen
    ? computeSuggestedChartPrimePivotLength(visible, timeframe)
    : Math.max(
        2,
        Math.min(30, typeof options?.chartPrimeLength === 'number' && Number.isFinite(options.chartPrimeLength) ? options.chartPrimeLength : 8)
      );
  const chartPrimeResult = computeChartPrimeTrendChannelOverlays(visible, min, max, visTime, visIdx, {
    enableLiquid: options?.chartPrimeVolumeBg === true,
    length: chartPrimeLenResolved,
    ...(options?.chartPrimeWait !== undefined ? { wait: options.chartPrimeWait } : {}),
    ...(options?.chartPrimeExtend !== undefined ? { extend: options.chartPrimeExtend } : {}),
    ...(options?.chartPrimeShowLast !== undefined ? { show: options.chartPrimeShowLast } : {}),
    ...(options?.chartPrimeShowFills !== undefined ? { showFills: options.chartPrimeShowFills } : {}),
    ...(typeof options?.chartPrimeTopHex === 'string' ? { topColor: options.chartPrimeTopHex } : {}),
    ...(typeof options?.chartPrimeCenterHex === 'string' ? { centerColor: options.chartPrimeCenterHex } : {}),
    ...(typeof options?.chartPrimeBottomHex === 'string' ? { bottomColor: options.chartPrimeBottomHex } : {}),
    ...(typeof options?.chartPrimeChannelWidthScale === 'number' && Number.isFinite(options.chartPrimeChannelWidthScale)
      ? { channelWidthScale: options.chartPrimeChannelWidthScale }
      : {}),
  });
  overlays.push(...chartPrimeResult.overlays);

  // Symmetrical triangle target
  const symTri = patterns.find(p => p.type === 'symTriangle' && p.targetPrice != null);
  if (symTri?.targetPrice != null) {
    const iTgt0 = Math.max(0, Math.floor(visible.length * 0.65));
    overlays.push({
      id: 'symtarget',
      kind: 'symTriangleTarget',
      label: '삼각 수렴 목표',
      x1: 0.7,
      y1: toRatio(symTri.targetPrice, min, max),
      x2: 0.98,
      y2: toRatio(symTri.targetPrice, min, max),
      time1: visTime(visible, iTgt0),
      time2: visTime(visible, visible.length - 1),
      price1: symTri.targetPrice,
      price2: symTri.targetPrice,
      confidence: 70,
      color: C.symTarget,
      category: 'structure',
    });
  }

  // PO3 phase
  const po3 = detectPO3Phase(visible);
  if (po3) {
    const po3Label =
      po3 === 'accumulation' ? 'PO3 축적' : po3 === 'manipulation' ? 'PO3 조작' : 'PO3 분산';
    const mid = Math.floor(visible.length / 2);
    overlays.push({
      id: 'po3',
      kind: 'po3Phase',
      label: po3Label,
      x1: 0.5,
      y1: 0.5,
      time1: visTime(visible, mid),
      price1: visible[mid]?.close ?? (min + max) / 2,
      confidence: 65,
      color: C.po3,
      category: 'po3',
    });
  }

  // False Breakout
  const fb = detectFalseBreakout(visible, rangeHigh, rangeLow);
  for (const x of fb) {
    overlays.push({
      id: `fb-${x.index}`,
      kind: 'falseBreakout',
      label: '가짜 돌파',
      x1: x.index / nVis,
      y1: toRatio(x.price, min, max),
      time1: visTime(visible, x.index),
      price1: x.price,
      confidence: 70,
      color: C.falseBreakout,
      category: 'structure',
    });
  }

  // Kill Zone (last candle)
  if (visible.length && isKillZone(visible[visible.length - 1].time)) {
    const lk = visible[visible.length - 1];
    overlays.push({
      id: 'killzone',
      kind: 'label',
      label: '킬존(거래 집중)',
      x1: 0.92,
      y1: 0.1,
      time1: lk.time as number,
      price1: lk.close,
      confidence: 60,
      color: C.killZone,
      category: 'labels',
    });
  }

  // FluidTrades: Supply/Demand zones — 캔들에 밀착 (형성 캔들 기준 좁은 너비)
  const zoneWidth = 14;
  const nNorm = Math.max(1, visible.length - 1);
  for (const z of supplyZones.slice(-5)) {
    const beforeTrend = z.left >= 5 ? (visible[z.left - 1]?.close ?? 0) - (visible[z.left - 5]?.close ?? 0) : 0;
    const baseType = beforeTrend > 0 ? '상승 후 하락 구간' : '공급 연속';
    const x2Zone = Math.min(nNorm, z.left + zoneWidth) / nNorm;
    const i2s = Math.min(visible.length - 1, z.left + zoneWidth);
    overlays.push({
      id: `supply-${z.left}`,
      kind: 'supplyZone',
      label: baseType,
      x1: z.left / nNorm,
      y1: toRatio(z.top, min, max),
      x2: x2Zone,
      y2: toRatio(z.bottom, min, max),
      time1: visTime(visible, z.left),
      time2: visTime(visible, i2s),
      price1: z.top,
      price2: z.bottom,
      confidence: 75,
      color: C.supplyZone,
    });
    overlays.push({
      id: `poi-supply-${z.left}`,
      kind: 'poi',
      label: '관심가(POI)',
      x1: z.left / nNorm,
      y1: toRatio(z.poi, min, max),
      time1: visTime(visible, z.left),
      price1: z.poi,
      confidence: 76,
      color: C.poi,
    });
  }
  for (const z of demandZones.slice(-5)) {
    const beforeTrend = z.left >= 5 ? (visible[z.left - 1]?.close ?? 0) - (visible[z.left - 5]?.close ?? 0) : 0;
    const baseType = beforeTrend < 0 ? '하락 후 반등 구간' : '수요 연속';
    const x2Zone = Math.min(nNorm, z.left + zoneWidth) / nNorm;
    const i2d = Math.min(visible.length - 1, z.left + zoneWidth);
    overlays.push({
      id: `demand-${z.left}`,
      kind: 'demandZone',
      label: baseType,
      x1: z.left / nNorm,
      y1: toRatio(z.top, min, max),
      x2: x2Zone,
      y2: toRatio(z.bottom, min, max),
      time1: visTime(visible, z.left),
      time2: visTime(visible, i2d),
      price1: z.top,
      price2: z.bottom,
      confidence: 75,
      color: C.demandZone,
    });
    overlays.push({
      id: `poi-demand-${z.left}`,
      kind: 'poi',
      label: '관심가(POI)',
      x1: z.left / nNorm,
      y1: toRatio(z.poi, min, max),
      time1: visTime(visible, z.left),
      price1: z.poi,
      confidence: 76,
      color: C.poi,
    });
  }

  // HH/LH/HL/LL swing labels
  for (let i = 1; i < lastHighs.length; i++) {
    const prev = lastHighs[i - 1], cur = lastHighs[i];
    const tag = cur.price >= prev.price ? 'HH' : 'LH';
    overlays.push({
      id: `sw-h-${cur.index}`,
      kind: 'swingLabel',
      label: tag,
      x1: cur.index / nVis,
      y1: toRatio(cur.price, min, max),
      time1: visTime(visible, cur.index),
      price1: cur.price,
      confidence: 70,
      color: C.swingLabel,
    });
  }
  for (let i = 1; i < lastLows.length; i++) {
    const prev = lastLows[i - 1], cur = lastLows[i];
    const tag = cur.price <= prev.price ? 'LL' : 'HL';
    overlays.push({
      id: `sw-l-${cur.index}`,
      kind: 'swingLabel',
      label: tag,
      x1: cur.index / nVis,
      y1: toRatio(cur.price, min, max),
      time1: visTime(visible, cur.index),
      price1: cur.price,
      confidence: 70,
      color: C.swingLabel,
    });
  }

  // LuxAlgo: Strong/Weak High/Low — 캔들에 밀착 (형성 지점 기준 짧은 구간)
  const trailExt = 12;
  const strongX2 = (idx: number) => Math.min(nNorm, idx + trailExt) / nNorm;
  {
    const i2sh = Math.min(visible.length - 1, trailTopIdx + trailExt);
    overlays.push({
      id: 'strong-high',
      kind: 'strongHigh',
      label: '추적 고점',
      x1: trailTopIdx / nNorm,
      y1: toRatio(trailTop, min, max),
      x2: strongX2(trailTopIdx),
      y2: toRatio(trailTop, min, max),
      time1: visTime(visible, trailTopIdx),
      time2: visTime(visible, i2sh),
      price1: trailTop,
      price2: trailTop,
      confidence: 74,
      color: C.strongHigh,
    });
  }
  {
    const i2sl = Math.min(visible.length - 1, trailBottomIdx + trailExt);
    overlays.push({
      id: 'strong-low',
      kind: 'strongLow',
      label: '추적 저점',
      x1: trailBottomIdx / nNorm,
      y1: toRatio(trailBottom, min, max),
      x2: strongX2(trailBottomIdx),
      y2: toRatio(trailBottom, min, max),
      time1: visTime(visible, trailBottomIdx),
      time2: visTime(visible, i2sl),
      price1: trailBottom,
      price2: trailBottom,
      confidence: 74,
      color: C.strongLow,
    });
  }

  /** 균형 가로선은 앞쪽 `eq-line`(supportLine) 한 줄만 — equilibrium·Lux EQH/EQL 중복 제거 */

  // 패턴 삼각형 등 대각선은 평행채널과 겹쳐 부채꼴이 되므로 여기서는 추가하지 않음 (요약·엔진에는 patterns 유지)

  let score = 0;
  if (trend === 'bullish') score += 20;
  if (trend === 'bearish') score -= 20;
  score += validFvg.filter(x => x.bias === 'bullish').length * 4;
  score -= validFvg.filter(x => x.bias === 'bearish').length * 4;
  score -= sweeps.filter(x => x.side === 'buy').length * 5;
  score += sweeps.filter(x => x.side === 'sell').length * 5;
  score += validObs.filter(x => x.bias === 'bullish').length * 3;
  score -= validObs.filter(x => x.bias === 'bearish').length * 3;
  patterns.forEach(p => {
    if (p.bias === 'bullish') score += 12;
    if (p.bias === 'bearish') score -= 12;
  });

  let draftVerdict: Verdict = 'WATCH';
  let draftConfidence = 55;
  if (score >= 18) {
    draftVerdict = 'LONG';
    draftConfidence = Math.min(93, Math.round(55 + score * 0.9));
  } else if (score <= -18) {
    draftVerdict = 'SHORT';
    draftConfidence = Math.min(93, Math.round(55 + Math.abs(score) * 0.9));
  }
  const htfTrend = options?.htfTrend;
  const trend1M = options?.trend1M;
  if (htfTrend && (draftVerdict === 'LONG' && htfTrend === 'bullish' || draftVerdict === 'SHORT' && htfTrend === 'bearish')) {
    draftConfidence = Math.min(95, draftConfidence + 5);
  } else if (htfTrend && (draftVerdict === 'LONG' && htfTrend === 'bearish' || draftVerdict === 'SHORT' && htfTrend === 'bullish')) {
    draftConfidence = Math.max(50, draftConfidence - 3);
  }
  if (trend1M && (draftVerdict === 'LONG' && trend1M === 'bullish' || draftVerdict === 'SHORT' && trend1M === 'bearish')) {
    draftConfidence = Math.min(95, draftConfidence + 3);
  } else if (trend1M && (draftVerdict === 'LONG' && trend1M === 'bearish' || draftVerdict === 'SHORT' && trend1M === 'bullish')) {
    draftConfidence = Math.max(50, draftConfidence - 2);
  }
  if (aiModeMax && (draftVerdict === 'LONG' || draftVerdict === 'SHORT')) {
    draftConfidence = Math.min(97, draftConfidence + 5);
  }

  const last = visible[visible.length - 1];
  const regimeResult = computeRegime(candles, { trend, swingHighs: highs.length, swingLows: lows.length });
  const mtf = computeMTF(htfTrend ?? null, trend, draftVerdict, trend1M ?? undefined);
  const signalResult = computeSignalScore({
    structure: { trend, bos, choch, fvg, sweeps, patterns, score },
    volumeDelta: (options as any)?.volumeDelta,
    orderbookImbalance: (options as any)?.orderbookImbalance,
    oiState: (options as any)?.oiState,
    fundingState: (options as any)?.fundingState,
    longShortRatio: (options as any)?.longShortRatio,
    regime: regimeResult,
    mtfAlignmentScore: mtf.alignmentScore,
    patternRecallScore: undefined,
  });
  // 진입/손절/목표: 최근 N봉 기준 (짧은 창으로 현재가 근처에 존 유지 — 15%는 1d에서 90봉이라 이격 커짐)
  const recentLen = Math.min(40, Math.max(15, Math.floor(visible.length * 0.08)));
  const recentSlice = visible.slice(-recentLen);
  const recentRangeHigh = recentSlice.length ? Math.max(...recentSlice.map(c => c.high)) : rangeHigh;
  const recentRangeLow = recentSlice.length ? Math.min(...recentSlice.map(c => c.low)) : rangeLow;
  const recentEq = (recentRangeHigh + recentRangeLow) / 2;
  const tradePlan = computeTradePlan({
    signal: signalResult.signal,
    currentPrice: last.close,
    equilibrium: recentEq,
    rangeHigh: recentRangeHigh,
    rangeLow: recentRangeLow,
    atr: atrVal,
    regime: regimeResult.regime,
    timeframe,
  });
  const confResult = computeConfidence({
    mtfAlignmentScore: mtf.alignmentScore,
    regimeConsistency: true,
    signalConflict: false,
    dataQuality: 'full',
    patternStrength: patterns.length ? 0.6 : 0,
    liquidityAlignment: sweeps.length > 0,
    volumeConfirmation: (options as any)?.volumeDelta != null,
    longScore: signalResult.longScore,
    shortScore: signalResult.shortScore,
    aiModeMax,
  });

  const verdict = signalResult.signal;
  const confidence = confResult.confidence;
  let adjustedConfidence = confidence;
  const entry = tradePlan.entry;
  const stop = tradePlan.stopLoss;
  const targets = tradePlan.targets;

  const tPlan = visTime(visible, visible.length - 1);
  overlays.push({
    id: 'entry',
    kind: 'entry',
    label: '진입',
    x1: Math.max(0.72, (visible.length - 18) / (visible.length - 1)),
    y1: toRatio(entry, min, max),
    time1: tPlan,
    price1: entry,
    confidence: 82,
    color: C.entry,
  });
  overlays.push({
    id: 'stop',
    kind: 'stop',
    label: '손절',
    x1: Math.max(0.76, (visible.length - 14) / (visible.length - 1)),
    y1: toRatio(stop, min, max),
    time1: tPlan,
    price1: stop,
    confidence: 82,
    color: C.stop,
  });
  targets.forEach((p, idx) =>
    overlays.push({
      id: `tp-${idx}`,
      kind: 'target',
      label: `목표${idx + 1}`,
      x1: Math.max(0.80 + idx * 0.03, (visible.length - 12 + idx * 2) / (visible.length - 1)),
      y1: toRatio(p, min, max),
      time1: tPlan,
      price1: p,
      confidence: 80,
      color: C.target,
    })
  );

  const anchorStart = Math.max(0.78, Math.min(0.82, (visible.length - 24) / (visible.length - 1)));
  const anchorMid = Math.max(0.86, Math.min(0.90, (visible.length - 14) / (visible.length - 1)));
  const anchorEnd = Math.max(0.92, Math.min(0.98, (visible.length - 4) / (visible.length - 1)));
  const idxFromNorm = (norm: number) => visIdx(visible, Math.round(Math.max(0, Math.min(1, norm)) * nVis));

  const lastPrice = last.close;
  const pathA = verdict === 'SHORT' ? [lastPrice, lastPrice * 0.99, lastPrice * 0.975] : [lastPrice, lastPrice * 1.01, lastPrice * 1.025];
  const pathB = verdict === 'SHORT' ? [lastPrice, eq, eq * 1.005] : [lastPrice, eq, eq * 0.995];

  {
    const iS = idxFromNorm(anchorStart);
    const iM = idxFromNorm(anchorMid);
    const iE = idxFromNorm(anchorEnd);
    overlays.push({
      id: 'sca-1',
      kind: 'scenario',
      label: '경로 A',
      x1: anchorStart,
      y1: toRatio(pathA[0], min, max),
      x2: anchorMid,
      y2: toRatio(pathA[1], min, max),
      time1: visTime(visible, iS),
      time2: visTime(visible, iM),
      price1: pathA[0],
      price2: pathA[1],
      confidence: 66,
      color: C.scenarioPathA,
    });
    overlays.push({
      id: 'sca-2',
      kind: 'scenario',
      label: '',
      x1: anchorMid,
      y1: toRatio(pathA[1], min, max),
      x2: anchorEnd,
      y2: toRatio(pathA[2], min, max),
      time1: visTime(visible, iM),
      time2: visTime(visible, iE),
      price1: pathA[1],
      price2: pathA[2],
      confidence: 66,
      color: C.scenarioPathA,
    });
    overlays.push({
      id: 'scb-1',
      kind: 'scenario',
      label: '경로 B',
      x1: anchorStart,
      y1: toRatio(pathB[0], min, max),
      x2: anchorMid,
      y2: toRatio(pathB[1], min, max),
      time1: visTime(visible, iS),
      time2: visTime(visible, iM),
      price1: pathB[0],
      price2: pathB[1],
      confidence: 64,
      color: C.scenarioPathB,
    });
    overlays.push({
      id: 'scb-2',
      kind: 'scenario',
      label: '',
      x1: anchorMid,
      y1: toRatio(pathB[1], min, max),
      x2: anchorEnd,
      y2: toRatio(pathB[2], min, max),
      time1: visTime(visible, iM),
      time2: visTime(visible, iE),
      price1: pathB[1],
      price2: pathB[2],
      confidence: 64,
      color: C.scenarioPathB,
    });
  }
  const pathC = verdict === 'SHORT' ? [lastPrice, lastPrice * 1.005, lastPrice * 1.02] : [lastPrice, lastPrice * 0.995, lastPrice * 0.97];
  const anchorEndC = Math.min(0.98, anchorEnd + 0.02);
  {
    const iS = idxFromNorm(anchorStart);
    const iM = idxFromNorm(anchorMid);
    const iE = idxFromNorm(anchorEndC);
    overlays.push({
      id: 'scc-1',
      kind: 'scenario',
      label: '경로 C',
      x1: anchorStart,
      y1: toRatio(pathC[0], min, max),
      x2: anchorMid,
      y2: toRatio(pathC[1], min, max),
      time1: visTime(visible, iS),
      time2: visTime(visible, iM),
      price1: pathC[0],
      price2: pathC[1],
      confidence: 50,
      color: C.scenarioPathC,
    });
    overlays.push({
      id: 'scc-2',
      kind: 'scenario',
      label: '',
      x1: anchorMid,
      y1: toRatio(pathC[1], min, max),
      x2: anchorEndC,
      y2: toRatio(pathC[2], min, max),
      time1: visTime(visible, iM),
      time2: visTime(visible, iE),
      price1: pathC[1],
      price2: pathC[2],
      confidence: 50,
      color: C.scenarioPathC,
    });
  }

  /** 전체 candles 대신 visible만 — 봉 수 증가 시 runPatternVision이 지연·메모리 폭주의 주원인이었음 */
  const visionResults = runPatternVision(visible);
  const visionOverlays = visionResultsToOverlays(visionResults, visible.length, 0, min, max, visible).filter(
    (o) => o.kind !== 'trendLine'
  );
  overlays.push(...visionOverlays);

  const smartMoney = analyzeSmartMoney({ trend, bos, choch, eqh, eql, sweeps, fvg, obs: obs, patterns });
  const tailongResult = computeTailong(visible, timeframe, verdict, trend);
  const engine = {
    trend,
    bos,
    choch,
    eqh,
    eql,
    sweeps,
    fvg,
    obs,
    patterns,
    premium: rangeHigh,
    discount: rangeLow,
    equilibrium: eq,
    strongHighPrice: trailTop,
    strongLowPrice: trailBottom,
    score,
    smartMoney,
    tailong: tailongResult,
    tailongCloseSignals,
    harmonics: harmonicSignals,
    nenStarHarmonics: nenStarHits.map((h) => ({
      pattern: 'nenStar',
      bias: h.bias,
      score: h.score,
      xIndex: h.x,
      aIndex: h.a,
      bIndex: h.b,
      cIndex: h.c,
      dIndex: h.d,
      xPrice: h.xPrice,
      aPrice: h.aPrice,
      bPrice: h.bPrice,
      cPrice: h.cPrice,
      dPrice: h.dPrice,
      ratios: h.ratios,
      candleConfirm: h.candleConfirm,
    })),
    nenStarChartMarkers,
    ...chartPrimeResult.engineSnippet,
    triplePattern,
    zoneTrendline: zoneResult,
    luxTrendline: { ...luxTrendlineEngineOut, lookback: tlLb, source: 'parkf_linreg_trendlines' },
  };
  const trendKo = trend === 'bullish' ? '상승' : trend === 'bearish' ? '하락' : '횡보';

  const levelInput = {
    currentPrice: last.close,
    rangeHigh,
    rangeLow,
    equilibrium: eq,
    swingHighs: lastHighs.map(h => h.price),
    swingLows: lastLows.map(l => l.price),
    eqhPrices: eqh.map(x => x.price),
    eqlPrices: eql.map(x => x.price),
    fvgBoundaries: validFvg.map(x => ({ low: x.low, high: x.high, bias: x.bias })),
    obRanges: validObs.map(x => ({ low: x.low, high: x.high })),
    liquidityPoolPrices: sweeps.map(s => s.price),
    trend,
  };
  const levelResult = computeLevels(levelInput);
  const settlementDirection: SettlementDirection =
    verdict === 'LONG' ? 'LONG' : verdict === 'SHORT' ? 'SHORT' : 'NONE';
  const settlementLevel =
    settlementDirection === 'LONG'
      ? (levelResult.breakoutLevel?.price ?? levelResult.supportLevel?.price ?? null)
      : settlementDirection === 'SHORT'
        ? (levelResult.invalidationLevel?.price ?? levelResult.resistanceLevel?.price ?? null)
        : null;
  const settlementZone = computeSettlementZoneState({
    candles: visible,
    direction: settlementDirection,
    levelPrice: settlementLevel,
    timeframe,
  });
  if (settlementZone.state === 'confirmed') {
    if (settlementZone.grade === 'A') adjustedConfidence = Math.min(99, adjustedConfidence + 6);
    else if (settlementZone.grade === 'B') adjustedConfidence = Math.min(97, adjustedConfidence + 3);
    else adjustedConfidence = Math.min(95, adjustedConfidence + 1);
  } else if (settlementZone.state === 'failed') {
    adjustedConfidence = Math.max(35, adjustedConfidence - 10);
  } else if (settlementZone.state === 'candidate') {
    adjustedConfidence = Math.max(40, adjustedConfidence - 2);
  }

  const whaleZOpt = options?.whaleZones;
  const volumeWhaleZoneConfluence = whaleZOpt
    ? computeVolumeWhaleZoneConfluence(visible, whaleZOpt.buyZones ?? [], whaleZOpt.sellZones ?? [], verdict)
    : undefined;
  if (volumeWhaleZoneConfluence) {
    adjustedConfidence = Math.min(
      99,
      Math.max(35, adjustedConfidence + volumeWhaleZoneConfluence.confidenceDelta)
    );
  }

  if (aiModeMax) {
    if (mtf.alignmentScore >= 72) {
      adjustedConfidence = Math.min(99, adjustedConfidence + 5);
    } else if (mtf.alignmentScore < 38) {
      adjustedConfidence = Math.max(33, adjustedConfidence - 5);
    }
    const bp0 = options?.buyPressure;
    const sp0 = options?.sellPressure;
    if (bp0 != null && sp0 != null) {
      const bp = bp0 <= 1.01 ? bp0 * 100 : bp0;
      const sp = sp0 <= 1.01 ? sp0 * 100 : sp0;
      if (Math.abs(bp - sp) > 14) {
        adjustedConfidence = Math.min(99, adjustedConfidence + 3);
      }
    }
  }

  if (settlementZone.level != null && settlementZone.direction !== 'NONE') {
    const settleColor =
      settlementZone.state === 'confirmed' ? 'rgba(34,197,94,0.95)'
      : settlementZone.state === 'failed' ? 'rgba(239,68,68,0.95)'
      : 'rgba(245,158,11,0.95)';
    const settleLabel =
      settlementZone.state === 'confirmed'
        ? `안착확인 ${settlementZone.grade} ${Math.round(settlementZone.score)}`
        : settlementZone.state === 'failed'
          ? `안착실패 ${settlementZone.grade} ${Math.round(settlementZone.score)}`
          : `안착후보 ${settlementZone.grade} ${Math.round(settlementZone.score)}`;
    overlays.push({
      id: 'settlement-zone-level',
      kind: 'keyLevel',
      label: settleLabel,
      x1: 0.06,
      y1: toRatio(settlementZone.level, min, max),
      x2: 0.98,
      y2: toRatio(settlementZone.level, min, max),
      confidence: Math.max(60, Math.min(96, Math.round(settlementZone.score))),
      color: settleColor,
      category: 'keyLevel',
    });
    if (typeof settlementZone.breakIndex === 'number') {
      const n = Math.max(1, visible.length - 1);
      const bx = Math.max(0.02, Math.min(0.98, settlementZone.breakIndex / n));
      const midX = Math.max(bx + 0.03, Math.min(0.95, bx + 0.12));
      const rIdx = typeof settlementZone.retestIndex === 'number' ? settlementZone.retestIndex : Math.min(visible.length - 1, settlementZone.breakIndex + 3);
      const rx = Math.max(0.02, Math.min(0.98, rIdx / n));
      const breakY = toRatio(visible[settlementZone.breakIndex].close, min, max);
      const retestY = toRatio(visible[rIdx].close, min, max);
      const contY = settlementZone.state === 'failed'
        ? toRatio(settlementZone.direction === 'LONG' ? settlementZone.level * 0.996 : settlementZone.level * 1.004, min, max)
        : toRatio(settlementZone.direction === 'LONG' ? settlementZone.level * 1.004 : settlementZone.level * 0.996, min, max);
      overlays.push({ id: 'settlement-path-1', kind: 'scenario', label: '리테스트 경로', x1: bx, y1: breakY, x2: midX, y2: retestY, confidence: 72, color: settleColor, category: 'scenario' });
      overlays.push({ id: 'settlement-path-2', kind: 'scenario', label: '', x1: midX, y1: retestY, x2: rx, y2: contY, confidence: 72, color: settleColor, category: 'scenario' });
    }
  }
  const divergenceSignalResult = computeDivergenceSignal({
    candles: visible,
    swingHighs: lastHighs,
    swingLows: lastLows,
    supportLevel: levelResult.supportLevel,
    resistanceLevel: levelResult.resistanceLevel,
    trend,
    sweeps,
    demandZones,
    supplyZones,
    timeframe,
  });
  const scenarioResult = computeScenarios({
    levels: levelResult,
    verdict,
    currentPrice: last.close,
    entry: typeof entry === 'number' ? entry : parseFloat(String(entry)) || 0,
    stopLoss: typeof stop === 'number' ? stop : parseFloat(String(stop)) || 0,
    targets: targets.map(t => typeof t === 'number' ? t : parseFloat(String(t)) || 0).filter(Boolean),
  });

  const keyLevelItems: Array<{ type: string; price: number; label: string }> = [];
  if (levelResult.breakoutLevel) keyLevelItems.push({ type: 'mustBreak', price: levelResult.breakoutLevel.price, label: '돌파 상승 확률' });
  if (levelResult.supportLevel) keyLevelItems.push({ type: 'mustHold', price: levelResult.supportLevel.price, label: '유지 시 ↑ 지지' });
  if (levelResult.invalidationLevel) keyLevelItems.push({ type: 'invalidation', price: levelResult.invalidationLevel.price, label: '이탈 하락 확률' });
  scenarioResult.nextTargets.slice(0, 2).forEach((txt, i) => {
    const parts = txt.split(/\s+/);
    const priceStr = parts.find(p => /^\d+(\.\d+)?$/.test(p));
    if (priceStr) keyLevelItems.push({ type: 'nextTarget', price: parseFloat(priceStr), label: `NEXT TARGET ${i + 1}` });
  });
  const keyLevelsToShow = keyLevelItems.slice(0, 6);
  for (const kl of keyLevelsToShow) {
    overlays.push({ id: `key-${kl.type}-${kl.price}`, kind: 'keyLevel', label: kl.label, x1: 0.02, y1: toRatio(kl.price, min, max), x2: 0.98, y2: toRatio(kl.price, min, max), confidence: 88, color: kl.type === 'mustBreak' ? C.keyMustBreak : kl.type === 'mustHold' ? C.keyMustHold : kl.type === 'invalidation' ? C.keyInvalidation : C.keyDefault, category: 'keyLevel' });
  }

  // 타이롱: 지지/저항/돌파가 수평선
  if (tailongResult.tailongSupport > 0 && tailongResult.tailongSupport >= min && tailongResult.tailongSupport <= max) {
    overlays.push({ id: 'tailong-support', kind: 'keyLevel', label: 'Support', x1: 0.02, y1: toRatio(tailongResult.tailongSupport, min, max), x2: 0.98, y2: toRatio(tailongResult.tailongSupport, min, max), confidence: 70, color: C.tailongSupport, category: 'keyLevel' });
  }
  if (tailongResult.tailongResistance > 0 && tailongResult.tailongResistance >= min && tailongResult.tailongResistance <= max) {
    overlays.push({ id: 'tailong-resistance', kind: 'keyLevel', label: 'Resistance', x1: 0.02, y1: toRatio(tailongResult.tailongResistance, min, max), x2: 0.98, y2: toRatio(tailongResult.tailongResistance, min, max), confidence: 70, color: C.tailongResistance, category: 'keyLevel' });
  }
  if (tailongResult.tailongBreakPrice > 0 && tailongResult.tailongBreakPrice >= min && tailongResult.tailongBreakPrice <= max) {
    overlays.push({ id: 'tailong-break', kind: 'keyLevel', label: 'Break', x1: 0.02, y1: toRatio(tailongResult.tailongBreakPrice, min, max), x2: 0.98, y2: toRatio(tailongResult.tailongBreakPrice, min, max), confidence: 72, color: tailongResult.tailongBreakDirection === 'bullish' ? C.tailongBreakBullish : C.tailongBreakBearish, category: 'keyLevel' });
  }

  // 반응구간: 캔들에 밀착 (마지막 N봉 구간만, 오른쪽으로 밀리지 않음)
  const entryNum = typeof entry === 'number' ? entry : parseFloat(String(entry)) || last.close;
  const atrValForZone = atr(visible, 14);
  const bandPct = Math.max(range * 0.0005, atrValForZone * 0.025, range * 0.00025);
  const reactionBars = 32;
  const lastNorm = Math.max(1, visible.length - 1);
  const xStart = Math.max(0, (visible.length - reactionBars) / lastNorm);
  const xEnd = Math.min(0.98, (visible.length - 1) / lastNorm);
  const entryTop = entryNum + bandPct;
  const entryBottom = entryNum - bandPct;
  overlays.push({
    id: 'reaction-zone-entry',
    kind: 'reactionZone',
    label: '반응구간',
    x1: xStart,
    y1: toRatio(entryTop, min, max),
    x2: xEnd,
    y2: toRatio(entryBottom, min, max),
    price1: Math.max(entryTop, entryBottom),
    price2: Math.min(entryTop, entryBottom),
    confidence: 75,
    color: C.reactionZoneEntry,
    category: 'reactionZone',
  });
  if (levelResult.supportLevel && levelResult.supportLevel.price >= min && levelResult.supportLevel.price <= max) {
    const sup = levelResult.supportLevel.price;
    const supTop = sup + bandPct;
    const supBottom = Math.max(min, sup - bandPct);
    overlays.push({
      id: 'reaction-zone-support',
      kind: 'reactionZone',
      label: '반응구간',
      x1: xStart,
      y1: toRatio(supTop, min, max),
      x2: xEnd,
      y2: toRatio(supBottom, min, max),
      price1: Math.max(supTop, supBottom),
      price2: Math.min(supTop, supBottom),
      confidence: 74,
      color: C.reactionZoneSupport,
      category: 'reactionZone',
    });
  }
  if (levelResult.resistanceLevel && levelResult.resistanceLevel.price >= min && levelResult.resistanceLevel.price <= max) {
    const res = levelResult.resistanceLevel.price;
    const resTop = Math.min(max, res + bandPct);
    const resBottom = res - bandPct;
    overlays.push({
      id: 'reaction-zone-resistance',
      kind: 'reactionZone',
      label: '반응구간',
      x1: xStart,
      y1: toRatio(resTop, min, max),
      x2: xEnd,
      y2: toRatio(resBottom, min, max),
      price1: Math.max(resTop, resBottom),
      price2: Math.min(resTop, resBottom),
      confidence: 74,
      color: C.reactionZoneResistance,
      category: 'reactionZone',
    });
  }

  // RSI 다이버전스: 캔들 두 개 피벗을 잇는 대각선 (Bullish=저점끼리 녹색, Bearish=고점끼리 빨강)
  const divLines = divergenceSignalResult.divergenceLines;
  if (divLines?.length && visible.length > 1) {
    const lastVi = Math.max(1, visible.length - 1);
    const xiNorm = (idx: number) => Math.max(0, Math.min(idx, lastVi)) / lastVi;
    for (let i = 0; i < divLines.length; i++) {
      const d = divLines[i];
      overlays.push({
        id: `rsi-div-${d.type}-${i}`,
        kind: 'rsiDivergenceLine',
        label: '',
        x1: xiNorm(d.index1),
        y1: toRatio(d.price1, min, max),
        x2: xiNorm(d.index2),
        y2: toRatio(d.price2, min, max),
        confidence: 70,
        color: d.type === 'bullish' ? C.rsiBullish : C.rsiBearish,
        category: 'rsi',
      });
    }
  }

  let htfConvictionMatrix: HtfConvictionMatrixResult | null = null;
  if (options?.htfCandles?.length) {
    const matrix = computeHtfConvictionDivergenceMatrix(
      visible,
      options.htfCandles,
      options.htfLabel ?? 'D',
      { rsiLen: 14, lbL: 5, lbR: 5, useVolValidation: true }
    );
    if (matrix) {
      htfConvictionMatrix = matrix;
      for (const ho of buildHtfConvictionOverlays(matrix, visible, min, max, toRatio)) {
        overlays.push(ho);
      }
    }
  }

  /** Lux 자동 추세선 × 고신뢰도: 돌파·이탈·반등·거부 시 ★ (88%+ 또는 WATCH+다이버전스 방향 일치) */
  const luxStarConfOk = adjustedConfidence >= 88;
  const divV = divergenceSignalResult.verdict;
  const luxLongAligned = verdict === 'LONG' || (verdict === 'WATCH' && divV === 'LONG');
  const luxShortAligned = verdict === 'SHORT' || (verdict === 'WATCH' && divV === 'SHORT');
  if (luxStarConfOk) {
    const m = luxTrendlineEngineOut.meta;
    const yStar = toRatio(last.close, min, max);
    const yHi = Math.max(0.06, Math.min(0.94, yStar + 0.025));
    const yLo = Math.max(0.06, Math.min(0.94, yStar - 0.025));
    if (m.resistBrokenUp && luxLongAligned) {
      overlays.push({
        id: 'lux-star-resist-break',
        kind: 'label',
        label: '★',
        x1: 0.9,
        y1: yHi,
        confidence: 94,
        color: '#FBBF24',
        category: 'labels',
      });
    }
    if (m.supportBrokenDown && luxShortAligned) {
      overlays.push({
        id: 'lux-star-support-break',
        kind: 'label',
        label: '★',
        x1: 0.9,
        y1: yLo,
        confidence: 94,
        color: '#FBBF24',
        category: 'labels',
      });
    }
    if (m.bouncedSupport && luxLongAligned) {
      overlays.push({
        id: 'lux-star-support-bounce',
        kind: 'label',
        label: '★',
        x1: 0.86,
        y1: yLo,
        confidence: 92,
        color: '#4ADE80',
        category: 'labels',
      });
    }
    if (m.rejectedResistance && luxShortAligned) {
      overlays.push({
        id: 'lux-star-resist-reject',
        kind: 'label',
        label: '★',
        x1: 0.86,
        y1: yHi,
        confidence: 92,
        color: '#F87171',
        category: 'labels',
      });
    }
  }

  overlays.push(...computeLvrbOverlays(visible, min, max));
  overlays.push(
    ...computeVolatilityTrendScoreOverlays(visible, min, max, {
      ...DEFAULT_VOLATILITY_TREND_SCORE_PARAMS,
      ...options?.volatilityTrendScore,
    })
  );

  // 빔·LVRB·VTS·ParkF는 reserved로 보존. 저 TF는 봉 수 많아 후보 폭증 → 상한을 키워 LinReg·존·라벨이 잘리지 않게 함
  const overlayCap =
    timeframe === '1Y'
      ? 110
      : timeframe === '1M'
        ? 160
        : timeframe === '1w'
          ? 200
          : timeframe === '1d' || timeframe === '4h'
            ? 220
            : timeframe === '1h'
              ? 230
              : 240;
  const beamOverlay = (o: OverlayItem) =>
    o.id.startsWith('beam-forecast-') || o.id.startsWith('beam-confirm-');
  const lvrbOverlay = (o: OverlayItem) => o.category === 'lvrb' || o.id.startsWith('lvrb-');
  const parkfOverlay = (o: OverlayItem) => String(o.id || '').startsWith('parkf-');
  const vtsOverlay = (o: OverlayItem) => o.category === 'volatilityTrendScore' || String(o.id || '').startsWith('vts-');
  const beamOverlays = overlays.filter(beamOverlay);
  const lvrbOverlays = overlays.filter(lvrbOverlay);
  const parkfOverlays = overlays.filter(parkfOverlay);
  const vtsOverlays = overlays.filter(vtsOverlay);
  const otherOverlays = overlays.filter(
    (o) => !beamOverlay(o) && !lvrbOverlay(o) && !parkfOverlay(o) && !vtsOverlay(o)
  );
  const limitedOverlays = (() => {
    if (overlays.length <= overlayCap) return overlays;
    const reserved =
      parkfOverlays.length +
      beamOverlays.length +
      lvrbOverlays.length +
      vtsOverlays.length;
    if (reserved >= overlayCap) {
      if (parkfOverlays.length >= overlayCap) return parkfOverlays.slice(0, overlayCap);
      let out = [...parkfOverlays];
      let left = overlayCap - out.length;
      out = [...out, ...lvrbOverlays.slice(0, left)];
      left = overlayCap - out.length;
      out = [...out, ...vtsOverlays.slice(0, left)];
      left = overlayCap - out.length;
      out = [...out, ...beamOverlays.slice(0, left)];
      return out;
    }
    const remain = Math.max(0, overlayCap - reserved);
    return [
      ...takeOtherOverlaysWithinCap(otherOverlays, remain),
      ...parkfOverlays,
      ...beamOverlays,
      ...lvrbOverlays,
      ...vtsOverlays,
    ];
  })();

  const earlyObAnalysis = (() => {
    if (earlyObsDedup.length === 0) return null;
    const parts: string[] = [];
    const sup = earlyObsDedup.filter(o => o.bias === 'bullish');
    const res = earlyObsDedup.filter(o => o.bias === 'bearish');
    if (sup.length) parts.push(`롱대기 구간 ${sup.length}곳(확정 전·반등 후보). ${sup.map(o => `${o.low.toLocaleString()}~${o.high.toLocaleString()}`).join(', ')}`);
    if (res.length) parts.push(`숏대기 구간 ${res.length}곳(확정 전·하락 후보). ${res.map(o => `${o.low.toLocaleString()}~${o.high.toLocaleString()}`).join(', ')}`);
    return parts.join(' ');
  })();

  const bullishObs = validObs.filter(o => o.bias === 'bullish');
  const bearishObs = validObs.filter(o => o.bias === 'bearish');

  // 상승 OB / 하락 OB 구간을 과거 캔들과 비교 → 지금 구간 분석
  const obZonePastStats = (ob: { index: number; low: number; high: number; bias: 'bullish' | 'bearish' }) => {
    let touchCount = 0;
    let bounceCount = 0;
    const lookAhead = 5;
    for (let j = ob.index + 1; j < visible.length - lookAhead; j++) {
      const c = visible[j];
      const touches = c.low <= ob.high && c.high >= ob.low;
      if (!touches) continue;
      touchCount++;
      const nextCloses = visible.slice(j + 1, j + 1 + lookAhead).map(x => x.close);
      if (ob.bias === 'bullish') {
        if (nextCloses.some(cl => cl > ob.high)) bounceCount++;
      } else {
        if (nextCloses.some(cl => cl < ob.low)) bounceCount++;
      }
    }
    return { touchCount, bounceCount };
  };
  const nearestBullishObWithStats = (() => {
    const below = bullishObs.filter(o => o.high <= last.close).sort((a, b) => b.high - a.high)[0];
    const at = bullishObs.find(o => o.low <= last.close && o.high >= last.close);
    const ob = at ?? below ?? null;
    if (!ob) return null;
    const { touchCount, bounceCount } = obZonePastStats(ob);
    return { ...ob, touchCount, bounceCount };
  })();
  const nearestBearishObWithStats = (() => {
    const above = bearishObs.filter(o => o.low >= last.close).sort((a, b) => a.low - b.low)[0];
    const at = bearishObs.find(o => o.low <= last.close && o.high >= last.close);
    const ob = at ?? above ?? null;
    if (!ob) return null;
    const { touchCount, bounceCount } = obZonePastStats(ob);
    return { ...ob, touchCount, bounceCount };
  })();
  const currentZoneSummary = (() => {
    const inBullish = nearestBullishObWithStats && last.close >= nearestBullishObWithStats.low && last.close <= nearestBullishObWithStats.high;
    const inBearish = nearestBearishObWithStats && last.close >= nearestBearishObWithStats.low && last.close <= nearestBearishObWithStats.high;
    if (inBullish && nearestBullishObWithStats) {
      const { touchCount, bounceCount } = nearestBullishObWithStats;
      const pct = touchCount > 0 ? Math.round((bounceCount / touchCount) * 100) : 0;
      return `지금 구간: 롱확인 OB 안. 과거 터치 ${touchCount}회 중 ${bounceCount}회 반등 (${pct}%)`;
    }
    if (inBearish && nearestBearishObWithStats) {
      const { touchCount, bounceCount } = nearestBearishObWithStats;
      const pct = touchCount > 0 ? Math.round((bounceCount / touchCount) * 100) : 0;
      return `지금 구간: 숏확인 OB 안. 과거 터치 ${touchCount}회 중 ${bounceCount}회 하락 이어짐 (${pct}%)`;
    }
    if (nearestBullishObWithStats && last.close >= nearestBullishObWithStats.low - range * 0.005 && last.close <= nearestBullishObWithStats.high + range * 0.005) {
      const { touchCount, bounceCount } = nearestBullishObWithStats;
      const pct = touchCount > 0 ? Math.round((bounceCount / touchCount) * 100) : 0;
      return `지금 구간: 롱확인 OB 근처. 과거 터치 ${touchCount}회 중 ${bounceCount}회 반등 (${pct}%)`;
    }
    if (nearestBearishObWithStats && last.close >= nearestBearishObWithStats.low - range * 0.005 && last.close <= nearestBearishObWithStats.high + range * 0.005) {
      const { touchCount, bounceCount } = nearestBearishObWithStats;
      const pct = touchCount > 0 ? Math.round((bounceCount / touchCount) * 100) : 0;
      return `지금 구간: 숏확인 OB 근처. 과거 터치 ${touchCount}회 중 ${bounceCount}회 하락 이어짐 (${pct}%)`;
    }
    return null;
  })();

  const nearestSupportOb = (() => {
    const below = bullishObs.filter(o => o.high <= last.close).sort((a, b) => b.high - a.high)[0];
    const at = bullishObs.find(o => o.low <= last.close && o.high >= last.close);
    const ob = at ?? below ?? null;
    if (!ob) return null;
    const { touchCount, bounceCount } = obZonePastStats(ob);
    const p0 = obProbabilityFromPastTouches(touchCount, bounceCount);
    return {
      low: ob.low,
      high: ob.high,
      probability: aiModeMax ? Math.min(94, p0 + 4) : p0,
      pastTouches: touchCount,
      pastHits: bounceCount,
    };
  })();
  const nearestResistanceOb = (() => {
    const above = bearishObs.filter(o => o.low >= last.close).sort((a, b) => a.low - b.low)[0];
    const at = bearishObs.find(o => o.low <= last.close && o.high >= last.close);
    const ob = at ?? above ?? null;
    if (!ob) return null;
    const { touchCount, bounceCount } = obZonePastStats(ob);
    const p1 = obProbabilityFromPastTouches(touchCount, bounceCount);
    return {
      low: ob.low,
      high: ob.high,
      probability: aiModeMax ? Math.min(94, p1 + 4) : p1,
      pastTouches: touchCount,
      pastHits: bounceCount,
    };
  })();

  const aiThBase = mergeCompressionThresholds(options?.aiCompression);
  const aiTh = (() => {
    if (!aiModeMax) return aiThBase;
    const s = AI_COMPRESSION_PRESETS.strict.values;
    return mergeCompressionThresholds({
      avgRangeAtr: Math.min(aiThBase.avgRangeAtr, s.aiCompressionAvgRangeAtr),
      maxRangeAtr: Math.min(aiThBase.maxRangeAtr, s.aiCompressionMaxRangeAtr),
      impulseRangeAtr: Math.max(aiThBase.impulseRangeAtr, s.aiImpulseRangeAtr),
      impulseBodyAtr: Math.max(aiThBase.impulseBodyAtr, s.aiImpulseBodyAtr),
    });
  })();
  const aiVolFilter = aiModeMax || options?.aiCompressionVolumeFilter === true;
  const compressionImpulse = findLatestCompressionImpulse(visible, atrVal, aiTh);
  const liveCompressionRaw = evaluateLiveCompression(visible, atrVal, aiTh, {
    volumeFilter: aiVolFilter,
    supportOb: nearestSupportOb ? { low: nearestSupportOb.low, high: nearestSupportOb.high } : null,
    resistanceOb: nearestResistanceOb ? { low: nearestResistanceOb.low, high: nearestResistanceOb.high } : null,
    lastClose: last.close,
  });

  const topRefs = matchTopReferences(engine);
  const topRefScore = topRefs[0]?.score ?? 0;
  const mtfResult = computeMTF(htfTrend ?? null, trend, verdict, trend1M ?? undefined);
  const probExtras =
    volumeWhaleZoneConfluence || aiModeMax
      ? {
          ...(volumeWhaleZoneConfluence
            ? {
                wadZoneLongBonus: volumeWhaleZoneConfluence.probabilityLongBonus,
                wadZoneShortBonus: volumeWhaleZoneConfluence.probabilityShortBonus,
              }
            : {}),
          ...(aiModeMax ? { aiModeMax: true as const } : {}),
        }
      : undefined;
  const probability = computeTradeProbability(
    verdict,
    adjustedConfidence,
    engine,
    topRefScore,
    mtfResult.alignmentScore,
    probExtras
  );
  const beamLongAvg = beamForecasts.length ? beamForecasts.reduce((s, x) => s + x.longProb, 0) / beamForecasts.length : 50;
  const beamShortAvg = beamForecasts.length ? beamForecasts.reduce((s, x) => s + x.shortProb, 0) / beamForecasts.length : 50;
  const futurePaths = computeFuturePaths(verdict, last.close, eq, trend, { beamLongProb: beamLongAvg, beamShortProb: beamShortAvg });
  const beamPathForecast = computeBeamPathForecast(last.close, atrVal, beamForecasts);

  const summaryText = `${symbol} ${timeframe} ${trendKo} 구조 · BOS ${bos.length} · CHOCH ${choch.length} · FVG ${fvg.length} · 스윕 ${sweeps.length} · 패턴 ${patterns.length}`;
  const volumeFlowSummaryBase = computeVolumeFlowSummary(visible);
  const volumeFlowSummary = volumeFlowSummaryBase
    ? {
        ...volumeFlowSummaryBase,
        label:
          volumeWhaleZoneConfluence && volumeWhaleZoneConfluence.zoneDataProvided
            ? `${volumeFlowSummaryBase.label} | ${volumeWhaleZoneConfluence.caption}`
            : volumeFlowSummaryBase.label,
      }
    : undefined;
  const normalized = normalizeCurrentPattern({ symbol, timeframe, verdict, confidence, summary: summaryText, entry: entry.toFixed(2), stopLoss: stop.toFixed(2), targets: targets.map(x => x.toFixed(2)), overlays: limitedOverlays, engine, topReferences: topRefs });
  const learnedPatternsTop5 = recallTopPatterns(normalized, undefined, 5);
  const recallSummary = buildRecallSummary(learnedPatternsTop5);
  const pre3ThrRaw = options?.pre3SimilarityThreshold;
  let pre3Thr =
    Number.isFinite(pre3ThrRaw) && pre3ThrRaw != null
      ? Math.max(0.55, Math.min(1, Number(pre3ThrRaw)))
      : 1;
  if (aiModeMax) {
    pre3Thr = Math.max(0.55, Math.min(1, pre3Thr - 0.045));
  }
  const pre3ConfirmOnClose = options?.pre3ConfirmOnCloseOnly !== false;
  const pre3Sparkle = computePre3SparkleFromMemory({
    symbol,
    timeframe,
    candles,
    threshold: pre3Thr,
    requireObZone: true,
    coreZoneOverlays: limitedOverlays,
    confirmOnCloseOnly: pre3ConfirmOnClose,
  });
  const pre3SparkleHistory = computePre3SparkleHistoryFromMemory({
    symbol,
    timeframe,
    candles,
    threshold: pre3Thr,
    maxHits: 400,
    requireObZone: true,
    coreZoneOverlays: limitedOverlays,
    excludeOpenLastBar: pre3ConfirmOnClose,
  });

  const pre3MatchZoneOverlay = buildPre3MatchZoneOverlay({
    pre3: pre3Sparkle,
    candles,
    visible,
    overlays,
    min,
    max,
    toRatio,
    symbol,
    timeframe,
    threshold: pre3Thr,
  });
  const nVisAi = visible.length;
  const aiCompressionOverlay =
    compressionImpulse && nVisAi > 1
      ? (() => {
          const comp = compressionImpulse;
          const i2 = Math.min(nVisAi - 1, comp.impulseIdx + 2);
          return {
            id: 'ai-auto-compression-ref',
            kind: 'zone' as const,
            label: `AI·압축→${comp.impulseBias === 'bullish' ? '장대양' : '장대음'} (${comp.barsCompressed}봉)`,
            x1: comp.compressionStartIdx / nVisAi,
            y1: toRatio(comp.boxHigh, min, max),
            x2: Math.min(0.98, i2 / nVisAi),
            y2: toRatio(comp.boxLow, min, max),
            time1: visTime(visible, comp.compressionStartIdx),
            time2: visTime(visible, i2),
            price1: comp.boxHigh,
            price2: comp.boxLow,
            confidence: aiModeMax ? 86 : 78,
            color:
              comp.impulseBias === 'bullish'
                ? aiModeMax
                  ? 'rgba(34,197,94,0.30)'
                  : 'rgba(34,197,94,0.26)'
                : aiModeMax
                  ? 'rgba(239,68,68,0.30)'
                  : 'rgba(239,68,68,0.26)',
            category: 'aiAuto' as const,
          };
        })()
      : null;

  const aiBuilt = buildAiModeAutoAnalysis({
    symbol,
    timeframe,
    verdict,
    nearestSupportOb,
    nearestResistanceOb,
    currentZoneSummary,
    earlyObAnalysis,
    compression: compressionImpulse,
    liveCompression: liveCompressionRaw,
    visibleLength: visible.length,
    volumeWhaleCaption:
      volumeWhaleZoneConfluence && volumeWhaleZoneConfluence.zoneDataProvided
        ? volumeWhaleZoneConfluence.caption
        : undefined,
    buyPressure: options?.buyPressure,
    sellPressure: options?.sellPressure,
    volumeDelta: options?.volumeDelta,
    pre3Matched: pre3Sparkle?.matched === true,
    pre3Similarity: typeof pre3Sparkle?.similarity === 'number' ? pre3Sparkle.similarity : undefined,
    aiModeMax,
  });
  const aiModeAutoAnalysis = {
    headline: aiBuilt.headline,
    bullets: aiBuilt.bullets,
    compression: aiBuilt.compression,
    liveCompression: aiBuilt.liveCompression,
    flowLine: aiBuilt.flowLine,
  };

  const aiLiveMin = aiModeMax ? 40 : 46;
  const aiLiveOverlay =
    aiBuilt.liveCompression && aiBuilt.liveCompression.score >= aiLiveMin && nVisAi > 1
      ? (() => {
          const lc = aiBuilt.liveCompression!;
          const i0 = Math.max(0, nVisAi - lc.barsN);
          const i1 = nVisAi - 1;
          const tag =
            lc.obConfluent === 'support'
              ? '·지지합류'
              : lc.obConfluent === 'resistance'
                ? '·저항합류'
                : '';
          return {
            id: 'ai-auto-live-compression',
            kind: 'zone' as const,
            label: `AI·진행압축 ${lc.score} · ${lc.barsN}봉${tag}`,
            x1: i0 / nVisAi,
            y1: toRatio(lc.boxHigh, min, max),
            x2: Math.min(0.98, (i1 + 0.45) / nVisAi),
            y2: toRatio(lc.boxLow, min, max),
            time1: visTime(visible, i0),
            time2: visTime(visible, i1),
            price1: lc.boxHigh,
            price2: lc.boxLow,
            confidence: Math.min(96, (aiModeMax ? 62 : 58) + Math.round(lc.score * (aiModeMax ? 0.38 : 0.35))),
            color: aiModeMax ? 'rgba(56,189,248,0.26)' : 'rgba(56,189,248,0.20)',
            category: 'aiAuto' as const,
          };
        })()
      : null;

  const overlaysOut = [
    ...(pre3MatchZoneOverlay ? [...limitedOverlays, pre3MatchZoneOverlay] : limitedOverlays),
    ...(aiCompressionOverlay ? [aiCompressionOverlay] : []),
    ...(aiLiveOverlay ? [aiLiveOverlay] : []),
  ];

  const depthDeltaContext = computeDepthDeltaContext(visible, {
    breakoutLevel: levelResult.breakoutLevel?.price ?? null,
    invalidationLevel: levelResult.invalidationLevel?.price ?? null,
  });
  const depthDeltaBias =
    depthDeltaContext?.regime === 'buy' ? 'LONG' : depthDeltaContext?.regime === 'sell' ? 'SHORT' : 'NEUTRAL';
  const snapSmcLs = computeParkfLinRegBandSnapshot(visible, {});
  const smcLsMeta = snapSmcLs
    ? computeSmcDeskConfluenceLsMeta({
        candles: visible,
        analysis: { nearestSupportOb, nearestResistanceOb } as AnalyzeResponse,
        overlays,
        snap: snapSmcLs,
        timeframe,
        depthDeltaBias,
      })
    : null;
  const smcDeskConfluenceLs =
    smcLsMeta == null
      ? null
      : {
          ...smcLsMeta,
          differsFromVerdict:
            (verdict === 'LONG' || verdict === 'SHORT') && smcLsMeta.side !== verdict,
        };

  return {
    symbol,
    timeframe,
    verdict,
    confidence: adjustedConfidence,
    summary: summaryText,
    entry: typeof entry === 'number' ? entry.toFixed(2) : String(entry),
    stopLoss: typeof stop === 'number' ? stop.toFixed(2) : String(stop),
    targets: targets.map(x => (typeof x === 'number' ? x.toFixed(2) : String(x))),
    overlays: overlaysOut,
    breakoutLevel: levelResult.breakoutLevel,
    supportLevel: levelResult.supportLevel,
    resistanceLevel: levelResult.resistanceLevel,
    invalidationLevel: levelResult.invalidationLevel,
    mustHold: scenarioResult.mustHold,
    mustBreak: scenarioResult.mustBreak,
    invalidation: scenarioResult.invalidation,
    bullishScenario: scenarioResult.bullishScenario,
    bearishScenario: scenarioResult.bearishScenario,
    nextTargets: scenarioResult.nextTargets,
    nearestSupportOb,
    nearestResistanceOb,
    smcDeskConfluenceLs,
    earlyObAnalysis,
    currentZoneSummary,
    aiModeAutoAnalysis,
    tailong: tailongResult,
    regime: regimeResult.regime,
    longScore: signalResult.longScore,
    shortScore: signalResult.shortScore,
    confidenceGrade: confResult.confidenceGrade,
    riskFlags: confResult.riskFlags,
    depthDeltaContext,
    rr: tradePlan.rr,
    settlementZone,
    mtf: { ...mtfResult, summary: mtfResult.summary },
    indicators: (() => {
      const mc = macd(visible);
      const bb = bollingerBands(visible);
      const atrArr = atrSeries(visible, 14);
      return {
        rsi: rsiVals, rsiMa: rsiMaVals, stochK, stochD,
        macdLine: mc.macd, macdSignal: mc.signal, macdHist: mc.hist,
        bbMid: bb.mid, bbUpper: bb.upper, bbLower: bb.lower,
        atr: atrArr
      };
    })(),
    engine,
    topReferences: topRefs.map(r => ({ id: r.id, title: r.title, score: r.score, tags: r.tags, reason: r.reason, outcome: r.outcome })),
    futurePaths,
    beamPathForecast,
    probability,
    learnedPatternsTop5: learnedPatternsTop5.map(p => ({ id: p.id, title: p.title, score: p.score, patternType: p.patternType, bias: p.bias, reason: p.reason, outcome: p.outcome, briefing: p.briefing, description: p.description })),
    recallSummary,
    pre3Sparkle,
    pre3SparkleHistory,
    detectedVisionPatterns: visionResults,
    dominantPattern: (() => { const d = getDominantPattern(visionResults); return d ? { type: d.type, confidence: d.confidence, bias: d.bias, label: d.label, reason: d.reason } : null; })(),
    patternVisionSummary: getPatternVisionSummary(visionResults),
    volumeFlowSummary,
    volumeWhaleZoneConfluence,
    rsiDivergenceSignal: divergenceSignalResult,
    htfConvictionMatrix: htfConvictionMatrix
      ? {
          htfLabel: htfConvictionMatrix.htfLabel,
          developingHtf: htfConvictionMatrix.developingHtf,
          htfIsBullish: htfConvictionMatrix.htfIsBullish,
          ribbon: htfConvictionMatrix.ribbon,
          signals: htfConvictionMatrix.signals,
        }
      : null,
    structureRocketSignals: (() => {
      const rkB = structureRocketBuilderBudget(timeframe);
      const raw = [
        ...buildStructureRocketSignals(
          visible,
          bos,
          divergenceSignalResult,
          settlementZone,
          atrVal,
          swings,
          allDemand,
          allSupply,
          timeframe,
          { allowBreakoutWithoutRetest: options?.structureBreakoutWithoutRetest === true },
          rkB.bosRocketMax
        ),
        ...buildCandleStructureRockets(
          visible,
          choch,
          bos,
          atrVal,
          swings,
          allDemand,
          allSupply,
          rkB.candleMax
        ),
        ...buildSupplyDemandZoneRockets(
          visible,
          allDemand,
          allSupply,
          atrVal,
          swings,
          allDemand,
          allSupply,
          rkB.zoneMax
        ),
      ];
      const filtered = raw.filter((r) => structureRocketSourceAllowedForTimeframe(timeframe, r.source));
      return mergeDedupeStructureRockets(filtered, rkB.mergeMax);
    })(),
  };
}
