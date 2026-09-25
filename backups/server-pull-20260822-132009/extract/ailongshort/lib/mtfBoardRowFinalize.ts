/**
 * MTF 카드 한 행: digest 후 **차트와 동일한** 로켓·밴드(현·전)로 정리.
 * 1) 현재 차트 TF → `ChartSnapshotRef` 실시간 마커
 * 2) 그 외 TF → 최근 차트 방문 캐시(localStorage) 또는 차트 루프와 동일한 합성(rkHit·편향·SL·IB)
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { getEffectiveFeatureToggles, type UIMode, type UserSettings } from '@/lib/settings';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';
import {
  computeInstitutionalBandInteractionMarkersUnion,
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  institutionalBandTouchMinGapBars,
  type InstitutionalBandInteractionMarker,
} from '@/lib/institutionalSuperBand';
import {
  applyChartDisplayedBandsToMtfDigest,
  applyChartDisplayedRocketsToMtfDigest,
  digestMtfSignalBoard,
  extractMtfBandsFromChartMarkerRows,
  type MtfDisplayedBandLastPrev,
  type MtfDisplayedRocketLastPrev,
  type MtfSignalBoardDigest,
} from '@/lib/mtfSignalBoardDigest';

const MTF_DISPLAYED_LIVE_CACHE_KEY = 'ailongshort-mtf-displayed-live-v1';
const MTF_DISPLAYED_LIVE_MAX_AGE_MS = 180_000;

function periodSeconds(tf: string): number {
  const map: Record<string, number> = {
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
  return map[normalizeChartTimeframe(tf)] ?? 60;
}

function candleOpenContainingTime(candles: Candle[], entrySec: number): number | null {
  const n = candles.length;
  if (!n || !Number.isFinite(entrySec)) return null;
  const firstT = Number(candles[0].time);
  if (entrySec < firstT) return null;
  let lo = 0;
  let hi = n - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const ct = Number(candles[mid].time);
    if (ct <= entrySec) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (ans < 0) return null;
  return Number(candles[ans].time);
}

function chartSlFailureKeySet(
  failures: Array<{ time: number; verdict: 'LONG' | 'SHORT' }> | undefined,
  candles: Candle[],
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

function filterLsRocketsBySlFailures<T extends { time: number; direction: 'LONG' | 'SHORT' }>(
  rows: T[],
  slSet: Set<string>,
  candles: Candle[],
): T[] {
  if (!slSet.size || !rows.length) return rows;
  return rows.filter((r) => {
    const open = candleOpenContainingTime(candles, r.time) ?? r.time;
    return !slSet.has(`${open}|${r.direction}`);
  });
}

function emptyPair(): MtfDisplayedRocketLastPrev {
  const z = { long: false, short: false };
  return { lastBar: { ...z }, prevBar: { ...z } };
}

/** ChartView `isAiMode`와 동일 선상 — 구조 로켓 숨김 판정용 */
export function chartUiIsAiModeForStructure(uiMode: string): boolean {
  return (
    uiMode === 'WHALE' ||
    uiMode === 'EXECUTION' ||
    uiMode === 'AI_ZONE' ||
    uiMode === 'FUSION_MODE' ||
    uiMode === 'SMC_DESK' ||
    uiMode === 'SMC_DESK_COMPOSITE' ||
    uiMode === 'SMC_DELTA_DESK'
  );
}

/** ChartView: `isAiMode && !whaleCoreSrZoneEnabled` → 구조 로켓 비표시 */
export function chartStripStructureRockets(uiMode: string, settings: UserSettings): boolean {
  if (!chartUiIsAiModeForStructure(uiMode)) return false;
  const eff = getEffectiveFeatureToggles(settings, uiMode as UIMode);
  return eff.whaleCoreSrZoneEnabled !== true;
}

function formatIbTouchChartText(ev: InstitutionalBandInteractionMarker): string {
  const sym = ev.tier === 'A' ? '★' : ev.tier === 'B' ? '◆' : '·';
  const sHint = ev.confluence?.grade === 'S' ? '⚡' : '';
  const lane = ev.unionSource === 'confluence' ? 'H' : ev.unionSource === 'precision' ? 'P' : '';
  if (ev.verdict === 'LONG') {
    return lane ? `${sHint}L${lane}${sym}` : `${sHint}L${sym}`;
  }
  return lane ? `${sHint}S${lane}${sym}` : `${sHint}S${sym}`;
}

/**
 * 차트 마커 루프와 동일: 봉 구간 `[t, rangeEnd)` 안의 구조 로켓 + 협상 구간 편향.
 * (누적 캔들 마커 persist는 캐시 경로로만 반영)
 */
