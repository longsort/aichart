/**
 * 연합 데스크 밴드 — 기관밴드·로켓과 **별도** LineSeries.
 * CP·LinReg·HotZone·구조·로켓·Strike·보드·캔들·안착을 한 스코어로 묶어
 * 융합 중심선 + 존상·존하 스텝 밴드 + E/SL/TP 메타. 참고용.
 */
import type { Candle } from '@/types';
import type { LineData, UTCTimestamp } from 'lightweight-charts';
import type { InstitutionalEnvelopeTrendSegment, MonthDeskBandFusionContext } from '@/lib/institutionalSuperBand';
import { computeRsiWilderSeries } from '@/lib/institutionalBandConfluence';
import { normalizeChartTimeframe } from '@/lib/constants';

export type FusionDeskBandExtra = {
  boardScoreLong?: number;
  boardScoreShort?: number;
  candleIntelBias?: 'LONG' | 'SHORT' | 'NEUTRAL';
  settleStep?: 'wait' | 'break' | 'settle' | 'confirm' | 'failed' | 'fake';
  fusedCandleDir?: 'LONG' | 'SHORT' | 'WAIT';
  strikeEntry?: number | null;
  strikeSl?: number | null;
  strikeTp1?: number | null;
  strikeTp2?: number | null;
  strikeTp3?: number | null;
  strikeZoneTop?: number | null;
  strikeZoneBot?: number | null;
  strikePrimary?: 'LONG' | 'SHORT' | 'NEUTRAL';
};

export type FusionDeskBandMeta = {
  direction: 'long' | 'short' | 'neutral';
  confluence: number;
  headlineKo: string;
  sublineKo: string;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
};

function atr14(candles: Candle[]): number[] {
  const n = candles.length;
  const out = new Array(n).fill(0);
  if (!n) return out;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? candles[i - 1] : undefined;
    const tr = prev
      ? Math.max(
          candles[i].high - candles[i].low,
          Math.abs(candles[i].high - prev.close),
          Math.abs(candles[i].low - prev.close)
        )
      : candles[i].high - candles[i].low;
    if (i < 14) {
      sum += tr;
      out[i] = sum / (i + 1);
    } else {
      out[i] = (out[i - 1] * 13 + tr) / 14;
    }
  }
  return out;
}

function smaVolumeAt(candles: Candle[], idx: number, period: number): number {
  let s = 0;
  let c = 0;
  for (let j = Math.max(0, idx - period + 1); j <= idx; j++) {
    s += Number(candles[j]?.volume ?? 0);
    c++;
  }
  return c > 0 ? s / c : 0;
}

function mergeShortRuns(sign: number[], minBars: number): number[] {
  const n = sign.length;
  if (n === 0 || minBars <= 1) return sign.slice();
  const runs: { start: number; end: number; val: number }[] = [];
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && sign[j] === sign[i]) j++;
    runs.push({ start: i, end: j - 1, val: sign[i] });
    i = j;
  }
  const out = sign.slice();
  for (let r = 0; r < runs.length; r++) {
    const len = runs[r].end - runs[r].start + 1;
    if (len >= minBars) continue;
    const prevVal = r > 0 ? runs[r - 1].val : null;
    const nextVal = r + 1 < runs.length ? runs[r + 1].val : null;
    const replacement =
      prevVal != null && nextVal != null ? prevVal : prevVal != null ? prevVal : nextVal != null ? nextVal : runs[r].val;
    for (let k = runs[r].start; k <= runs[r].end; k++) out[k] = replacement;
  }
  return out;
}

