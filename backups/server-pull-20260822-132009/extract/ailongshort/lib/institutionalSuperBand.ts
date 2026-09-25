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

/** SuperTrend ATR 밴드 내부 상태 — 마감·안착 등에서 한 번만 계산해 재사용 */
export type InstitutionalSuperTrendCore = {
  trend: number[];
  finalUpper: number[];
  finalLower: number[];
};

function computeSuperTrendCore(
  candles: Candle[],
  period: number,
  mult: number
): InstitutionalSuperTrendCore | null {
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

/** 마감·안착 등: 동일 캔들에 대해 SuperTrend 코어를 한 번만 계산할 때 사용 */
export function computeInstitutionalSuperTrendCore(
  candles: Candle[],
  period = INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  mult = INSTITUTIONAL_BAND_DEFAULT_MULT
): InstitutionalSuperTrendCore | null {
  return computeSuperTrendCore(candles, period, mult);
}

function resolveSuperTrendCore(
  candles: Candle[],
  period: number,
  mult: number,
  reuse?: InstitutionalSuperTrendCore | null
): InstitutionalSuperTrendCore | null {
  if (reuse && reuse.trend.length === candles.length) return reuse;
  return computeSuperTrendCore(candles, period, mult);
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

/**
 * SuperTrend ATR 상·하한 스텝 — 마감 존 **면 채움**(두 경계 사이)용.
 * 활성 추세선(`computeInstitutionalSuperBandData`)과 동일 `computeSuperTrendCore`.
 */
export function computeInstitutionalSuperTrendEnvelopeStepData(
  candles: Candle[],
  period = 10,
  mult = 3
): { upper: LineData<UTCTimestamp>[]; lower: LineData<UTCTimestamp>[] } {
  const upper: LineData<UTCTimestamp>[] = [];
  const lower: LineData<UTCTimestamp>[] = [];
  const core = computeSuperTrendCore(candles, period, mult);
  if (!core) return { upper, lower };
  const { finalUpper, finalLower } = core;
  const n = candles.length;
  for (let i = 0; i < n; i++) {
    const t = candles[i].time as UTCTimestamp;
    upper.push({ time: t, value: finalUpper[i] });
    lower.push({ time: t, value: finalLower[i] });
  }
  return { upper, lower };
}

/** SuperTrend 상·하한의 중간 — 스텝과 동일 봉 정렬(마감·안착 보조선) */
export function computeInstitutionalSuperTrendMidLineData(
  candles: Candle[],
  period = INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  mult = INSTITUTIONAL_BAND_DEFAULT_MULT,
  reuseCore?: InstitutionalSuperTrendCore | null
): LineData<UTCTimestamp>[] {
  const core = resolveSuperTrendCore(candles, period, mult, reuseCore ?? undefined);
  if (!core) return [];
  const { finalUpper, finalLower } = core;
  const out: LineData<UTCTimestamp>[] = [];
  for (let i = 0; i < candles.length; i++) {
    out.push({
      time: candles[i].time as UTCTimestamp,
      value: (finalUpper[i] + finalLower[i]) * 0.5,
    });
  }
  return out;
}

/** 마감존 상·하한을 SuperTrend 롱/숏 구간으로 나눈 조각 — 구간마다 선 색만 바꿔 그릴 때 사용 */
export type InstitutionalEnvelopeTrendSegment = {
  dir: 'long' | 'short';
  upper: LineData<UTCTimestamp>[];
  lower: LineData<UTCTimestamp>[];
};

/**
 * 마감 존 스텝(상·하한 전체)을 추세 전환마다 분할.
 * 인접 구간은 경계 봉을 한 번 겹쳐 스텝이 끊기지 않게 함.
 */
export function computeInstitutionalSuperTrendEnvelopeSegmentsByTrend(
  candles: Candle[],
  period = INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  mult = INSTITUTIONAL_BAND_DEFAULT_MULT
): InstitutionalEnvelopeTrendSegment[] {
  const core = computeSuperTrendCore(candles, period, mult);
  if (!core) return [];
  const { trend, finalUpper, finalLower } = core;
  const n = candles.length;
  if (n < 1) return [];

  const slice = (a: number, b: number): InstitutionalEnvelopeTrendSegment => {
    const dir: 'long' | 'short' = trend[a] === 1 ? 'long' : 'short';
    const upper: LineData<UTCTimestamp>[] = [];
    const lower: LineData<UTCTimestamp>[] = [];
    for (let j = a; j <= b; j++) {
      const t = candles[j].time as UTCTimestamp;
      upper.push({ time: t, value: finalUpper[j] });
      lower.push({ time: t, value: finalLower[j] });
    }
    return { dir, upper, lower };
  };

  const segments: InstitutionalEnvelopeTrendSegment[] = [];
  let runStart = 0;
  for (let i = 1; i < n; i++) {
    if (trend[i] !== trend[runStart]) {
      const end = i - 1;
      segments.push(slice(runStart, end));
      runStart = end;
    }
  }
  segments.push(slice(runStart, n - 1));
  return segments;
}

/** 마감·안착 밴드 색 구간 융합 — 구조/분석/시나리오 입력. 성과·승률 수치는 부여하지 않음. */
export type MonthDeskBandFusionHighlight = {
  bias: 'bullish' | 'bearish';
  phase: string;
  tag?: string;
};

export type MonthDeskBandFusionContext = {
  analyzeVerdict?: string | null;
  closingScenarioBias?: 'LONG' | 'SHORT' | 'NEUTRAL' | null;
  /** 마지막 봉 마감 판정(안착/실패/불안) — 최근 구간 존선 색 가중 */
  lastClosingVerdict?: ClosingEnvelopeVerdictKo | null;
  /** 차트 TF — 데드밴드·최소 구간 길이 튜닝 */
  timeframe?: string | null;
  structureByTime?: ReadonlyMap<number, MonthDeskBandFusionHighlight> | null;
  /** 차트 구조 로켓(🚀/📉)과 동일 — 봉 open time → LONG|SHORT */
  rocketByBarTime?: ReadonlyMap<number, 'LONG' | 'SHORT'> | null;
  /** Chart Prime 채널 엔진 봉별 편향 — `computeChartPrimeBiasScoreSeries` */
  cpBiasScores?: number[] | null;
  /** ParkF LinReg 미드 대비 종가 편향 — 롤링 구간 */
  linRegBiasScores?: number[] | null;
  /**
   * 고래 Hot Zone과 동일 볼륨 프로파일 → 구간별 과거 방향 통계 기반 편향(OHLCV, 호가 원장 아님).
   */
  hotZoneBiasScores?: number[] | null;
  /** analyze와 동일 규칙의 유효 FVG + 구조검증 OB에 가격이 맞닿을 때 편향 */
  obFvgBiasScores?: number[] | null;
};

type MonthDeskZoneFusionTuning = {
  deadband: number;
  minRunBars: number;
  smoothAlpha: number;
  recentTailBars: number;
  verdictBoost: number;
};

function monthDeskZoneFusionTuning(timeframe?: string | null): MonthDeskZoneFusionTuning {
  const tf = normalizeChartTimeframe(timeframe ?? '1h');
  const table: Record<string, MonthDeskZoneFusionTuning> = {
    '1m': { deadband: 0.56, minRunBars: 3, smoothAlpha: 0.31, recentTailBars: 28, verdictBoost: 0.72 },
    '3m': { deadband: 0.55, minRunBars: 3, smoothAlpha: 0.3, recentTailBars: 26, verdictBoost: 0.74 },
    '5m': { deadband: 0.54, minRunBars: 3, smoothAlpha: 0.29, recentTailBars: 24, verdictBoost: 0.76 },
    '15m': { deadband: 0.52, minRunBars: 3, smoothAlpha: 0.28, recentTailBars: 22, verdictBoost: 0.78 },
    '30m': { deadband: 0.5, minRunBars: 3, smoothAlpha: 0.27, recentTailBars: 20, verdictBoost: 0.8 },
    '1h': { deadband: 0.48, minRunBars: 3, smoothAlpha: 0.26, recentTailBars: 18, verdictBoost: 0.82 },
    '2h': { deadband: 0.46, minRunBars: 4, smoothAlpha: 0.25, recentTailBars: 16, verdictBoost: 0.84 },
    '4h': { deadband: 0.42, minRunBars: 4, smoothAlpha: 0.24, recentTailBars: 14, verdictBoost: 0.88 },
    '6h': { deadband: 0.4, minRunBars: 4, smoothAlpha: 0.23, recentTailBars: 12, verdictBoost: 0.9 },
    '8h': { deadband: 0.38, minRunBars: 4, smoothAlpha: 0.22, recentTailBars: 12, verdictBoost: 0.9 },
    '12h': { deadband: 0.36, minRunBars: 4, smoothAlpha: 0.21, recentTailBars: 10, verdictBoost: 0.92 },
    '1d': { deadband: 0.34, minRunBars: 5, smoothAlpha: 0.2, recentTailBars: 10, verdictBoost: 0.94 },
    '3d': { deadband: 0.32, minRunBars: 5, smoothAlpha: 0.19, recentTailBars: 8, verdictBoost: 0.96 },
    '1w': { deadband: 0.3, minRunBars: 5, smoothAlpha: 0.18, recentTailBars: 8, verdictBoost: 0.96 },
    '1M': { deadband: 0.28, minRunBars: 5, smoothAlpha: 0.17, recentTailBars: 6, verdictBoost: 0.98 },
  };
  return table[tf] ?? table['1h']!;
}

function applyMonthDeskVerdictTailBoost(
  scores: number[],
  trend: number[],
  tailBars: number,
  verdict: ClosingEnvelopeVerdictKo | null | undefined,
  boost: number
): void {
  if (!verdict || tailBars < 1) return;
  const n = scores.length;
  const start = Math.max(0, n - tailBars);
  for (let i = start; i < n; i++) {
    const stSign = trend[i] === 1 ? 1 : -1;
    if (verdict === '안착') scores[i] += stSign * boost;
    else if (verdict === '실패') scores[i] -= stSign * (boost * 1.15);
    else scores[i] *= 0.94;
  }
}

function monthDeskFusionHasAuxiliarySignals(ctx: MonthDeskBandFusionContext): boolean {
  const v = ctx.analyzeVerdict;
  if (v === 'LONG' || v === 'SHORT') return true;
  const b = ctx.closingScenarioBias;
  if (b === 'LONG' || b === 'SHORT') return true;
  if ((ctx.structureByTime?.size ?? 0) > 0) return true;
  return (ctx.rocketByBarTime?.size ?? 0) > 0;
}

function smaVolumeAt(candles: Candle[], endIdx: number, len: number): number {
  const start = Math.max(0, endIdx - len + 1);
  let sum = 0;
  let c = 0;
  for (let k = start; k <= endIdx; k++) {
    const v = Number(candles[k]?.volume ?? 0);
    if (Number.isFinite(v)) {
      sum += v;
      c++;
    }
  }
  return c > 0 ? sum / c : 0;
}

/** 1봉짜리 색 뒤집힘 제거 — 양옆이 같으면 그쪽으로 흡수, 시작·끝은 인접 구간 색 따름 */
function mergeShortTrendRuns(raw: number[], minBars: number): number[] {
  const n = raw.length;
  if (n === 0 || minBars <= 1) return raw.slice();
  const runs: { start: number; end: number; val: number }[] = [];
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && raw[j] === raw[i]) j++;
    runs.push({ start: i, end: j - 1, val: raw[i] });
    i = j;
  }
  const out = raw.slice();
  for (let r = 0; r < runs.length; r++) {
    const len = runs[r].end - runs[r].start + 1;
    if (len >= minBars) continue;
    const prevVal = r > 0 ? runs[r - 1].val : null;
    const nextVal = r + 1 < runs.length ? runs[r + 1].val : null;
    const replacement =
      prevVal != null && nextVal != null
        ? prevVal
        : prevVal != null
          ? prevVal
          : nextVal != null
            ? nextVal
            : runs[r].val;
    for (let k = runs[r].start; k <= runs[r].end; k++) out[k] = replacement;
  }
  return out;
}