export function synthesizeMtfDisplayedRocketsLastPrev(
  candles: Candle[],
  timeframe: string,
  structureRocketSignals: AnalyzeResponse['structureRocketSignals'] | undefined,
  opts: {
    verdict?: string;
    slFailures?: AnalyzeResponse['signalLearning'] extends { slFailures?: infer F } ? F : never;
    stripStructureRockets: boolean;
  },
): MtfDisplayedRocketLastPrev {
  const out = emptyPair();
  const raw = Array.isArray(candles) ? sanitizeChartCandlesForSeries(candles) : [];
  if (raw.length < 2) return out;
  const tf = normalizeChartTimeframe(timeframe);
  const n = raw.length;
  const slSet = chartSlFailureKeySet(
    opts.slFailures as Array<{ time: number; verdict: 'LONG' | 'SHORT' }> | undefined,
    raw,
  );
  let rockets = Array.isArray(structureRocketSignals) ? [...structureRocketSignals] : [];
  if (opts.stripStructureRockets) rockets = [];
  const visible = filterLsRocketsBySlFailures(
    rockets as Array<{ time: number; direction: 'LONG' | 'SHORT' }>,
    slSet,
    raw,
  );
  const chartBias: 'LONG' | 'SHORT' | null =
    opts.verdict === 'LONG' || opts.verdict === 'SHORT' ? opts.verdict : null;
  const LS_MARKER_NEGOTIATE_BARS = 22;
  const negotiateFromCi = Math.max(0, n - LS_MARKER_NEGOTIATE_BARS);
  const periodFallback = periodSeconds(tf);

  const rkHitForCi = (ci: number): 'LONG' | 'SHORT' | null => {
    const c = raw[ci];
    if (!c) return null;
    const t = Number(c.time);
    const rangeEnd = ci + 1 < n ? Number(raw[ci + 1]!.time) : t + periodFallback;
    for (const rk of visible) {
      const rt = Number(rk.time);
      if (!Number.isFinite(rt)) continue;
      if (t <= rt && rt < rangeEnd) {
        if (chartBias && ci >= negotiateFromCi && rk.direction !== chartBias) break;
        return rk.direction;
      }
    }
    return null;
  };

  const lastCi = n - 1;
  const prevCi = n - 2;
  const hitLast = rkHitForCi(lastCi);
  const hitPrev = rkHitForCi(prevCi);
  if (hitLast === 'LONG') out.lastBar.long = true;
  if (hitLast === 'SHORT') out.lastBar.short = true;
  if (hitPrev === 'LONG') out.prevBar.long = true;
  if (hitPrev === 'SHORT') out.prevBar.short = true;
  return out;
}

export function synthesizeMtfDisplayedBandsLastPrev(
  candles: Candle[],
  timeframe: string,
  overlays: OverlayItem[] | undefined,
  bandTouchTierMask: { A: boolean; B: boolean; C: boolean },
): MtfDisplayedBandLastPrev {
  const out = emptyPair();
  const safe = Array.isArray(candles) ? sanitizeChartCandlesForSeries(candles) : [];
  if (safe.length < 7) return out;
  const tf = normalizeChartTimeframe(timeframe);
  const n = safe.length;
  const lastT = Number(safe[n - 1]!.time);
  const prevT = n >= 2 ? Number(safe[n - 2]!.time) : NaN;
  const ibMarks = computeInstitutionalBandInteractionMarkersUnion(
    safe,
    INSTITUTIONAL_BAND_DEFAULT_PERIOD,
    INSTITUTIONAL_BAND_DEFAULT_MULT,
    {
      minBarsBetween: institutionalBandTouchMinGapBars(tf),
      tierEnabled: {
        A: bandTouchTierMask.A === true,
        B: bandTouchTierMask.B === true,
        C: bandTouchTierMask.C === true,
      },
      overlays: Array.isArray(overlays) ? overlays : [],
    },
  );
  const markers = ibMarks.map((ev) => {
    const isLong = ev.verdict === 'LONG';
    return {
      time: Number(ev.time),
      text: formatIbTouchChartText(ev),
      shape: isLong ? 'arrowUp' : 'arrowDown',
    };
  });
  return extractMtfBandsFromChartMarkerRows(markers, lastT, Number.isFinite(prevT) ? prevT : null);
}

export function synthesizeMtfDisplayedRocketsAndBands(
  candles: Candle[] | undefined,
  timeframe: string | undefined,
  d: {
    structureRocketSignals?: AnalyzeResponse['structureRocketSignals'];
    overlays?: AnalyzeResponse['overlays'];
    verdict?: string;
    signalLearning?: AnalyzeResponse['signalLearning'];
  },
  bandTouchTierMask: { A: boolean; B: boolean; C: boolean },
  stripStructureRockets: boolean,
): { rockets: MtfDisplayedRocketLastPrev; bands: MtfDisplayedBandLastPrev } {
  const raw = Array.isArray(candles) ? candles : [];
  const tf = String(timeframe || '4h');
  const rockets = synthesizeMtfDisplayedRocketsLastPrev(raw, tf, d.structureRocketSignals, {
    verdict: d.verdict,
    slFailures: d.signalLearning?.slFailures as
      | Array<{ time: number; verdict: 'LONG' | 'SHORT' }>
      | undefined,
    stripStructureRockets,
  });
  const bands = synthesizeMtfDisplayedBandsLastPrev(raw, tf, d.overlays as OverlayItem[] | undefined, bandTouchTierMask);
  return { rockets, bands };
}

