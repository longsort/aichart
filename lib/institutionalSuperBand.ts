import type { Candle, OverlayItem } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { LineData, UTCTimestamp } from 'lightweight-charts';
import {
  bandTouchMeetsPrecisionGate,
  computeObvSeries,
  evaluateBandTouchPrecision,
} from '@/lib/institutionalBandPrecisionGates';
import {
  computeRsiWilderSeries,
  DEFAULT_CONFLUENCE_MIN_TOTAL,
  scoreInstitutionalBandConfluence,
} from '@/lib/institutionalBandConfluence';

function trueRange(curr: Candle, prev?: Candle): number {
  if (!prev) return curr.high - curr.low;
  const a = curr.high - curr.low;
  const b = Math.abs(curr.high - prev.close);
  const c = Math.abs(curr.low - prev.close);
  return Math.max(a, b, c);
}

function atrSeries(candles: Candle[], period: number): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  if (!candles.length) return out;
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    const tr = trueRange(candles[i], i > 0 ? candles[i - 1] : undefined);
    if (i < period) {
      sum += tr;
      out[i] = sum / (i + 1);
    } else {
      out[i] = (out[i - 1] * (period - 1) + tr) / period;
    }
  }
  return out;
}

export type InstitutionalTrendDir = 'long' | 'short';

export type InstitutionalTrendSegment = {
  startIdx: number;
  endIdx: number;
  dir: InstitutionalTrendDir;
};

type SuperTrendCore = {
  trend: number[];
  finalUpper: number[];
  finalLower: number[];
};

function computeSuperTrendCore(candles: Candle[], period: number, mult: number): SuperTrendCore | null {
  const n = candles.length;
  if (n < 2) return null;
  const p = Math.max(2, Math.min(50, Math.round(period)));
  const m = Math.max(0.5, Math.min(12, mult));
  const atrArr = atrSeries(candles, p);
  const upperBasic = new Array(n).fill(0);
  const lowerBasic = new Array(n).fill(0);
  const finalUpper = new Array(n).fill(0);
  const finalLower = new Array(n).fill(0);
  const trend = new Array(n).fill(1);

  for (let i = 0; i < n; i++) {
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const a = atrArr[i] || 0;
    upperBasic[i] = hl2 + m * a;
    lowerBasic[i] = hl2 - m * a;
  }
  finalUpper[0] = upperBasic[0];
  finalLower[0] = lowerBasic[0];
  for (let i = 1; i < n; i++) {
    finalUpper[i] =
      upperBasic[i] < finalUpper[i - 1] || candles[i - 1].close > finalUpper[i - 1]
        ? upperBasic[i]
        : finalUpper[i - 1];
    finalLower[i] =
      lowerBasic[i] > finalLower[i - 1] || candles[i - 1].close < finalLower[i - 1]
        ? lowerBasic[i]
        : finalLower[i - 1];
  }
  for (let i = 1; i < n; i++) {
    if (trend[i - 1] === 1 && candles[i].close < finalLower[i - 1]) trend[i] = -1;
    else if (trend[i - 1] === -1 && candles[i].close > finalUpper[i - 1]) trend[i] = 1;
    else trend[i] = trend[i - 1];
  }
  return { trend, finalUpper, finalLower };
}

/**
 * 연속 구간(롱/숏) — 배경 띠·요약 배지용
 */
