'use client';

import { memo } from 'react';
import { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import { visibleLimit, ZONE_PRICE_FLOOR, ZONE_PRICE_CEIL, RSI_SWING_LS_THRESHOLD } from '../../lib/constants';
import { loadSettings, saveSettings, defaultSettings, getEffectiveFeatureToggles, type UIMode as SettingsUIMode } from '@/lib/settings';
import { subscribeWs } from '@/lib/websocket';
import { fetchWithRetry } from '@/lib/fetchWithRetry';
import { bollingerBands } from '@/lib/indicators';
import { CHART_CANDLE } from '@/lib/overlayColors';
import { overlayDisplayLabel } from '@/lib/labelTranslation';
import { createChart, createSeriesMarkers, CandlestickSeries, HistogramSeries, LineSeries, CandlestickData, HistogramData, LineData, IChartApi, ISeriesApi, ISeriesMarkersPluginApi, UTCTimestamp, Time, TickMarkType, CrosshairMode } from 'lightweight-charts';
import { useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import type { ChartExplainRequest } from '@/types/chartExplain';
import UIModeSwitcher, { type UIMode } from './UIModeSwitcher';
import ExecutionOverlay, { type ExecutionPositions } from './ExecutionOverlay';

export type ChartSnapshotRef = { getSnapshot: () => string | null };

type PriceStripPosition = 'left' | 'center' | 'right';

/** 축 옆 HTML 가격 박스: width:max-content로 % 계산 고정 후 좌·중·우 + 슬라이더 */
function buildPriceStripOverlayStyle(
  position: PriceStripPosition,
  hShiftPx: number,
  axisPx: number,
  chartWidth: number,
  rest: React.CSSProperties
): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: 'max-content',
    ...rest,
  };
  if (position === 'right') {
    return { ...base, left: axisPx + hShiftPx, transform: 'translateY(-50%)', textAlign: 'left' };
  }
  if (position === 'center') {
    return {
      ...base,
      left: axisPx + hShiftPx,
      transform: 'translate(-50%, -50%)',
      textAlign: 'center',
    };
  }
  /* left: 오른쪽 끝이 축에 닿음. translateX(-100%)로 왼쪽으로 당김 */
  return {
    ...base,
    left: axisPx + hShiftPx,
    transform: `translate(-100%, -50%)`,
    textAlign: 'right',
  };
}

function mapOverlays(
  overlays: OverlayItem[],
  candles: Candle[],
  timeframe: string,
  options?: { useZonePriceRange?: boolean; closeOverlayRange?: { min: number; max: number } }
) {
  const limit = visibleLimit(timeframe);
  const visible = candles.slice(-limit);
  if (visible.length < 2) return [];

  const candleMin = Math.min(...visible.map(c => c.low));
  const candleMax = Math.max(...visible.map(c => c.high));
  const candleRange = Math.max(1e-9, candleMax - candleMin);
  const zoneMin = ZONE_PRICE_FLOOR;
  const zoneMax = ZONE_PRICE_CEIL;
  const zoneRange = Math.max(1e-9, zoneMax - zoneMin);
  const visibleLen = visible.length;
  const baseIdx = candles.length - visibleLen;
  const closeRange = options?.closeOverlayRange;
  const closeRangeSize = closeRange ? Math.max(1e-9, closeRange.max - closeRange.min) : 0;

  const pickTime = (x: number) => {
    const clamped = Math.max(0, Math.min(1, x));
    const idxInVisible = visibleLen <= 1 ? 0 : clamped * (visibleLen - 1);
    const idxInFull = baseIdx + Math.round(idxInVisible);
    const safe = Math.max(0, Math.min(candles.length - 1, idxInFull));
    return candles[safe].time;
  };

  return overlays.map(item => {
    const isCloseLevel = (item as any).id?.startsWith?.('close-');
    const isSwingTapZone = (item as any).id === 'swing-tap-zone';
    const useCloseRange = (isCloseLevel || isSwingTapZone) && closeRange;
    const useZoneRange = !useCloseRange && options?.useZonePriceRange && item.category === 'strongZone';
    const maxP = useCloseRange ? closeRange!.max : useZoneRange ? zoneMax : candleMax;
    const range = useCloseRange ? closeRangeSize : useZoneRange ? zoneRange : candleRange;
    const pickPrice = (y: number) => maxP - y * range;
    const t1 = typeof item.time1 === 'number' ? item.time1 : pickTime(item.x1);
    const p1 = typeof item.price1 === 'number' ? item.price1 : pickPrice(item.y1);
    const t2 =
      typeof item.time2 === 'number'
        ? item.time2
        : typeof item.x2 === 'number'
          ? pickTime(item.x2)
          : undefined;
    const p2 =
      typeof item.price2 === 'number'
        ? item.price2
        : typeof item.y2 === 'number'
          ? pickPrice(item.y2)
          : undefined;
    return {
      ...item,
      time1: t1,
      price1: p1,
      time2: t2,
      price2: p2,
    };
  });
}

function isLineKind(kind: OverlayItem['kind']) {
  return ['supportLine', 'resistanceLine', 'trendLine', 'liquiditySweep', 'bos', 'choch', 'eqh', 'eql', 'scenario', 'equilibrium', 'strongHigh', 'strongLow', 'fibLine', 'harmonic', 'harmonicLeg', 'rsiDivergenceLine', 'symTriangleTarget', 'keyLevel', 'entry', 'stop', 'target'].includes(kind);
}

/** 동일 id 중복 시 마지막 항목만 유지 — 패닝 시 겹침·복제처럼 보이는 원인 방지 */
function dedupeOverlaysById(items: OverlayItem[]): OverlayItem[] {
  const map = new Map<string, OverlayItem>();
  for (const it of items) {
    map.set(it.id, it);
  }
  return Array.from(map.values());
}

const chartThemes = {
  dark: { bg: '#10151D', text: '#c7d2e0', grid: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.08)' },
  light: { bg: '#f5f8fc', text: '#1a2332', grid: 'rgba(0,0,0,0.06)', border: 'rgba(0,0,0,0.12)' },
};

const NEARBY_BARS = 8;

/** TF별 캔들 기간(초) — locked 신호를 상위 TF 캔들에 매핑용 */
function periodSeconds(tf: string): number {
  const map: Record<string, number> = {
    '1m': 60, '3m': 180, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400,
    '1d': 86400, '1w': 604800, '1M': 2592000, '1Y': 31536000,
  };
  return map[tf] ?? 60;
}

const ZONE_KINDS = ['zone', 'fvg', 'ob', 'supplyZone', 'demandZone', 'bprZone', 'reactionZone'];

function formatOverlayPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (p >= 0.01) return p.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  return p.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 8 });
}

const PRICE_BOX_OFFSET_VERTICAL = 6;
const PRICE_AXIS_RESERVE_PX = 80;
const PRICE_STRIP_PADDING_PX = 14;

function toSolidOverlayColor(c: string | undefined): string {
  if (!c) return '#e2e8f0';
  if (c.startsWith('rgba')) return c.replace(/,\s*[\d.]+\)$/, ')').replace('rgba', 'rgb');
  return c;
}

