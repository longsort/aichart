/**
 * 통합 펄스 엔진 — 마감·안착 차트 상단 칩(가로선·존·Strike·밴드·안착 등)을
 * **하나의 분석 엔진**으로 병합. 기관밴드·로켓 로직 유지, 출력은 아틀라스 펄스(⚡◆★▲▼ + E/SL/TP).
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import type { MonthDeskBandFusionContext } from '@/lib/institutionalSuperBand';
import type { MonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';
import type { UserSettings } from '@/lib/settings';
import {
  computeAtlasPulseDeskPack,
  filterOverlaysForAtlasPulseDesk,
  isAtlasPulsePreservedChartMarker,
  type AtlasPulseDeskMeta,
  type AtlasPulseMarker,
  type AtlasPulsePriceLine,
} from '@/lib/monthDeskAtlasPulseDesk';
import { buildMonthDeskStrikeDeskOverlays } from '@/lib/monthDeskStrikeDesk';
import {
  buildMonthDeskPulseProLayers,
  isPulseProPreservedChartMarker,
  type PulseProStrategyStrip,
} from '@/lib/monthDeskPulseProLayers';
import {
  focusPulseMarkersToLastBar,
  preserveMergedDeskChartMarkers,
  narrowOverlaysToLastBars,
  LAST_CANDLE_ZONE_BARS,
} from '@/lib/monthDeskLastCandleFocus';

export type UnifiedPulseEnginePack = {
  overlays: OverlayItem[];
  markers: AtlasPulseMarker[];
  priceLines: AtlasPulsePriceLine[];
  meta: AtlasPulseDeskMeta & {
    engineKo: string;
    aiVerdict: 'LONG' | 'SHORT' | 'NEUTRAL';
    strategy: PulseProStrategyStrip;
  };
};

/** 통합 엔진 ON — 하위 칩 일괄 프리셋 (기능 삭제 아님, 내부 병렬 가동) */
export type UnifiedPulseEngineSettingsPatch = Pick<
  UserSettings,
  | 'chartMonthDeskUnifiedPulseEngineEnabled'
  | 'chartMonthDeskAtlasPulseDeskEnabled'
  | 'chartMonthDeskStrikeDeskEnabled'
  | 'chartMonthDeskFusionDeskBandEnabled'
  | 'chartMonthDeskSettleCandlePaint'
  | 'chartMonthDeskCleanIconSignalsEnabled'
  | 'chartMonthDeskMergedSignalEnabled'
  | 'chartMonthDeskLayerMode'
  | 'chartMonthDeskOverlayDensity'
  | 'chartMonthDeskClearSummaryEnabled'
  | 'chartMonthDeskFloatingHudEnabled'
  | 'chartBulkHideLabels'
  | 'chartMonthDeskClickPrecisionEnabled'
  | 'chartMonthDeskBreakoutFollowPath'
  | 'showInstitutionalTrendBadge'
  | 'chartMonthDeskPullbackHotZoneEnabled'
>;

export function isMonthDeskUnifiedPulseEngineOn(
  settings: Pick<UserSettings, 'chartMonthDeskUnifiedPulseEngineEnabled'>
): boolean {
  return settings.chartMonthDeskUnifiedPulseEngineEnabled !== false;
}

export function monthDeskUnifiedPulseEnginePatch(
  enabled: boolean
): Partial<UnifiedPulseEngineSettingsPatch> {
  if (!enabled) {
    return { chartMonthDeskUnifiedPulseEngineEnabled: false };
  }
  return {
    chartMonthDeskUnifiedPulseEngineEnabled: true,
    chartMonthDeskAtlasPulseDeskEnabled: true,
    chartMonthDeskStrikeDeskEnabled: true,
    chartMonthDeskFusionDeskBandEnabled: true,
    chartMonthDeskSettleCandlePaint: true,
    chartMonthDeskCleanIconSignalsEnabled: true,
    chartMonthDeskMergedSignalEnabled: false,
    chartMonthDeskLayerMode: 'strike',
    chartMonthDeskOverlayDensity: 'clear',
    chartMonthDeskClearSummaryEnabled: false,
    chartMonthDeskFloatingHudEnabled: false,
    chartBulkHideLabels: true,
    chartMonthDeskClickPrecisionEnabled: false,
    chartMonthDeskBreakoutFollowPath: false,
    showInstitutionalTrendBadge: false,
    chartMonthDeskPullbackHotZoneEnabled: true,
  };
}

const UNIFIED_HIDE_OVERLAY_PREFIXES = [
  'parkf-',
  'cptc-',
  'phz-',
  'hotzone-',
  'month-desk-typeom-',
  'trade-atlas-',
  'month-desk-plan-',
  'month-desk-unified-',
  'month-desk-smc-',
  'month-desk-chart-deck',
  'whale-alr-',
  'md-path-',
  'ob-pre-beam-',
] as const;