export function computeInstitutionalSuperTrendMeta(
  candles: Candle[],
  period = 10,
  mult = 3
): {
  segments: InstitutionalTrendSegment[];
  lastDir: InstitutionalTrendDir;
  lastLinePrice: number | null;
  /** 현재 추세 구간이 몇 봉째인지 (마지막 전환 이후) */
  barsInCurrentTrend: number;
  /** 현재 추세가 시작된 봉의 time (unix) */
  currentTrendStartTime: number | null;
} {
  const core = computeSuperTrendCore(candles, period, mult);
  if (!core) {
    return {
      segments: [],
      lastDir: 'long',
      lastLinePrice: null,
      barsInCurrentTrend: 0,
      currentTrendStartTime: null,
    };
  }
  const { trend, finalUpper, finalLower } = core;
  const n = candles.length;
  const segments: InstitutionalTrendSegment[] = [];
  let start = 0;
  for (let i = 1; i < n; i++) {
    if (trend[i] !== trend[start]) {
      segments.push({
        startIdx: start,
        endIdx: i - 1,
        dir: trend[start] === 1 ? 'long' : 'short',
      });
      start = i;
    }
  }
  segments.push({
    startIdx: start,
    endIdx: n - 1,
    dir: trend[start] === 1 ? 'long' : 'short',
  });
  const lastT = trend[n - 1];
  const lastDir: InstitutionalTrendDir = lastT === 1 ? 'long' : 'short';
  const lastLinePrice = lastT === 1 ? finalLower[n - 1] : finalUpper[n - 1];
  const lastSeg = segments[segments.length - 1];
  const barsInCurrentTrend = lastSeg ? lastSeg.endIdx - lastSeg.startIdx + 1 : 0;
  const st = lastSeg ? candles[lastSeg.startIdx]?.time : undefined;
  const currentTrendStartTime =
    typeof st === 'number' && Number.isFinite(st) ? (st as number) : null;
  return {
    segments,
    lastDir,
    lastLinePrice: Number.isFinite(lastLinePrice) ? lastLinePrice : null,
    barsInCurrentTrend,
    currentTrendStartTime,
  };
}

/**
 * TradingView식 SuperTrend — 롱일 때 하단(초록), 숏일 때 상단(빨강) 스텝 라인.
 */
export function computeInstitutionalSuperBandData(
  candles: Candle[],
  period = 10,
  mult = 3
): { long: LineData<UTCTimestamp>[]; short: LineData<UTCTimestamp>[] } {
  const long: LineData<UTCTimestamp>[] = [];
  const short: LineData<UTCTimestamp>[] = [];
  const core = computeSuperTrendCore(candles, period, mult);
  if (!core) return { long, short };
  const { trend, finalUpper, finalLower } = core;
  const n = candles.length;
  for (let i = 0; i < n; i++) {
    const t = candles[i].time as UTCTimestamp;
    const v = trend[i] === 1 ? finalLower[i] : finalUpper[i];
    if (trend[i] === 1) long.push({ time: t, value: v });
    else short.push({ time: t, value: v });
  }
  return { long, short };
}

/** 마지막 봉 기준 SuperTrend 밴드 상·하한(참고용 힌트·융합 문구용) */
export function getLastInstitutionalBandEdges(
  candles: Candle[],
  period = INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  mult = INSTITUTIONAL_BAND_DEFAULT_MULT
): { upper: number; lower: number } | null {
  const core = computeSuperTrendCore(candles, period, mult);
  if (!core) return null;
  const i = candles.length - 1;
  if (i < 0) return null;
  const upper = core.finalUpper[i];
  const lower = core.finalLower[i];
  if (!Number.isFinite(upper) || !Number.isFinite(lower)) return null;
  return { upper, lower };
}

/** 차트·밴드 계산과 동일한 기본값 */
export const INSTITUTIONAL_BAND_DEFAULT_PERIOD = 10;
export const INSTITUTIONAL_BAND_DEFAULT_MULT = 3;

export type InstitutionalBandTouchTier = 'A' | 'B' | 'C';

export type InstitutionalBandInteractionMarker = {
  time: number;
  verdict: 'LONG' | 'SHORT';
  tier: InstitutionalBandTouchTier;
  /** 0–100 근사 품질 점수 */
  score: number;
  /** 밴드까지 최단 거리 / ATR */
  proximityAtr: number;
  /** 툴팁용 짧은 근거 나열 */
  summaryParts: string[];
  /** 정밀 모드 ON일 때만 — OBV·거래량·구조(EQ 등) 게이트 통과 후 남기는 짧은 근거 */
  precisionParts?: string[];
  /**
   * 다축 합류 모드 — 터치·OBV·거래량·구조·RSI 가중 점수(실전 보조, 손익 보장 아님).
   */
  confluence?: {
    total: number;
    grade: 'S' | 'A' | 'B' | 'C';
    parts: string[];
  };
  /**
   * `computeInstitutionalBandInteractionMarkersUnion` 전용: 같은 봉에 합류·정밀 파이프라인을
   * **둘 다** 그릴 때 구분(한 줄로 합치지 않음).
   */
  unionSource?: 'confluence' | 'precision';
};