const ChartViewInner = ({
  symbol,
  timeframe,
  analysis,
  setTimeframe,
  onTimeframeChange,
  theme = 'dark',
  snapshotRef,
  onChartPointClick,
  uiMode: uiModeProp = 'FOCUS',
  onUiModeChange: onUiModeChangeProp,
}: {
  symbol: string;
  timeframe: string;
  analysis: AnalyzeResponse | null;
  setTimeframe: (tf: string) => void;
  onTimeframeChange?: (tf: string) => void;
  theme?: 'dark' | 'light';
  snapshotRef?: React.RefObject<ChartSnapshotRef | null>;
  onChartPointClick?: (data: ChartExplainRequest) => void;
  uiMode?: UIMode;
  onUiModeChange?: (mode: UIMode) => void;
}) => {
  const [internalUiMode, setInternalUiMode] = useState<UIMode>('EXECUTION');
  const uiMode = onUiModeChangeProp != null ? uiModeProp : internalUiMode;
  const setUiMode = onUiModeChangeProp ?? setInternalUiMode;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lastFittedRef = useRef<string>('');
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  /** RSI 다이버전스 등 캔들 마커 (lightweight-charts v5 플러그인) */
  const rsiMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  /** 4요소 확정 시 진입·손절·목표 가격선 */
  const executionPriceLinesRef = useRef<unknown[]>([]);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const zoneRangeSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const closeRangeSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const overlayTickDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 차트 스크롤/줌 시 setState 폭주 방지 — 프레임당 1회만 오버레이 좌표 갱신 */
  const overlayRafRef = useRef<number | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [overlayTick, setOverlayTick] = useState(0);
  const [lastUpdate, setLastUpdate] = useState('');
  const [marketError, setMarketError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; req: ChartExplainRequest } | null>(null);
  const [settings, setSettings] = useState(defaultSettings);
  useEffect(() => { setSettings(loadSettings()); }, []);
  const apply = (s: Partial<typeof settings>) => { setSettings(prev => saveSettings({ ...prev, ...s })); };
  const applyModeFeature = (key: keyof typeof effective, value: boolean) => {
    const m = uiMode as SettingsUIMode;
    const next = { ...(settings.modeFeatureOverrides || {}), [m]: { ...(settings.modeFeatureOverrides?.[m] || {}), [key]: value } };
    apply({ modeFeatureOverrides: next });
  };
  const effective = getEffectiveFeatureToggles(settings, uiMode as SettingsUIMode);
  const { showStructure, showZones, showLabels, showScenario, showFib, showRsi, showHarmonic, showPo3, showCandle, showBpr, showVision, showVisionTriangle, showVisionFlag, showVisionWedge, showVisionReversal, showVisionRange, showReactionZone, showWhaleZone } = effective;
  const { overlayLabelEditMode, overlayLabelFontSize, chartScaleFontSize, overlayPriceStripFontSize, overlayLineThickness, translateLabelsToKo, showRsiPanel, showMacdPanel, showBbPanel } = settings;
  const labelEditMode = overlayLabelEditMode;

  const overlays = analysis?.overlays || [];
  const isVisionTriangle = (id: string) => /^vision-(sym|asc|desc)-/.test(id);
  const isVisionFlag = (id: string) => /^vision-(bullflag|bearflag|flag)-/.test(id);
  const isVisionWedge = (id: string) => /^vision-(rw|fw)-/.test(id);
  const isVisionReversal = (id: string) => /^vision-(dt|db|hs|ihs)-/.test(id);
  const isVisionRange = (id: string) => /^vision-(range|chup|chdn)-/.test(id);
  const filteredOverlays = useMemo(() => overlays.filter(item => {
    const cat = (item as any).category;
    if (cat === 'keyLevel') return showStructure;
    if (cat === 'strongZone') return showWhaleZone;
    if (cat === 'patternVision') {
      if (!showVision) return false;
      const baseId = item.id.replace(/-label$/, '').replace(/-zone-\d+$/, '').replace(/-resistance-\d+$/, '').replace(/-support-\d+$/, '').replace(/-neckline-\d+$/, '');
      if (isVisionTriangle(baseId) && !showVisionTriangle) return false;
      if (isVisionFlag(baseId) && !showVisionFlag) return false;
      if (isVisionWedge(baseId) && !showVisionWedge) return false;
      if (isVisionReversal(baseId) && !showVisionReversal) return false;
      if (isVisionRange(baseId) && !showVisionRange) return false;
      return true;
    }
    if (!showLabels && ['entry', 'stop', 'target', 'label', 'poi', 'swingLabel'].includes(item.kind)) {
      const harmonicPoint = item.kind === 'label' && cat === 'harmonic' && showHarmonic;
      if (!harmonicPoint) return false;
    }
    if (!showRsi && (item.kind === 'rsiSignal' || item.kind === 'rsiDivergenceLine' || cat === 'rsi')) return false;
    if (!showStructure && ['supportLine', 'resistanceLine', 'trendLine', 'bos', 'choch', 'liquiditySweep', 'eqh', 'eql', 'equilibrium', 'strongHigh', 'strongLow', 'poi', 'swingLabel', 'symTriangleTarget'].includes(item.kind)) return false;
    if (!showFib && (item.kind === 'fibLine' || cat === 'fib')) return false;
    if (!showHarmonic && (item.kind === 'harmonic' || item.kind === 'harmonicLeg' || cat === 'harmonic')) return false;
    if (!showZones && ['zone', 'fvg', 'ob', 'supplyZone', 'demandZone'].includes(item.kind)) return false;
    if (!showReactionZone && (item.kind === 'reactionZone' || (item as any).category === 'reactionZone')) return false;
    if (!showBpr && (item.kind === 'bprZone' || cat === 'bpr')) return false;
    if (!showPo3 && (item.kind === 'po3Phase' || cat === 'po3')) return false;
    if (!showCandle && (item.kind === 'candlePattern' || cat === 'candle')) return false;
    if (!showScenario && item.kind === 'scenario') return false;
    return true;
  }), [overlays, showStructure, showZones, showLabels, showScenario, showFib, showRsi, showHarmonic, showPo3, showCandle, showBpr, showReactionZone, showWhaleZone, showVision, showVisionTriangle, showVisionFlag, showVisionWedge, showVisionReversal, showVisionRange]);

  const modeFilteredOverlays = useMemo(() => {
    // 실행/타점 모드: 실행 라벨 + 스윙 타점 + 강한 구간
    if (uiMode === 'EXECUTION' || uiMode === 'TAPPOINT') {
      const harmonicXabcd = showHarmonic
        ? overlays.filter(
            (o: any) => o.kind === 'harmonicLeg' || o.kind === 'harmonic' || (o.kind === 'label' && o.category === 'harmonic')
          )
        : [];
      const rsiDivOverlays = showRsi ? overlays.filter((o: any) => o.kind === 'rsiSignal' || o.kind === 'rsiDivergenceLine' || (o.category === 'rsi')) : [];
      const tailongOnly = overlays.filter((item: any) => item.id?.startsWith('tailong-'));
      const breakoutLevel = overlays.filter((item: any) => item.id?.startsWith('key-mustBreak-'));
      const mustHoldSupport = overlays.filter((item: any) => item.id?.startsWith('key-mustHold-'));
      const invalidationLevel = overlays.filter((item: any) => item.id?.startsWith('key-invalidation-'));
      /** 엔진 keyLevel 누락 방지: key-nextTarget 등 key-* 접두사 모두 포함 */
      const otherKeyLevels = overlays.filter((item: any) => item.kind === 'keyLevel' && item.id?.startsWith?.('key-') && !item.id.startsWith('key-mustBreak-') && !item.id.startsWith('key-mustHold-') && !item.id.startsWith('key-invalidation-'));
      const tapPatternLevels = overlays.filter((item: any) => item.id?.startsWith('tap-'));
      const bullishFvg = overlays.filter((item: any) => item.kind === 'fvg');
      const reactionZones = overlays.filter((item: any) => item.kind === 'reactionZone' || (item as any).category === 'reactionZone');
      const bullishOb = overlays.filter((item: any) => item.kind === 'ob');
      const demandSupply = overlays
        .filter((item: any) => (item.kind === 'demandZone' || item.kind === 'supplyZone') && item.id !== 'swing-tap-zone' && item.id !== 'tap-support-zone' && item.id !== 'tap-resistance-zone');
      const closeLevelLines = overlays.filter((item: any) => item.id?.startsWith('close-'));
      const executionLabels = overlays.filter(
        (o: any) =>
          o.id === 'equilibrium' ||
          o.id === 'strong-high' ||
          o.id === 'strong-low' ||
          o.kind === 'liquiditySweep' ||
          o.kind === 'eqh' ||
          o.kind === 'eql' ||
          o.kind === 'supportLine' ||
          o.kind === 'resistanceLine'
      );
      const structureOverlays = showStructure ? overlays.filter((o: any) => o.kind === 'choch' || o.kind === 'bos') : [];
      const swingTapZone = overlays.filter((o: any) => o.id === 'swing-tap-zone');
      const strongZones = showWhaleZone ? (analysis?.strongZoneOverlays ?? []) : [];
      if (uiMode === 'TAPPOINT') {
        const tapFiltered = tapPatternLevels.filter((o: any) => o.id !== 'tap-support-zone' && o.id !== 'tap-resistance-zone');
        return [...swingTapZone, ...strongZones, ...executionLabels, ...structureOverlays, ...tapFiltered, ...breakoutLevel, ...mustHoldSupport, ...invalidationLevel, ...otherKeyLevels, ...closeLevelLines, ...bullishFvg, ...reactionZones, ...demandSupply, ...bullishOb, ...tailongOnly, ...harmonicXabcd, ...rsiDivOverlays];
      }
      return [...executionLabels, ...structureOverlays, ...swingTapZone, ...strongZones, ...tailongOnly, ...breakoutLevel, ...mustHoldSupport, ...invalidationLevel, ...otherKeyLevels, ...closeLevelLines, ...bullishFvg, ...reactionZones, ...demandSupply, ...bullishOb, ...harmonicXabcd, ...rsiDivOverlays];
    }
    if (uiMode === 'FULL') return filteredOverlays.filter((o: any) => o.id !== 'swing-tap-zone');
    const strong = showWhaleZone ? (analysis?.strongZoneOverlays ?? []) : [];
    if (uiMode === 'FOCUS') {
      const focusList = strong.length ? [...strong, ...filteredOverlays] : filteredOverlays;
      return focusList.filter((o: any) => o.id !== 'swing-tap-zone');
    }
    return [];
  }, [uiMode, filteredOverlays, overlays, analysis?.strongZoneOverlays, showWhaleZone, showHarmonic, showRsi, showStructure]);

  const modeFilteredOverlaysDeduped = useMemo(
    () => dedupeOverlaysById(modeFilteredOverlays),
    [modeFilteredOverlays]
  );

  const hasStrongZones = (analysis?.strongZoneOverlays?.length ?? 0) > 0;
  const useZoneRange = (uiMode === 'FOCUS' && showWhaleZone) && hasStrongZones;
  /** 분석에 사용된 캔들이 있으면 우선 사용 — 각 TF별 오버레이를 차트 캔들에 정밀 매칭 */
  const candlesForOverlay = useMemo(() => {
    const ac = (analysis as { candles?: Candle[]; symbol?: string; timeframe?: string } | null)?.candles;
    if (ac?.length && analysis?.symbol === symbol && analysis?.timeframe === timeframe) return ac;
    return candles;
  }, [analysis, symbol, timeframe, candles]);
  const anchored = useMemo(
    () =>
      candlesForOverlay.length
        ? mapOverlays(modeFilteredOverlaysDeduped, candlesForOverlay, timeframe, {
            useZonePriceRange: useZoneRange,
            closeOverlayRange: (analysis as any)?.closeOverlayRange,
          })
        : [],
    [modeFilteredOverlaysDeduped, candlesForOverlay, timeframe, useZoneRange, analysis]
  );

  const [executionPositions, setExecutionPositions] = useState<ExecutionPositions | null>(null);
  useEffect(() => {
    if ((uiMode !== 'EXECUTION' && uiMode !== 'TAPPOINT') || !analysis || !chartRef.current || !seriesRef.current || !hostRef.current || !candles.length) {
      setExecutionPositions(null);
      return;
    }
    const chart = chartRef.current;
    const series = seriesRef.current;
    const lastTime = candles[candles.length - 1].time;
    const xCoord = chart.timeScale().timeToCoordinate(lastTime as UTCTimestamp);
    if (xCoord == null) { setExecutionPositions(null); return; }
    const x = Number(xCoord);
    const pad = 60;
    const rect = hostRef.current.getBoundingClientRect();
    const xStart = Math.max(pad, x - 80);
    const xEnd = Math.min(rect.width - pad, x + 40);
    const entry = parseFloat(analysis.entry);
    const stop = parseFloat(analysis.stopLoss);
    const targets = (analysis.targets || []).slice(0, 3).map(t => parseFloat(String(t))).filter(n => !isNaN(n));
    if (isNaN(entry) || isNaN(stop)) { setExecutionPositions(null); return; }
    const entryY = series.priceToCoordinate(entry);
    const stopY = series.priceToCoordinate(stop);
    const tpY = targets.map(t => series.priceToCoordinate(t)).filter(y => y != null).map(y => Number(y));
    if (entryY == null || stopY == null) { setExecutionPositions(null); return; }
    setExecutionPositions({
      entryY: Number(entryY),
      stopY: Number(stopY),
      tpY,
      xStart,
      xEnd,
      entryPrice: entry,
      stopPrice: stop,
      tpPrices: targets,
      isLong: analysis.verdict === 'LONG',
    });
  }, [uiMode, analysis, candles, overlayTick]);

  /** 4요소 확정 시 진입·손절·목표 가격선 — 차트 전역 가로선으로 표시 */
  useEffect(() => {
    const series = seriesRef.current;
    const lines = executionPriceLinesRef.current;
    const prev = [...lines];
    lines.length = 0;
    prev.forEach((line) => {
      try {
        (series as any)?.removePriceLine?.(line);
      } catch {}
    });

    const confirmed = (analysis as { confirmedSignal?: { confirmed?: boolean; direction?: string }; symbol?: string; timeframe?: string })?.confirmedSignal;
    const match = analysis && (analysis as { symbol?: string; timeframe?: string }).symbol === symbol && (analysis as { symbol?: string; timeframe?: string }).timeframe === timeframe;
    if (!series || !match || !confirmed?.confirmed || !analysis) return;

    const entry = parseFloat(String(analysis.entry ?? ''));
    const stop = parseFloat(String(analysis.stopLoss ?? ''));
    const targets = (analysis.targets ?? []).slice(0, 3).map((t) => parseFloat(String(t))).filter((n) => !isNaN(n));
    if (isNaN(entry) || isNaN(stop) || entry <= 0 || stop <= 0) return;

    const isLong = confirmed.direction === 'LONG';
    const entryColor = isLong ? '#22C55E' : '#EF4444';
    const stopColor = '#EF4444';
    const tpColor = '#22C55E';

    const add = (price: number, title: string, color: string) => {
      try {
        const line = (series as any).createPriceLine({ price, color, title, lineWidth: 2 });
        lines.push(line);
      } catch {}
    };

    add(entry, `진입 ${entry.toLocaleString()}`, entryColor);
    add(stop, `손절 ${stop.toLocaleString()}`, stopColor);
    targets.forEach((t, i) => add(t, `목표${i + 1} ${t.toLocaleString()}`, tpColor));

    return () => {
      lines.forEach((line) => {
        try {
          (series as any)?.removePriceLine?.(line);
        } catch {}
      });
      lines.length = 0;
    };
  }, [analysis, symbol, timeframe]);

  const screenOverlays = useMemo(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const host = hostRef.current;
    if (!chart || !series || !candles.length || !host) return [];
    const rect = host.getBoundingClientRect();
    const pad = 20;
    const priceStripRight = rect.width - PRICE_AXIS_RESERVE_PX - PRICE_STRIP_PADDING_PX;
    const ts = chart.timeScale();
    const tAt0 = ts.coordinateToTime(0) as { timestamp?: number } | number | null;
    const tAtW = ts.coordinateToTime(rect.width) as { timestamp?: number } | number | null;
    const tMin = tAt0 != null ? (typeof tAt0 === 'object' ? tAt0.timestamp : tAt0) : null;
    const tMax = tAtW != null ? (typeof tAtW === 'object' ? tAtW.timestamp : tAtW) : null;
    const resolveX = (t: number): number => {
      const raw = ts.timeToCoordinate(t as UTCTimestamp);
      if (raw != null) return Number(raw);
      if (tMin != null && tMax != null && tMax > tMin) {
        if (t <= tMin) return 0;
        if (t >= tMax) return rect.width;
        return Math.max(0, Math.min(rect.width, pad + (rect.width - 2 * pad) * (t - tMin) / (tMax - tMin)));
      }
      return rect.width / 2;
    };
    /** coordinateToTime / 캔들.time 과 동일 단위 (기존 tMin·resolveX와 맞춤) */
    const extractTime = (t: unknown): number | null => {
      if (t == null) return null;
      if (typeof t === 'number' && !Number.isNaN(t)) return t;
      if (typeof t === 'object' && t !== null && 'timestamp' in t) {
        const v = (t as { timestamp?: number }).timestamp;
        return typeof v === 'number' && !Number.isNaN(v) ? v : null;
      }
      return null;
    };
    const items = anchored.flatMap((item: any) => {
      let x1 = resolveX(item.time1);
      const y1Raw = series.priceToCoordinate(item.price1);
      let y1 = y1Raw != null ? Number(y1Raw) : rect.height / 2;
      let x2: number | null = item.time2 != null ? resolveX(item.time2) : null;
      const y2Raw = typeof item.price2 === 'number' ? series.priceToCoordinate(item.price2) : null;
      let y2 = y2Raw != null ? Number(y2Raw) : null;
      // 확대/축소 시에도 표시 유지: 화면 밖이면 끝으로 클램프 (생략하지 않음)
      x1 = Math.max(0, Math.min(rect.width, x1));
      if (x2 != null) x2 = Math.max(0, Math.min(rect.width, x2));
      y1 = Math.max(0, Math.min(rect.height, y1));
      if (y2 != null) y2 = Math.max(0, Math.min(rect.height, y2));
      const isZone = ['zone', 'fvg', 'ob', 'supplyZone', 'demandZone', 'bprZone', 'reactionZone'].includes(item.kind);
      const isLine = isLineKind(item.kind);
      const extendToRight = isZone || isLine;
      const xMaxRight = extendToRight ? rect.width - pad : (x2 ?? x1);
      // 추세선: 픽셀 선형 보간 대신 (시간,가격) 직선 → 우측 끝 가격으로 변환 (로그축·가격축과 일치, 똑바른 작도)
      if (
        isLine &&
        typeof item.time1 === 'number' &&
        typeof item.time2 === 'number' &&
        typeof item.price1 === 'number' &&
        typeof item.price2 === 'number' &&
        Math.abs(item.time2 - item.time1) > 1e-9
      ) {
        const tEdgeRaw = ts.coordinateToTime(xMaxRight as UTCTimestamp);
        const tEdge = extractTime(tEdgeRaw);
        if (tEdge != null) {
          const { time1: t1, time2: t2, price1: p1, price2: p2 } = item;
          const pEdge = p1 + (p2 - p1) * (tEdge - t1) / (t2 - t1);
          const yExt = series.priceToCoordinate(pEdge);
          if (yExt != null) {
            x2 = xMaxRight;
            y2 = Number(yExt);
          }
        }
      }
      return [{
        ...item,
        x1,
        y1,
        x2: isZone ? xMaxRight : x2,
        y2,
        xMaxRight,
        priceStripRight,
        chartWidth: rect.width,
        chartHeight: rect.height,
      }];
    });
    return items;
  }, [anchored, candles, overlayTick]);

  const OVERLAY_OFFSETS_KEY = 'ailongshort-overlay-offsets';
  const [overlayOffsets, setOverlayOffsets] = useState<Record<string, { dx: number; dy: number }>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(OVERLAY_OFFSETS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const NUDGE = 6;

  const OVERLAY_FONT_SIZES_KEY = 'ailongshort-overlay-font-sizes';
  const DEFAULT_FONT_SIZE = 11;
  const [overlayFontSizes, setOverlayFontSizes] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(OVERLAY_FONT_SIZES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const getFontSize = (id: string) => overlayFontSizes[id] ?? (overlayLabelFontSize ?? DEFAULT_FONT_SIZE);
  const getLineStrokeWidth = (item: any) => {
    if (item?.id?.startsWith?.('tap-')) return overlayLineThickness === 'thin' ? 2 : overlayLineThickness === 'thick' ? 4 : 3;
    return overlayLineThickness === 'thin' ? 1 : overlayLineThickness === 'thick' ? 3 : (item.kind === 'scenario' ? 2.5 : 2);
  };
  const setFontSize = (id: string, delta: number) => {
    setOverlayFontSizes(prev => {
      const next = { ...prev, [id]: Math.max(8, Math.min(24, (prev[id] ?? DEFAULT_FONT_SIZE) + delta)) };
      try { window.localStorage.setItem(OVERLAY_FONT_SIZES_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setOverlayTick(v => v + 1);
  };
  const setFontSizeValue = (id: string, value: number) => {
    const v = Math.max(8, Math.min(24, value));
    setOverlayFontSizes(prev => {
      const next = { ...prev, [id]: v };
      try { window.localStorage.setItem(OVERLAY_FONT_SIZES_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setOverlayTick(t => t + 1);
  };

  type LabelAlign = 'left' | 'center' | 'right';
  const OVERLAY_FONT_FAMILY_KEY = 'ailongshort-overlay-font-family';
  const OVERLAY_LABEL_ALIGN_KEY = 'ailongshort-overlay-label-align';
  const [overlayFontFamily, setOverlayFontFamilyState] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try { const raw = window.localStorage.getItem(OVERLAY_FONT_FAMILY_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  });
  const [overlayLabelAlign, setOverlayLabelAlignState] = useState<Record<string, LabelAlign>>(() => {
    if (typeof window === 'undefined') return {};
    try { const raw = window.localStorage.getItem(OVERLAY_LABEL_ALIGN_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  });
  const OVERLAY_LABEL_H_SHIFT_KEY = 'ailongshort-overlay-label-h-shift';
  const LABEL_H_SHIFT_MIN = -200;
  const LABEL_H_SHIFT_MAX = 200;
  const [overlayLabelHShift, setOverlayLabelHShiftState] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(OVERLAY_LABEL_H_SHIFT_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const getFontFamily = (id: string) => overlayFontFamily[id] ?? '';
  const getLabelAlign = (id: string): LabelAlign => overlayLabelAlign[id] ?? 'left';
  const getLabelHShift = (id: string) => overlayLabelHShift[id] ?? 0;
  const setFontFamily = (id: string, font: string) => {
    setOverlayFontFamilyState(prev => {
      const next = font ? { ...prev, [id]: font } : (() => { const p = { ...prev }; delete p[id]; return p; })();
      try { window.localStorage.setItem(OVERLAY_FONT_FAMILY_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setOverlayTick(v => v + 1);
  };
  const setLabelAlign = (id: string, align: LabelAlign) => {
    setOverlayLabelAlignState(prev => {
      const next = { ...prev, [id]: align };
      try { window.localStorage.setItem(OVERLAY_LABEL_ALIGN_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setOverlayTick(v => v + 1);
  };
  const setLabelHShift = (id: string, value: number) => {
    const v = Math.max(LABEL_H_SHIFT_MIN, Math.min(LABEL_H_SHIFT_MAX, Math.round(value)));
    setOverlayLabelHShiftState(prev => {
      const next = { ...prev };
      if (v === 0) delete next[id];
      else next[id] = v;
      try { window.localStorage.setItem(OVERLAY_LABEL_H_SHIFT_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setOverlayTick(x => x + 1);
  };

  /** 개별 라벨 ON/OFF — OFF면 차트에서 숨김 */
  const OVERLAY_HIDDEN_IDS_KEY = 'ailongshort-overlay-hidden-ids';
  const [hiddenOverlayIds, setHiddenOverlayIdsState] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = window.localStorage.getItem(OVERLAY_HIDDEN_IDS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  });
  const isOverlayVisible = (id: string) => !hiddenOverlayIds.has(id);
  const setOverlayVisible = (id: string, visible: boolean) => {
    setHiddenOverlayIdsState(prev => {
      const next = new Set(prev);
      if (visible) next.delete(id);
      else next.add(id);
      try { window.localStorage.setItem(OVERLAY_HIDDEN_IDS_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
    setOverlayTick(v => v + 1);
  };
  /** 차트에 실제로 그릴 오버레이 (숨김 처리된 것 제외) */
  const visibleScreenOverlays = useMemo(
    () => screenOverlays.filter((o: any) => !hiddenOverlayIds.has(o.id)),
    [screenOverlays, hiddenOverlayIds]
  );

  type PriceDisplayPosition = 'left' | 'center' | 'right';
  const OVERLAY_PRICE_POSITION_KEY = 'ailongshort-overlay-price-position';
  const [priceDisplayPosition, setPriceDisplayPositionState] = useState<PriceDisplayPosition>(() => {
    if (typeof window === 'undefined') return 'left';
    try {
      const raw = window.localStorage.getItem(OVERLAY_PRICE_POSITION_KEY);
      if (raw === 'center' || raw === 'left' || raw === 'right') return raw;
    } catch {}
    return 'left';
  });
  const setPriceDisplayPosition = (pos: PriceDisplayPosition) => {
    setPriceDisplayPositionState(pos);
    try { window.localStorage.setItem(OVERLAY_PRICE_POSITION_KEY, pos); } catch {}
    setOverlayTick(v => v + 1);
  };

  const OVERLAY_PRICE_H_SHIFT_KEY = 'ailongshort-overlay-price-h-shift';
  const [priceDisplayHShift, setPriceDisplayHShiftState] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const raw = window.localStorage.getItem(OVERLAY_PRICE_H_SHIFT_KEY);
      const n = raw != null ? parseInt(raw, 10) : 0;
      return Number.isFinite(n) ? Math.max(-200, Math.min(200, n)) : 0;
    } catch {
      return 0;
    }
  });
  const setPriceDisplayHShift = (value: number) => {
    const v = Math.max(-200, Math.min(200, Math.round(value)));
    setPriceDisplayHShiftState(v);
    try {
      if (v === 0) window.localStorage.removeItem(OVERLAY_PRICE_H_SHIFT_KEY);
      else window.localStorage.setItem(OVERLAY_PRICE_H_SHIFT_KEY, String(v));
    } catch {}
    setOverlayTick(x => x + 1);
  };

  /** 종가 마감선(close-1m ~ close-monthly) 축 옆 가격만 — 일반 키레벨·타점과 분리 */
  const CLOSE_STRIP_POSITION_KEY = 'ailongshort-close-strip-position';
  const CLOSE_STRIP_H_SHIFT_KEY = 'ailongshort-close-strip-h-shift';
  const [closeStripPosition, setCloseStripPositionState] = useState<PriceDisplayPosition>(() => {
    if (typeof window === 'undefined') return 'left';
    try {
      const raw = window.localStorage.getItem(CLOSE_STRIP_POSITION_KEY);
      if (raw === 'center' || raw === 'left' || raw === 'right') return raw;
    } catch {}
    return 'left';
  });
  const setCloseStripPosition = (pos: PriceDisplayPosition) => {
    setCloseStripPositionState(pos);
    try { window.localStorage.setItem(CLOSE_STRIP_POSITION_KEY, pos); } catch {}
    setOverlayTick(v => v + 1);
  };
  const [closeStripHShift, setCloseStripHShiftState] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const raw = window.localStorage.getItem(CLOSE_STRIP_H_SHIFT_KEY);
      const n = raw != null ? parseInt(raw, 10) : 0;
      return Number.isFinite(n) ? Math.max(-200, Math.min(200, n)) : 0;
    } catch {
      return 0;
    }
  });
  const setCloseStripHShift = (value: number) => {
    const v = Math.max(-200, Math.min(200, Math.round(value)));
    setCloseStripHShiftState(v);
    try {
      if (v === 0) window.localStorage.removeItem(CLOSE_STRIP_H_SHIFT_KEY);
      else window.localStorage.setItem(CLOSE_STRIP_H_SHIFT_KEY, String(v));
    } catch {}
    setOverlayTick(x => x + 1);
  };

  const [labelMenuOpen, setLabelMenuOpen] = useState(false);

  const CHART_PAD = 20;
  const DRAG_DY_MAX = 300;
  type DragState = { id: string; startClientX: number; startClientY: number; startDx: number; startDy: number; baseLeft: number; xMaxRight: number; currentDx: number; currentDy: number };
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const didDragRef = useRef(false);
  dragStateRef.current = dragState;

  useEffect(() => {
    if (!dragState) return;
    const onMove = (e: MouseEvent) => {
      setDragState(prev => {
        if (!prev) return null;
        const dx = prev.startDx + (e.clientX - prev.startClientX);
        const minDx = CHART_PAD - prev.baseLeft;
        const maxDx = prev.xMaxRight - prev.baseLeft - 60;
        const clampedDx = Math.max(minDx, Math.min(maxDx, dx));
        const dy = prev.startDy + (e.clientY - prev.startClientY);
        const clampedDy = Math.max(-DRAG_DY_MAX, Math.min(DRAG_DY_MAX, dy));
        return { ...prev, currentDx: clampedDx, currentDy: clampedDy };
      });
    };
    const onUp = () => {
      const d = dragStateRef.current;
      if (d) {
        didDragRef.current = Math.abs(d.currentDx - d.startDx) > 2 || Math.abs(d.currentDy - d.startDy) > 2;
        setOverlayOffsets(prev => {
          const next = { ...prev, [d.id]: { dx: d.currentDx, dy: d.currentDy } };
          try { window.localStorage.setItem(OVERLAY_OFFSETS_KEY, JSON.stringify(next)); } catch {}
          return next;
        });
        setOverlayTick(v => v + 1);
      } else didDragRef.current = false;
      setDragState(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [!!dragState]);

  const setOffset = (id: string, dxDelta: number, dyDelta: number) => {
    setOverlayOffsets(prev => {
      const next = { ...prev, [id]: { dx: (prev[id]?.dx ?? 0) + dxDelta, dy: (prev[id]?.dy ?? 0) + dyDelta } };
      try { window.localStorage.setItem(OVERLAY_OFFSETS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setOverlayTick(v => v + 1);
  };

  const startLabelDrag = (id: string, baseLeft: number, xMaxRight: number, currentOff: { dx: number; dy: number }, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragState({
      id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startDx: currentOff.dx,
      startDy: currentOff.dy,
      baseLeft,
      xMaxRight,
      currentDx: currentOff.dx,
      currentDy: currentOff.dy,
    });
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const th = chartThemes[theme];
    const scaleFs =
      typeof window !== 'undefined'
        ? (loadSettings().chartScaleFontSize ?? defaultSettings.chartScaleFontSize)
        : defaultSettings.chartScaleFontSize;
    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { color: th.bg },
        textColor: th.text,
        fontSize: Math.max(10, Math.min(18, scaleFs)),
      },
      grid: {
        vertLines: { color: th.grid },
        horzLines: { color: th.grid }
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: th.border,
        scaleMargins: { top: 0.10, bottom: 0.22 }
      },
      timeScale: {
        borderColor: th.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: true
      }
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: CHART_CANDLE.up,
      downColor: CHART_CANDLE.down,
      borderVisible: false,
      wickUpColor: CHART_CANDLE.up,
      wickDownColor: CHART_CANDLE.down
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      color: CHART_CANDLE.volumeUp
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeRef.current = volume;
    rsiMarkersRef.current?.detach();
    rsiMarkersRef.current = createSeriesMarkers(series, []);

    const scheduleOverlayRefresh = () => {
      if (overlayRafRef.current != null) return;
      overlayRafRef.current = requestAnimationFrame(() => {
        overlayRafRef.current = null;
        setOverlayTick(v => v + 1);
      });
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleOverlayRefresh);
    const ro = new ResizeObserver(scheduleOverlayRefresh);
    ro.observe(host);

    return () => {
      if (overlayRafRef.current != null) {
        cancelAnimationFrame(overlayRafRef.current);
        overlayRafRef.current = null;
      }
      ro.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleOverlayRefresh);
      zoneRangeSeriesRef.current = null;
      closeRangeSeriesRef.current = null;
      rsiMarkersRef.current?.detach();
      rsiMarkersRef.current = null;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const th = chartThemes[theme];
    const isDayOrWeek = timeframe === '1d' || timeframe === '1w';
    const formatUtcDate = (t: number) => {
      const d = new Date(t * 1000);
      const y = d.getUTCFullYear();
      const M = d.getUTCMonth() + 1;
      const day = d.getUTCDate();
      return `${y}-${String(M).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    };
    const tickMarkFormatter = isDayOrWeek
      ? (time: unknown, tickMarkType: TickMarkType) => {
          const ts = typeof time === 'number' ? time : (time as { timestamp?: number })?.timestamp;
          if (typeof ts !== 'number') return null;
          const d = new Date(ts * 1000);
          const y = d.getUTCFullYear();
          const M = d.getUTCMonth() + 1;
          const day = d.getUTCDate();
          if (tickMarkType === TickMarkType.Year) return String(y);
          if (tickMarkType === TickMarkType.Month) return `${y}-${String(M).padStart(2, '0')}`;
          return `${M}/${day}`;
        }
      : undefined;
    const opts: Parameters<typeof chart.applyOptions>[0] = {
      layout: {
        background: { color: th.bg },
        textColor: th.text,
        fontSize: Math.max(10, Math.min(18, chartScaleFontSize)),
      },
      grid: { vertLines: { color: th.grid }, horzLines: { color: th.grid } },
      rightPriceScale: { borderColor: th.border },
      timeScale: {
        borderColor: th.border,
        tickMarkFormatter: tickMarkFormatter ?? undefined,
      },
    };
    if (isDayOrWeek) {
      (opts as any).localization = {
        timeFormatter: (time: unknown) => {
          const ts = typeof time === 'number' ? time : (time as { timestamp?: number })?.timestamp;
          if (typeof ts !== 'number') return '';
          return formatUtcDate(ts);
        },
        dateFormat: 'yyyy-MM-dd',
      };
    }
    chart.applyOptions(opts);
  }, [theme, timeframe, chartScaleFontSize]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length < 2) return;
    if (useZoneRange) {
      if (!zoneRangeSeriesRef.current) {
        const lineSeries = chart.addSeries(LineSeries, {
          color: 'rgba(0,0,0,0)',
          lineWidth: 1,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        });
        zoneRangeSeriesRef.current = lineSeries;
      }
      const rangeData: LineData<UTCTimestamp>[] = [
        { time: candles[0].time as UTCTimestamp, value: ZONE_PRICE_CEIL },
        { time: candles[candles.length - 1].time as UTCTimestamp, value: ZONE_PRICE_FLOOR },
      ];
      zoneRangeSeriesRef.current.setData(rangeData);
    } else {
      if (zoneRangeSeriesRef.current) {
        chart.removeSeries(zoneRangeSeriesRef.current);
        zoneRangeSeriesRef.current = null;
      }
    }
  }, [useZoneRange, candles]);

  const closeOverlayRange = (analysis as any)?.closeOverlayRange as { min: number; max: number } | undefined;
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length < 2) return;
    const inExecutionWithRange = (uiMode === 'EXECUTION' || uiMode === 'TAPPOINT') && closeOverlayRange;
    if (inExecutionWithRange) {
      if (!closeRangeSeriesRef.current) {
        const lineSeries = chart.addSeries(LineSeries, {
          color: 'rgba(0,0,0,0)',
          lineWidth: 1,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        });
        closeRangeSeriesRef.current = lineSeries;
      }
      const rangeData: LineData<UTCTimestamp>[] = [
        { time: candles[0].time as UTCTimestamp, value: closeOverlayRange.min },
        { time: candles[candles.length - 1].time as UTCTimestamp, value: closeOverlayRange.max },
      ];
      closeRangeSeriesRef.current.setData(rangeData);
    } else {
      if (closeRangeSeriesRef.current) {
        chart.removeSeries(closeRangeSeriesRef.current);
        closeRangeSeriesRef.current = null;
      }
    }
  }, [uiMode, closeOverlayRange?.min, closeOverlayRange?.max, candles]);

  /** L/S 캔들 마커: 4요소 확정 시 표시. 한번 뜬 신호는 스크롤·TF 전환해도 해당 캔들에 유지 */
  const lockedSignalsRef = useRef<Map<number, 'LONG' | 'SHORT'>>(new Map());
  const rsiOnlySignalsRef = useRef<Map<number, 'LONG' | 'SHORT'>>(new Map());
  const lastSymbolRef = useRef('');
  useEffect(() => {
    const markersApi = rsiMarkersRef.current;
    if (!markersApi || candles.length === 0) {
      if (markersApi) markersApi.setMarkers([]);
      return;
    }
    const locked = lockedSignalsRef.current;
    if (lastSymbolRef.current !== symbol) {
      locked.clear();
      rsiOnlySignalsRef.current.clear();
      lastSymbolRef.current = symbol;
    }

    const analysisMatches = analysis && (analysis as { symbol?: string; timeframe?: string }).symbol === symbol && (analysis as { symbol?: string; timeframe?: string }).timeframe === timeframe;
    const ac = (analysis as { candles?: Candle[] })?.candles;
    const signalCandles = analysisMatches && ac?.length ? ac : candles;
    const signalLastTime = signalCandles[signalCandles.length - 1]?.time as number;
    if (signalLastTime == null) {
      markersApi.setMarkers([]);
      return;
    }

    const rsiOnly = rsiOnlySignalsRef.current;
    if (!analysisMatches) {
      locked.clear();
      rsiOnly.clear();
    } else {
      // 현재 분석 기준으로만 표시 — 이전 확정이 사라졌으면 마커 제거
      locked.clear();
      rsiOnly.clear();
      const confirmed = (analysis as { confirmedSignal?: { confirmed: boolean; direction: 'LONG' | 'SHORT' | null } }).confirmedSignal;
      const sig = (analysis as { rsiDivergenceSignal?: { verdict: 'LONG' | 'SHORT' | 'WATCH' | 'NONE'; signalBarTime?: number; totalScore?: number } }).rsiDivergenceSignal;
      const isConfirmed = Boolean(confirmed?.confirmed && confirmed?.direction);
      const direction = confirmed?.direction;
      const barTime = (sig?.signalBarTime != null && candles.some((c) => (c.time as number) === sig.signalBarTime)) ? sig.signalBarTime : signalLastTime;
      if (isConfirmed && direction && candles.some((c) => (c.time as number) === barTime)) {
        locked.set(barTime, direction);
      } else if (sig && (sig.verdict === 'LONG' || sig.verdict === 'SHORT') && (sig.totalScore ?? 0) >= RSI_SWING_LS_THRESHOLD) {
        const rsiBarTime = sig.signalBarTime ?? signalLastTime;
        if (candles.some((c) => (c.time as number) === rsiBarTime)) {
          rsiOnly.set(rsiBarTime, sig.verdict);
        }
      }
    }

    const period = periodSeconds(timeframe);
    const markers: Array<{ time: UTCTimestamp; position: 'aboveBar' | 'belowBar'; shape: 'arrowUp' | 'arrowDown' | 'circle'; color: string; text: string }> = [];
    for (const c of candles) {
      const t = c.time as number;
      const rangeEnd = t + period;
      let v: 'LONG' | 'SHORT' | undefined;
      let isConfirmedBar = false;
      for (const [lockedTime, dir] of locked) {
        if (t <= lockedTime && lockedTime < rangeEnd) {
          v = dir;
          isConfirmedBar = true;
          break;
        }
      }
      if (!v) {
        for (const [rsiTime, dir] of rsiOnly) {
          if (t <= rsiTime && rsiTime < rangeEnd) {
            v = dir;
            break;
          }
        }
      }
      if (v === 'LONG') {
        if (isConfirmedBar) {
          markers.push({ time: t as UTCTimestamp, position: 'belowBar', shape: 'arrowUp', color: '#22C55E', text: '🐂' });
        } else {
          markers.push({ time: t as UTCTimestamp, position: 'belowBar', shape: 'arrowUp', color: '#22C55E', text: 'L' });
        }
      } else if (v === 'SHORT') {
        if (isConfirmedBar) {
          markers.push({ time: t as UTCTimestamp, position: 'aboveBar', shape: 'arrowDown', color: '#EF4444', text: '🐻' });
        } else {
          markers.push({ time: t as UTCTimestamp, position: 'aboveBar', shape: 'arrowDown', color: '#EF4444', text: 'S' });
        }
      }
    }
    if (locked.size > 200) {
      const times = [...locked.keys()].sort((a, b) => a - b);
      for (let i = 0; i < times.length - 150; i++) locked.delete(times[i]);
    }
    markersApi.setMarkers(markers);
  }, [analysis, candles, symbol, timeframe]);

  useEffect(() => {
    let cancelled = false;
    async function loadCandles() {
      try {
        const res = await fetchWithRetry(`/api/market?symbol=${symbol}&timeframe=${timeframe}`, { cache: 'no-store', credentials: 'same-origin' });
        const payload = await res.json();
        if (cancelled) return;
        if (!payload.ok) throw new Error(payload.error || 'market fetch failed');
        const nextCandles = payload.candles as Candle[];
        setMarketError('');
        setCandles(nextCandles);

        seriesRef.current?.setData(nextCandles.map((x): CandlestickData<UTCTimestamp> => ({
          time: x.time as UTCTimestamp,
          open: x.open,
          high: x.high,
          low: x.low,
          close: x.close
        })));

        volumeRef.current?.setData(nextCandles.map((x): HistogramData<UTCTimestamp> => ({
          time: x.time as UTCTimestamp,
          value: x.volume || 0,
          color: x.close >= x.open ? CHART_CANDLE.volumeUp : CHART_CANDLE.volumeDown
        })));

        const key = `${symbol}|${timeframe}`;
        if (lastFittedRef.current !== key) {
          lastFittedRef.current = key;
          chartRef.current?.timeScale().fitContent();
        }
        setLastUpdate(new Date().toLocaleTimeString('ko-KR', { hour12: false }));
        setOverlayTick(v => v + 1);
      } catch (e: any) {
        if (!cancelled) setMarketError(e?.message || 'market error');
      }
    }

    loadCandles();
    const timer = window.setInterval(loadCandles, 7000);

    const canWs = !['1M', '1Y'].includes(timeframe);
    const unsub = canWs ? subscribeWs(symbol, timeframe, ({ candle }) => {
      if (cancelled) return;
      setCandles(prev => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (last.time === candle.time) {
          const next = [...prev];
          next[next.length - 1] = candle;
          seriesRef.current?.update({ time: candle.time as any, open: candle.open, high: candle.high, low: candle.low, close: candle.close });
          volumeRef.current?.update({ time: candle.time as any, value: candle.volume, color: candle.close >= candle.open ? CHART_CANDLE.volumeUp : CHART_CANDLE.volumeDown });
          return next;
        }
        if (candle.time > last.time) {
          seriesRef.current?.update({ time: candle.time as any, open: candle.open, high: candle.high, low: candle.low, close: candle.close });
          volumeRef.current?.update({ time: candle.time as any, value: candle.volume, color: candle.close >= candle.open ? CHART_CANDLE.volumeUp : CHART_CANDLE.volumeDown });
          return [...prev, candle];
        }
        return prev;
      });
      if (overlayTickDebounceRef.current) clearTimeout(overlayTickDebounceRef.current);
      overlayTickDebounceRef.current = setTimeout(() => {
        overlayTickDebounceRef.current = null;
        setOverlayTick(v => v + 1);
      }, 400);
    }) : () => {};

    return () => {
        cancelled = true;
        window.clearInterval(timer);
        unsub();
        if (overlayTickDebounceRef.current) {
          clearTimeout(overlayTickDebounceRef.current);
          overlayTickDebounceRef.current = null;
        }
      };
  }, [symbol, timeframe]);

  useImperativeHandle(snapshotRef, () => ({
    getSnapshot: () => {
      const host = hostRef.current;
      if (!host) return null;
      const canvas = host.querySelector('canvas');
      if (!canvas) return null;
      try {
        return canvas.toDataURL('image/png');
      } catch {
        return null;
      }
    },
  }), []);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!onChartPointClick || !series || !chart || !candles.length) return;
    const limit = visibleLimit(timeframe);
    const visibleLen = Math.min(limit, candles.length);
    const baseIdx = candles.length - visibleLen;

    const buildRequest = (barTime: number): ChartExplainRequest | null => {
      const idx = candles.findIndex(c => c.time === barTime);
      if (idx < 0) return null;
      const c = candles[idx];
      const visibleIndex = idx - baseIdx;
      const engine = analysis?.engine as Record<string, any> | undefined;
      const filterNearby = (arr: Array<{ index: number } | undefined> | undefined, key: string) => {
        const a = (engine?.[key] ?? []) as Array<{ index: number; [k: string]: any }>;
        return a.filter((x: any) => Math.abs((x.index ?? 0) - visibleIndex) <= NEARBY_BARS);
      };
      return {
        symbol,
        timeframe,
        candleData: {
          timestamp: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume ?? 0,
          candleIndex: idx,
        },
        engineData: {
          bos: filterNearby(engine?.bos, 'bos') as any,
          choch: filterNearby(engine?.choch, 'choch') as any,
          fvgNearby: filterNearby(engine?.fvg, 'fvg') as any,
          obNearby: filterNearby(engine?.obs, 'obs') as any,
          sweep: filterNearby(engine?.sweeps, 'sweeps') as any,
          eqh: filterNearby(engine?.eqh, 'eqh') as any,
          eql: filterNearby(engine?.eql, 'eql') as any,
        },
      };
    };

    const handler = (param: { time?: number; seriesData?: Map<unknown, { time?: number }> }) => {
      const t = param?.time ?? (series && param?.seriesData?.get?.(series as any)?.time);
      if (t == null) return;
      const req = buildRequest(typeof t === 'number' ? t : (t as any));
      if (req) onChartPointClick(req);
    };
    chart.subscribeClick(handler as any);
    return () => chart.unsubscribeClick(handler as any);
  }, [symbol, timeframe, candles, analysis?.engine, onChartPointClick]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = async () => {
    const el = frameRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) await document.exitFullscreen();
    else await el.requestFullscreen();
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hostRef.current || !chartRef.current || !candles.length) return;
    e.preventDefault();
    const chart = chartRef.current;
    const rect = hostRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = chart.timeScale().coordinateToTime(x);
    if (t == null) return;
    const barTime = typeof t === 'number' ? t : (t as any).timestamp ?? t;
    const limit = visibleLimit(timeframe);
    const baseIdx = Math.max(0, candles.length - Math.min(limit, candles.length));
    const idx = candles.findIndex(c => c.time >= barTime);
    const candleIndex = idx >= 0 ? idx : candles.length - 1;
    const c = candles[candleIndex];
    if (!c) return;
    const visibleIndex = candleIndex - baseIdx;
    const engine = analysis?.engine as Record<string, any> | undefined;
    const filterNearby = (arr: any[] | undefined) => (arr ?? []).filter((x: any) => Math.abs((x.index ?? 0) - visibleIndex) <= NEARBY_BARS);
    const req: ChartExplainRequest = {
      symbol,
      timeframe,
      candleData: { timestamp: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0, candleIndex },
      engineData: {
        bos: filterNearby(engine?.bos),
        choch: filterNearby(engine?.choch),
        fvgNearby: filterNearby(engine?.fvg),
        obNearby: filterNearby(engine?.obs),
        sweep: filterNearby(engine?.sweeps),
        eqh: filterNearby(engine?.eqh),
        eql: filterNearby(engine?.eql),
      },
    };
    setContextMenu({ x: e.clientX, y: e.clientY, req });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const onClose = () => setContextMenu(null);
    window.addEventListener('click', onClose);
    return () => window.removeEventListener('click', onClose);
  }, [contextMenu]);

  return (
    <div ref={frameRef} className={`tv-frame ${isFullscreen ? 'is-fullscreen' : ''}`}>
      <div ref={hostRef} className="tv-host" onContextMenu={handleContextMenu} />
      {contextMenu && (
        <div className="chart-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e => e.stopPropagation()}>
          <button type="button" className="tool-chip tool-chip-button" onClick={() => { onChartPointClick?.(contextMenu.req); setContextMenu(null); }}>
            AI Explain
          </button>
        </div>
      )}

      <div className="chart-topbar">
        <div className="toolbar">
          <UIModeSwitcher uiMode={uiMode} setUiMode={setUiMode} style={{ marginRight: 8 }} />
          {['1m','3m','5m','15m','1h','4h','1d','1w','1M','1Y'].map(tf => (
            <button key={tf} className={`tool-chip tool-chip-button ${timeframe === tf ? 'tool-chip-active' : ''}`} onClick={() => { setTimeframe(tf); onTimeframeChange?.(tf); }} title={tf === '1w' ? '주봉' : tf === '1M' ? '월봉' : tf === '1Y' ? '연봉' : undefined}>{tf === '1w' ? '1W' : tf}</button>
          ))}
          <button
            type="button"
            className={`tool-chip tool-chip-button ${labelMenuOpen ? 'tool-chip-active' : ''}`}
            onClick={() => setLabelMenuOpen(v => !v)}
            title="차트 표시 옵션 및 라벨 설정"
            style={{ fontWeight: 600, padding: '6px 12px', marginLeft: 8 }}
          >
            ⚙ 설정
          </button>
        </div>
        <div className="toolbar toolbar-actions">
          <div className="live-box">실시간 · {lastUpdate || '--:--:--'}</div>
          <button className="fullscreen-btn" onClick={toggleFullscreen}>{isFullscreen ? '전체화면 종료' : '전체화면'}</button>
        </div>
        {labelMenuOpen && (
          <div className="label-settings-panel" style={{ marginTop: 8, padding: '14px 16px', background: 'rgba(15,23,42,0.98)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 12, maxWidth: 560, maxHeight: 520, overflow: 'hidden', display: 'flex', flexDirection: 'column', pointerEvents: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0' }}>차트 설정</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  style={{ padding: '4px 10px', fontSize: 11, background: 'rgba(98,239,224,0.2)', color: '#62efe0' }}
                  onClick={() => {
                    const m = uiMode as SettingsUIMode;
                    const allOn = { showStructure: true, showZones: true, showLabels: true, showScenario: true, showFib: true, showRsi: true, showHarmonic: true, showPo3: true, showCandle: true, showBpr: true, showVision: true, showVisionTriangle: true, showVisionFlag: true, showVisionWedge: true, showVisionReversal: true, showVisionRange: true, showReactionZone: true, showWhaleZone: true };
                    apply({ modeFeatureOverrides: { ...(settings.modeFeatureOverrides || {}), [m]: allOn } });
                  }}
                  title="현재 모드에서 보이는 기능 전부 켜기"
                >
                  {uiMode === 'FULL' ? '전체' : uiMode === 'FOCUS' ? '포커스' : uiMode === 'EXECUTION' ? '실행' : '타점'} 모드 기능 전부 켜기
                </button>
                <button type="button" className="tool-chip tool-chip-button" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setLabelMenuOpen(false)}>닫기</button>
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  모드별 기능 ON/OFF — 현재: <strong style={{ color: '#62efe0' }}>{uiMode === 'FULL' ? '전체' : uiMode === 'FOCUS' ? '포커스' : uiMode === 'EXECUTION' ? '실행' : '타점'}</strong>
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>선택한 모드에서 표시할 기능을 켜고 끄세요. 각 모드별로 따로 저장됩니다.</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button type="button" className={`tool-chip tool-chip-button ${showWhaleZone ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showWhaleZone', !showWhaleZone)} title="거래소 API 기반 세력·고래 매수/매도 구간 확률">고래 구간</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showStructure ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showStructure', !showStructure)}>구조</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showZones ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showZones', !showZones)}>존/구간</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showScenario ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showScenario', !showScenario)}>시나리오</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showLabels ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showLabels', !showLabels)}>라벨</button>
                  <button type="button" className={`tool-chip tool-chip-button ${labelEditMode ? 'tool-chip-active' : ''}`} onClick={() => apply({ overlayLabelEditMode: !overlayLabelEditMode })} title="겹친 레이블을 드래그 또는 ↑↓ 버튼으로 옮길 수 있습니다">레이블 위치 조정</button>
                  <button type="button" className={`tool-chip tool-chip-button ${translateLabelsToKo ? 'tool-chip-active' : ''}`} onClick={() => apply({ translateLabelsToKo: !translateLabelsToKo })} title="FVG, BOS 등 영어 라벨 한글화. OB는 기본으로 롱확정·롱대기·숏확정·숏대기·약함 표기">한글 번역</button>
                  <button type="button" className="tool-chip tool-chip-button" style={{ fontSize: 10 }} onClick={() => { setOverlayOffsets({}); try { window.localStorage.removeItem(OVERLAY_OFFSETS_KEY); } catch {} setOverlayTick(v => v + 1); }} title="모든 레이블 위치를 기본으로 되돌립니다">위치 초기화</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showFib ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showFib', !showFib)}>피보</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showRsi ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showRsi', !showRsi)}>RSI</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showHarmonic ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showHarmonic', !showHarmonic)}>하모닉</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showBpr ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showBpr', !showBpr)}>BPR</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showVision ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showVision', !showVision)}>Vision</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showVisionTriangle ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showVisionTriangle', !showVisionTriangle)} title="위삼각">△</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showVisionFlag ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showVisionFlag', !showVisionFlag)}>Flag</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showVisionWedge ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showVisionWedge', !showVisionWedge)}>Wedge</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showVisionReversal ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showVisionReversal', !showVisionReversal)}>Rev</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showVisionRange ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showVisionRange', !showVisionRange)}>Range</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showReactionZone ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showReactionZone', !showReactionZone)} title="캔들 위 반응구간">반응구간</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showRsiPanel ? 'tool-chip-active' : ''}`} onClick={() => apply({ showRsiPanel: !showRsiPanel })}>RSI 패널</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showMacdPanel ? 'tool-chip-active' : ''}`} onClick={() => apply({ showMacdPanel: !showMacdPanel })}>MACD</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showBbPanel ? 'tool-chip-active' : ''}`} onClick={() => apply({ showBbPanel: !showBbPanel })}>BB</button>
                </div>
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>가격 표시 위치 (축 쪽)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                  <button type="button" className={`tool-chip tool-chip-button ${priceDisplayPosition === 'left' ? 'tool-chip-active' : ''}`} style={{ padding: '6px 12px' }} onClick={() => setPriceDisplayPosition('left')} title="가격을 축 왼쪽으로 정렬">좌</button>
                  <button type="button" className={`tool-chip tool-chip-button ${priceDisplayPosition === 'center' ? 'tool-chip-active' : ''}`} style={{ padding: '6px 12px' }} onClick={() => setPriceDisplayPosition('center')} title="가격을 축 기준 중앙 정렬">중</button>
                  <button type="button" className={`tool-chip tool-chip-button ${priceDisplayPosition === 'right' ? 'tool-chip-active' : ''}`} style={{ padding: '6px 12px' }} onClick={() => setPriceDisplayPosition('right')} title="가격을 축 오른쪽(차트 쪽)으로 정렬">우</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>가격 가로 미세조정</span>
                  <input
                    type="range"
                    min={-200}
                    max={200}
                    value={priceDisplayHShift}
                    onChange={e => setPriceDisplayHShift(parseInt(e.target.value, 10) || 0)}
                    title="좌·중·우 모두 축 기준으로 좌우 이동"
                    style={{ width: 120, flex: 1, maxWidth: 200, accentColor: '#62efe0' }}
                  />
                  <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 44 }}>{priceDisplayHShift > 0 ? `+${priceDisplayHShift}` : priceDisplayHShift}px</span>
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, lineHeight: 1.4 }}>
                  위 설정은 돌파·지지·타점 등 <strong style={{ color: '#94a3b8' }}>일반 라벨 옆 가격</strong>에만 적용됩니다.
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>종가 마감선 가격 (1m·5m·15m·1h·4h·일·주·월)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                    <button type="button" className={`tool-chip tool-chip-button ${closeStripPosition === 'left' ? 'tool-chip-active' : ''}`} style={{ padding: '6px 12px' }} onClick={() => setCloseStripPosition('left')} title="종가선 축 가격: 차트 쪽(좌)">좌</button>
                    <button type="button" className={`tool-chip tool-chip-button ${closeStripPosition === 'center' ? 'tool-chip-active' : ''}`} style={{ padding: '6px 12px' }} onClick={() => setCloseStripPosition('center')} title="종가선 축 가격: 축 중앙">중</button>
                    <button type="button" className={`tool-chip tool-chip-button ${closeStripPosition === 'right' ? 'tool-chip-active' : ''}`} style={{ padding: '6px 12px' }} onClick={() => setCloseStripPosition('right')} title="종가선 축 가격: 축 오른쪽">우</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>종가선 OPX</span>
                    <input
                      type="range"
                      min={-200}
                      max={200}
                      value={closeStripHShift}
                      onChange={e => setCloseStripHShift(parseInt(e.target.value, 10) || 0)}
                      title="종가 마감선 축 옆 숫자만 미세 이동"
                      style={{ width: 120, flex: 1, maxWidth: 200, accentColor: '#96c8ff' }}
                    />
                    <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 44 }}>{closeStripHShift > 0 ? `+${closeStripHShift}` : closeStripHShift}px</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>차트 축 가격 글자</span>
                    <input
                      type="range"
                      min={10}
                      max={18}
                      value={Math.max(10, Math.min(18, chartScaleFontSize))}
                      onChange={e => apply({ chartScaleFontSize: parseInt(e.target.value, 10) || 12 })}
                      style={{ width: 100, accentColor: '#62efe0' }}
                    />
                    <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 20 }}>{chartScaleFontSize}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>라벨 옆 가격 글자</span>
                    <input
                      type="range"
                      min={8}
                      max={16}
                      value={Math.max(8, Math.min(16, overlayPriceStripFontSize))}
                      onChange={e => apply({ overlayPriceStripFontSize: parseInt(e.target.value, 10) || 10 })}
                      style={{ width: 100, accentColor: '#62efe0' }}
                    />
                    <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 20 }}>{overlayPriceStripFontSize}</span>
                  </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>전체 라벨 · 가로줄</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>전체 라벨 글자 크기</span>
                    <input
                      type="range"
                      min={8}
                      max={24}
                      value={overlayLabelFontSize ?? 11}
                      onChange={e => apply({ overlayLabelFontSize: parseInt(e.target.value, 10) || 11 })}
                      style={{ width: 80, accentColor: '#62efe0' }}
                    />
                    <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 20 }}>{overlayLabelFontSize ?? 11}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>가로줄 굵기</span>
                    <button type="button" className={`tool-chip tool-chip-button ${overlayLineThickness === 'thin' ? 'tool-chip-active' : ''}`} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => apply({ overlayLineThickness: 'thin' })}>얇게</button>
                    <button type="button" className={`tool-chip tool-chip-button ${overlayLineThickness === 'normal' ? 'tool-chip-active' : ''}`} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => apply({ overlayLineThickness: 'normal' })}>보통</button>
                    <button type="button" className={`tool-chip tool-chip-button ${overlayLineThickness === 'thick' ? 'tool-chip-active' : ''}`} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => apply({ overlayLineThickness: 'thick' })}>굵게</button>
                  </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>라벨 설정 — 글자체·크기·정렬 (개별)</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8' }}>
                      <th style={{ textAlign: 'center', padding: '6px 8px 8px', fontWeight: 600, width: 56 }}>표시</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px 8px', fontWeight: 600 }}>라벨</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px 8px', fontWeight: 600 }}>글자체</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px 8px', fontWeight: 600 }}>크기</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px 8px', fontWeight: 600, minWidth: 200 }}>정렬 · 가로 슬라이더</th>
                    </tr>
                  </thead>
                  <tbody>
                    {screenOverlays.map((o: any) => (
                      <tr key={o.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <td style={{ padding: '4px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${isOverlayVisible(o.id) ? 'tool-chip-active' : ''}`}
                            style={{ padding: '2px 8px', fontSize: 10, minWidth: 40, background: isOverlayVisible(o.id) ? 'rgba(98,239,224,0.2)' : 'rgba(100,116,139,0.2)', border: `1px solid ${isOverlayVisible(o.id) ? '#62efe0' : '#64748b'}` }}
                            onClick={() => setOverlayVisible(o.id, !isOverlayVisible(o.id))}
                            title={isOverlayVisible(o.id) ? '차트에 표시 중 — 클릭하면 숨김' : '숨김 — 클릭하면 표시'}
                          >
                            {isOverlayVisible(o.id) ? 'ON' : 'OFF'}
                          </button>
                        </td>
                        <td style={{ padding: '6px 8px', color: isOverlayVisible(o.id) ? '#e2e8f0' : '#64748b', whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }} title={overlayDisplayLabel(o.label, o.id, uiMode, translateLabelsToKo) || o.id}>{overlayDisplayLabel(o.label, o.id, uiMode, translateLabelsToKo) || o.id}</td>
                        <td style={{ padding: '4px 8px' }}>
                          <select
                            value={getFontFamily(o.id)}
                            onChange={e => setFontFamily(o.id, e.target.value)}
                            style={{ width: '100%', minWidth: 100, padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#e2e8f0', fontSize: 11 }}
                          >
                            <option value="">기본</option>
                            <option value="'Noto Sans KR', sans-serif">Noto Sans KR</option>
                            <option value="'Pretendard', sans-serif">Pretendard</option>
                            <option value="'Noto Sans JP', sans-serif">Noto Sans JP</option>
                            <option value="system-ui, sans-serif">system-ui</option>
                            <option value="serif">serif</option>
                          </select>
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <input
                            type="number"
                            min={8}
                            max={24}
                            value={getFontSize(o.id)}
                            onChange={e => setFontSizeValue(o.id, parseInt(e.target.value, 10) || (overlayLabelFontSize ?? DEFAULT_FONT_SIZE))}
                            style={{ width: 52, padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#e2e8f0', fontSize: 11 }}
                          />
                        </td>
                        <td style={{ padding: '4px 8px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              <button type="button" className={`tool-chip tool-chip-button ${getLabelAlign(o.id) === 'left' ? 'tool-chip-active' : ''}`} style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => setLabelAlign(o.id, 'left')}>좌</button>
                              <button type="button" className={`tool-chip tool-chip-button ${getLabelAlign(o.id) === 'center' ? 'tool-chip-active' : ''}`} style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => setLabelAlign(o.id, 'center')}>중</button>
                              <button type="button" className={`tool-chip tool-chip-button ${getLabelAlign(o.id) === 'right' ? 'tool-chip-active' : ''}`} style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => setLabelAlign(o.id, 'right')}>우</button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input
                                type="range"
                                min={LABEL_H_SHIFT_MIN}
                                max={LABEL_H_SHIFT_MAX}
                                value={getLabelHShift(o.id)}
                                onChange={e => setLabelHShift(o.id, parseInt(e.target.value, 10) || 0)}
                                title="라벨을 좌우로 원하는 만큼 이동 (픽셀)"
                                style={{ width: 110, flex: 1, minWidth: 80, accentColor: '#62efe0' }}
                              />
                              <span style={{ fontSize: 10, color: '#94a3b8', minWidth: 40, fontVariantNumeric: 'tabular-nums' }}>
                                {getLabelHShift(o.id) > 0 ? `+${getLabelHShift(o.id)}` : getLabelHShift(o.id)}px
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {screenOverlays.length === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', color: '#64748b', fontSize: 11 }}>표시 중인 라벨이 없습니다. 위 차트 표시에서 구조·존·라벨 등을 켜면 목록에 나타납니다.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="overlay-layer">
        {visibleScreenOverlays.map((item: any) => {
          const off = overlayOffsets[item.id] ?? { dx: 0, dy: 0 };
          const isDragging = dragState?.id === item.id;
          const liveOff = isDragging ? { dx: dragState.currentDx, dy: dragState.currentDy } : off;
          if (['zone', 'fvg', 'ob', 'supplyZone', 'demandZone', 'bprZone', 'reactionZone'].includes(item.kind) && typeof item.x2 === 'number' && typeof item.y2 === 'number') {
            const baseLeft = Math.min(item.x1, item.x2);
            const baseWidth = Math.abs(item.x2 - item.x1);
            const isTapZone = item.id?.startsWith?.('tap-');
            const xMaxRight = item.xMaxRight ?? (baseLeft + baseWidth);
            // 모든 zone을 우측 끝까지 확장
            const width = Math.max(baseWidth, xMaxRight - baseLeft);
            const left = baseLeft + liveOff.dx;
            const top = Math.min(item.y1, item.y2) + liveOff.dy;
            const height = Math.abs(item.y2 - item.y1);
            const align = getLabelAlign(item.id);
            const justifyContent = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
            const zoneHigh = typeof item.price1 === 'number' && typeof item.price2 === 'number' ? Math.max(item.price1, item.price2) : (item.price1 ?? item.price2);
            const zoneLow = typeof item.price1 === 'number' && typeof item.price2 === 'number' ? Math.min(item.price1, item.price2) : (item.price1 ?? item.price2);
            const hasPrices = typeof zoneHigh === 'number' && typeof zoneLow === 'number';
            const zonePriceColor = toSolidOverlayColor(item.color);
            const zoneLabelColor = toSolidOverlayColor(item.color);
            const priceBoxRight = item.priceStripRight ?? left + width;
            const chartW = item.chartWidth ?? 0;
            const stripFs = Math.max(8, Math.min(16, overlayPriceStripFontSize));
            const priceBoxStyle = buildPriceStripOverlayStyle(priceDisplayPosition, priceDisplayHShift, priceBoxRight, chartW, {
              whiteSpace: 'nowrap',
              fontSize: stripFs,
              fontWeight: 600,
              color: zonePriceColor,
              background: 'rgba(8,15,25,0.82)',
              padding: '2px 6px',
              borderRadius: 4,
              pointerEvents: 'none',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.2)',
            });
            const chartH = item.chartHeight ?? 0;
            const labelBoxW = 180;
            const labelBoxH = 24;
            const labelHShift = getLabelHShift(item.id);
            const labelLeft = Math.max(6, Math.min(Math.max(6, chartW - labelBoxW - 6), left + 6 + labelHShift));
            const labelTop = Math.max(6, Math.min(Math.max(6, chartH - labelBoxH - 6), top + 4));
            const obMitigated = item.kind === 'ob' && item.obMitigated === true;
            const zoneBorder = isTapZone
              ? `1.5px solid ${zoneLabelColor}`
              : obMitigated
                ? '1px dashed rgba(148,163,184,0.5)'
                : undefined;
            return (
              <div key={item.id} style={{ position: 'absolute', left: 0, top: 0 }}>
                <div
                  className="overlay-zone"
                  style={{ left, top, width, height, background: item.color || 'rgba(113,247,189,0.18)', border: zoneBorder, display: 'flex', alignItems: 'center', justifyContent, paddingLeft: 6, paddingRight: 6, cursor: isDragging ? 'grabbing' : 'grab' }}
                  onMouseDown={(e) => startLabelDrag(item.id, left, xMaxRight, liveOff, e)}
                >
                  <span style={{ opacity: 0, pointerEvents: 'none' }}>{overlayDisplayLabel(item.label, item.id, uiMode, translateLabelsToKo)}</span>
                </div>
                <div style={{ position: 'absolute', left: labelLeft, top: labelTop, whiteSpace: 'nowrap', fontSize: isTapZone ? Math.max(getFontSize(item.id), 12) : getFontSize(item.id), fontFamily: getFontFamily(item.id) || undefined, fontWeight: isTapZone ? 700 : 500, color: zoneLabelColor, opacity: obMitigated ? 0.72 : 1, textShadow: '0 1px 1px rgba(0,0,0,0.5)', background: 'rgba(8,15,25,.58)', padding: isTapZone ? '3px 8px' : '2px 6px', borderRadius: 999, maxWidth: labelBoxW, overflow: 'hidden', textOverflow: 'ellipsis' }}>{overlayDisplayLabel(item.label, item.id, uiMode, translateLabelsToKo)}</div>
                {hasPrices && (
                  <>
                    <div style={{ ...priceBoxStyle, top: top - PRICE_BOX_OFFSET_VERTICAL }}>{formatOverlayPrice(zoneHigh)}</div>
                    <div style={{ ...priceBoxStyle, top: top + height + PRICE_BOX_OFFSET_VERTICAL }}>{formatOverlayPrice(zoneLow)}</div>
                  </>
                )}
                {labelEditMode && (
                  <div className="overlay-move-controls" style={{ position: 'absolute', left: left + width - 120, top: top + height / 2 - 14, display: 'flex', gap: 2, zIndex: 10, alignItems: 'center' }}>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, -NUDGE, 0)} title="왼쪽">←</button>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, NUDGE, 0)} title="오른쪽">→</button>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, 0, -NUDGE)} title="위">↑</button>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, 0, NUDGE)} title="아래">↓</button>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setFontSize(item.id, -1)} title="글자 작게">A−</button>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setFontSize(item.id, 1)} title="글자 크게">A+</button>
                  </div>
                )}
              </div>
            );
          }

          if (typeof item.x2 === 'number' && typeof item.y2 === 'number' && isLineKind(item.kind)) {
            const baseMinX = Math.min(item.x1, item.x2);
            const baseMinY = Math.min(item.y1, item.y2);
            const segW = Math.abs(item.x2 - item.x1) || 1;
            const xMaxRight = item.xMaxRight ?? (baseMinX + segW);
            const lineWidth = Math.max(segW, xMaxRight - baseMinX);
            // max(20,…) 제거: 세로가 작을 때 viewBox 비율이 깨져 선이 휘어 보이던 문제 방지
            const lineHeight = Math.max(6, Math.abs(item.y2 - item.y1));
            const yAtRight = item.y1 + (item.y2 - item.y1) * ((xMaxRight - item.x1) / segW);
            const minX = baseMinX + liveOff.dx;
            const minY = baseMinY + liveOff.dy;
            const x1 = item.x1 - baseMinX;
            const y1 = item.y1 - baseMinY;
            const isTapLine = item.id?.startsWith?.('tap-');
            const x2 = (isTapLine ? (item.x2 ?? xMaxRight) : xMaxRight) - baseMinX;
            const y2 = yAtRight - baseMinY;
            const align = getLabelAlign(item.id);
            const textX = align === 'left' ? x1 + 6 : align === 'right' ? Math.max(x1 + 6, x2 - 4) : (x1 + x2) / 2;
            const textAnchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
            const linePriceText = typeof item.price1 === 'number'
              ? (typeof item.price2 === 'number' && Math.abs(item.price1 - item.price2) > 1e-6
                ? `${formatOverlayPrice(item.price1)} ~ ${formatOverlayPrice(item.price2)}`
                : formatOverlayPrice(item.price1))
              : '';
            const tapLabelNudge =
              item.id === 'tap-breakout' ? -14 :
              item.id === 'tap-retest-support' ? 10 :
              item.id === 'tap-retest-support-2' ? 16 :
              item.id === 'tap-resistance' ? -10 :
              item.id === 'tap-entry' ? -12 :
              item.id === 'tap-stop' ? 12 :
              item.id === 'tap-target' ? -16 : 0;
            const labelNudge = (item.id === 'tailong-resistance' ? -10 : item.id === 'tailong-support' ? 10 : 0) + tapLabelNudge;
            const labelOnlyY = Math.max(12, lineHeight / 2) + labelNudge;
            const linePriceColor = toSolidOverlayColor(item.color);
            const lineStripFs = Math.max(8, Math.min(16, overlayPriceStripFontSize));
            const baseLabel = overlayDisplayLabel(item.label, item.id, uiMode, translateLabelsToKo);
            const keyLevelDisplayLabel = item.kind === 'keyLevel' && analysis
              ? (item.id.startsWith('key-mustBreak-') && (analysis as { breakoutLevelProbability?: number }).breakoutLevelProbability != null
                ? `돌파 상승 확률 · ${(analysis as { breakoutLevelProbability: number }).breakoutLevelProbability}%`
                : item.id.startsWith('key-invalidation-') && (analysis as { invalidationLevelProbability?: number }).invalidationLevelProbability != null
                  ? `${baseLabel} · ${(analysis as { invalidationLevelProbability: number }).invalidationLevelProbability}%`
                  : item.id.startsWith('key-mustHold-') && (analysis as { supportLevelProbability?: number }).supportLevelProbability != null
                    ? `S의 상승확률 · ${(analysis as { supportLevelProbability: number }).supportLevelProbability}%`
                    : baseLabel)
              : baseLabel;
            const lineLabelColor = toSolidOverlayColor(item.color);
            const tapTextXOffset =
              item.id === 'tap-breakout' ? 8 :
              item.id === 'tap-resistance' ? 12 :
              item.id === 'tap-retest-support' ? 10 :
              item.id === 'tap-retest-support-2' ? 22 :
              item.id === 'tap-entry' ? 6 :
              item.id === 'tap-stop' ? 6 :
              item.id === 'tap-target' ? 4 : 8;
            const tapTextX = Math.max(x1 + 8, x2 - tapTextXOffset);
            const finalTextX = isTapLine ? tapTextX : textX;
            const finalTextAnchor = isTapLine ? 'end' : textAnchor;
            const chartW = item.chartWidth ?? 0;
            const chartH = item.chartHeight ?? 0;
            const lineLabelHShift = getLabelHShift(item.id);
            const lineLabelLeft = Math.max(6, Math.min(Math.max(6, chartW - 220), minX + finalTextX - 110 + lineLabelHShift));
            const lineLabelTop = Math.max(6, Math.min(Math.max(6, chartH - 24), minY + labelOnlyY - 12));
            const isCloseSettlementLine = Boolean(item.id?.startsWith?.('close-'));
            const axisStripPos = isCloseSettlementLine ? closeStripPosition : priceDisplayPosition;
            const axisStripShift = isCloseSettlementLine ? closeStripHShift : priceDisplayHShift;
            return (
              <div key={item.id} style={{ position: 'absolute', left: 0, top: 0 }}>
                <svg
                  className="overlay-svg-item"
                  style={{ left: minX, top: minY, width: lineWidth, height: lineHeight, cursor: isDragging ? 'grabbing' : 'grab' }}
                  viewBox={`0 0 ${lineWidth} ${lineHeight}`}
                  onMouseDown={(e) => startLabelDrag(item.id, minX, xMaxRight, liveOff, e)}
                >
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={item.color || '#62efe0'} strokeWidth={getLineStrokeWidth(item)} strokeDasharray={item.lineDash ?? (item.kind === 'scenario' ? '6 5' : (item.kind === 'harmonicLeg' || item.kind === 'rsiDivergenceLine') ? '5 5' : undefined)} vectorEffect="non-scaling-stroke" />
                </svg>
                {keyLevelDisplayLabel ? (
                  <div style={{ position: 'absolute', left: lineLabelLeft, top: lineLabelTop, color: lineLabelColor, fontSize: isTapLine ? Math.max(getFontSize(item.id), 12) : getFontSize(item.id), fontWeight: isTapLine ? 700 : 500, fontFamily: getFontFamily(item.id) || undefined, background: 'rgba(8,15,25,.58)', padding: '2px 6px', borderRadius: 999, whiteSpace: 'nowrap', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {keyLevelDisplayLabel}
                  </div>
                ) : null}
                {linePriceText ? (
                  <div
                    style={{
                      ...buildPriceStripOverlayStyle(
                        axisStripPos,
                        axisStripShift,
                        (item as any).priceStripRight ?? minX + lineWidth,
                        chartW,
                        {
                          top: minY + y2 - PRICE_BOX_OFFSET_VERTICAL,
                          whiteSpace: 'nowrap',
                          fontSize: lineStripFs,
                          fontFamily: getFontFamily(item.id) || undefined,
                          fontWeight: 600,
                          color: linePriceColor,
                          background: 'rgba(8,15,25,0.82)',
                          padding: '2px 6px',
                          borderRadius: 4,
                          pointerEvents: 'none',
                          boxShadow: '0 0 0 1px rgba(0,0,0,0.2)',
                        }
                      ),
                    }}
                  >
                    {linePriceText}
                  </div>
                ) : null}
                {labelEditMode && (
                  <div className="overlay-move-controls" style={{ position: 'absolute', left: minX + lineWidth - 120, top: minY + lineHeight / 2 - 14, display: 'flex', gap: 2, zIndex: 10, alignItems: 'center' }}>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, -NUDGE, 0)} title="왼쪽">←</button>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, NUDGE, 0)} title="오른쪽">→</button>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, 0, -NUDGE)} title="위">↑</button>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, 0, NUDGE)} title="아래">↓</button>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setFontSize(item.id, -1)} title="글자 작게">A−</button>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setFontSize(item.id, 1)} title="글자 크게">A+</button>
                  </div>
                )}
              </div>
            );
          }

          const isPatternLabel = (item as any).category === 'patternVision' && item.kind === 'label';
          const patternId = isPatternLabel ? item.id.replace(/-label$/, '') : undefined;
          const rawPinLeft = item.x1 + liveOff.dx + getLabelHShift(item.id);
          const rawPinTop = item.y1 + liveOff.dy;
          const chartW = item.chartWidth ?? 0;
          const chartH = item.chartHeight ?? 0;
          const pinLeft = Math.max(20, Math.min(Math.max(20, chartW - 20), rawPinLeft));
          const pinTop = Math.max(14, Math.min(Math.max(14, chartH - 14), rawPinTop));
          const pinColor = toSolidOverlayColor(item.color);
          const pinXMaxRight = item.priceStripRight ?? item.xMaxRight ?? 999;
          return (
            <div key={item.id} style={{ position: 'absolute', left: 0, top: 0 }}>
            <div
              className={`overlay-pin ${isPatternLabel && onChartPointClick ? 'overlay-pin-clickable' : ''}`}
              style={{ left: pinLeft, top: pinTop, borderColor: item.color || '#62efe0', color: pinColor, fontSize: getFontSize(item.id), fontFamily: getFontFamily(item.id) || undefined, justifyContent: getLabelAlign(item.id) === 'left' ? 'flex-start' : getLabelAlign(item.id) === 'right' ? 'flex-end' : 'center', cursor: isDragging ? 'grabbing' : 'grab' }}
              onMouseDown={(e) => startLabelDrag(item.id, pinLeft, pinXMaxRight, liveOff, e)}
              onClick={isPatternLabel && onChartPointClick && patternId ? () => {
                if (didDragRef.current) { didDragRef.current = false; return; }
                const limit = visibleLimit(timeframe);
                const visibleLen = Math.min(limit, candles.length);
                const baseIdx = candles.length - visibleLen;
                const c = candles[candles.length - 1];
                if (!c) return;
                const engine = analysis?.engine as Record<string, any> | undefined;
                const filterNearby = (arr: any[] | undefined) => (arr ?? []).filter((x: any) => Math.abs((x.index ?? 0) - (visibleLen - 1)) <= NEARBY_BARS);
                onChartPointClick({
                  symbol,
                  timeframe,
                  candleData: { timestamp: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0, candleIndex: candles.length - 1 },
                  engineData: {
                    bos: filterNearby(engine?.bos),
                    choch: filterNearby(engine?.choch),
                    fvgNearby: filterNearby(engine?.fvg),
                    obNearby: filterNearby(engine?.obs),
                    sweep: filterNearby(engine?.sweeps),
                    eqh: filterNearby(engine?.eqh),
                    eql: filterNearby(engine?.eql),
                  },
                  patternId,
                });
              } : undefined}
            >
              <span className="overlay-pin-dot" style={{ background: item.color || '#62efe0' }} />
              {[overlayDisplayLabel(item.label, item.id, uiMode, translateLabelsToKo), typeof item.price1 === 'number' ? formatOverlayPrice(item.price1) : null].filter(Boolean).join(' · ')}
            </div>
            {labelEditMode && (
              <div className="overlay-move-controls" style={{ position: 'absolute', left: pinLeft - 80, top: pinTop - 14, display: 'flex', gap: 2, zIndex: 10, alignItems: 'center' }}>
                <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, -NUDGE, 0)} title="왼쪽">←</button>
                <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, NUDGE, 0)} title="오른쪽">→</button>
                <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, 0, -NUDGE)} title="위">↑</button>
                <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, 0, NUDGE)} title="아래">↓</button>
                <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setFontSize(item.id, -1)} title="글자 작게">A−</button>
                <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setFontSize(item.id, 1)} title="글자 크게">A+</button>
              </div>
            )}
            </div>
          );
        })}
        {(uiMode === 'EXECUTION' || uiMode === 'TAPPOINT') &&
          (analysis?.verdict === 'LONG' || analysis?.verdict === 'SHORT') &&
          (analysis?.confidence ?? 0) >= 80 &&
          Boolean((analysis as any)?.confirmedSignal?.confirmed) && (
          <ExecutionOverlay analysis={analysis} positions={executionPositions} theme={theme} />
        )}
      </div>

      {showRsiPanel && analysis?.indicators && (
        <div className="indicator-panel" style={{ bottom: 48 }}>
          <div className="rsi-panel-title">RSI / StochRSI</div>
          <div className="rsi-panel-chart">
            {(() => {
              const ind = analysis.indicators;
              const rsiArr = ind.rsi || [];
              const k = ind.stochK || [];
              const d = ind.stochD || [];
              const tail = Math.min(60, rsiArr.length);
              const slice = (arr: number[]) => arr.slice(-tail);
              const rs = slice(rsiArr);
              const ks = slice(k);
              const ds = slice(d);
              const max = Math.max(100, ...rs, ...ks, ...ds);
              const min = Math.min(0, ...rs, ...ks, ...ds);
              const h = 40;
              const toY = (v: number) => h - ((v - min) / (max - min || 1)) * h;
              const startIdx = Math.max(0, rsiArr.length - tail);
              const divLines = (analysis as { rsiDivergenceSignal?: { divergenceLines?: Array<{ type: 'bullish' | 'bearish'; index1: number; index2: number; rsi1?: number; rsi2?: number }> } })?.rsiDivergenceSignal?.divergenceLines || [];
              return (
                <svg width="100%" height={h} preserveAspectRatio="none" viewBox={`0 0 ${Math.max(1, tail)} ${h}`}>
                  {rs.length > 1 && <polyline fill="none" stroke="#62efe0" strokeWidth="0.5" points={rs.map((v, i) => `${i},${toY(v)}`).join(' ')} />}
                  {ks.length > 1 && <polyline fill="none" stroke="#4df2a3" strokeWidth="0.5" strokeDasharray="2 2" points={ks.map((v, i) => `${i},${toY(v)}`).join(' ')} />}
                  {ds.length > 1 && <polyline fill="none" stroke="#ffb86b" strokeWidth="0.5" strokeDasharray="2 2" points={ds.map((v, i) => `${i},${toY(v)}`).join(' ')} />}
                  <line x1={0} y1={toY(30)} x2={tail} y2={toY(30)} stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
                  <line x1={0} y1={toY(70)} x2={tail} y2={toY(70)} stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
                  {divLines.map((dl, i) => {
                    const r1 = dl.rsi1 ?? 50;
                    const r2 = dl.rsi2 ?? 50;
                    const x1 = dl.index1 - startIdx;
                    const x2 = dl.index2 - startIdx;
                    if (x1 < 0 || x2 < 0 || x1 >= tail || x2 >= tail) return null;
                    const stroke = dl.type === 'bullish' ? '#22C55E' : '#EF4444';
                    return <line key={`div-${i}`} x1={x1} y1={toY(r1)} x2={x2} y2={toY(r2)} stroke={stroke} strokeWidth="0.8" strokeDasharray="2 2" />;
                  })}
                </svg>
              );
            })()}
          </div>
          <div className="rsi-panel-legend">
            <span style={{ color: '#62efe0' }}>RSI</span>
            <span style={{ color: '#4df2a3' }}>K</span>
            <span style={{ color: '#ffb86b' }}>D</span>
            {(analysis as any)?.rsiDivergenceSignal?.volume && (
              <span style={{ color: '#94a3b8', marginLeft: 8 }}>
                {(analysis as any).rsiDivergenceSignal.volume.spike ? 'Vol OK' : `Vol: ${(analysis as any).rsiDivergenceSignal.volume.label}`}
              </span>
            )}
          </div>
        </div>
      )}

      {showMacdPanel && analysis?.indicators && (() => {
        const ind = analysis.indicators;
        const macdL = ind.macdLine || [];
        const macdS = ind.macdSignal || [];
        const macdH = ind.macdHist || [];
        const tail = Math.min(60, macdH.length || macdL.length);
        const slice = (arr: number[]) => arr.slice(-tail);
        const ml = slice(macdL); const ms = slice(macdS); const mh = slice(macdH);
        const all = [...ml, ...ms, ...mh].filter(x => isFinite(x));
        const max = Math.max(0.0001, ...all); const min = Math.min(-0.0001, ...all);
        const h = 40; const toY = (v: number) => h - ((v - min) / (max - min || 1)) * h;
        return (
          <div key="macd" className="indicator-panel" style={{ bottom: 48 + (showRsiPanel ? 78 : 0) }}>
            <div className="rsi-panel-title">MACD</div>
            <div className="rsi-panel-chart">
              <svg width="100%" height={h} preserveAspectRatio="none" viewBox={`0 0 ${Math.max(1, tail)} ${h}`}>
                {mh.length > 1 && mh.map((v, i) => (
                  <line key={i} x1={i} y1={toY(0)} x2={i} y2={toY(v)} stroke={v >= 0 ? '#62efe0' : '#ff7b7b'} strokeWidth="0.8" />
                ))}
                {ml.length > 1 && <polyline fill="none" stroke="#62efe0" strokeWidth="0.5" points={ml.map((v, i) => `${i},${toY(v)}`).join(' ')} />}
                {ms.length > 1 && <polyline fill="none" stroke="#ffb86b" strokeWidth="0.5" strokeDasharray="2 2" points={ms.map((v, i) => `${i},${toY(v)}`).join(' ')} />}
                <line x1={0} y1={toY(0)} x2={tail} y2={toY(0)} stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
              </svg>
            </div>
            <div className="rsi-panel-legend">
              <span style={{ color: '#62efe0' }}>MACD</span>
              <span style={{ color: '#ffb86b' }}>Signal</span>
              <span>Histogram</span>
            </div>
          </div>
        );
      })()}

      {showBbPanel && candles.length > 0 && (() => {
        const bb = bollingerBands(candles, 20, 2);
        const visible = candles.slice(-60);
        const u = bb.upper.slice(-60); const m = bb.mid.slice(-60); const l = bb.lower.slice(-60);
        const min = Math.min(...l, ...visible.map(c => c.low));
        const max = Math.max(...u, ...visible.map(c => c.high));
        const h = 40; const toY = (v: number) => h - ((v - min) / (max - min || 1)) * h;
        return (
          <div key="bb" className="indicator-panel" style={{ bottom: 48 + (showRsiPanel ? 78 : 0) + (showMacdPanel ? 78 : 0) }}>
            <div className="rsi-panel-title">Bollinger Bands</div>
            <div className="rsi-panel-chart">
              <svg width="100%" height={h} preserveAspectRatio="none" viewBox={`0 0 60 ${h}`}>
                {u.length > 1 && <polyline fill="none" stroke="#62efe0" strokeWidth="0.5" strokeOpacity="0.8" points={u.map((v, i) => `${i},${toY(v)}`).join(' ')} />}
                {m.length > 1 && <polyline fill="none" stroke="#ffb86b" strokeWidth="0.5" strokeDasharray="2 2" points={m.map((v, i) => `${i},${toY(v)}`).join(' ')} />}
                {l.length > 1 && <polyline fill="none" stroke="#ff7b7b" strokeWidth="0.5" strokeOpacity="0.8" points={l.map((v, i) => `${i},${toY(v)}`).join(' ')} />}
                {visible.length > 1 && <polyline fill="none" stroke="#c7d2e0" strokeWidth="0.6" points={visible.map((c, i) => `${i},${toY(c.close)}`).join(' ')} />}
              </svg>
            </div>
            <div className="rsi-panel-legend">
              <span style={{ color: '#62efe0' }}>Upper</span>
              <span style={{ color: '#ffb86b' }}>Mid</span>
              <span style={{ color: '#ff7b7b' }}>Lower</span>
              <span style={{ color: '#c7d2e0' }}>Close</span>
            </div>
          </div>
        );
      })()}

      <div className="chart-bottombar">
        <div className="scale">
          <div className="small-chip">{symbol}</div>
          <div className="small-chip">{timeframe}</div>
          <div className="small-chip">{analysis?.verdict === 'LONG' ? '롱' : analysis?.verdict === 'SHORT' ? '숏' : '관망'}</div>
          {(analysis as any)?.rsiDivergenceSignal && (
            <div className={`small-chip ${(analysis as any).rsiDivergenceSignal.verdict === 'LONG' ? 'c-long' : (analysis as any).rsiDivergenceSignal.verdict === 'SHORT' ? 'c-short' : (analysis as any).rsiDivergenceSignal.verdict === 'WATCH' ? 'c-watch' : ''}`} style={(analysis as any).rsiDivergenceSignal.verdict === 'NONE' ? { color: '#94a3b8' } : undefined}>
              RSI {(analysis as any).rsiDivergenceSignal.verdict === 'LONG' ? 'LONG' : (analysis as any).rsiDivergenceSignal.verdict === 'SHORT' ? 'SHORT' : (analysis as any).rsiDivergenceSignal.verdict === 'WATCH' ? 'WATCH' : 'NONE'}
            </div>
          )}
          {marketError ? <div className="small-chip small-chip-warn">오류</div> : <div className="small-chip small-chip-live">실시간 연동</div>}
        </div>
      </div>
    </div>
  );
}

const ChartView = forwardRef<ChartSnapshotRef, Omit<Parameters<typeof ChartViewInner>[0], 'snapshotRef'>>(
  (props, ref) => <ChartViewInner {...props} snapshotRef={ref as React.RefObject<ChartSnapshotRef | null>} />
);
export default memo(ChartView);