/** 통합 엔진 — 아틀라스 + 잡음 레이어 제거 */
export function filterOverlaysForUnifiedPulseEngine(items: OverlayItem[]): OverlayItem[] {
  const base = filterOverlaysForAtlasPulseDesk(items);
  return base.filter((o) => {
    const id = String(o.id || '');
    if (id.startsWith('atlas-pulse-') || id.startsWith('pulse-pro-')) return true;
    return !UNIFIED_HIDE_OVERLAY_PREFIXES.some((p) => id.startsWith(p));
  });
}

function aiVerdict(analysis: AnalyzeResponse | null | undefined): 'LONG' | 'SHORT' | 'NEUTRAL' {
  const v = analysis?.verdict;
  if (v === 'LONG' || v === 'SHORT') return v;
  return 'NEUTRAL';
}

function pushPrimaryEntryMarker(
  markers: AtlasPulseMarker[],
  candles: Candle[],
  meta: AtlasPulseDeskMeta,
  bundle: MonthDeskStrikeDeskBundle,
  analysis: AnalyzeResponse | null | undefined
): AtlasPulseMarker[] {
  const n = candles.length;
  if (n < 2) return markers;
  const lastT = Number(candles[n - 1]?.time) as UTCTimestamp;
  if (!Number.isFinite(lastT)) return markers;

  const pri = bundle.primary;
  if (pri !== 'LONG' && pri !== 'SHORT') return markers;

  const stepOk = meta.step === 'confirm' || meta.step === 'settle' || meta.step === 'break';
  const ai = aiVerdict(analysis);
  const aiOk = ai === 'NEUTRAL' || ai === pri;
  const confOk = meta.confluence >= 58;

  if (!stepOk || !aiOk || !confOk) return markers;

  const hot =
    bundle.ai?.phase === 'hot' ||
    (pri === 'LONG' ? bundle.ai?.long?.phase === 'hot' : bundle.ai?.short?.phase === 'hot');

  const icon = pri === 'LONG' ? '▲' : '▼';
  const out = markers.filter((m) => !(m.time === lastT && (m.text === '▲' || m.text === '▼')));
  out.push({
    time: lastT,
    position: pri === 'LONG' ? 'belowBar' : 'aboveBar',
    shape: 'square',
    color: pri === 'LONG' ? '#22C55E' : '#EF4444',
    text: icon,
    size: hot || meta.step === 'confirm' ? 3 : 2,
    id: `unified-pulse-entry-${pri.toLowerCase()}-${lastT}`,
  });
  return out;
}

function engineHeadlineKo(meta: AtlasPulseDeskMeta, bundle: MonthDeskStrikeDeskBundle): string {
  const dir = meta.primary === 'LONG' ? '롱' : meta.primary === 'SHORT' ? '숏' : '관망';
  return `마지막봉 ${dir} · ${meta.stepKo} · 합류${meta.confluence}%`;
}

