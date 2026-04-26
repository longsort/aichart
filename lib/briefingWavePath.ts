import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';

/**
 * 브리핑 카드 빨간 네모 구간과 동일한 텍스트 풀:
 * 유사 참조 · 과거 학습 · 가장 유사 패턴 · 주요 패턴 · 비전 요약
 */
export function buildBriefingPatternText(analysis: {
  topReferences?: Array<{ title?: string }>;
  recallSummary?: string | null;
  learnedPatternsTop5?: Array<{ title?: string; outcome?: string; reason?: string; score?: number }>;
  dominantPattern?: { type?: string; label?: string; reason?: string; bias?: string; confidence?: number } | null;
  patternVisionSummary?: string | null;
} | null): string {
  if (!analysis) return '';
  const refs = (analysis.topReferences ?? []).map((r) => String(r.title ?? '')).join(' ');
  const top = analysis.learnedPatternsTop5?.[0];
  const d = analysis.dominantPattern;
  return [
    refs,
    String(analysis.recallSummary ?? ''),
    String(top?.title ?? ''),
    String(top?.outcome ?? ''),
    String(top?.reason ?? ''),
    String(d?.type ?? ''),
    String(d?.label ?? ''),
    String(d?.reason ?? ''),
    String(d?.bias ?? ''),
    String(analysis.patternVisionSummary ?? ''),
  ]
    .join(' | ')
    .toLowerCase();
}

export type BriefingWavePathResult = {
  preAnchor: number;
  w1: number;
  w2: number;
  w3: number;
  useShort: boolean;
  tag: string;
  confidence: number;
};

/**
 * 브리핑 기준 3파 가격: 2파 끝 = 현재가(w2), 3파 도착 = TP1(w3), 1파 = 패턴에 맞는 중간 목표.
 * Bear Flag + CHOCH / Bull Flag + BOS 등은 텍스트 매칭으로 태그만 구분 (가격은 진입·목표·현재가로 고정).
 */
export function computeBriefingWavePathFromAnalysis(
  analysis: {
    verdict?: string;
    confidence?: number;
    entry?: string;
    stopLoss?: string;
    targets?: string[];
    longScore?: number;
    shortScore?: number;
    dominantPattern?: { bias?: string; confidence?: number } | null;
  } | null,
  currentPrice: number,
  patternText: string
): BriefingWavePathResult | null {
  if (!analysis || !Number.isFinite(currentPrice) || currentPrice <= 0) return null;
  const targets = (analysis.targets ?? [])
    .map((t) => parseFloat(String(t)))
    .filter((n) => Number.isFinite(n) && n > 0);
  const tp1 = targets[0];
  if (tp1 == null) return null;

  const entryNum = parseFloat(String(analysis.entry ?? ''));
  const t = patternText;

  const hasBearFlagChoch =
    (/(bear\s*flag|베어\s*플래그|bearflag|베어플래그)/i.test(t) || /베어.*플래그/i.test(t)) &&
    (/(choch|초크)/i.test(t) || /(continuation|지속|하락\s*이어|숏|bearish)/i.test(t));
  const hasBullFlagBos =
    (/(bull\s*flag|불\s*플래그|bullflag|불플래그)/i.test(t) || /불.*플래그/i.test(t)) &&
    (/(bos|비오에스)/i.test(t) || /(continuation|지속|상승\s*이어|롱|bullish)/i.test(t));
  const hasExpansionDown =
    /(확장형|expanding|broadening).*(하방|이탈|breakdown|하락)/i.test(t) ||
    /(하방\s*이탈|downside\s*break)/i.test(t);

  let tag = '브리핑패턴';
  if (hasBearFlagChoch) tag = 'BearFlag+CHOCH';
  else if (hasBullFlagBos) tag = 'BullFlag+BOS';
  else if (hasExpansionDown) tag = '확장형하방';

  const bearishBias =
    analysis.dominantPattern?.bias === 'bearish' ||
    /(bearish|하락|숏|downtrend|매도\s*우세|downward)/i.test(t);
  const bullishBias =
    analysis.dominantPattern?.bias === 'bullish' ||
    /(bullish|상승|롱|uptrend|매수\s*우세|upward)/i.test(t);

  const ls = analysis.longScore ?? 50;
  const ss = analysis.shortScore ?? 50;

  let useShort: boolean;
  if (analysis.verdict === 'SHORT') useShort = true;
  else if (analysis.verdict === 'LONG') useShort = false;
  else if (hasBearFlagChoch || (hasExpansionDown && bearishBias)) useShort = true;
  else if (hasBullFlagBos && bullishBias) useShort = false;
  else if (ss > ls + 8) useShort = true;
  else if (ls > ss + 8) useShort = false;
  else useShort = tp1 < currentPrice;

  const conf = Math.max(
    55,
    Math.min(
      96,
      Math.round(
        Number.isFinite(analysis.dominantPattern?.confidence)
          ? Number(analysis.dominantPattern?.confidence)
          : analysis.confidence ?? 70
      )
    )
  );

  if (useShort) {
    if (tp1 >= currentPrice) return null;
    const span = currentPrice - tp1;
    if (span < currentPrice * 0.0003) return null;
    const preAnchor = currentPrice + span * 0.42;
    const w1 = currentPrice - span * 0.52;
    const w2 = currentPrice;
    const w3 = tp1;
    return { preAnchor, w1, w2, w3, useShort: true, tag, confidence: conf };
  }

  if (tp1 <= currentPrice) return null;
  const span = tp1 - currentPrice;
  if (span < currentPrice * 0.0003) return null;
  const preAnchor = currentPrice - span * 0.42;
  const w1 = currentPrice + span * 0.52;
  const w2 = currentPrice;
  const w3 = tp1;
  return { preAnchor, w1, w2, w3, useShort: false, tag, confidence: conf };
}

