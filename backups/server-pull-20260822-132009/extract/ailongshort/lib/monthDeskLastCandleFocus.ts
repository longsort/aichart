/**
 * 통합 펄스 — zone·아이콘·신호를 **마지막 캔들(우측 끝)** 기준으로 정렬.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';
import { mergedDeskLastCandleZoneTimes, mergedDeskRocketVisibleBars } from '@/lib/mergedAnalysisOverlayTimes';

export const LAST_CANDLE_ZONE_BARS = 8;

export function lastBarTime(candles: Candle[]): number | null {
  const n = candles.length;
  if (n < 1) return null;
  const t = Number(candles[n - 1]?.time);
  return Number.isFinite(t) ? t : null;
}

export function lastBarSpan(
  candles: Candle[],
  widthBars = LAST_CANDLE_ZONE_BARS
): { t1: number; t2: number } {
  const n = candles.length;
  if (n < 1) return { t1: 0, t2: 0 };
  return {
    t1: Number(candles[Math.max(0, n - widthBars)]?.time),
    t2: Number(candles[n - 1]?.time),
  };
}

export function narrowOverlaysToLastBars(
  overlays: OverlayItem[],
  candles: Candle[],
  opts?: number | { widthBars?: number; timeframe?: string }
): OverlayItem[] {
  let t1: number;
  let t2: number;
  if (typeof opts === 'string' || (opts && typeof opts === 'object' && opts.timeframe)) {
    const tf = typeof opts === 'string' ? opts : opts.timeframe!;
    const span = mergedDeskLastCandleZoneTimes(candles, tf);
    if (!span) return overlays;
    t1 = Number(span.t1);
    t2 = Number(span.t2);
  } else {
    const width =
      typeof opts === 'number'
        ? opts
        : typeof opts === 'object' && opts?.widthBars != null
          ? opts.widthBars
          : LAST_CANDLE_ZONE_BARS;
    const span = lastBarSpan(candles, width);
    t1 = span.t1;
    t2 = span.t2;
  }
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return overlays;
  return overlays.map((o) => ({ ...o, time1: t1, time2: t2, x1: 0, x2: 1 }));
}

type StepKind = 'wait' | 'break' | 'settle' | 'confirm' | 'failed' | 'fake';

function stepToIcon(step: StepKind): string | null {
  if (step === 'break') return '⚡';
  if (step === 'settle') return '◆';
  if (step === 'confirm') return '★';
  if (step === 'failed' || step === 'fake') return '✕';
  return null;
}

function stepMarkerColor(step: StepKind, primary: 'LONG' | 'SHORT' | 'NEUTRAL'): string {
  if (step === 'failed' || step === 'fake') return '#F87171';
  if (primary === 'SHORT') return '#FB923C';
  if (primary === 'LONG') return '#22D3EE';
  return '#FACC15';
}

function buildStepMarker(
  lastT: UTCTimestamp,
  step: StepKind,
  primary: 'LONG' | 'SHORT' | 'NEUTRAL'
): AtlasPulseMarker | null {
  const icon = stepToIcon(step);
  if (!icon) return null;
  const bull = primary !== 'SHORT';
  return {
    time: lastT,
    position: bull ? 'belowBar' : 'aboveBar',
    shape: icon === '★' || icon === '⚡' ? 'square' : 'circle',
    color: stepMarkerColor(step, primary),
    text: icon,
    size: icon === '★' ? 2 : 1,
    id: `pulse-last-step-${icon}-${lastT}`,
  };
}

const ICON_RANK: Record<string, number> = {
  '★': 90,
  '◆': 80,
  '⚡': 70,
  '▲': 65,
  '▼': 65,
  '↩': 60,
  '◈': 55,
  '⟡': 50,
  '✕': 45,
};

function pickBestMarker(candidates: AtlasPulseMarker[], text: string): AtlasPulseMarker | null {
  const matches = candidates.filter((m) => m.text === text);
  if (!matches.length) return null;
  return matches.sort((a, b) => (ICON_RANK[b.text] ?? 0) - (ICON_RANK[a.text] ?? 0))[0]!;
}

/** 마지막 봉에만 아이콘 — 단계·방향·구조·되돌림 최대 3개 */
export function focusPulseMarkersToLastBar(
  markers: AtlasPulseMarker[],
  candles: Candle[],
  meta: {
    step: StepKind;
    primary: 'LONG' | 'SHORT' | 'NEUTRAL';
  }
): AtlasPulseMarker[] {
  const lastT = lastBarTime(candles);
  if (lastT == null) return [];
  const lastUtc = lastT as UTCTimestamp;
  const onLast = markers.filter((m) => Number(m.time) === lastT);

  const out: AtlasPulseMarker[] = [];

  const stepFromMeta = buildStepMarker(lastUtc, meta.step, meta.primary);
  const stepFromPack =
    pickBestMarker(onLast, '★') ??
    pickBestMarker(onLast, '◆') ??
    pickBestMarker(onLast, '⚡') ??
    pickBestMarker(onLast, '✕');
  const stepMarker = stepFromMeta ?? stepFromPack;
  if (stepMarker) out.push(stepMarker);

  const dirMarker = pickBestMarker(onLast, '▲') ?? pickBestMarker(onLast, '▼');
  if (dirMarker && !out.some((m) => m.text === dirMarker.text)) out.push(dirMarker);

  const extra =
    pickBestMarker(onLast, '↩') ??
    pickBestMarker(onLast, '◈') ??
    pickBestMarker(onLast, '⟡');
  if (extra && !out.some((m) => m.text === extra.text)) out.push(extra);

  return out.slice(0, 3);
}