export function writeMtfDisplayedLiveCache(
  symbol: string,
  tf: string,
  rockets: MtfDisplayedRocketLastPrev,
  bands: MtfDisplayedBandLastPrev,
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `${String(symbol || '').toUpperCase()}|${normalizeChartTimeframe(tf)}`;
    const raw = window.localStorage.getItem(MTF_DISPLAYED_LIVE_CACHE_KEY);
    const root = raw ? (JSON.parse(raw) as Record<string, { rockets: MtfDisplayedRocketLastPrev; bands: MtfDisplayedBandLastPrev; at: number }>) : {};
    root[key] = { rockets, bands, at: Date.now() };
    window.localStorage.setItem(MTF_DISPLAYED_LIVE_CACHE_KEY, JSON.stringify(root));
  } catch {
    /* ignore quota */
  }
}

export function readMtfDisplayedLiveCache(
  symbol: string,
  tf: string,
  maxAgeMs = MTF_DISPLAYED_LIVE_MAX_AGE_MS,
): { rockets: MtfDisplayedRocketLastPrev; bands: MtfDisplayedBandLastPrev } | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = `${String(symbol || '').toUpperCase()}|${normalizeChartTimeframe(tf)}`;
    const raw = window.localStorage.getItem(MTF_DISPLAYED_LIVE_CACHE_KEY);
    if (!raw) return null;
    const root = JSON.parse(raw) as Record<string, { rockets: MtfDisplayedRocketLastPrev; bands: MtfDisplayedBandLastPrev; at: number }>;
    const e = root[key];
    if (!e || typeof e.at !== 'number') return null;
    if (Date.now() - e.at > maxAgeMs) return null;
    return { rockets: e.rockets, bands: e.bands };
  } catch {
    return null;
  }
}

export type MtfDigestInput = Parameters<typeof digestMtfSignalBoard>[0];

/** `ChartView` ref 최소 면 — lib ↔ 컴포넌트 순환 참조 방지 */
export type ChartSnapshotMtfSlice = {
  getMtfDisplayedRocketLastPrev?: () => MtfDisplayedRocketLastPrev;
  getMtfDisplayedBandLastPrev?: () => MtfDisplayedBandLastPrev;
};

/**
 * MTF 카드 한 TF 행용: `digestMtfSignalBoard` 입력으로 digest → 로켓·밴드만 차트 기준으로 덮음.
 */
export function finalizeMtfSignalBoardForRow(args: {
  digestInput: MtfDigestInput;
  symbol: string;
  chartTimeframe: string;
  chartSnapshot: ChartSnapshotMtfSlice | null | undefined;
  settings: UserSettings;
  uiMode: UIMode | string;
  /** SL·verdict — digest 입력에 없을 때 analyze 행에서 전달 */
  rocketContext?: {
    verdict?: string;
    signalLearning?: AnalyzeResponse['signalLearning'];
  };
}): MtfSignalBoardDigest {
  const { digestInput, symbol, chartTimeframe, chartSnapshot, settings, uiMode, rocketContext } = args;
  const boardRaw = digestMtfSignalBoard(digestInput);
  const tfN = normalizeChartTimeframe(String(digestInput.timeframe || ''));
  const chartTfN = normalizeChartTimeframe(chartTimeframe);

  if (chartSnapshot && tfN === chartTfN) {
    return applyChartDisplayedBandsToMtfDigest(
      applyChartDisplayedRocketsToMtfDigest(
        boardRaw,
        chartSnapshot.getMtfDisplayedRocketLastPrev?.() ?? null,
      ),
      chartSnapshot.getMtfDisplayedBandLastPrev?.() ?? null,
    );
  }

  const cached = readMtfDisplayedLiveCache(symbol, tfN);
  if (cached) {
    return applyChartDisplayedBandsToMtfDigest(
      applyChartDisplayedRocketsToMtfDigest(boardRaw, cached.rockets),
      cached.bands,
    );
  }

  const strip = chartStripStructureRockets(String(uiMode), settings);
  const syn = synthesizeMtfDisplayedRocketsAndBands(
    digestInput.candles,
    digestInput.timeframe,
    {
      verdict: rocketContext?.verdict,
      signalLearning: rocketContext?.signalLearning,
      structureRocketSignals: digestInput.structureRocketSignals as AnalyzeResponse['structureRocketSignals'],
      overlays: digestInput.overlays as OverlayItem[] | undefined,
    },
    digestInput.bandTouchTierMask ?? { A: true, B: true, C: false },
    strip,
  );
  return applyChartDisplayedBandsToMtfDigest(
    applyChartDisplayedRocketsToMtfDigest(boardRaw, syn.rockets),
    syn.bands,
  );
}