/** TF별 최소 봉 간격 — 저TF는 과밀 완화, 고TF는 의미 있는 간격 */
export function institutionalBandTouchMinGapBars(timeframe: string): number {
  const tf = normalizeChartTimeframe(String(timeframe || ''));
  if (tf === '1m' || tf === '3m') return 5;
  if (tf === '5m' || tf === '15m') return 6;
  if (tf === '1h') return 7;
  if (tf === '4h') return 8;
  if (tf === '1d') return 10;
  if (tf === '1w' || tf === '1M' || tf === '1Y') return 12;
  return 7;
}

function isSwingLow5(candles: Candle[], i: number): boolean {
  if (i < 2 || i >= candles.length - 2) return false;
  const v = candles[i].low;
  for (let k = i - 2; k <= i + 2; k++) {
    if (k !== i && candles[k].low < v) return false;
  }
  return true;
}

function isSwingHigh5(candles: Candle[], i: number): boolean {
  if (i < 2 || i >= candles.length - 2) return false;
  const v = candles[i].high;
  for (let k = i - 2; k <= i + 2; k++) {
    if (k !== i && candles[k].high > v) return false;
  }
  return true;
}

function tierFromScore(score: number): InstitutionalBandTouchTier | null {
  if (score >= 68) return 'A';
  if (score >= 48) return 'B';
  if (score >= 30) return 'C';
  return null;
}

function scoreLongTouch(
  candles: Candle[],
  i: number,
  band: number,
  atr: number
): { score: number; proximityAtr: number; parts: string[] } | null {
  const c = candles[i];
  const prev = i > 0 ? candles[i - 1] : undefined;
  const px = Math.max(1e-12, Math.abs(c.close));
  const atrSafe = Math.max(atr, px * 1e-8);
  const proximityAtr = Math.abs(c.low - band) / atrSafe;

  if (c.low > band + atrSafe * 0.55) return null;
  if (c.close < band - atrSafe * 0.08) return null;

  let score = 0;
  const parts: string[] = [];

  score += Math.max(0, 34 - Math.min(34, proximityAtr * 26));
  if (proximityAtr < 0.22) parts.push('근접');

  const microTol = Math.max(atrSafe * 0.02, px * 1e-6);
  if (c.low < band - microTol && c.close > band) {
    score += 30;
    parts.push('위크스윕·종가복귀');
  } else if (c.low <= band + atrSafe * 0.18 && c.close > (c.high + c.low) / 2) {
    score += 18;
    parts.push('지지반등');
  }

  const range = c.high - c.low;
  if (range > 1e-12) {
    const pos = (c.close - c.low) / range;
    if (pos >= 0.72) {
      score += 18;
      parts.push('강한종가');
    } else if (pos >= 0.55) score += 10;
  }
  if (c.close >= c.open) {
    score += 8;
    parts.push('양봉');
  }

  if (prev && prev.volume > 0 && c.volume >= prev.volume * 1.38) {
    score += 12;
    parts.push('거래량확대');
  }

  if (isSwingLow5(candles, i)) {
    score += 14;
    parts.push('스윙저점');
  }

  return { score: Math.min(100, Math.round(score)), proximityAtr, parts };
}

