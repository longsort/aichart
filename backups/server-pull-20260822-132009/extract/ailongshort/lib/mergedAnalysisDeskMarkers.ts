/**
 * 통합·분석 — 기관밴드(ST) 터치 마커 · developing 봉 구조 로켓 선반영.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import type { UnifiedPulseChartMarker } from '@/lib/monthDeskUnifiedPulseEngine';
import {
  computeInstitutionalBandInteractionMarkersUnion,
  computeInstitutionalSuperTrendMeta,
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  institutionalBandTouchMinGapBars,
  type InstitutionalBandInteractionMarker,
} from '@/lib/institutionalSuperBand';
import type { InstitutionalBandTouchTierMask } from '@/lib/settings';
import { tierMaskFromMinTier } from '@/lib/settings';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';
import { detectMergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';
import { mergedDevelopingBar } from '@/lib/mergedAnalysisLeadingBar';
import { detectMergedDirectionConfirms } from '@/lib/mergedAnalysisDirectionConfirm';
import {
  filterMergedDeskSignalsToChartWindow,
  remapMergedDeskMarkerTimesToChart,
  remapStructureRocketsToChart,
  dedupeMergedDeskRocketsOnePerBar,
} from '@/lib/mergedAnalysisOverlayTimes';
import { structureMarksFu } from '@/lib/smcDeskOverlay';
import { structureRocketMergeMax, normalizeChartTimeframe } from '@/lib/constants';
import {
  mergedDesk4hReferenceBarCap,
  mergedDesk4hReferencePivotWindowForTf,
  mergedInstitutionalBandCandlesSlice,
} from '@/lib/mergedDesk4hReference';

export type MergedDeskRocketRow = { time: number; direction: 'LONG' | 'SHORT'; tier: 'structure' | 'monthDesk' };

function formatBandTouchChartText(ev: InstitutionalBandInteractionMarker): string {
  const sym = ev.tier === 'A' ? '★' : ev.tier === 'B' ? '◆' : '·';
  const sHint = ev.confluence?.grade === 'S' ? '⚡' : '';
  const lane = ev.unionSource === 'confluence' ? 'H' : ev.unionSource === 'precision' ? 'P' : '';
  if (ev.verdict === 'LONG') {
    return lane ? `${sHint}L${lane}${sym}` : `${sHint}L${sym}`;
  }
  return lane ? `${sHint}S${lane}${sym}` : `${sHint}S${sym}`;
}

function bandTouchMarkerStyle(ev: InstitutionalBandInteractionMarker): { color: string; size: number } {
  const sGrade = ev.confluence?.grade === 'S';
  if (ev.verdict === 'LONG') {
    return {
      color: sGrade ? '#fbbf24' : ev.tier === 'A' ? '#2dd4bf' : ev.tier === 'B' ? '#14b8a6' : '#0d9488',
      size: sGrade || ev.tier === 'A' ? 2 : 1,
    };
  }
  return {
    color: sGrade ? '#fbbf24' : ev.tier === 'A' ? '#f472b6' : ev.tier === 'B' ? '#fb7185' : '#e11d48',
    size: sGrade || ev.tier === 'A' ? 2 : 1,
  };
}

/** developing 봉 — ST 밴드 터치 선반영 (종가 전 high/low) */
function buildLeadingBandTouchMarker(candles: Candle[]): UnifiedPulseChartMarker | null {
  if (candles.length < 8) return null;
  const meta = computeInstitutionalSuperTrendMeta(
    candles,
    INSTITUTIONAL_BAND_DEFAULT_PERIOD,
    INSTITUTIONAL_BAND_DEFAULT_MULT
  );
  const last = candles[candles.length - 1]!;
  const lastT = Number(last.time);
  if (!Number.isFinite(lastT) || meta.lastLinePrice == null) return null;
  const dev = mergedDevelopingBar(last);
  const tol = Math.max(Math.abs(last.close) * 0.0012, (last.high - last.low) * 0.08, 1e-8);
  const band = meta.lastLinePrice;

  if (meta.lastDir === 'long' && dev.low <= band + tol) {
    return {
      time: lastT as UTCTimestamp,
      position: 'belowBar',
      shape: 'arrowUp',
      color: '#2dd4bf',
      text: '⚡L·',
      size: 2,
      id: `merged-desk-band-leading-long-${lastT}`,
    };
  }
  if (meta.lastDir === 'short' && dev.high >= band - tol) {
    return {
      time: lastT as UTCTimestamp,
      position: 'aboveBar',
      shape: 'arrowDown',
      color: '#f87171',
      text: '⚡S·',
      size: 2,
      id: `merged-desk-band-leading-short-${lastT}`,
    };
  }
  return null;
}