/**
 * SuperTrend 상·하한 **가격**은 그대로 두고, 롱/숏 **색 구간**은 RSI·밴드 내 종가에 더해
 * TF verdict·마감존 편향·BOS/CHOCH/MSB 단계·구조 로켓(동일 봉)·거래량(SMA 대비)을 가중한다.
 * 양방향 스무딩 + 짧은 구간 병합으로 시각적 노이즈를 줄인다.
 */
export function computeInstitutionalSuperTrendEnvelopeSegmentsFused(
  candles: Candle[],
  period = INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  mult = INSTITUTIONAL_BAND_DEFAULT_MULT,
  fusion?: MonthDeskBandFusionContext | null,
  reuseCore?: InstitutionalSuperTrendCore | null
): InstitutionalEnvelopeTrendSegment[] {
  const core = resolveSuperTrendCore(candles, period, mult, reuseCore ?? undefined);
  if (!core) return [];
  const { trend, finalUpper, finalLower } = core;
  const n = candles.length;
  if (n < 1) return [];

  const useAuxBoost = fusion != null && monthDeskFusionHasAuxiliarySignals(fusion);
  const rsi = computeRsiWilderSeries(candles, 14);
  const scores = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const stSign = trend[i] === 1 ? 1 : -1;
    let s = 6.35 * stSign;

    const cl = Number(candles[i].close);
    const fu = finalUpper[i];
    const fl = finalLower[i];
    const bw = fu - fl;
    if (Number.isFinite(cl) && Number.isFinite(fu) && Number.isFinite(fl) && bw > 1e-12) {
      const mid = (fu + fl) / 2;
      const pos = (cl - mid) / bw;
      s += Math.max(-1, Math.min(1, pos)) * 1.45;
    }

    const rv = rsi[i];
    if (rv != null && Number.isFinite(rv)) {
      if (rv >= 56) s += 1.2;
      else if (rv <= 44) s -= 1.2;
      else if (rv >= 52) s += 0.45;
      else if (rv <= 48) s -= 0.45;
    }

    const cpSc = fusion?.cpBiasScores?.[i];
    const lrSc = fusion?.linRegBiasScores?.[i];
    if (cpSc != null && Number.isFinite(cpSc)) s += cpSc * 1.22;
    if (lrSc != null && Number.isFinite(lrSc)) s += lrSc * 1.14;
    if (
      cpSc != null &&
      lrSc != null &&
      Number.isFinite(cpSc) &&
      Number.isFinite(lrSc) &&
      cpSc * lrSc > 0 &&
      Math.abs(cpSc) > 0.2 &&
      Math.abs(lrSc) > 0.2
    ) {
      s += cpSc > 0 ? 0.48 : -0.48;
    }

    const hzSc = fusion?.hotZoneBiasScores?.[i];
    const obFvgSc = fusion?.obFvgBiasScores?.[i];
    if (hzSc != null && Number.isFinite(hzSc)) s += hzSc * 1.08;
    if (obFvgSc != null && Number.isFinite(obFvgSc)) s += obFvgSc * 1.05;
    if (
      hzSc != null &&
      obFvgSc != null &&
      Number.isFinite(hzSc) &&
      Number.isFinite(obFvgSc) &&
      hzSc * obFvgSc > 0 &&
      Math.abs(hzSc) > 0.18 &&
      Math.abs(obFvgSc) > 0.18
    ) {
      s += hzSc > 0 ? 0.38 : -0.38;
    }

    if (
      obFvgSc != null &&
      cpSc != null &&
      Number.isFinite(obFvgSc) &&
      Number.isFinite(cpSc) &&
      obFvgSc * cpSc > 0 &&
      Math.abs(obFvgSc) > 0.22 &&
      Math.abs(cpSc) > 0.22
    ) {
      s += cpSc > 0 ? 0.28 : -0.28;
    }

    const bt = Number(candles[i].time);
    const structHere =
      Number.isFinite(bt) && fusion?.structureByTime ? fusion.structureByTime.get(bt) : undefined;

    if (useAuxBoost && fusion) {
      const av = fusion.analyzeVerdict;
      if (av === 'LONG') s += 1.25;
      else if (av === 'SHORT') s -= 1.25;

      const cb = fusion.closingScenarioBias;
      if (cb === 'LONG') s += 1.05;
      else if (cb === 'SHORT') s -= 1.05;

      if (structHere && structHere.phase !== 'failed') {
        const bull = structHere.bias === 'bullish';
        let w = 1.65;
        if (structHere.phase === 'confirmed') w = 3.35;
        else if (structHere.phase === 'settling') w = 2.45;
        else if (structHere.phase === 'breakout') w = 2.05;
        else if (structHere.phase === 'trace') w = 1.35;
        const tag = structHere.tag;
        if (tag === 'MSB') w *= 1.14;
        else if (tag === 'CHOCH') w *= 1.08;
        s += bull ? w : -w;
      }

      /** CP 채널 편향 부호가 구조 방향과 같을 때 소량 가산(BOS/CHOCH/MSB 태그별 미세 차등) */
      if (
        structHere &&
        structHere.phase !== 'failed' &&
        cpSc != null &&
        Number.isFinite(cpSc) &&
        Math.abs(cpSc) > 0.24
      ) {
        const bullS = structHere.bias === 'bullish';
        const bearS = structHere.bias === 'bearish';
        const cpBull = cpSc > 0;
        if ((bullS && cpBull) || (bearS && !cpBull)) {
          let syn = 0.26;
          if (structHere.tag === 'MSB') syn += 0.1;
          else if (structHere.tag === 'CHOCH') syn += 0.07;
          else if (structHere.tag === 'BOS') syn += 0.05;
          s += bullS ? syn : -syn;
        }
      }
    }

    /** 구조 로켓 봉 + 거래량 확인 — 차트 마커와 동일 소스(`rocketByBarTime`) */
    if (fusion?.rocketByBarTime && Number.isFinite(bt)) {
      const rk = fusion.rocketByBarTime.get(bt);
      if (rk === 'LONG' || rk === 'SHORT') {
        const smaV = smaVolumeAt(candles, i, 20);
        const vi = Number(candles[i].volume ?? 0);
        const vr = smaV > 1e-20 && Number.isFinite(vi) ? vi / smaV : 1;
        let bump = 2.62;
        if (vr >= 1.58) bump += 1.52;
        else if (vr >= 1.24) bump += 0.88;
        else if (vr <= 0.66) bump *= 0.55;
        if (rk === 'LONG') {
          s += bump;
          if (structHere && structHere.phase !== 'failed' && structHere.bias === 'bullish') {
            s += 1.42;
          }
        } else {
          s -= bump;
          if (structHere && structHere.phase !== 'failed' && structHere.bias === 'bearish') {
            s -= 1.42;
          }
        }
      }
    }

    scores[i] = s;
  }

  const tuning = monthDeskZoneFusionTuning(fusion?.timeframe ?? null);
  applyMonthDeskVerdictTailBoost(
    scores,
    trend,
    tuning.recentTailBars,
    fusion?.lastClosingVerdict ?? null,
    tuning.verdictBoost
  );

  const alpha = tuning.smoothAlpha;
  const fwd = new Array(n).fill(0);
  fwd[0] = scores[0];
  for (let i = 1; i < n; i++) {
    fwd[i] = alpha * scores[i] + (1 - alpha) * fwd[i - 1];
  }
  const bwd = new Array(n).fill(0);
  bwd[n - 1] = scores[n - 1];
  for (let i = n - 2; i >= 0; i--) {
    bwd[i] = alpha * scores[i] + (1 - alpha) * bwd[i + 1];
  }
  const smooth = new Array(n);
  for (let i = 0; i < n; i++) {
    smooth[i] = (fwd[i] + bwd[i]) * 0.5;
  }

  const deadband = useAuxBoost ? tuning.deadband : Math.min(0.62, tuning.deadband + 0.08);
  let fusedTrend = new Array(n).fill(1);
  for (let i = 0; i < n; i++) {
    const stSign = trend[i] === 1 ? 1 : -1;
    if (Math.abs(smooth[i]) < deadband) fusedTrend[i] = stSign;
    else fusedTrend[i] = smooth[i] >= 0 ? 1 : -1;
  }

  fusedTrend = mergeShortTrendRuns(fusedTrend, tuning.minRunBars);

  const slice = (a: number, b: number): InstitutionalEnvelopeTrendSegment => {
    const dir: 'long' | 'short' = fusedTrend[a] === 1 ? 'long' : 'short';
    const upper: LineData<UTCTimestamp>[] = [];
    const lower: LineData<UTCTimestamp>[] = [];
    for (let j = a; j <= b; j++) {
      const t = candles[j].time as UTCTimestamp;
      upper.push({ time: t, value: finalUpper[j] });
      lower.push({ time: t, value: finalLower[j] });
    }
    return { dir, upper, lower };
  };

  const segments: InstitutionalEnvelopeTrendSegment[] = [];
  let runStart = 0;
  for (let i = 1; i < n; i++) {
    if (fusedTrend[i] !== fusedTrend[runStart]) {
      const end = i - 1;
      segments.push(slice(runStart, end));
      runStart = end;
    }
  }
  segments.push(slice(runStart, n - 1));
  return segments;
}