function scoreShortTouch(
  candles: Candle[],
  i: number,
  band: number,
  atr: number
): { score: number; proximityAtr: number; parts: string[] } | null {
  const c = candles[i];
  const prev = i > 0 ? candles[i - 1] : undefined;
  const px = Math.max(1e-12, Math.abs(c.close));
  const atrSafe = Math.max(atr, px * 1e-8);
  const proximityAtr = Math.abs(c.high - band) / atrSafe;

  if (c.high < band - atrSafe * 0.55) return null;
  if (c.close > band + atrSafe * 0.08) return null;

  let score = 0;
  const parts: string[] = [];

  score += Math.max(0, 34 - Math.min(34, proximityAtr * 26));
  if (proximityAtr < 0.22) parts.push('근접');

  const microTol = Math.max(atrSafe * 0.02, px * 1e-6);
  if (c.high > band + microTol && c.close < band) {
    score += 30;
    parts.push('위크스윕·종가복귀');
  } else if (c.high >= band - atrSafe * 0.18 && c.close < (c.high + c.low) / 2) {
    score += 18;
    parts.push('저항거절');
  }

  const range = c.high - c.low;
  if (range > 1e-12) {
    const pos = (c.high - c.close) / range;
    if (pos >= 0.72) {
      score += 18;
      parts.push('약한종가');
    } else if (pos >= 0.55) score += 10;
  }
  if (c.close <= c.open) {
    score += 8;
    parts.push('음봉');
  }

  if (prev && prev.volume > 0 && c.volume >= prev.volume * 1.38) {
    score += 12;
    parts.push('거래량확대');
  }

  if (isSwingHigh5(candles, i)) {
    score += 14;
    parts.push('스윙고점');
  }

  return { score: Math.min(100, Math.round(score)), proximityAtr, parts };
}

type Candidate = {
  i: number;
  time: number;
  verdict: 'LONG' | 'SHORT';
  tier: InstitutionalBandTouchTier;
  score: number;
  proximityAtr: number;
  summaryParts: string[];
  precisionParts?: string[];
  confluence?: { total: number; grade: 'S' | 'A' | 'B' | 'C'; parts: string[] };
  sortScore: number;
};

/**
 * 기관밴드(SuperTrend) 활성선과의 **의미 있는** 접촉·반등/거절 후보.
 * - 점수·A/B/C 등급, 위크 스윕·스윙·거래량 가중.
 * - 점수 상위부터 채택하며 `minBarsBetween` 간격 유지.
 */