export function computeFusionDeskBandScores(
  candles: Candle[],
  fusion: MonthDeskBandFusionContext | null,
  extra: FusionDeskBandExtra | null,
  fusionMidByBar: (number | null)[]
): number[] {
  const n = candles.length;
  const scores = new Array(n).fill(0);
  if (n < 2) return scores;

  const rsi = computeRsiWilderSeries(candles, 14);
  const boardL = extra?.boardScoreLong ?? 0;
  const boardS = extra?.boardScoreShort ?? 0;
  const boardEdge = boardL - boardS;

  for (let i = 0; i < n; i++) {
    let s = 0;
    const mid = fusionMidByBar[i];
    const cl = Number(candles[i].close);
    if (mid != null && Number.isFinite(mid) && Number.isFinite(cl)) {
      s += Math.max(-1.2, Math.min(1.2, (cl - mid) / Math.max(Math.abs(mid) * 0.002, 1e-9))) * 2.1;
    }

    const rv = rsi[i];
    if (rv != null && Number.isFinite(rv)) {
      if (rv >= 58) s += 1.1;
      else if (rv <= 42) s -= 1.1;
    }

    const cpSc = fusion?.cpBiasScores?.[i];
    const lrSc = fusion?.linRegBiasScores?.[i];
    if (cpSc != null && Number.isFinite(cpSc)) s += cpSc * 1.35;
    if (lrSc != null && Number.isFinite(lrSc)) s += lrSc * 1.28;

    const hzSc = fusion?.hotZoneBiasScores?.[i];
    const obSc = fusion?.obFvgBiasScores?.[i];
    if (hzSc != null && Number.isFinite(hzSc)) s += hzSc * 1.15;
    if (obSc != null && Number.isFinite(obSc)) s += obSc * 1.08;

    if (fusion?.analyzeVerdict === 'LONG') s += 1.35;
    else if (fusion?.analyzeVerdict === 'SHORT') s -= 1.35;

    if (fusion?.closingScenarioBias === 'LONG') s += 1.05;
    else if (fusion?.closingScenarioBias === 'SHORT') s -= 1.05;

    const bt = Number(candles[i].time);
    const structHere =
      Number.isFinite(bt) && fusion?.structureByTime ? fusion.structureByTime.get(bt) : undefined;
    if (structHere && structHere.phase !== 'failed') {
      const w =
        structHere.phase === 'confirmed'
          ? 3.2
          : structHere.phase === 'settling'
            ? 2.4
            : structHere.phase === 'breakout'
              ? 2.0
              : 1.4;
      s += structHere.bias === 'bullish' ? w : -w;
    }

    if (fusion?.rocketByBarTime && Number.isFinite(bt)) {
      const rk = fusion.rocketByBarTime.get(bt);
      if (rk === 'LONG' || rk === 'SHORT') {
        const smaV = smaVolumeAt(candles, i, 20);
        const vi = Number(candles[i].volume ?? 0);
        const vr = smaV > 1e-20 ? vi / smaV : 1;
        let bump = 2.85;
        if (vr >= 1.5) bump += 1.4;
        s += rk === 'LONG' ? bump : -bump;
      }
    }

    if (Math.abs(boardEdge) > 0.5) {
      s += boardEdge > 0 ? Math.min(2.2, boardEdge * 0.35) : Math.max(-2.2, boardEdge * 0.35);
    }

    if (extra?.candleIntelBias === 'LONG') s += 1.05;
    else if (extra?.candleIntelBias === 'SHORT') s -= 1.05;

    if (extra?.settleStep === 'confirm') s += extra.candleIntelBias === 'SHORT' ? -1.2 : 1.2;
    else if (extra?.settleStep === 'settle') s += extra.candleIntelBias === 'SHORT' ? -0.75 : 0.75;

    if (extra?.fusedCandleDir === 'LONG') s += 0.95;
    else if (extra?.fusedCandleDir === 'SHORT') s -= 0.95;

    const e = extra?.strikeEntry;
    const zt = extra?.strikeZoneTop;
    const zb = extra?.strikeZoneBot;
    if (e != null && zt != null && zb != null && Number.isFinite(cl)) {
      if (cl >= zb && cl <= zt) {
        s += extra.strikePrimary === 'SHORT' ? -1.15 : 1.15;
      }
    }

    scores[i] = s;
  }

  const alpha = 0.28;
  const fwd = new Array(n).fill(0);
  fwd[0] = scores[0];
  for (let i = 1; i < n; i++) fwd[i] = alpha * scores[i] + (1 - alpha) * fwd[i - 1];
  const bwd = new Array(n).fill(0);
  bwd[n - 1] = fwd[n - 1];
  for (let i = n - 2; i >= 0; i--) bwd[i] = alpha * fwd[i] + (1 - alpha) * bwd[i + 1];
  return bwd;
}

function deadbandForTf(tf: string): number {
  const t = normalizeChartTimeframe(tf);
  const map: Record<string, number> = {
    '1m': 0.52,
    '5m': 0.48,
    '15m': 0.44,
    '1h': 0.38,
    '4h': 0.32,
    '1d': 0.28,
    '1w': 0.24,
    '1M': 0.2,
  };
  return map[t] ?? 0.36;
}

export function computeFusionDeskBandEnvelopeSegments(
  candles: Candle[],
  fusionMidByBar: (number | null)[],
  scores: number[],
  extra: FusionDeskBandExtra | null,
  timeframe: string
): InstitutionalEnvelopeTrendSegment[] {
  const n = candles.length;
  if (n < 2) return [];

  const atr = atr14(candles);
  const dead = deadbandForTf(timeframe);
  const minRun = normalizeChartTimeframe(timeframe) === '1M' ? 5 : 3;

  const rawSign = scores.map((s) => (s > dead ? 1 : s < -dead ? -1 : 0));
  let sign = mergeShortRuns(rawSign, minRun);
  for (let i = 0; i < n; i++) {
    if (sign[i] === 0) sign[i] = i > 0 ? sign[i - 1] : 1;
  }

  const strikeHalf =
    extra?.strikeZoneTop != null &&
    extra?.strikeZoneBot != null &&
    extra.strikeZoneTop > extra.strikeZoneBot
      ? (extra.strikeZoneTop - extra.strikeZoneBot) * 0.52
      : null;

  const slice = (a: number, b: number): InstitutionalEnvelopeTrendSegment => {
    const dir: 'long' | 'short' = sign[a] === 1 ? 'long' : 'short';
    const upper: LineData<UTCTimestamp>[] = [];
    const lower: LineData<UTCTimestamp>[] = [];
    for (let j = a; j <= b; j++) {
      const mid = fusionMidByBar[j];
      if (mid == null || !Number.isFinite(mid)) continue;
      const hw = Math.max(strikeHalf ?? 0, (atr[j] || atr[n - 1] || 1) * 0.72);
      const t = candles[j].time as UTCTimestamp;
      upper.push({ time: t, value: mid + hw * 0.55 });
      lower.push({ time: t, value: mid - hw * 0.95 });
    }
    return { dir, upper, lower };
  };

  const segments: InstitutionalEnvelopeTrendSegment[] = [];
  let runStart = 0;
  for (let i = 1; i < n; i++) {
    if (sign[i] !== sign[runStart]) {
      const end = i - 1;
      const seg = slice(runStart, end);
      if (seg.upper.length >= 2) segments.push(seg);
      runStart = end;
    }
  }
  const last = slice(runStart, n - 1);
  if (last.upper.length >= 2) segments.push(last);
  return segments;
}