/** Strike·안착·AI·HotZone·밴드·구조 → 아틀라스 펄스 한 팩 */
export function runMonthDeskUnifiedPulseEngine(params: {
  candles: Candle[];
  timeframe: string;
  bundle: MonthDeskStrikeDeskBundle;
  fusion: MonthDeskBandFusionContext | null;
  analysis?: AnalyzeResponse | null;
  bandTouchByTime?: Map<number, Array<{ verdict: 'LONG' | 'SHORT'; tier?: 'A' | 'B' | 'C' }>>;
  probePack?: OverlayItem[];
  /** 통합·분석 — HTF 펄스 히스토리 완화 */
  mergedDeskMode?: boolean;
}): UnifiedPulseEnginePack | null {
  const { candles, timeframe, bundle, fusion, analysis, bandTouchByTime } = params;
  if (candles.length < 8) return null;

  const probePack = params.probePack ?? buildMonthDeskStrikeDeskOverlays(bundle, candles);
  const atlas = computeAtlasPulseDeskPack({
    candles,
    timeframe,
    bundle,
    probePack,
    fusion,
    analysis,
    bandTouchByTime,
  });
  if (!atlas) return null;

  let markers = pushPrimaryEntryMarker(atlas.markers, candles, atlas.meta, bundle, analysis);

  const ai = aiVerdict(analysis);
  if (ai === 'LONG' || ai === 'SHORT') {
    const edge =
      ai === 'LONG'
        ? Number(analysis?.longScore ?? 0) - Number(analysis?.shortScore ?? 0)
        : Number(analysis?.shortScore ?? 0) - Number(analysis?.longScore ?? 0);
    if (edge > 12 && atlas.meta.step !== 'failed' && atlas.meta.step !== 'fake') {
      const lastT = Number(candles[candles.length - 1]?.time) as UTCTimestamp;
      const hasEntry = markers.some((m) => m.time === lastT && (m.text === '▲' || m.text === '▼'));
      if (!hasEntry) {
        markers = [
          ...markers,
          {
            time: lastT,
            position: ai === 'LONG' ? 'belowBar' : 'aboveBar',
            shape: 'circle',
            color: ai === 'LONG' ? '#4ade80' : '#f87171',
            text: ai === 'LONG' ? '▲' : '▼',
            size: 2,
            id: `unified-pulse-ai-${ai.toLowerCase()}-${lastT}`,
          },
        ];
      }
    }
  }

  const pro = buildMonthDeskPulseProLayers({
    candles,
    timeframe,
    bundle,
    probePack,
    fusion,
    analysis,
    stepKo: atlas.meta.stepKo,
    breakLevel: atlas.meta.breakLevel,
  });

  const mergedMarkers = dedupeMarkersById([...markers, ...pro.markers]);
  const focusedMarkers = params.mergedDeskMode
    ? preserveMergedDeskChartMarkers(mergedMarkers, candles, {
        step: atlas.meta.step,
        primary: atlas.meta.primary,
      })
    : focusPulseMarkersToLastBar(mergedMarkers, candles, {
        step: atlas.meta.step,
        primary: atlas.meta.primary,
      });

  return {
    overlays: params.mergedDeskMode
      ? dedupeOverlaysById([...atlas.overlays, ...pro.overlays])
      : narrowOverlaysToLastBars(
          dedupeOverlaysById([...atlas.overlays, ...pro.overlays]),
          candles,
          { widthBars: LAST_CANDLE_ZONE_BARS }
        ),
    markers: focusedMarkers,
    priceLines: [...atlas.priceLines, ...pro.priceLines],
    meta: {
      ...atlas.meta,
      engineKo: engineHeadlineKo(atlas.meta, bundle),
      aiVerdict: ai,
      strategy: pro.strategy,
    },
  };
}

function dedupeOverlaysById(items: OverlayItem[]): OverlayItem[] {
  const seen = new Set<string>();
  const out: OverlayItem[] = [];
  for (const o of items) {
    const id = String(o.id || '');
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push(o);
  }
  return out;
}

function dedupeMarkersById(items: AtlasPulseMarker[]): AtlasPulseMarker[] {
  const seen = new Set<string>();
  const out: AtlasPulseMarker[] = [];
  for (const m of items) {
    const key = String(m.id || `${m.time}-${m.text}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

export type UnifiedPulseChartMarker = {
  time: UTCTimestamp;
  position: 'aboveBar' | 'belowBar';
  shape: 'square' | 'circle' | 'arrowUp' | 'arrowDown';
  color: string;
  text: string;
  size?: 1 | 2 | 3;
  id?: string;
};

function dedupeUnifiedPulseMarkers(items: UnifiedPulseChartMarker[]): UnifiedPulseChartMarker[] {
  const seen = new Set<string>();
  const out: UnifiedPulseChartMarker[] = [];
  for (const m of items) {
    const key = String(m.id || `${m.time}-${m.text}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

export function buildUnifiedPulseFastChartMarkers(params: {
  pack: Pick<UnifiedPulseEnginePack, 'markers'>;
  rockets: ReadonlyArray<{ time: number; direction: 'LONG' | 'SHORT' }>;
  rocketSize?: 1 | 2 | 3;
  /** 기관밴드 ST 터치 — 통합·분석 등 fast path */
  bandMarkers?: UnifiedPulseChartMarker[];
}): UnifiedPulseChartMarker[] {
  const { pack, rockets, rocketSize = 2, bandMarkers = [] } = params;
  const out: UnifiedPulseChartMarker[] = [
    ...pack.markers.map((m) => ({ ...m })),
    ...bandMarkers.map((m) => ({ ...m })),
  ];
  for (const r of rockets) {
    const t = Number(r.time);
    if (!Number.isFinite(t)) continue;
    out.push({
      time: t as UTCTimestamp,
      position: r.direction === 'LONG' ? 'belowBar' : 'aboveBar',
      shape: 'circle',
      color: r.direction === 'LONG' ? '#16A34A' : '#DC2626',
      text: r.direction === 'LONG' ? '🚀' : '📉',
      size: rocketSize,
      id: `unified-pulse-rocket-${r.direction.toLowerCase()}-${t}`,
    });
  }
  return dedupeUnifiedPulseMarkers(out);
}

export function isUnifiedPulsePreservedChartMarker(m: { text?: string }): boolean {
  return isPulseProPreservedChartMarker(m) || isAtlasPulsePreservedChartMarker(m);
}

export { isAtlasPulsePreservedChartMarker } from '@/lib/monthDeskAtlasPulseDesk';
export type { PulseProStrategyStrip } from '@/lib/monthDeskPulseProLayers';