export function computeInstitutionalBandInteractionMarkers(
  candles: Candle[],
  period = INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  mult = INSTITUTIONAL_BAND_DEFAULT_MULT,
  opts?: {
    minBarsBetween?: number;
    /** 최소 등급 — 'B'면 C등급 마커 생략 (`tierEnabled`가 있으면 무시) */
    minTier?: InstitutionalBandTouchTier;
    /** 등급별 표시 마스크 — A/B/C 각각 true인 등급만 마커에 포함(다중 선택). 지정 시 `minTier`보다 우선 */
    tierEnabled?: Partial<Record<InstitutionalBandTouchTier, boolean>>;
    /**
     * 켜면: 거래량·OBV·(분석 오버레이에 EQ·저항·지지 등이 있을 때) 구조 근접을 만족한 접촉만 채택.
     * 오버레이가 비어 있으면 구조 조건은 생략(OVC만 검사).
     */
    precision?: { enabled: boolean; overlays?: OverlayItem[] };
    /**
     * 다축 합류(터치·OBV·거래량·구조·RSI 가중) — 켜면 `precision`만 단독일 때보다 우선.
     */
    confluence?: { enabled: boolean; overlays?: OverlayItem[]; minTotal?: number };
    /**
     * 접촉정밀 + 밴드합류 통합: 합류 점수로 채택한 뒤 **정밀 게이트**까지 통과해야 마커(더 엄격, 합류 최소점수 +5).
     */
    reinforcedFusion?: boolean;
  }
): InstitutionalBandInteractionMarker[] {
  const core = computeSuperTrendCore(candles, period, mult);
  if (!core || candles.length < 7) return [];
  const { trend, finalUpper, finalLower } = core;
  const p = Math.max(2, Math.min(50, Math.round(period)));
  const atrArr = atrSeries(candles, p);
  const minGap = Math.max(4, opts?.minBarsBetween ?? 8);
  const minTier = opts?.minTier ?? 'C';
  const tierRank: Record<InstitutionalBandTouchTier, number> = { A: 3, B: 2, C: 1 };
  const minRank = tierRank[minTier];
  const te = opts?.tierEnabled;
  const useTierEnabledMask =
    te &&
    typeof te === 'object' &&
    (te.A === true ||
      te.B === true ||
      te.C === true ||
      te.A === false ||
      te.B === false ||
      te.C === false);
  const tierPassesFilter = (tier: InstitutionalBandTouchTier): boolean => {
    if (useTierEnabledMask && te) {
      return te[tier] === true;
    }
    return tierRank[tier] >= minRank;
  };
  const reinforcedFusion = opts?.reinforcedFusion === true;
  const confluenceOn = opts?.confluence?.enabled === true;
  const effectiveConfluence = confluenceOn || reinforcedFusion;
  const confluenceOverlays = opts?.confluence?.overlays;
  const baseConfluenceMin = opts?.confluence?.minTotal ?? DEFAULT_CONFLUENCE_MIN_TOTAL;
  const confluenceMinTotal = Math.max(
    40,
    Math.min(95, baseConfluenceMin + (reinforcedFusion ? 5 : 0)),
  );
  const precisionOn = !effectiveConfluence && opts?.precision?.enabled === true;
  const precisionOverlays = opts?.precision?.overlays;
  const obvSeries = precisionOn || effectiveConfluence ? computeObvSeries(candles) : null;
  const rsiSeries = effectiveConfluence ? computeRsiWilderSeries(candles, 14) : null;

  const candidates: Candidate[] = [];

  for (let i = 2; i < candles.length - 2; i++) {
    const atr = atrArr[i] || 0;
    if (atr <= 0) continue;
    const t = candles[i].time as number;

    if (trend[i] === 1) {
      const band = finalLower[i];
      const s = scoreLongTouch(candles, i, band, atr);
      if (!s) continue;
      const touchTier = tierFromScore(s.score);
      if (!touchTier || s.score < 30) continue;
      if (!effectiveConfluence && (!touchTier || !tierPassesFilter(touchTier))) continue;

      let precisionParts: string[] | undefined;
      let confluenceBlock: Candidate['confluence'];
      let outTier: InstitutionalBandTouchTier = touchTier;
      let outScore = s.score;
      let sortScore = s.score;

      if (effectiveConfluence && obvSeries && rsiSeries) {
        const cf = scoreInstitutionalBandConfluence(
          candles,
          obvSeries,
          rsiSeries,
          i,
          'LONG',
          band,
          atr,
          s.score,
          confluenceOverlays
        );
        if (!cf.ok || cf.total < confluenceMinTotal || cf.grade == null) continue;
        if (!tierPassesFilter(cf.mappedTier)) continue;
        outTier = cf.mappedTier;
        outScore = cf.total;
        sortScore = cf.total;
        confluenceBlock = { total: cf.total, grade: cf.grade, parts: cf.parts };
        if (reinforcedFusion) {
          const ov = precisionOverlays ?? confluenceOverlays;
          const chk = evaluateBandTouchPrecision(candles, obvSeries, i, 'LONG', band, atr, ov);
          if (!bandTouchMeetsPrecisionGate(chk)) continue;
          precisionParts = chk.parts;
        }
      } else {
        if (!tierPassesFilter(touchTier)) continue;
        if (precisionOn && obvSeries) {
          const chk = evaluateBandTouchPrecision(
            candles,
            obvSeries,
            i,
            'LONG',
            band,
            atr,
            precisionOverlays
          );
          if (!bandTouchMeetsPrecisionGate(chk)) continue;
          precisionParts = chk.parts;
        }
      }

      candidates.push({
        i,
        time: t,
        verdict: 'LONG',
        tier: outTier,
        score: outScore,
        proximityAtr: s.proximityAtr,
        summaryParts: s.parts,
        precisionParts,
        confluence: confluenceBlock,
        sortScore,
      });
    } else if (trend[i] === -1) {
      const band = finalUpper[i];
      const s = scoreShortTouch(candles, i, band, atr);
      if (!s) continue;
      const touchTier = tierFromScore(s.score);
      if (!touchTier || s.score < 30) continue;
      if (!effectiveConfluence && (!touchTier || !tierPassesFilter(touchTier))) continue;

      let precisionParts: string[] | undefined;
      let confluenceBlock: Candidate['confluence'];
      let outTier: InstitutionalBandTouchTier = touchTier;
      let outScore = s.score;
      let sortScore = s.score;

      if (effectiveConfluence && obvSeries && rsiSeries) {
        const cf = scoreInstitutionalBandConfluence(
          candles,
          obvSeries,
          rsiSeries,
          i,
          'SHORT',
          band,
          atr,
          s.score,
          confluenceOverlays
        );
        if (!cf.ok || cf.total < confluenceMinTotal || cf.grade == null) continue;
        if (!tierPassesFilter(cf.mappedTier)) continue;
        outTier = cf.mappedTier;
        outScore = cf.total;
        sortScore = cf.total;
        confluenceBlock = { total: cf.total, grade: cf.grade, parts: cf.parts };
        if (reinforcedFusion) {
          const ov = precisionOverlays ?? confluenceOverlays;
          const chk = evaluateBandTouchPrecision(candles, obvSeries, i, 'SHORT', band, atr, ov);
          if (!bandTouchMeetsPrecisionGate(chk)) continue;
          precisionParts = chk.parts;
        }
      } else {
        if (!tierPassesFilter(touchTier)) continue;
        if (precisionOn && obvSeries) {
          const chk = evaluateBandTouchPrecision(
            candles,
            obvSeries,
            i,
            'SHORT',
            band,
            atr,
            precisionOverlays
          );
          if (!bandTouchMeetsPrecisionGate(chk)) continue;
          precisionParts = chk.parts;
        }
      }

      candidates.push({
        i,
        time: t,
        verdict: 'SHORT',
        tier: outTier,
        score: outScore,
        proximityAtr: s.proximityAtr,
        summaryParts: s.parts,
        precisionParts,
        confluence: confluenceBlock,
        sortScore,
      });
    }
  }

  candidates.sort((a, b) => b.sortScore - a.sortScore);

  const accepted: Candidate[] = [];
  for (const c of candidates) {
    let clash = false;
    for (const a of accepted) {
      if (Math.abs(c.i - a.i) < minGap) {
        clash = true;
        break;
      }
    }
    if (!clash) accepted.push(c);
  }

  accepted.sort((a, b) => a.i - b.i);

  return accepted.map((c) => ({
    time: c.time,
    verdict: c.verdict,
    tier: c.tier,
    score: c.score,
    proximityAtr: c.proximityAtr,
    summaryParts: c.summaryParts,
    ...(c.precisionParts ? { precisionParts: c.precisionParts } : {}),
    ...(c.confluence ? { confluence: c.confluence } : {}),
  }));
}