export function formatBriefingWaveParagraph(path: BriefingWavePathResult): string {
  const dir = path.useShort ? '하락' : '상승';
  return (
    `[파동 분석 · 브리핑 카드 기준] ${dir} 시나리오 · ${path.tag} · 신뢰도 ${path.confidence}%\n` +
    `1파(충격): ${Math.round(path.w1).toLocaleString()} → ` +
    `2파(현재·반등/눌림): ${Math.round(path.w2).toLocaleString()} → ` +
    `3파(목표·TP1 도착): ${Math.round(path.w3).toLocaleString()}`
  );
}

/** TF별 봉 간격(초) — analyze route TF_SEC 와 동일 */
const TF_SEC: Record<string, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
  '1w': 604800,
  '1M': 2592000,
  '1Y': 31536000,
};

export type WavePathCandle = { time: number; high: number; low: number; close: number };

function resolveBarSec(candles: WavePathCandle[], timeframe: string): number {
  const fromTf = TF_SEC[timeframe];
  if (typeof fromTf === 'number' && fromTf > 0) return fromTf;
  const n = candles.length;
  if (n >= 2) {
    const d = Math.abs(candles[n - 1].time - candles[n - 2].time);
    if (d > 30) return d;
  }
  return 3600;
}

type SwingPt = { i: number; t: number; p: number };

function findFractalSwings(candles: WavePathCandle[], left = 2, right = 2): { highs: SwingPt[]; lows: SwingPt[] } {
  const highs: SwingPt[] = [];
  const lows: SwingPt[] = [];
  const n = candles.length;
  for (let i = left; i < n - right; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= left; j++) {
      if (candles[i].high <= candles[i - j].high) isHigh = false;
      if (candles[i].low >= candles[i - j].low) isLow = false;
    }
    for (let j = 1; j <= right; j++) {
      if (candles[i].high <= candles[i + j].high) isHigh = false;
      if (candles[i].low >= candles[i + j].low) isLow = false;
    }
    if (isHigh) highs.push({ i, t: candles[i].time, p: candles[i].high });
    if (isLow) lows.push({ i, t: candles[i].time, p: candles[i].low });
  }
  return { highs, lows };
}

function nearestSwing(
  swings: SwingPt[],
  targetPrice: number,
  maxIndex: number
): SwingPt | null {
  const cand = swings.filter((s) => s.i <= maxIndex);
  if (!cand.length) return null;
  let best = cand[0];
  let bestD = Math.abs(best.p - targetPrice);
  for (let k = 1; k < cand.length; k++) {
    const d = Math.abs(cand[k].p - targetPrice);
    if (d < bestD || (d === bestD && cand[k].i > best.i)) {
      best = cand[k];
      bestD = d;
    }
  }
  return best;
}

function nearestSwingBefore(
  swings: SwingPt[],
  targetPrice: number,
  beforeIdx: number
): SwingPt | null {
  const cand = swings.filter((s) => s.i < beforeIdx);
  if (!cand.length) return null;
  let best = cand[0];
  let bestD = Math.abs(best.p - targetPrice);
  for (let k = 1; k < cand.length; k++) {
    const d = Math.abs(cand[k].p - targetPrice);
    if (d < bestD || (d === bestD && cand[k].i > best.i)) {
      best = cand[k];
      bestD = d;
    }
  }
  return best;
}

/**
 * 브리핑 예측 파동을 캔들 시간축에 붙인다. (가격은 vals 그대로 — TP1 정확히 유지)
 * 5점: ①충격 시작 ~ ②1파 끝 ~ ③중간 반등/눌림 ~ ④현재 ~ (미래) TP1 — 차트에 직선 구간으로 맞춤.
 */