/** 마감·안착 차트 마커용 — 종가 vs SuperTrend 상·하한(참고 휴리스틱, 확정 신호 아님) */
export type ClosingEnvelopeVerdictKo = '안착' | '실패' | '불안';

/** 오버레이·툴팁용 짧은 판정 문자열 */
export function closingEnvelopeVerdictStripLabel(v: ClosingEnvelopeVerdictKo): string {
  return v;
}

export function computeClosingEnvelopeVerdictMarkers(
  candles: Candle[],
  period = INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  mult = INSTITUTIONAL_BAND_DEFAULT_MULT,
  options?: { recentBars?: number; /** 기본 240. 마감·안착 패널 등에서 더 긴 구간을 볼 때만 상향 */
    recentBarsMax?: number }
): { time: UTCTimestamp; verdict: ClosingEnvelopeVerdictKo }[] {
  const core = computeSuperTrendCore(candles, period, mult);
  if (!core) return [];
  const { trend, finalUpper, finalLower } = core;
  const n = candles.length;
  const hardCap = Math.max(24, Math.min(1200, options?.recentBarsMax ?? 240));
  const desired = Math.max(24, Math.floor(options?.recentBars ?? 120));
  const recent = Math.min(hardCap, desired);
  const start = Math.max(0, n - recent);
  const out: { time: UTCTimestamp; verdict: ClosingEnvelopeVerdictKo }[] = [];
  for (let i = start; i < n; i++) {
    const c = candles[i];
    const cl = Number(c.close);
    const hi = Number(c.high);
    const lo = Number(c.low);
    const fu = finalUpper[i];
    const fl = finalLower[i];
    if (!Number.isFinite(cl) || !Number.isFinite(fu) || !Number.isFinite(fl)) continue;
    const bw = Math.max(fu - fl, 1e-12);
    const eps = Math.max(bw * 0.03, Math.abs(cl) * 1e-8);
    let verdict: ClosingEnvelopeVerdictKo;
    if (trend[i] === 1) {
      if (cl < fl) verdict = '실패';
      else if (Number.isFinite(lo) && lo <= fl + eps) verdict = '안착';
      else verdict = '불안';
    } else {
      if (cl > fu) verdict = '실패';
      else if (Number.isFinite(hi) && hi >= fu - eps) verdict = '안착';
      else verdict = '불안';
    }
    out.push({ time: c.time as UTCTimestamp, verdict });
  }
  return out;
}