function spreadAtlasMarkers(markers: AtlasPulseMarker[], max: number): AtlasPulseMarker[] {
  if (markers.length <= max) return markers;
  const sorted = [...markers].sort((a, b) => Number(a.time) - Number(b.time));
  const step = Math.ceil(sorted.length / max);
  const out: AtlasPulseMarker[] = [];
  for (let i = 0; i < sorted.length; i += step) out.push(sorted[i]!);
  const last = sorted[sorted.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/**
 * 통합·분석 — 펄스·구조 마커를 발생 봉에 유지(마지막 봉 tail만 남기지 않음).
 * 마지막 봉 단계 아이콘(★◆⚡)만 focusPulseMarkersToLastBar로 정리.
 */
export function preserveMergedDeskChartMarkers(
  markers: AtlasPulseMarker[],
  candles: Candle[],
  meta: {
    step: StepKind;
    primary: 'LONG' | 'SHORT' | 'NEUTRAL';
  },
  maxMarkers = 120
): AtlasPulseMarker[] {
  const lastT = lastBarTime(candles);
  if (lastT == null) return [];

  const tMin = Number(candles[0]?.time);
  const tMax = Number(candles[candles.length - 1]?.time);
  const inWindow = markers.filter((m) => {
    const t = Number(m.time);
    return Number.isFinite(t) && Number.isFinite(tMin) && Number.isFinite(tMax) && t >= tMin && t <= tMax;
  });

  const seen = new Set<string>();
  const deduped: AtlasPulseMarker[] = [];
  for (const m of inWindow) {
    const key = String(m.id || `${m.time}-${m.text}-${m.position}`);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(m);
  }

  const hist = deduped.filter((m) => Number(m.time) !== lastT);
  const onLast = deduped.filter((m) => Number(m.time) === lastT);
  const lastFocused = focusPulseMarkersToLastBar(onLast, candles, meta);

  const lastKeys = new Set(lastFocused.map((m) => String(m.id || `${m.time}-${m.text}-${m.position}`)));
  const histKept = hist.filter((m) => !lastKeys.has(String(m.id || `${m.time}-${m.text}-${m.position}`)));

  return spreadAtlasMarkers([...histKept, ...lastFocused], maxMarkers).sort(
    (a, b) => Number(a.time) - Number(b.time)
  );
}

/** @deprecated tail 전용 — 통합·분석은 preserveMergedDeskChartMarkers 사용 */
export function focusPulseMarkersForMergedDesk(
  markers: AtlasPulseMarker[],
  candles: Candle[],
  meta: {
    step: StepKind;
    primary: 'LONG' | 'SHORT' | 'NEUTRAL';
  },
  timeframe: string
): AtlasPulseMarker[] {
  const lastT = lastBarTime(candles);
  if (lastT == null) return [];

  const width = mergedDeskRocketVisibleBars(timeframe);
  const tStart = Number(candles[Math.max(0, candles.length - width)]?.time);
  const inTail = markers.filter((m) => {
    const t = Number(m.time);
    return Number.isFinite(t) && Number.isFinite(tStart) && t >= tStart && t <= lastT;
  });

  const onLast = inTail.filter((m) => Number(m.time) === lastT);
  const lastFocused =
    onLast.length > 0
      ? focusPulseMarkersToLastBar(onLast, candles, meta)
      : focusPulseMarkersToLastBar(
          markers.filter((m) => Number(m.time) === lastT),
          candles,
          meta
        );

  const hist = inTail
    .filter((m) => Number(m.time) !== lastT)
    .sort((a, b) => Number(b.time) - Number(a.time))
    .slice(0, 4);

  const seen = new Set<string>();
  const out: AtlasPulseMarker[] = [];
  for (const m of [...hist, ...lastFocused]) {
    const key = String(m.id || `${m.time}-${m.text}-${m.position}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

export function filterEntryIconsToLastBar<T extends { time: UTCTimestamp | number }>(
  rows: T[],
  candles: Candle[]
): T[] {
  const lastT = lastBarTime(candles);
  if (lastT == null) return [];
  return rows.filter((m) => Number(m.time) === lastT);
}
