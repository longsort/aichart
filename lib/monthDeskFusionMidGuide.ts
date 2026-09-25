/**
 * 마감·안착: ST·LinReg·CP 중심을 한 줄로 합치고, 종가 대비 위/아래로 롱·숏 색 구간 분할.
 * 참고용(확정 신호 아님).
 */
import type { Candle } from '@/types';
import type { LineData, UTCTimestamp } from 'lightweight-charts';

export type MonthDeskFusionMidSegment = {
  bias: 'long' | 'short';
  data: LineData<UTCTimestamp>[];
};

function alignByIndex(series: LineData<UTCTimestamp>[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < Math.min(n, series.length); i++) {
    const v = series[i]?.value as number | undefined;
    out[i] = v != null && Number.isFinite(v) ? v : null;
  }
  return out;
}

/**
 * 봉별 융합 중심가 = 유효한 중심값들의 산술평균. 종가 ≥ 융합중심이면 롱 색 구간.
 */
export function buildMonthDeskFusionMidGuideSegments(
  candles: Candle[],
  stMid: LineData<UTCTimestamp>[],
  lrMid: LineData<UTCTimestamp>[],
  cpMid: LineData<UTCTimestamp>[]
): MonthDeskFusionMidSegment[] {
  const n = candles.length;
  const st = alignByIndex(stMid, n);
  const lr = alignByIndex(lrMid, n);
  const cp = alignByIndex(cpMid, n);

  type Pt = { bias: 'long' | 'short'; t: UTCTimestamp; v: number };
  const pts: Pt[] = [];

  for (let i = 0; i < n; i++) {
    const vals = [st[i], lr[i], cp[i]].filter((x): x is number => x != null && Number.isFinite(x));
    if (vals.length === 0) continue;
    const fused = vals.reduce((a, b) => a + b, 0) / vals.length;
    const cl = candles[i].close;
    const bias: 'long' | 'short' = cl >= fused ? 'long' : 'short';
    pts.push({ bias, t: candles[i].time as UTCTimestamp, v: fused });
  }

  if (!pts.length) return [];

  /** 1~2봉짜리 융합중심 색 뒤집힘 흡수 — 존선과 동일 원칙 */
  const rawBias = pts.map((p) => (p.bias === 'long' ? 1 : -1));
  const merged = mergeShortBiasRuns(rawBias, 3);
  const smoothPts: Pt[] = pts.map((p, i) => ({
    ...p,
    bias: merged[i] === 1 ? 'long' : 'short',
  }));

  const segments: MonthDeskFusionMidSegment[] = [];
  let run: LineData<UTCTimestamp>[] = [{ time: smoothPts[0].t, value: smoothPts[0].v }];
  let runBias = smoothPts[0].bias;

  for (let i = 1; i < smoothPts.length; i++) {
    if (smoothPts[i].bias !== runBias) {
      segments.push({ bias: runBias, data: run });
      run = [{ time: smoothPts[i].t, value: smoothPts[i].v }];
      runBias = smoothPts[i].bias;
    } else {
      run.push({ time: smoothPts[i].t, value: smoothPts[i].v });
    }
  }
  segments.push({ bias: runBias, data: run });
  return segments;
}

function mergeShortBiasRuns(raw: number[], minBars: number): number[] {
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
      prevVal != null && nextVal != null ? prevVal : prevVal != null ? prevVal : nextVal != null ? nextVal : runs[r].val;
    for (let k = runs[r].start; k <= runs[r].end; k++) out[k] = replacement;
  }
  return out;
}