/** 마감존(SuperTrend 상·하한) + 진행 추세로 만든 선물 대응 **참고 시나리오**(확정 신호·수익 보장 아님) */
export type ClosingEnvelopeFuturesBias = 'LONG' | 'SHORT' | 'NEUTRAL';

export type ClosingEnvelopeFuturesScenario = {
  bias: ClosingEnvelopeFuturesBias;
  /** 무효화 판단용 기준 가격(종가 전후 참고) */
  invalidationPrice: number;
  invalidationSide: 'below' | 'above';
  summaryKo: string;
  bulletsKo: string[];
  lastVerdict: ClosingEnvelopeVerdictKo;
  trendLong: boolean;
};

function fmtClosingScenarioPx(n: number): string {
  const a = Math.abs(n);
  const frac = a >= 1000 ? 2 : a >= 1 ? 4 : 6;
  return n.toLocaleString(undefined, { maximumFractionDigits: frac });
}

/**
 * 마지막 봉 기준 — 존하·존상과 종가 관계로 롱/숏 **편향**만 표현.
 * 실거래·레버리지는 본인 판단; 상위 TF·체결·뉴스 등 별도 검증 필요.
 */
export function computeClosingEnvelopeFuturesScenario(
  candles: Candle[],
  period = INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  mult = INSTITUTIONAL_BAND_DEFAULT_MULT,
  reuseCore?: InstitutionalSuperTrendCore | null
): ClosingEnvelopeFuturesScenario | null {
  const core = resolveSuperTrendCore(candles, period, mult, reuseCore ?? undefined);
  if (!core) return null;
  const n = candles.length;
  const i = n - 1;
  const { trend, finalUpper, finalLower } = core;
  const c = candles[i];
  const cl = Number(c.close);
  const hi = Number(c.high);
  const lo = Number(c.low);
  const fu = finalUpper[i];
  const fl = finalLower[i];
  if (!Number.isFinite(cl) || !Number.isFinite(fu) || !Number.isFinite(fl)) return null;
  const bw = Math.max(fu - fl, 1e-12);
  const eps = Math.max(bw * 0.03, Math.abs(cl) * 1e-8);
  let verdict: ClosingEnvelopeVerdictKo;
  if (trend[i] === 1) {
    if (cl < fl) verdict = '실패';
    else if (Number.isFinite(lo) && lo <= fl + eps) verdict = '안착';
    else verdict = '불안';
  } else {
    if (cl > fu) verdict = '실패';
    else if (Number.isFinite(hi) && hi >= fu - eps) verdict = '안착';
    else verdict = '불안';
  }
  const trendLong = trend[i] === 1;
  const mid = (fu + fl) / 2;

  let bias: ClosingEnvelopeFuturesBias;
  let invalidationPrice: number;
  let invalidationSide: 'below' | 'above';
  let summaryKo: string;
  const bulletsKo: string[] = [];

  if (trendLong) {
    if (verdict === '안착') {
      bias = 'LONG';
      invalidationPrice = fl;
      invalidationSide = 'below';
      summaryKo = '마감존하 안착 국면 — 롱 편향 참고, 무효는 존하 아래 종가';
      bulletsKo.push('참고 시나리오: 롱 우위(SuperTrend 롱 + 존하 지지)');
      bulletsKo.push(`무효화 참고: ${fmtClosingScenarioPx(fl)} 아래로 종가 마감 시 롱 전제 약화`);
    } else if (verdict === '실패') {
      bias = 'SHORT';
      invalidationPrice = fl;
      invalidationSide = 'above';
      summaryKo = '마감존하 이탈 — 숏·되돌림 편향 참고, 무효는 존하 위 종가 회복';
      bulletsKo.push('참고 시나리오: 숏 우위(존하 붕괴)');
      bulletsKo.push(`무효화 참고: ${fmtClosingScenarioPx(fl)} 위로 종가 회복 시 숏 전제 약화`);
    } else {
      if (cl >= mid) {
        bias = 'LONG';
        invalidationPrice = fl;
        invalidationSide = 'below';
        summaryKo = '존 중상단·불안 — 약한 롱 편향, 무효는 존하 아래 종가';
      } else {
        bias = 'NEUTRAL';
        invalidationPrice = fl;
        invalidationSide = 'below';
        summaryKo = '존 중하단·불안 — 분기 구간, 존하·존상 종가 확인';
      }
      bulletsKo.push('마감존 상태: 불안 — 확정 신호 아님');
      bulletsKo.push(
        bias === 'LONG'
          ? `약한 롱 편향: 무효 ${fmtClosingScenarioPx(fl)} 아래 종가`
          : `중립: ${fmtClosingScenarioPx(fl)} / ${fmtClosingScenarioPx(fu)} 양쪽 종가로 방향 가름`
      );
    }
  } else {
    if (verdict === '안착') {
      bias = 'SHORT';
      invalidationPrice = fu;
      invalidationSide = 'above';
      summaryKo = '마감존상 안착 국면 — 숏 편향 참고, 무효는 존상 위 종가';
      bulletsKo.push('참고 시나리오: 숏 우위(SuperTrend 숏 + 존상 저항)');
      bulletsKo.push(`무효화 참고: ${fmtClosingScenarioPx(fu)} 위로 종가 마감 시 숏 전제 약화`);
    } else if (verdict === '실패') {
      bias = 'LONG';
      invalidationPrice = fu;
      invalidationSide = 'below';
      summaryKo = '마감존상 돌파 — 롱·반등 편향 참고, 무효는 존상 아래 종가';
      bulletsKo.push('참고 시나리오: 롱 우위(존상 돌파)');
      bulletsKo.push(`무효화 참고: ${fmtClosingScenarioPx(fu)} 아래로 종가 되돌림 시 롱 전제 약화`);
    } else {
      if (cl <= mid) {
        bias = 'SHORT';
        invalidationPrice = fu;
        invalidationSide = 'above';
        summaryKo = '존 중하단·불안 — 약한 숏 편향, 무효는 존상 위 종가';
      } else {
        bias = 'NEUTRAL';
        invalidationPrice = fu;
        invalidationSide = 'above';
        summaryKo = '존 중상단·불안 — 분기 구간, 존상·존하 종가 확인';
      }
      bulletsKo.push('마감존 상태: 불안 — 확정 신호 아님');
      bulletsKo.push(
        bias === 'SHORT'
          ? `약한 숏 편향: 무효 ${fmtClosingScenarioPx(fu)} 위 종가`
          : `중립: ${fmtClosingScenarioPx(fl)} / ${fmtClosingScenarioPx(fu)} 양쪽 종가로 방향 가름`
      );
    }
  }

  bulletsKo.push('진입·레버·청산은 본인 리스크이며 승률·수익을 보장하지 않습니다.');

  return {
    bias,
    invalidationPrice,
    invalidationSide,
    summaryKo,
    bulletsKo,
    lastVerdict: verdict,
    trendLong,
  };
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