function isBandMarkerText(tx: string): boolean {
  return /^[⚡]?[LS][HP]?[★◆·]/.test(String(tx || '').trim());
}

export function isBandMarkerChartText(tx: string): boolean {
  return isBandMarkerText(tx);
}

export function isRocketChartText(tx: string): boolean {
  const t = String(tx || '').trim();
  return t.includes('🚀') || t.includes('📉');
}

/**
 * LWC 마커용 pack 마커 — 마지막 봉은 로켓·밴드·선반영 전용, 역사 신호만 유지.
 */
export function prepareMergedDeskPackMarkersForLwc(
  packMarkers: UnifiedPulseChartMarker[],
  chartCandles: Candle[],
  sourceCandles?: Candle[],
  maxHistorical = 72
): UnifiedPulseChartMarker[] {
  if (!packMarkers.length || chartCandles.length < 2) return [];
  const lastT = Number(chartCandles[chartCandles.length - 1]!.time);
  const remapped = remapMergedDeskMarkerTimesToChart(packMarkers, chartCandles, sourceCandles);
  const inWindow = filterMergedDeskSignalsToChartWindow(remapped, chartCandles);
  const hist = inWindow.filter((m) => {
    const t = Number(m.time);
    if (!Number.isFinite(t) || t === lastT) return false;
    const tx = String(m.text || '');
    if (isRocketChartText(tx) || isBandMarkerText(tx)) return false;
    return true;
  });
  if (hist.length <= maxHistorical) return hist;
  const sorted = [...hist].sort((a, b) => Number(a.time) - Number(b.time));
  const step = Math.ceil(sorted.length / maxHistorical);
  const out: UnifiedPulseChartMarker[] = [];
  for (let i = 0; i < sorted.length; i += step) out.push(sorted[i]!);
  const last = sorted[sorted.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function markerPriority(m: UnifiedPulseChartMarker): number {
  const t = String(m.text || '');
  if (t.startsWith('선반영')) return 420;
  if (isRocketChartText(t) && t.includes('⚡')) return 390;
  if (isRocketChartText(t)) return 360;
  if (isBandMarkerText(t) && t.startsWith('⚡')) return 340;
  if (isBandMarkerText(t)) return 300;
  if (t === 'L' || t === 'S' || /^L·|^S·/.test(t)) return 220;
  return 40;
}

function rocketDirFromMarker(m: UnifiedPulseChartMarker): 'LONG' | 'SHORT' | null {
  const t = String(m.text || '');
  if (isRocketChartText(t)) {
    if (t.includes('📉')) return 'SHORT';
    if (t.includes('🚀')) return 'LONG';
  }
  if (isBandMarkerText(t)) {
    if (/S[HP]?[★◆·]/.test(t) && !/^L/.test(t)) return 'SHORT';
    return 'LONG';
  }
  return null;
}

export type MergedDeskFrontRunSnap = {
  state: 'WATCH' | 'READY' | 'TRIGGERED' | 'INVALID' | 'NO_SIGNAL';
  direction: 'LONG' | 'SHORT' | 'NONE';
};

export function buildMergedDeskFrontRunMarker(
  frontRun: MergedDeskFrontRunSnap,
  lastBarTime: number,
  chartBias?: 'LONG' | 'SHORT' | null
): UnifiedPulseChartMarker | null {
  if (frontRun.state === 'NO_SIGNAL' || frontRun.state === 'INVALID') return null;
  const dir =
    frontRun.direction === 'LONG' || frontRun.direction === 'SHORT' ? frontRun.direction : null;
  if (chartBias && dir && dir !== chartBias) return null;
  if (frontRun.state === 'TRIGGERED' && dir) return null;

  const frStateKo =
    frontRun.state === 'READY'
      ? '준비'
      : frontRun.state === 'WATCH'
        ? '관찰'
        : '신호없음';
  const frDirKo = dir === 'LONG' ? '롱' : dir === 'SHORT' ? '숏' : '';
  const frColor =
    frontRun.state === 'READY' ? '#F59E0B' : frontRun.state === 'WATCH' ? '#38BDF8' : '#94A3B8';
  const frText = `선반영 ${frStateKo}${frDirKo ? ` ${frDirKo}` : ''}`;
  return {
    time: lastBarTime as UTCTimestamp,
    position: dir === 'SHORT' ? 'aboveBar' : 'belowBar',
    shape: 'circle',
    color: frColor,
    text: frText,
    size: 2,
    id: `merged-desk-frontrun-${lastBarTime}-${frontRun.state}`,
  };
}

/** 로켓·밴드·선반영 — 봉당 1방향·슬롯 1개로 정리 */
export function consolidateMergedDeskPulseMarkers(params: {
  packMarkers: UnifiedPulseChartMarker[];
  rockets: ReadonlyArray<{ time: number; direction: 'LONG' | 'SHORT' }>;
  bandMarkers: UnifiedPulseChartMarker[];
  chartCandles: Candle[];
  sourceCandles?: Candle[];
  frontRun?: MergedDeskFrontRunSnap | null;
  lastBarTime?: number | null;
  chartBias?: 'LONG' | 'SHORT' | null;
  rocketSize?: 1 | 2 | 3;
}): UnifiedPulseChartMarker[] {
  const { packMarkers, rockets, bandMarkers, chartCandles, sourceCandles, frontRun, chartBias, rocketSize = 2 } =
    params;
  const lastBarTime = params.lastBarTime ?? null;
  const rocketsRemapped = dedupeMergedDeskRocketsOnePerBar(
    remapStructureRocketsToChart(
      rockets.map((r) => ({ ...r })),
      chartCandles,
      sourceCandles
    ),
    chartBias,
    chartCandles
  );
  const bandsRemapped = remapMergedDeskMarkerTimesToChart(bandMarkers, chartCandles, sourceCandles);
  const rocketKeys = new Set(rocketsRemapped.map((r) => `${r.time}|${r.direction}`));

  const packClean = prepareMergedDeskPackMarkersForLwc(packMarkers, chartCandles, sourceCandles).filter((m) => {
    if (!isRocketChartText(String(m.text || ''))) return true;
    const dir = rocketDirFromMarker(m);
    const tm = Number(m.time);
    return !(dir && rocketKeys.has(`${tm}|${dir}`));
  });

  const raw: UnifiedPulseChartMarker[] = [...packClean, ...bandsRemapped.map((m) => ({ ...m }))];
  for (const r of rocketsRemapped) {
    const t = Number(r.time);
    if (!Number.isFinite(t)) continue;
    raw.push({
      time: t as UTCTimestamp,
      position: r.direction === 'LONG' ? 'belowBar' : 'aboveBar',
      shape: 'circle',
      color: r.direction === 'LONG' ? '#16A34A' : '#DC2626',
      text: r.direction === 'LONG' ? '🚀' : '📉',
      size: rocketSize,
      id: `merged-desk-rocket-${r.direction.toLowerCase()}-${t}`,
    });
  }

  if (frontRun && lastBarTime != null && Number.isFinite(lastBarTime)) {
    const fr = buildMergedDeskFrontRunMarker(frontRun, lastBarTime, chartBias);
    if (fr) raw.push(fr);
  }

  const byTime = new Map<number, UnifiedPulseChartMarker[]>();
  for (const m of raw) {
    const tm = Number(m.time);
    if (!Number.isFinite(tm)) continue;
    const list = byTime.get(tm) ?? [];
    list.push(m);
    byTime.set(tm, list);
  }

  const out: UnifiedPulseChartMarker[] = [];
  for (const [tm, list] of byTime) {
    const rocketsOnBar = list.filter((m) => isRocketChartText(String(m.text || '')));
    const longRk = rocketsOnBar.some((m) => rocketDirFromMarker(m) === 'LONG');
    const shortRk = rocketsOnBar.some((m) => rocketDirFromMarker(m) === 'SHORT');
    let filtered = list;
    if (longRk && shortRk) {
      const pick =
        chartBias ??
        rocketsRemapped.find((r) => r.time === tm)?.direction ??
        (markerPriority(rocketsOnBar[0]!) >= markerPriority(rocketsOnBar[1] ?? rocketsOnBar[0]!)
          ? rocketDirFromMarker(rocketsOnBar[0]!) ?? 'LONG'
          : rocketDirFromMarker(rocketsOnBar[1]!) ?? 'SHORT');
      filtered = list.filter((m) => {
        if (!isRocketChartText(String(m.text || ''))) return true;
        return rocketDirFromMarker(m) === pick;
      });
    }

    const slots = new Map<UnifiedPulseChartMarker['position'], UnifiedPulseChartMarker>();
    for (const m of filtered) {
      const key = m.position;
      const prev = slots.get(key);
      if (!prev || markerPriority(m) > markerPriority(prev)) slots.set(key, m);
    }

    const below = slots.get('belowBar');
    const above = slots.get('aboveBar');
    if (
      below &&
      above &&
      isRocketChartText(String(below.text)) &&
      isRocketChartText(String(above.text))
    ) {
      const pick = chartBias ?? (markerPriority(below) >= markerPriority(above) ? 'LONG' : 'SHORT');
      if (pick === 'LONG') slots.delete('aboveBar');
      else slots.delete('belowBar');
    }

    for (const m of slots.values()) out.push(m);
  }

  const lastT = Number(chartCandles[chartCandles.length - 1]?.time);
  let capped = out;
  if (Number.isFinite(lastT)) {
    const hist = out.filter((m) => Number(m.time) !== lastT);
    const onLast = out
      .filter((m) => Number(m.time) === lastT)
      .sort((a, b) => markerPriority(b) - markerPriority(a))
      .slice(0, 3);
    capped = [...hist, ...onLast];
  }

  const seen = new Set<string>();
  const deduped = capped
    .filter((m) => {
      const key = String(m.id || `${m.time}-${m.position}-${m.text}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Number(a.time) - Number(b.time));

  return finalizeMergedDeskLwcMarkers(deduped, chartCandles, chartBias);
}

export function formatMergedDeskBandTouchDetail(ev: InstitutionalBandInteractionMarker): string {
  const sym = ev.tier === 'A' ? '★' : ev.tier === 'B' ? '◆' : '';
  const head = ev.verdict === 'LONG' ? `ST·L${sym}` : `ST·S${sym}`;
  const sum = ev.summaryParts.slice(0, 8).join('·');
  const outcome =
    ev.verdict === 'LONG'
      ? sum.includes('복귀') || sum.includes('반등')
        ? '지지 유지·롱 관점'
        : sum.includes('이탈')
          ? '지지 실패·무효화 참고'
          : '지지 테스트·롱 관점'
      : sum.includes('거절')
        ? '저항 거절·숏 관점'
        : sum.includes('이탈')
          ? '저항 돌파·숏 무효 참고'
          : '저항 테스트·숏 관점';
  return `${head}|${ev.tier}|${ev.score}|${ev.proximityAtr.toFixed(2)}|${sum}|${outcome}`;
}

export function evaluateMergedDeskBandLineAtPrice(
  candles: Candle[],
  clickPrice: number,
  clickTime?: number
): string[] {
  const safe = sanitizeChartCandlesForSeries(candles);
  if (safe.length < 8 || !Number.isFinite(clickPrice)) return [];
  const meta = computeInstitutionalSuperTrendMeta(
    safe,
    INSTITUTIONAL_BAND_DEFAULT_PERIOD,
    INSTITUTIONAL_BAND_DEFAULT_MULT
  );
  if (meta.lastLinePrice == null) return [];
  const band = meta.lastLinePrice;
  const last = safe[safe.length - 1]!;
  const atr = Math.max(
    Math.abs(last.close) * 0.008,
    (last.high - last.low) * 0.6,
    Math.abs(band) * 0.0015,
    1e-8
  );
  const dist = clickPrice - band;
  const prox = Math.abs(dist);
  if (prox > atr * 1.35) return [];

  const bar =
    clickTime != null
      ? safe.find((c) => Number(c.time) === clickTime) ?? last
      : last;
  const close = Number(bar.close);
  const isLongBand = meta.lastDir === 'long';

  if (isLongBand) {
    if (dist >= -atr * 0.15 && close >= band - atr * 0.08) {
      return [
        '기관밴드(하늘색) 지지 — 롱 관점 유리',
        `기준선 ${band.toFixed(2)} · 종가 ${close.toFixed(2)}`,
      ];
    }
    if (close < band - atr * 0.22) {
      return [
        '기관밴드 지지 못함 — 이탈·무효화 참고',
        `기준선 ${band.toFixed(2)} · 종가 ${close.toFixed(2)}`,
      ];
    }
    return [
      '기관밴드 지지 테스트 중 — 확인 봉 마감 필요',
      `기준선 ${band.toFixed(2)} · 터치가 ${clickPrice.toFixed(2)}`,
    ];
  }

  if (dist <= atr * 0.15 && close <= band + atr * 0.08) {
    return [
      '기관밴드(빨강) 저항 — 숏 관점 유리',
      `기준선 ${band.toFixed(2)} · 종가 ${close.toFixed(2)}`,
    ];
  }
  if (close > band + atr * 0.22) {
    return [
      '기관밴드 저항 돌파 — 숏 무효·상방 참고',
      `기준선 ${band.toFixed(2)} · 종가 ${close.toFixed(2)}`,
    ];
  }
  return [
    '기관밴드 저항 테스트 중 — 확인 봉 마감 필요',
    `기준선 ${band.toFixed(2)} · 터치가 ${clickPrice.toFixed(2)}`,
  ];
}

export function buildMergedDeskMarkerBarDetailMap(params: {
  markers: UnifiedPulseChartMarker[];
  bandEvents: InstitutionalBandInteractionMarker[];
  frontRun?: MergedDeskFrontRunSnap | null;
  analysis?: AnalyzeResponse | null;
}): Map<number, string[]> {
  const map = new Map<number, string[]>();
  const push = (tm: number, line: string) => {
    if (!Number.isFinite(tm) || !line.trim()) return;
    const arr = map.get(tm) ?? [];
    if (!arr.includes(line)) arr.push(line);
    map.set(tm, arr);
  };

  for (const m of params.markers) {
    const tm = Number(m.time);
    const tx = String(m.text || '');
    if (tx.startsWith('선반영')) {
      push(tm, `${tx} — 종가 전 선행 시나리오(참고·비보장)`);
      continue;
    }
    if (isRocketChartText(tx)) {
      push(tm, tx.includes('📉') ? '구조 숏 로켓' : '구조 롱 로켓');
      continue;
    }
    if (isBandMarkerText(tx)) {
      push(
        tm,
        `기관밴드 터치 ${tx} — SuperTrend(${INSTITUTIONAL_BAND_DEFAULT_PERIOD},${INSTITUTIONAL_BAND_DEFAULT_MULT})`
      );
    }
  }

  for (const ev of params.bandEvents) {
    push(Number(ev.time), formatMergedDeskBandTouchDetail(ev));
  }

  const fr = params.frontRun;
  if (fr && fr.state !== 'NO_SIGNAL' && fr.state !== 'INVALID') {
    const lastT = params.analysis?.candles?.length
      ? Number(params.analysis.candles[params.analysis.candles.length - 1]!.time)
      : NaN;
    if (Number.isFinite(lastT)) {
      const dir = fr.direction === 'LONG' ? '롱' : fr.direction === 'SHORT' ? '숏' : '';
      push(lastT, `선반영 ${fr.state} ${dir} — analyze frontRunSignal`);
    }
  }

  return map;
}

export function computeMergedDeskBandInteractionEvents(
  candles: Candle[],
  timeframe: string,
  analysis?: AnalyzeResponse | null,
  touchTierMask?: InstitutionalBandTouchTierMask | null
): InstitutionalBandInteractionMarker[] {
  const safe = sanitizeChartCandlesForSeries(candles);
  if (safe.length < 7) return [];
  const mask = touchTierMask ?? tierMaskFromMinTier('B');
  return computeInstitutionalBandInteractionMarkersUnion(
    safe,
    INSTITUTIONAL_BAND_DEFAULT_PERIOD,
    INSTITUTIONAL_BAND_DEFAULT_MULT,
    {
      minBarsBetween: institutionalBandTouchMinGapBars(timeframe),
      tierEnabled: {
        A: mask.A === true,
        B: mask.B === true,
        C: mask.C === true,
      },
      overlays: analysis?.overlays ?? [],
    }
  );
}

/** 다른 모드와 동일 — ST 터치 L★/S★ + 마지막 봉 추세 L·/S· */
export function buildMergedDeskInstitutionalBandMarkers(params: {
  candles: Candle[];
  timeframe: string;
  analysis?: AnalyzeResponse | null;
  touchTierMask?: InstitutionalBandTouchTierMask | null;
}): UnifiedPulseChartMarker[] {
  const safe = sanitizeChartCandlesForSeries(params.candles);
  if (safe.length < 7) return [];

  const mask =
    params.touchTierMask ??
    tierMaskFromMinTier('B');
  const overlayList = params.analysis?.overlays ?? ([] as OverlayItem[]);
  const ibMarks = computeInstitutionalBandInteractionMarkersUnion(
    safe,
    INSTITUTIONAL_BAND_DEFAULT_PERIOD,
    INSTITUTIONAL_BAND_DEFAULT_MULT,
    {
      minBarsBetween: institutionalBandTouchMinGapBars(params.timeframe),
      tierEnabled: {
        A: mask.A === true,
        B: mask.B === true,
        C: mask.C === true,
      },
      overlays: overlayList,
    }
  );

  const remappedMarks = remapStructureRocketsToChart(
    ibMarks.map((ev) => ({ ...ev, time: Number(ev.time) })),
    safe
  );

  const out: UnifiedPulseChartMarker[] = [];
  for (const ev of remappedMarks) {
    const tm = Number(ev.time);
    if (!Number.isFinite(tm)) continue;
    const isLong = ev.verdict === 'LONG';
    const st = bandTouchMarkerStyle(ev);
    out.push({
      time: tm as UTCTimestamp,
      position: isLong ? 'belowBar' : 'aboveBar',
      shape: isLong ? 'arrowUp' : 'arrowDown',
      color: st.color,
      text: formatBandTouchChartText(ev),
      size: (st.size >= 2 ? 2 : 1) as 1 | 2 | 3,
      id: `merged-desk-band-${ev.unionSource ?? 'base'}-${isLong ? 'l' : 's'}-${tm}-${ev.tier}`,
    });
  }

  const lastT = Number(safe[safe.length - 1]!.time);
  const hasBandOnLast = out.some((m) => Number(m.time) === lastT && isBandMarkerText(String(m.text ?? '')));

  if (!hasBandOnLast) {
    const leading = buildLeadingBandTouchMarker(safe);
    if (leading) {
      out.push(leading);
    } else {
      const meta = computeInstitutionalSuperTrendMeta(
        safe,
        INSTITUTIONAL_BAND_DEFAULT_PERIOD,
        INSTITUTIONAL_BAND_DEFAULT_MULT
      );
      const isLong = meta.lastDir === 'long';
      out.push({
        time: lastT as UTCTimestamp,
        position: isLong ? 'belowBar' : 'aboveBar',
        shape: isLong ? 'arrowUp' : 'arrowDown',
        color: isLong ? '#2dd4bf' : '#f87171',
        text: isLong ? 'L·' : 'S·',
        size: 2,
        id: `merged-desk-band-trend-${lastT}`,
      });
    }
  }

  return out;
}

function lastPivotHighBefore(candles: Candle[], endIdx: number, L: number): { idx: number; price: number } | null {
  for (let i = Math.min(endIdx - 1, candles.length - 1 - L); i >= L; i--) {
    const hi = Number(candles[i]!.high);
    let ok = true;
    for (let k = 1; k <= L; k++) {
      if (Number(candles[i - k]!.high) >= hi) {
        ok = false;
        break;
      }
      if (i + k < endIdx && Number(candles[i + k]!.high) > hi) {
        ok = false;
        break;
      }
    }
    if (ok) return { idx: i, price: hi };
  }
  return null;
}

function lastPivotLowBefore(candles: Candle[], endIdx: number, L: number): { idx: number; price: number } | null {
  for (let i = Math.min(endIdx - 1, candles.length - 1 - L); i >= L; i--) {
    const lo = Number(candles[i]!.low);
    let ok = true;
    for (let k = 1; k <= L; k++) {
      if (Number(candles[i - k]!.low) <= lo) {
        ok = false;
        break;
      }
      if (i + k < endIdx && Number(candles[i + k]!.low) < lo) {
        ok = false;
        break;
      }
    }
    if (ok) return { idx: i, price: lo };
  }
  return null;
}

/**
 * 선반영 로켓 씨앗 — 종가 확정·후행 CHOCH 전에 스윕·돌파시도·ST홀드 봉에 찍고
 * 그 봉 시각을 고정한다. 마지막 봉으로 끌어오지 않음.
 */
export function scanMergedDeskLeadingRocketSeeds(
  candles: Candle[],
  timeframe: string,
  analysis?: AnalyzeResponse | null
): MergedDeskRocketRow[] {
  const n = candles.length;
  if (n < 16) return [];
  const L = 2;
  const look = Math.min(n - 1, Math.max(16, Math.round(mergedDesk4hReferenceBarCap(timeframe) * 0.18)));
  const out: MergedDeskRocketRow[] = [];
  const push = (idx: number, direction: 'LONG' | 'SHORT') => {
    const t = Number(candles[idx]?.time);
    if (!Number.isFinite(t) || idx < 0 || idx >= n) return;
    out.push({ time: t, direction, tier: 'structure' });
  };

  for (let i = Math.max(L + 2, n - look); i < n; i++) {
    const c = candles[i]!;
    const isLast = i === n - 1;
    const swH = lastPivotHighBefore(candles, i, L);
    const swL = lastPivotLowBefore(candles, i, L);
    const hi = Number(c.high);
    const lo = Number(c.low);
    const cl = Number(c.close);
    const sweepLong = !!(swL && lo < swL.price && cl > swL.price);
    const sweepShort = !!(swH && hi > swH.price && cl < swH.price);
    if (sweepLong && !sweepShort) push(i, 'LONG');
    else if (sweepShort && !sweepLong) push(i, 'SHORT');
    else if (sweepLong && sweepShort) push(i, cl >= Number(c.open) ? 'LONG' : 'SHORT');
    else if (swH && hi > swH.price && cl <= swH.price) push(i, 'LONG');
    else if (swL && lo < swL.price && cl >= swL.price) push(i, 'SHORT');
    /** 종가 돌파도 그 돌파봉에 고정 (후행 재배치 없음) */
    if (!isLast && swH && cl > swH.price) push(i, 'LONG');
    if (!isLast && swL && cl < swL.price) push(i, 'SHORT');
  }

  const ctx = detectMergedSmcLeadingContext({ candles, timeframe, analysis });
  for (const m of ctx.marks) {
    if (m.tag === 'CHOCH' || m.developing) {
      push(m.index, m.bias === 'bullish' ? 'LONG' : 'SHORT');
    }
  }

  try {
    const confirms = detectMergedDirectionConfirms({
      candles,
      timeframe,
      analysis,
      maxEvents: 24,
    });
    for (const ev of confirms) {
      if (ev.tier !== 'building' && ev.tier !== 'strong') continue;
      const idx = candles.findIndex((c) => Number(c.time) === Number(ev.time));
      if (idx >= 0) push(idx, ev.direction);
    }
  } catch {
    /* ignore */
  }

  const byT = new Map<number, MergedDeskRocketRow>();
  for (const r of out) {
    if (!byT.has(r.time)) byT.set(r.time, r);
  }
  return [...byT.values()].sort((a, b) => a.time - b.time);
}

/** 선반영 씨앗 증강 — 호출 중지(구조 CHOCH/BOS만). 시그니처 유지. */
export function augmentMergedDeskRocketRows(
  rockets: MergedDeskRocketRow[],
  _candles?: Candle[],
  _timeframe?: string,
  _analysis?: AnalyzeResponse | null
): MergedDeskRocketRow[] {
  return rockets;
}

/** @deprecated 선반영 씨앗 — 구조 로켓만 사용. 내부 스캔은 유지(삭제 금지). */
export function augmentMergedDeskRocketRowsLegacy(
  rockets: MergedDeskRocketRow[],
  candles: Candle[],
  timeframe: string,
  analysis?: AnalyzeResponse | null
): MergedDeskRocketRow[] {
  if (candles.length < 12) return rockets;
  const seeds = scanMergedDeskLeadingRocketSeeds(candles, timeframe, analysis);
  const taken = new Set(rockets.map((r) => r.time));
  const out = [...rockets];
  for (const s of seeds) {
    if (taken.has(s.time)) continue;
    taken.add(s.time);
    out.push(s);
  }
  const deduped = new Map<number, MergedDeskRocketRow>();
  for (const r of out) deduped.set(r.time, r);
  return filterMergedDeskSignalsToChartWindow(
    [...deduped.values()].sort((a, b) => a.time - b.time),
    candles
  );
}

/** 차트 TF 구조 로켓 상한 — 분·시·일·주·월 공동 밀도 */
const MERGED_DESK_CHART_TF_ROCKET_MAX = 22;

export function mergedDeskRocketMinGapBars(timeframe: string): number {
  const cap = mergedDesk4hReferenceBarCap(timeframe);
  return Math.max(3, Math.min(10, Math.round(cap * 0.022)));
}

/** 연속 봉 로켓 뭉침 → 클러스터당 최신 1개 */
export function thinMergedDeskRocketsMinBarGap<T extends { time: number }>(
  rows: ReadonlyArray<T>,
  candles: Candle[],
  minGapBars: number
): T[] {
  if (minGapBars <= 1 || rows.length <= 1 || candles.length < 2) return [...rows];
  const idxByT = new Map<number, number>();
  for (let i = 0; i < candles.length; i++) {
    idxByT.set(Number(candles[i]!.time), i);
  }
  const sorted = [...rows].sort((a, b) => Number(a.time) - Number(b.time));
  const out: T[] = [];
  let lastIdx = -Infinity;
  for (const r of sorted) {
    const i = idxByT.get(Number(r.time));
    if (i == null) continue;
    if (Number.isFinite(lastIdx) && i - lastIdx < minGapBars && out.length) {
      /** 먼저 뜬 로켓 유지 — 후행으로 앞으로 끌어가지 않음 */
      continue;
    }
    out.push(r);
    lastIdx = i;
  }
  return out;
}

/**
 * 차트 선택 TF 구조 로켓 — CHOCH·BOS 공동, 봉 간격으로 밀도만 제한.
 */
export function buildMergedDeskChartTfStructureRockets(
  chartCandles: Candle[],
  timeframe: string
): MergedDeskRocketRow[] {
  const tf = normalizeChartTimeframe(timeframe);
  const series = mergedInstitutionalBandCandlesSlice(chartCandles, tf);
  if (series.length < 12) return [];
  const { L } = mergedDesk4hReferencePivotWindowForTf(tf);
  const marks = structureMarksFu(series, L, Math.max(12, structureRocketMergeMax(tf)));
  const minGap = mergedDeskRocketMinGapBars(tf);
  const out: MergedDeskRocketRow[] = [];
  let lastIdx = -Infinity;
  for (const mk of marks) {
    if (Number.isFinite(lastIdx) && mk.index - lastIdx < minGap) continue;
    const t = Number(series[mk.index]?.time);
    if (!Number.isFinite(t)) continue;
    out.push({
      time: t,
      direction: mk.bias === 'bullish' ? 'LONG' : 'SHORT',
      tier: 'structure',
    });
    lastIdx = mk.index;
    if (out.length >= MERGED_DESK_CHART_TF_ROCKET_MAX) break;
  }
  return filterMergedDeskSignalsToChartWindow(out, chartCandles);
}

/** 통합·분석 차트 로켓 — 선택 TF 구조 우선, 15m analyze는 빈 봉만 보강 */
export function buildMergedDeskStructureRocketsForChart(params: {
  structureRockets: ReadonlyArray<{ time?: number; direction?: 'LONG' | 'SHORT' }>;
  chartCandles: Candle[];
  sourceCandles?: Candle[];
  chartBias?: 'LONG' | 'SHORT' | null;
  /** 차트 선택 TF — 없으면 차트TF 구조 로켓 생략(하위 호환) */
  timeframe?: string;
}): MergedDeskRocketRow[] {
  const raw: MergedDeskRocketRow[] = [];
  for (const rk of params.structureRockets) {
    const t = Number(rk.time);
    const dir = rk.direction;
    if (!Number.isFinite(t) || (dir !== 'LONG' && dir !== 'SHORT')) continue;
    raw.push({ time: t, direction: dir, tier: 'structure' });
  }
  const remapped = remapStructureRocketsToChart(raw, params.chartCandles, params.sourceCandles);
  const chartTfRockets = params.timeframe
    ? buildMergedDeskChartTfStructureRockets(params.chartCandles, params.timeframe)
    : [];
  /** 차트 TF CHOCH/BOS가 봉을 먼저 차지 — 15m 스냅이 HTF 로켓을 덮지 않음 */
  const merged = dedupeMergedDeskRocketsOnePerBar(
    [...chartTfRockets, ...remapped],
    params.chartBias,
    params.chartCandles
  );
  const gap = params.timeframe ? mergedDeskRocketMinGapBars(params.timeframe) : 6;
  return filterMergedDeskSignalsToChartWindow(
    thinMergedDeskRocketsMinBarGap(merged, params.chartCandles, gap),
    params.chartCandles
  );
}

function candleIndexAtOrBeforeBar(candles: Candle[], t: number): number {
  if (!candles.length || !Number.isFinite(t)) return 0;
  let lo = 0;
  let hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (Number(candles[mid]!.time) <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** LWC 마커 time = setData 캔들 시가와 정확히 일치해야 함 */
export function snapMarkersToSeriesBarTimes<T extends { time: number | UTCTimestamp }>(
  markers: ReadonlyArray<T>,
  candles: Candle[]
): T[] {
  if (!markers.length || !candles.length) return [...markers];
  return markers.map((m) => {
    const t = Number(m.time);
    if (!Number.isFinite(t)) return m;
    const exact = candles.find((c) => Number(c.time) === t);
    if (exact) return m;
    const idx = candleIndexAtOrBeforeBar(candles, t);
    const barT = Number(candles[idx]?.time);
    return Number.isFinite(barT) ? ({ ...m, time: barT as T['time'] } as T) : m;
  });
}

/** 봉당 1마커·마지막 봉 과밀 방지 — 시리즈 시가에 스냅 후 정리 */
export function finalizeMergedDeskLwcMarkers(
  markers: UnifiedPulseChartMarker[],
  chartCandles: Candle[],
  chartBias?: 'LONG' | 'SHORT' | null
): UnifiedPulseChartMarker[] {
  const snapped = snapMarkersToSeriesBarTimes(markers, chartCandles);
  const byBar = new Map<number, UnifiedPulseChartMarker>();
  for (const m of snapped) {
    const t = Number(m.time);
    if (!Number.isFinite(t)) continue;
    const prev = byBar.get(t);
    if (!prev || markerPriority(m) > markerPriority(prev)) byBar.set(t, m);
    else if (
      prev &&
      markerPriority(m) === markerPriority(prev) &&
      isRocketChartText(String(m.text)) &&
      !isRocketChartText(String(prev.text))
    ) {
      byBar.set(t, m);
    }
  }
  let list = [...byBar.values()].sort((a, b) => Number(a.time) - Number(b.time));
  const lastT = Number(chartCandles[chartCandles.length - 1]?.time);
  if (Number.isFinite(lastT)) {
    const hist = list.filter((m) => Number(m.time) !== lastT);
    const onLast = list
      .filter((m) => Number(m.time) === lastT)
      .sort((a, b) => markerPriority(b) - markerPriority(a))
      .slice(0, 2);
    list = [...hist, ...onLast];
  }
  const seen = new Set<string>();
  return list.filter((m) => {
    const key = `${m.time}|${m.position}|${m.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
