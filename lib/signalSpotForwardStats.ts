/**
 * 차트에 표시되는 신호(기관밴드 접촉·구조 로켓) 이후 **현물(spot) 기준** 전진 변동 통계.
 * 진입 = 신호 봉 종가, 이후 N봉까지 고저로 MFE/MAE. 실전 검증용 통계(과거 데이터, 미래 보장 없음).
 */
import { analysisMatchesSymbolAndTf } from '@/lib/constants';
import type { Candle } from '@/types';
import type { AnalyzeResponse } from '@/types';
import {
  computeInstitutionalBandInteractionMarkersUnion,
  institutionalBandTouchMinGapBars,
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  type InstitutionalBandTouchTier,
} from '@/lib/institutionalSuperBand';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';

export type StatsSignalKind = 'inst_band' | 'rocket';

export type StatsSignal = {
  time: number;
  verdict: 'LONG' | 'SHORT';
  kind: StatsSignalKind;
  /** 기관밴드 접촉 등급(로켓은 없음) */
  bandTier?: InstitutionalBandTouchTier;
};

export type SpotForwardOutcome = {
  signalTime: number;
  kind: StatsSignalKind;
  direction: 'LONG' | 'SHORT';
  bandTier?: InstitutionalBandTouchTier;
  entryPrice: number;
  horizonBars: number;
  /** 유리한 최대 변동 % (롱: 상승, 숏: 하락) */
  mfePct: number;
  /** 불리한 최대 변동 % (롱: 하락, 숏: 상승) — 손절 후보 폭 */
  maePct: number;
  /** 마지막 전진 봉 종가 기준 순변동 % (방향 정렬) */
  returnHorizonPct: number;
  barsAvailable: number;
};

function candleOpenContainingTime(candles: Candle[], entrySec: number): number | null {
  const n = candles.length;
  if (!n || !Number.isFinite(entrySec)) return null;
  const firstT = candles[0].time as number;
  if (entrySec < firstT) return null;
  let lo = 0;
  let hi = n - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const ct = candles[mid].time as number;
    if (ct <= entrySec) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (ans < 0) return null;
  return candles[ans].time as number;
}

function chartSlFailureKeySet(
  failures: Array<{ time: number; verdict: 'LONG' | 'SHORT' }> | undefined,
  candles: Candle[]
): Set<string> {
  const s = new Set<string>();
  if (!failures?.length || !candles.length) return s;
  for (const f of failures) {
    if (f.verdict !== 'LONG' && f.verdict !== 'SHORT') continue;
    const t = Number(f.time);
    if (!Number.isFinite(t)) continue;
    const open = candleOpenContainingTime(candles, t);
    s.add(`${open ?? t}|${f.verdict}`);
  }
  return s;
}

function filterRocketsBySlFailures<T extends { time: number; direction: 'LONG' | 'SHORT' }>(
  rows: T[],
  slSet: Set<string>,
  candles: Candle[]
): T[] {
  if (!slSet.size || !rows.length) return rows;
  return rows.filter((r) => {
    const open = candleOpenContainingTime(candles, r.time) ?? r.time;
    return !slSet.has(`${open}|${r.direction}`);
  });
}