export function buildFusionMidByBar(
  candles: Candle[],
  stMid: LineData<UTCTimestamp>[],
  lrMid: LineData<UTCTimestamp>[],
  cpMid: LineData<UTCTimestamp>[]
): (number | null)[] {
  const n = candles.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const vals: number[] = [];
    const push = (series: LineData<UTCTimestamp>[]) => {
      const v = series[i]?.value as number | undefined;
      if (v != null && Number.isFinite(v)) vals.push(v);
    };
    push(stMid);
    push(lrMid);
    push(cpMid);
    if (vals.length) out[i] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return out;
}

export function computeFusionDeskBandMeta(
  candles: Candle[],
  scores: number[],
  extra: FusionDeskBandExtra | null,
  timeframe: string
): FusionDeskBandMeta {
  const n = candles.length;
  const close = Number(candles[n - 1]?.close ?? 0);
  const dead = deadbandForTf(timeframe);
  const tail = scores.slice(-Math.min(24, n));
  const avg = tail.length ? tail.reduce((a, b) => a + b, 0) / tail.length : 0;
  const direction: FusionDeskBandMeta['direction'] =
    avg > dead ? 'long' : avg < -dead ? 'short' : 'neutral';
  const confluence = Math.round(
    Math.min(96, Math.max(38, 50 + Math.abs(avg) * 8 + Math.abs((extra?.boardScoreLong ?? 0) - (extra?.boardScoreShort ?? 0)) * 2))
  );

  const entry = extra?.strikeEntry ?? close;
  const sl = extra?.strikeSl ?? (direction === 'long' ? close * 0.985 : close * 1.015);
  const tp1 = extra?.strikeTp1 ?? (direction === 'long' ? close * 1.02 : close * 0.98);
  const tp2 = extra?.strikeTp2 ?? tp1 * (direction === 'long' ? 1.012 : 0.988);
  const tp3 = extra?.strikeTp3 ?? tp2 * (direction === 'long' ? 1.012 : 0.988);

  const dirKo = direction === 'long' ? '롱' : direction === 'short' ? '숏' : '중립';
  const headlineKo = `연합밴드 ${dirKo} · ${confluence}% — CP·LinReg·HotZone·로켓·Strike·보드·캔들`;
  const sublineKo = `E ${entry.toFixed(2)} · SL ${sl.toFixed(2)} · TP1 ${tp1.toFixed(2)}`;

  return {
    direction,
    confluence,
    headlineKo,
    sublineKo,
    entry,
    stopLoss: sl,
    tp1,
    tp2,
    tp3,
  };
}

export function computeFusionDeskBandPackage(params: {
  candles: Candle[];
  timeframe: string;
  fusion: MonthDeskBandFusionContext | null;
  extra: FusionDeskBandExtra | null;
  stMid: LineData<UTCTimestamp>[];
  lrMid: LineData<UTCTimestamp>[];
  cpMid: LineData<UTCTimestamp>[];
}): {
  segments: InstitutionalEnvelopeTrendSegment[];
  midLine: LineData<UTCTimestamp>[];
  meta: FusionDeskBandMeta;
} | null {
  const { candles, timeframe, fusion, extra, stMid, lrMid, cpMid } = params;
  if (candles.length < 8) return null;
  const fusionMidByBar = buildFusionMidByBar(candles, stMid, lrMid, cpMid);
  const scores = computeFusionDeskBandScores(candles, fusion, extra, fusionMidByBar);
  const segments = computeFusionDeskBandEnvelopeSegments(candles, fusionMidByBar, scores, extra, timeframe);
  const meta = computeFusionDeskBandMeta(candles, scores, extra, timeframe);
  const midLine: LineData<UTCTimestamp>[] = [];
  for (let i = 0; i < candles.length; i++) {
    const v = fusionMidByBar[i];
    if (v != null) midLine.push({ time: candles[i].time as UTCTimestamp, value: v });
  }
  return { segments, midLine, meta };
}