export function buildAnchoredWavePath(
  candles: WavePathCandle[],
  timeframe: string,
  vals: [number, number, number, number],
  useShort: boolean
): { times: number[]; prices: number[] } | null {
  if (!candles?.length || candles.length < 4) return null;
  const barSec = resolveBarSec(candles, timeframe);
  const lastIdx = candles.length - 1;
  const tLast = candles[lastIdx].time;
  const tFuture = tLast + barSec * 6;
  const [p0, p1, p2, p3] = vals;
  const { highs, lows } = findFractalSwings(candles, 2, 2);

  let t0: number;
  let t1: number;
  let t2 = tLast;
  let t3 = tFuture;

  if (useShort) {
    const low1 = nearestSwing(lows, p1, lastIdx - 1) ?? { i: Math.max(0, lastIdx - 8), t: candles[Math.max(0, lastIdx - 8)].time, p: candles[Math.max(0, lastIdx - 8)].low };
    const high0 = nearestSwingBefore(highs, p0, low1.i) ?? { i: Math.max(0, low1.i - 6), t: candles[Math.max(0, low1.i - 6)].time, p: candles[Math.max(0, low1.i - 6)].high };
    t1 = low1.t;
    t0 = high0.t;
    if (t0 >= t1) t0 = t1 - barSec * 4;
  } else {
    const high1 = nearestSwing(highs, p1, lastIdx - 1) ?? { i: Math.max(0, lastIdx - 8), t: candles[Math.max(0, lastIdx - 8)].time, p: candles[Math.max(0, lastIdx - 8)].high };
    const low0 = nearestSwingBefore(lows, p0, high1.i) ?? { i: Math.max(0, high1.i - 6), t: candles[Math.max(0, high1.i - 6)].time, p: candles[Math.max(0, high1.i - 6)].low };
    t1 = high1.t;
    t0 = low0.t;
    if (t0 >= t1) t0 = t1 - barSec * 4;
  }

  if (t1 >= t2) {
    t1 = t2 - barSec * 3;
    if (t0 >= t1) t0 = t1 - barSec * 4;
  }

  /** 1파 끝 ~ 현재 사이 반등/눌림 고점·저점 (스케치 ③) */
  let tMid: number | null = null;
  let pMid: number | null = null;
  const i1 = candles.findIndex((c) => c.time >= t1);
  const i2 = lastIdx;
  const from = Math.max(0, i1 >= 0 ? i1 : 0);
  const to = Math.max(from + 1, i2);
  if (useShort) {
    let bestH = -Infinity;
    let bestI = -1;
    for (let i = from; i <= to; i++) {
      if (candles[i].high > bestH) {
        bestH = candles[i].high;
        bestI = i;
      }
    }
    if (bestI > from && bestI < lastIdx) {
      tMid = candles[bestI].time;
      pMid = bestH;
    }
  } else {
    let bestL = Infinity;
    let bestI = -1;
    for (let i = from; i <= to; i++) {
      if (candles[i].low < bestL) {
        bestL = candles[i].low;
        bestI = i;
      }
    }
    if (bestI > from && bestI < lastIdx) {
      tMid = candles[bestI].time;
      pMid = bestL;
    }
  }

  if (tMid != null && pMid != null && t0 < t1 && t1 < tMid && tMid < t2 && t2 < t3) {
    return {
      times: [t0, t1, tMid, t2, t3],
      prices: [p0, p1, pMid, p2, p3],
    };
  }

  return {
    times: [t0, t1, t2, t3],
    prices: [p0, p1, p2, p3],
  };
}

/**
 * 브리핑 카드 수치(TP1·현재가 등)만으로 3파 시나리오를 차트에 붙인다.
 * `/api/analyze`가 tap-beam을 안 내려줄 때 `briefingReferenceChartOverlays`에서 사용.
 */
export function buildRecallWaveScenarioOverlays(
  analysis: AnalyzeResponse,
  candles: Candle[],
  timeframe: string
): OverlayItem[] {
  if (!analysis || candles.length < 4) return [];
  const patternText = buildBriefingPatternText(analysis);
  const last = candles[candles.length - 1];
  const currentPrice = Number(last?.close);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return [];

  const wave = computeBriefingWavePathFromAnalysis(analysis, currentPrice, patternText);
  if (!wave) return [];

  const quad: [number, number, number, number] = [wave.preAnchor, wave.w1, wave.w2, wave.w3];
  const anchored = buildAnchoredWavePath(candles as WavePathCandle[], timeframe, quad, wave.useShort);
  const times = anchored?.times;
  const prices = anchored?.prices;
  if (!times?.length || !prices?.length || times.length !== prices.length || times.length < 2) return [];

  const color = wave.useShort ? 'rgba(248,113,113,0.82)' : 'rgba(74,222,128,0.82)';
  const idPrefix = 'briefing-recall-wave';
  const nSeg = prices.length - 1;
  const out: OverlayItem[] = [];

  for (let s = 0; s < nSeg; s++) {
    out.push({
      id: `${idPrefix}-seg-${s + 1}`,
      kind: 'scenario',
      label: s === 0 ? `브리핑·${wave.tag}` : '',
      time1: times[s],
      time2: times[s + 1],
      price1: prices[s],
      price2: prices[s + 1],
      x1: 0.5,
      y1: 0.5,
      x2: 0.5,
      y2: 0.5,
      confidence: wave.confidence,
      color,
      category: 'scenario',
      noProject: s === nSeg - 1,
    });
  }
  return out;
}