function candleIndexByTime(candles: Candle[], t: number): number {
  let lo = 0;
  let hi = candles.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const ct = Number(candles[mid].time);
    if (ct === t) return mid;
    if (ct < t) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/** 차트와 동일 소스로 통계용 신호 목록(시간 중복 시 로켓 우선). */
export function collectStatsSignals(
  rawCandles: Candle[],
  analysis: AnalyzeResponse | null,
  symbolTfMatch: boolean,
  opts: {
    timeframe: string;
    includeInstitutionalBand: boolean;
    institutionalMinTier: InstitutionalBandTouchTier;
    /** 차트와 동일 — A/B/C 등급별 표시 마스크. 있으면 `institutionalMinTier`보다 우선 */
    institutionalTierEnabled?: Partial<Record<InstitutionalBandTouchTier, boolean>>;
    includeStructureRockets: boolean;
  }
): StatsSignal[] {
  const safe = sanitizeChartCandlesForSeries(rawCandles);
  const byTime = new Map<number, StatsSignal>();

  if (opts.includeInstitutionalBand && safe.length >= 7) {
    const overlayList =
      symbolTfMatch && analysis?.overlays?.length ? analysis.overlays : [];
    const marks = computeInstitutionalBandInteractionMarkersUnion(
      safe,
      INSTITUTIONAL_BAND_DEFAULT_PERIOD,
      INSTITUTIONAL_BAND_DEFAULT_MULT,
      {
        minBarsBetween: institutionalBandTouchMinGapBars(opts.timeframe),
        ...(opts.institutionalTierEnabled
          ? { tierEnabled: opts.institutionalTierEnabled }
          : { minTier: opts.institutionalMinTier }),
        overlays: overlayList,
      }
    );
    for (const m of marks) {
      /** 통계는 봉당 1건 — 합류·정밀 동시 마커는 첫 항목만(전진 수익 중복 방지) */
      if (byTime.has(m.time)) continue;
      byTime.set(m.time, {
        time: m.time,
        verdict: m.verdict,
        kind: 'inst_band',
        bandTier: m.tier,
      });
    }
  }

  if (opts.includeStructureRockets && analysis && symbolTfMatch) {
    const slSet = chartSlFailureKeySet(analysis.signalLearning?.slFailures, safe);
    const raw = analysis.structureRocketSignals ?? [];
    const vis = filterRocketsBySlFailures(raw, slSet, safe);
    for (const r of vis) {
      if (r.direction !== 'LONG' && r.direction !== 'SHORT') continue;
      byTime.set(r.time, { time: r.time, verdict: r.direction, kind: 'rocket' });
    }
  }

  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export function computeSpotForwardOutcomes(
  rawCandles: Candle[],
  signals: StatsSignal[],
  opts: { horizonBars: number }
): SpotForwardOutcome[] {
  const candles = sanitizeChartCandlesForSeries(rawCandles);
  const n = candles.length;
  const H = Math.max(3, Math.min(200, Math.round(opts.horizonBars)));
  const out: SpotForwardOutcome[] = [];

  for (const sig of signals) {
    const idx = candleIndexByTime(candles, sig.time);
    if (idx < 0) continue;
    const entry = Number(candles[idx].close);
    if (!Number.isFinite(entry) || entry <= 0) continue;
    const end = Math.min(idx + H, n - 1);
    if (idx + 1 > end) continue;

    const dir = sig.verdict;
    let mfe = 0;
    let mae = 0;
    for (let j = idx + 1; j <= end; j++) {
      const c = candles[j];
      if (dir === 'LONG') {
        mfe = Math.max(mfe, ((c.high - entry) / entry) * 100);
        mae = Math.max(mae, ((entry - c.low) / entry) * 100);
      } else {
        mfe = Math.max(mfe, ((entry - c.low) / entry) * 100);
        mae = Math.max(mae, ((c.high - entry) / entry) * 100);
      }
    }
    const last = candles[end];
    const returnHorizonPct =
      dir === 'LONG'
        ? ((last.close - entry) / entry) * 100
        : ((entry - last.close) / entry) * 100;

    out.push({
      signalTime: sig.time,
      kind: sig.kind,
      direction: dir,
      bandTier: sig.bandTier,
      entryPrice: entry,
      horizonBars: H,
      mfePct: mfe,
      maePct: mae,
      returnHorizonPct,
      barsAvailable: end - idx,
    });
  }
  return out;
}

export type SlAdverseTouchRow = {
  slPct: number;
  /** 해당 손절폭(불리 방향) 이상 움직인 신호 수 */
  touchedCount: number;
  totalSignals: number;
  touchedRate: number;
};

export function summarizeAdverseBySlGrid(outcomes: SpotForwardOutcome[], slGrid: number[]): SlAdverseTouchRow[] {
  const total = outcomes.length;
  return slGrid.map((slPct) => {
    let touched = 0;
    for (const o of outcomes) {
      if (o.maePct >= slPct - 1e-9) touched++;
    }
    return {
      slPct,
      touchedCount: touched,
      totalSignals: total,
      touchedRate: total > 0 ? touched / total : 0,
    };
  });
}

export type ReturnHistogramBin = { label: string; from: number; to: number; count: number };

/** 전진 종가 수익률(returnHorizonPct) 히스토그램 — 구간 자동 스케일 */
export function histogramHorizonReturns(
  outcomes: SpotForwardOutcome[],
  binCount = 14
): { bins: ReturnHistogramBin[]; minR: number; maxR: number } {
  if (!outcomes.length) return { bins: [], minR: 0, maxR: 0 };
  const vals = outcomes.map((o) => o.returnHorizonPct);
  let minR = Math.min(...vals);
  let maxR = Math.max(...vals);
  if (!Number.isFinite(minR) || !Number.isFinite(maxR)) return { bins: [], minR: 0, maxR: 0 };
  if (Math.abs(maxR - minR) < 1e-6) {
    minR -= 0.5;
    maxR += 0.5;
  }
  const pad = (maxR - minR) * 0.08;
  minR -= pad;
  maxR += pad;
  const step = (maxR - minR) / binCount;
  const bins: ReturnHistogramBin[] = [];
  for (let b = 0; b < binCount; b++) {
    const from = minR + b * step;
    const to = minR + (b + 1) * step;
    bins.push({
      label: `${from.toFixed(1)}~${to.toFixed(1)}`,
      from,
      to,
      count: 0,
    });
  }
  for (const v of vals) {
    const i = Math.min(binCount - 1, Math.max(0, Math.floor((v - minR) / step)));
    bins[i].count++;
  }
  return { bins, minR, maxR };
}

export type PathRaceRow = {
  label: string;
  tpPct: number;
  slPct: number;
  tpFirst: number;
  slFirst: number;
  neither: number;
  total: number;
  /** 목표선이 먼저 닿은 비율(같은 봉에 둘 다면 손절 우선 가정) */
  tpFirstRate: number;
  slFirstRate: number;
  neitherRate: number;
};

export type DirectionSummary = {
  n: number;
  medianReturn: number;
  medianMfe: number;
  medianMae: number;
};

export type BandTierSummaryRow = {
  tier: InstitutionalBandTouchTier;
  n: number;
  medianReturn: number;
};

export type SignalSpotForwardReport = {
  signals: StatsSignal[];
  outcomes: SpotForwardOutcome[];
  slGrid: SlAdverseTouchRow[];
  /** 봉 단위 선도달 시뮬(정밀도 향상 — 미래 예측 아님) */
  pathRace: PathRaceRow[];
  histogram: { bins: ReturnHistogramBin[]; minR: number; maxR: number };
  summary: {
    n: number;
    medianReturn: number;
    medianMfe: number;
    medianMae: number;
    avgReturn: number;
  };
  summaryLong: DirectionSummary;
  summaryShort: DirectionSummary;
  bandTierRows: BandTierSummaryRow[];
};

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const DEFAULT_SL_GRID = [0.5, 1, 1.5, 2, 3, 5, 8];

const DEFAULT_PATH_PAIRS: Array<{ tpPct: number; slPct: number; label: string }> = [
  { tpPct: 1.5, slPct: 1, label: '목표1.5%·손절1%' },
  { tpPct: 2, slPct: 1, label: '목표2%·손절1%' },
  { tpPct: 2, slPct: 2, label: '목표2%·손절2%' },
  { tpPct: 3, slPct: 2, label: '목표3%·손절2%' },
];

function pathRaceForward(
  candles: Candle[],
  entryIdx: number,
  horizonBars: number,
  direction: 'LONG' | 'SHORT',
  entry: number,
  tpPct: number,
  slPct: number
): 'tp_first' | 'sl_first' | 'neither' {
  const n = candles.length;
  const end = Math.min(entryIdx + horizonBars, n - 1);
  if (entryIdx + 1 > end) return 'neither';
  const tpLong = entry * (1 + tpPct / 100);
  const slLong = entry * (1 - slPct / 100);
  const tpShort = entry * (1 - tpPct / 100);
  const slShort = entry * (1 + slPct / 100);

  for (let j = entryIdx + 1; j <= end; j++) {
    const c = candles[j];
    if (direction === 'LONG') {
      const hitSl = c.low <= slLong;
      const hitTp = c.high >= tpLong;
      if (hitSl && hitTp) return 'sl_first';
      if (hitSl) return 'sl_first';
      if (hitTp) return 'tp_first';
    } else {
      const hitSl = c.high >= slShort;
      const hitTp = c.low <= tpShort;
      if (hitSl && hitTp) return 'sl_first';
      if (hitSl) return 'sl_first';
      if (hitTp) return 'tp_first';
    }
  }
  return 'neither';
}

export function computePathRaceStats(
  rawCandles: Candle[],
  signals: StatsSignal[],
  horizonBars: number,
  pairs: Array<{ tpPct: number; slPct: number; label: string }> = DEFAULT_PATH_PAIRS
): PathRaceRow[] {
  const candles = sanitizeChartCandlesForSeries(rawCandles);
  const H = Math.max(3, Math.min(200, Math.round(horizonBars)));
  const rows: PathRaceRow[] = [];

  for (const pair of pairs) {
    let tpFirst = 0;
    let slFirst = 0;
    let neither = 0;
    for (const sig of signals) {
      const idx = candleIndexByTime(candles, sig.time);
      if (idx < 0) continue;
      const entry = Number(candles[idx].close);
      if (!Number.isFinite(entry) || entry <= 0) continue;
      const r = pathRaceForward(candles, idx, H, sig.verdict, entry, pair.tpPct, pair.slPct);
      if (r === 'tp_first') tpFirst++;
      else if (r === 'sl_first') slFirst++;
      else neither++;
    }
    const total = tpFirst + slFirst + neither;
    rows.push({
      label: pair.label,
      tpPct: pair.tpPct,
      slPct: pair.slPct,
      tpFirst,
      slFirst,
      neither,
      total,
      tpFirstRate: total > 0 ? tpFirst / total : 0,
      slFirstRate: total > 0 ? slFirst / total : 0,
      neitherRate: total > 0 ? neither / total : 0,
    });
  }
  return rows;
}

function summarizeDirection(outcomes: SpotForwardOutcome[], dir: 'LONG' | 'SHORT'): DirectionSummary {
  const o = outcomes.filter((x) => x.direction === dir);
  if (!o.length) return { n: 0, medianReturn: 0, medianMfe: 0, medianMae: 0 };
  return {
    n: o.length,
    medianReturn: median(o.map((x) => x.returnHorizonPct)),
    medianMfe: median(o.map((x) => x.mfePct)),
    medianMae: median(o.map((x) => x.maePct)),
  };
}

function summarizeBandTierRows(outcomes: SpotForwardOutcome[]): BandTierSummaryRow[] {
  const tiers: InstitutionalBandTouchTier[] = ['A', 'B', 'C'];
  return tiers
    .map((tier) => {
      const o = outcomes.filter((x) => x.kind === 'inst_band' && x.bandTier === tier);
      return {
        tier,
        n: o.length,
        medianReturn: o.length ? median(o.map((x) => x.returnHorizonPct)) : 0,
      };
    })
    .filter((x) => x.n > 0);
}

export function buildSignalSpotForwardReport(
  rawCandles: Candle[],
  analysis: AnalyzeResponse | null,
  symbol: string,
  timeframe: string,
  opts: {
    horizonBars: number;
    includeInstitutionalBand: boolean;
    institutionalMinTier: InstitutionalBandTouchTier;
    institutionalTierEnabled?: Partial<Record<InstitutionalBandTouchTier, boolean>>;
    includeStructureRockets: boolean;
    slPctGrid?: number[];
  }
): SignalSpotForwardReport | null {
  const analysisMatches = analysisMatchesSymbolAndTf(analysis, symbol, timeframe);

  const signals = collectStatsSignals(rawCandles, analysis, analysisMatches, {
    timeframe,
    includeInstitutionalBand: opts.includeInstitutionalBand,
    institutionalMinTier: opts.institutionalMinTier,
    ...(opts.institutionalTierEnabled ? { institutionalTierEnabled: opts.institutionalTierEnabled } : {}),
    includeStructureRockets: opts.includeStructureRockets,
  });

  if (!signals.length) {
    const emptyDir: DirectionSummary = { n: 0, medianReturn: 0, medianMfe: 0, medianMae: 0 };
    return {
      signals: [],
      outcomes: [],
      slGrid: [],
      pathRace: [],
      histogram: { bins: [], minR: 0, maxR: 0 },
      summary: { n: 0, medianReturn: 0, medianMfe: 0, medianMae: 0, avgReturn: 0 },
      summaryLong: emptyDir,
      summaryShort: emptyDir,
      bandTierRows: [],
    };
  }

  const outcomes = computeSpotForwardOutcomes(rawCandles, signals, { horizonBars: opts.horizonBars });
  const slGrid = summarizeAdverseBySlGrid(outcomes, opts.slPctGrid ?? DEFAULT_SL_GRID);
  const pathRace = computePathRaceStats(rawCandles, signals, opts.horizonBars, DEFAULT_PATH_PAIRS);
  const histogram = histogramHorizonReturns(outcomes, 16);
  const rets = outcomes.map((o) => o.returnHorizonPct);
  const mfes = outcomes.map((o) => o.mfePct);
  const maes = outcomes.map((o) => o.maePct);
  const avgReturn = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;

  return {
    signals,
    outcomes,
    slGrid,
    pathRace,
    histogram,
    summary: {
      n: outcomes.length,
      medianReturn: median(rets),
      medianMfe: median(mfes),
      medianMae: median(maes),
      avgReturn,
    },
    summaryLong: summarizeDirection(outcomes, 'LONG'),
    summaryShort: summarizeDirection(outcomes, 'SHORT'),
    bandTierRows: summarizeBandTierRows(outcomes),
  };
}