/**
 * 다축 합류(밴드합류)와 접촉정밀을 **각각** 돌린 뒤, 같은 봉이면 **두 마커 모두** 반환합니다.
 * (시간으로 합쳐 하나만 쓰거나, 합류·정밀 사이에 또 한 번 간격 필터를 걸지 않음.)
 */
export function computeInstitutionalBandInteractionMarkersUnion(
  candles: Candle[],
  period = INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  mult = INSTITUTIONAL_BAND_DEFAULT_MULT,
  opts?: {
    minBarsBetween?: number;
    minTier?: InstitutionalBandTouchTier;
    tierEnabled?: Partial<Record<InstitutionalBandTouchTier, boolean>>;
    overlays?: OverlayItem[];
  }
): InstitutionalBandInteractionMarker[] {
  const overlays = opts?.overlays ?? [];
  const innerGap = Math.max(4, opts?.minBarsBetween ?? 8);
  const baseOpts: NonNullable<Parameters<typeof computeInstitutionalBandInteractionMarkers>[3]> = {
    minBarsBetween: innerGap,
    ...(opts?.tierEnabled
      ? { tierEnabled: opts.tierEnabled }
      : { minTier: opts?.minTier ?? 'C' }),
  };
  const mConf = computeInstitutionalBandInteractionMarkers(candles, period, mult, {
    ...baseOpts,
    confluence: { enabled: true, overlays },
  });
  const mPrec = computeInstitutionalBandInteractionMarkers(candles, period, mult, {
    ...baseOpts,
    precision: { enabled: true, overlays },
  });
  const taggedConf = mConf.map((m) => ({ ...m, unionSource: 'confluence' as const }));
  const taggedPrec = mPrec.map((m) => ({ ...m, unionSource: 'precision' as const }));
  return [...taggedConf, ...taggedPrec].sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    if (a.unionSource === b.unionSource) return 0;
    return a.unionSource === 'confluence' ? -1 : 1;
  });
}
