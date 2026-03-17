'use client';

import { memo } from 'react';
import { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import { visibleLimit, ZONE_PRICE_FLOOR, ZONE_PRICE_CEIL } from '@/lib/constants';
import { loadSettings, saveSettings, defaultSettings } from '@/lib/settings';
import { subscribeWs } from '@/lib/websocket';
import { fetchWithRetry } from '@/lib/fetchWithRetry';
import { bollingerBands } from '@/lib/indicators';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, CandlestickData, HistogramData, LineData, IChartApi, ISeriesApi, UTCTimestamp, TickMarkType, CrosshairMode } from 'lightweight-charts';
import { useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import type { ChartExplainRequest } from '@/types/chartExplain';
import UIModeSwitcher, { type UIMode } from './UIModeSwitcher';
import ExecutionOverlay, { type ExecutionPositions } from './ExecutionOverlay';

export type ChartSnapshotRef = { getSnapshot: () => string | null };

function mapOverlays(
  overlays: OverlayItem[],
  candles: Candle[],
  timeframe: string,
  options?: { useZonePriceRange?: boolean }
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

  const pickTime = (x: number) => {
    const clamped = Math.max(0, Math.min(1, x));
    const idxInVisible = visibleLen <= 1 ? 0 : clamped * (visibleLen - 1);
    const idxInFull = baseIdx + Math.round(idxInVisible);
    const safe = Math.max(0, Math.min(candles.length - 1, idxInFull));
    return candles[safe].time;
  };

  return overlays.map(item => {
    const useZoneRange = options?.useZonePriceRange && item.category === 'strongZone';
    const maxP = useZoneRange ? zoneMax : candleMax;
    const range = useZoneRange ? zoneRange : candleRange;
    const pickPrice = (y: number) => maxP - y * range;
    return {
      ...item,
      time1: pickTime(item.x1),
      price1: pickPrice(item.y1),
      time2: typeof item.x2 === 'number' ? pickTime(item.x2) : undefined,
      price2: typeof item.y2 === 'number' ? pickPrice(item.y2) : undefined
    };
  });
}

function isLineKind(kind: OverlayItem['kind']) {
  return ['supportLine', 'resistanceLine', 'trendLine', 'liquiditySweep', 'bos', 'choch', 'eqh', 'eql', 'scenario', 'equilibrium', 'strongHigh', 'strongLow', 'fibLine', 'harmonic', 'symTriangleTarget', 'keyLevel'].includes(kind);
}

const chartThemes = {
  dark: { bg: '#10151D', text: '#c7d2e0', grid: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.08)' },
  light: { bg: '#f5f8fc', text: '#1a2332', grid: 'rgba(0,0,0,0.06)', border: 'rgba(0,0,0,0.12)' },
};

const NEARBY_BARS = 8;

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
  theme?: 'dark' | 'light';
  snapshotRef?: React.RefObject<ChartSnapshotRef | null>;
  onChartPointClick?: (data: ChartExplainRequest) => void;
  uiMode?: UIMode;
  onUiModeChange?: (mode: UIMode) => void;
}) => {
  const [internalUiMode, setInternalUiMode] = useState<UIMode>('FOCUS');
  const uiMode = onUiModeChangeProp != null ? uiModeProp : internalUiMode;
  const setUiMode = onUiModeChangeProp ?? setInternalUiMode;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lastFittedRef = useRef<string>('');
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const zoneRangeSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [overlayTick, setOverlayTick] = useState(0);
  const [lastUpdate, setLastUpdate] = useState('');
  const [marketError, setMarketError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; req: ChartExplainRequest } | null>(null);
  const [settings, setSettings] = useState(defaultSettings);
  useEffect(() => { setSettings(loadSettings()); }, []);
  const apply = (s: Partial<typeof settings>) => { setSettings(prev => saveSettings({ ...prev, ...s })); };
  const { showStructure, showZones, showLabels, showScenario, showFib, showRsi, showHarmonic, showPo3, showCandle, showBpr, showRsiPanel, showMacdPanel, showBbPanel, showVision, showVisionTriangle, showVisionFlag, showVisionWedge, showVisionReversal, showVisionRange, showReactionZone, showWhaleZone, overlayLabelEditMode, overlayLabelFontSize, overlayLineThickness } = settings;
  const labelEditMode = overlayLabelEditMode;

  const overlays = analysis?.overlays || [];
  const isVisionTriangle = (id: string) => /^vision-(sym|asc|desc)-/.test(id);
  const isVisionFlag = (id: string) => /^vision-(bullflag|bearflag)-/.test(id);
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
    if (!showLabels && ['entry', 'stop', 'target', 'label', 'poi', 'swingLabel'].includes(item.kind)) return false;
    if (!showRsi && (item.kind === 'rsiSignal' || cat === 'rsi')) return false;
    if (!showStructure && ['supportLine', 'resistanceLine', 'trendLine', 'bos', 'choch', 'liquiditySweep', 'eqh', 'eql', 'equilibrium', 'strongHigh', 'strongLow', 'poi', 'swingLabel', 'symTriangleTarget'].includes(item.kind)) return false;
    if (!showFib && (item.kind === 'fibLine' || cat === 'fib')) return false;
    if (!showHarmonic && (item.kind === 'harmonic' || cat === 'harmonic')) return false;
    if (!showZones && ['zone', 'fvg', 'ob', 'supplyZone', 'demandZone'].includes(item.kind)) return false;
    if (!showReactionZone && (item.kind === 'reactionZone' || (item as any).category === 'reactionZone')) return false;
    if (!showBpr && (item.kind === 'bprZone' || cat === 'bpr')) return false;
    if (!showPo3 && (item.kind === 'po3Phase' || cat === 'po3')) return false;
    if (!showCandle && (item.kind === 'candlePattern' || cat === 'candle')) return false;
    if (!showScenario && item.kind === 'scenario') return false;
    return true;
  }), [overlays, showStructure, showZones, showLabels, showScenario, showFib, showRsi, showHarmonic, showPo3, showCandle, showBpr, showReactionZone, showWhaleZone, showVision, showVisionTriangle, showVisionFlag, showVisionWedge, showVisionReversal, showVisionRange]);

  const modeFilteredOverlays = useMemo(() => {
    if (uiMode === 'EXECUTION') {
      const tailongOnly = overlays.filter((item: any) => item.id?.startsWith('tailong-'));
      const breakoutLevel = overlays.filter((item: any) => item.id?.startsWith('key-mustBreak-'));
      const mustHoldSupport = overlays.filter((item: any) => item.id?.startsWith('key-mustHold-'));
      const bullishFvg = overlays.filter((item: any) => item.kind === 'fvg' && item.label === '상승 FVG');
      const reactionZones = overlays.filter((item: any) => item.kind === 'reactionZone' || (item as any).category === 'reactionZone');
      const bullishOb = overlays.filter((item: any) => item.kind === 'ob' && (item.label === '상승 OB' || item.label === 'OB 선포착 ↑'));
      const demandSupplyLabels: Record<string, string> = {
        '수요 연속': '지지 후 상승 구간',
        '수요 반전': '하락 후 반등 구간',
        '공급 연속': '저항 후 하락 구간',
        '공급 반전': '상승 후 하락 구간',
      };
      const demandSupply = overlays
        .filter((item: any) => item.kind === 'demandZone' || item.kind === 'supplyZone')
        .map((item: any) => ({ ...item, label: demandSupplyLabels[item.label] ?? item.label }));
      const closeLevelLines = overlays.filter((item: any) => item.id?.startsWith('close-'));
      return [...tailongOnly, ...breakoutLevel, ...mustHoldSupport, ...closeLevelLines, ...bullishFvg, ...reactionZones, ...demandSupply, ...bullishOb];
    }
    if (uiMode === 'FULL') return filteredOverlays;
    const strong = showWhaleZone ? (analysis?.strongZoneOverlays ?? []) : [];
    if (uiMode === 'FOCUS') {
      return strong.length ? [...strong, ...filteredOverlays] : filteredOverlays;
    }
    return [];
  }, [uiMode, filteredOverlays, overlays, analysis?.strongZoneOverlays, showWhaleZone]);

  const hasStrongZones = (analysis?.strongZoneOverlays?.length ?? 0) > 0;
  const useZoneRange = (uiMode === 'FOCUS' && showWhaleZone) && hasStrongZones;
  const anchored = useMemo(
    () => candles.length ? mapOverlays(modeFilteredOverlays, candles, timeframe, { useZonePriceRange: useZoneRange }) : [],
    [modeFilteredOverlays, candles, timeframe, useZoneRange]
  );

  const [executionPositions, setExecutionPositions] = useState<ExecutionPositions | null>(null);
  useEffect(() => {
    if (uiMode !== 'EXECUTION' || !analysis || !chartRef.current || !seriesRef.current || !hostRef.current || !candles.length) {
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
    const tpY = targets
      .map(t => series.priceToCoordinate(t))
      .filter((y): y is NonNullable<ReturnType<typeof series.priceToCoordinate>> => y != null)
      .map(y => Number(y));
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

  const screenOverlays = useMemo(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const host = hostRef.current;
    if (!chart || !series || !candles.length || !host) return [];
    const rect = host.getBoundingClientRect();
    const pad = 20;
    const xMin = pad;
    const xMax = Math.max(xMin, rect.width - pad);
    const priceStripRight = rect.width - PRICE_AXIS_RESERVE_PX - PRICE_STRIP_PADDING_PX;
    const items = anchored.flatMap((item: any) => {
      const x1Raw = chart.timeScale().timeToCoordinate(item.time1 as UTCTimestamp);
      const y1 = series.priceToCoordinate(item.price1);
      if (x1Raw == null || y1 == null) return [];
      const x2Raw = item.time2 ? chart.timeScale().timeToCoordinate(item.time2 as UTCTimestamp) : null;
      const y2 = typeof item.price2 === 'number' ? series.priceToCoordinate(item.price2) : null;
      const x1 = Math.max(xMin, Math.min(xMax, Number(x1Raw)));
      const x2 = x2Raw != null ? Math.max(xMin, Math.min(xMax, Number(x2Raw))) : null;
      if (x1 < -pad || x1 > rect.width + pad) return [];
      return [{ ...item, x1, y1, x2, y2, xMaxRight: xMax, priceStripRight }];
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
  const getLineStrokeWidth = (item: any) => overlayLineThickness === 'thin' ? 1 : overlayLineThickness === 'thick' ? 3 : (item.kind === 'scenario' ? 2.5 : 2);
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
  const getFontFamily = (id: string) => overlayFontFamily[id] ?? '';
  const getLabelAlign = (id: string): LabelAlign => overlayLabelAlign[id] ?? 'left';
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

  type PriceDisplayPosition = 'left' | 'center';
  const OVERLAY_PRICE_POSITION_KEY = 'ailongshort-overlay-price-position';
  const [priceDisplayPosition, setPriceDisplayPositionState] = useState<PriceDisplayPosition>(() => {
    if (typeof window === 'undefined') return 'left';
    try {
      const raw = window.localStorage.getItem(OVERLAY_PRICE_POSITION_KEY);
      if (raw === 'center' || raw === 'left') return raw;
    } catch {}
    return 'left';
  });
  const setPriceDisplayPosition = (pos: PriceDisplayPosition) => {
    setPriceDisplayPositionState(pos);
    try { window.localStorage.setItem(OVERLAY_PRICE_POSITION_KEY, pos); } catch {}
    setOverlayTick(v => v + 1);
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
    const chart = createChart(host, {
      autoSize: true,
      layout: { background: { color: th.bg }, textColor: th.text },
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
      upColor: '#62efe0',
      downColor: '#ff7b7b',
      borderVisible: false,
      wickUpColor: '#62efe0',
      wickDownColor: '#ff7b7b'
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      color: 'rgba(98,239,224,0.35)'
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeRef.current = volume;

    const refresh = () => setOverlayTick(v => v + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(refresh);
    const ro = new ResizeObserver(refresh);
    ro.observe(host);

    return () => {
      ro.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(refresh);
      zoneRangeSeriesRef.current = null;
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
      layout: { background: { color: th.bg }, textColor: th.text },
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
  }, [theme, timeframe]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length < 2) return;
    if (useZoneRange) {
      if (!zoneRangeSeriesRef.current) {
        const lineSeries = chart.addSeries(LineSeries, {
          color: 'rgba(0,0,0,0)',
          lineWidth: 0,
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

  useEffect(() => {
    let cancelled = false;
    async function loadCandles() {
      try {
        const res = await fetchWithRetry(`/api/market?symbol=${symbol}&timeframe=${timeframe}`, { cache: 'no-store' });
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
          color: x.close >= x.open ? 'rgba(98,239,224,0.28)' : 'rgba(255,123,123,0.28)'
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
          volumeRef.current?.update({ time: candle.time as any, value: candle.volume, color: candle.close >= candle.open ? 'rgba(98,239,224,0.28)' : 'rgba(255,123,123,0.28)' });
          return next;
        }
        if (candle.time > last.time) {
          seriesRef.current?.update({ time: candle.time as any, open: candle.open, high: candle.high, low: candle.low, close: candle.close });
          volumeRef.current?.update({ time: candle.time as any, value: candle.volume, color: candle.close >= candle.open ? 'rgba(98,239,224,0.28)' : 'rgba(255,123,123,0.28)' });
          return [...prev, candle];
        }
        return prev;
      });
      setOverlayTick(v => v + 1);
    }) : () => {};

    return () => { cancelled = true; window.clearInterval(timer); unsub(); };
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
            <button key={tf} className={`tool-chip tool-chip-button ${timeframe === tf ? 'tool-chip-active' : ''}`} onClick={() => setTimeframe(tf)}>{tf}</button>
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
                  onClick={() => apply({
                    showStructure: true,
                    showZones: true,
                    showLabels: true,
                    showScenario: true,
                    showFib: true,
                    showRsi: true,
                    showHarmonic: true,
                    showPo3: true,
                    showCandle: true,
                    showBpr: true,
                    showVision: true,
                    showVisionTriangle: true,
                    showVisionFlag: true,
                    showVisionWedge: true,
                    showVisionReversal: true,
                    showVisionRange: true,
                    showReactionZone: true,
                  })}
                  title="지지/저항, FVG, OB, BOS, EQH/EQL, 라벨, 시나리오, Vision 등 차트에 보이는 기능 전부 켜기"
                >
                  차트 기능 전부 복구
                </button>
                <button type="button" className="tool-chip tool-chip-button" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setLabelMenuOpen(false)}>닫기</button>
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>차트 표시</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button type="button" className={`tool-chip tool-chip-button ${showWhaleZone ? 'tool-chip-active' : ''}`} onClick={() => apply({ showWhaleZone: !showWhaleZone })} title="거래소 API 기반 세력·고래 매수/매도 구간 확률">고래 구간</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showStructure ? 'tool-chip-active' : ''}`} onClick={() => apply({ showStructure: !showStructure })}>구조</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showZones ? 'tool-chip-active' : ''}`} onClick={() => apply({ showZones: !showZones })}>존/구간</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showScenario ? 'tool-chip-active' : ''}`} onClick={() => apply({ showScenario: !showScenario })}>시나리오</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showLabels ? 'tool-chip-active' : ''}`} onClick={() => apply({ showLabels: !showLabels })}>라벨</button>
                  <button type="button" className={`tool-chip tool-chip-button ${labelEditMode ? 'tool-chip-active' : ''}`} onClick={() => apply({ overlayLabelEditMode: !overlayLabelEditMode })} title="겹친 레이블을 드래그 또는 ↑↓ 버튼으로 옮길 수 있습니다">레이블 위치 조정</button>
                  <button type="button" className="tool-chip tool-chip-button" style={{ fontSize: 10 }} onClick={() => { setOverlayOffsets({}); try { window.localStorage.removeItem(OVERLAY_OFFSETS_KEY); } catch {} setOverlayTick(v => v + 1); }} title="모든 레이블 위치를 기본으로 되돌립니다">위치 초기화</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showFib ? 'tool-chip-active' : ''}`} onClick={() => apply({ showFib: !showFib })}>피보</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showRsi ? 'tool-chip-active' : ''}`} onClick={() => apply({ showRsi: !showRsi })}>RSI</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showHarmonic ? 'tool-chip-active' : ''}`} onClick={() => apply({ showHarmonic: !showHarmonic })}>하모닉</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showBpr ? 'tool-chip-active' : ''}`} onClick={() => apply({ showBpr: !showBpr })}>BPR</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showVision ? 'tool-chip-active' : ''}`} onClick={() => apply({ showVision: !showVision })}>Vision</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showVisionTriangle ? 'tool-chip-active' : ''}`} onClick={() => apply({ showVisionTriangle: !showVisionTriangle })} title="위삼각">△</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showVisionFlag ? 'tool-chip-active' : ''}`} onClick={() => apply({ showVisionFlag: !showVisionFlag })}>Flag</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showVisionWedge ? 'tool-chip-active' : ''}`} onClick={() => apply({ showVisionWedge: !showVisionWedge })}>Wedge</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showVisionReversal ? 'tool-chip-active' : ''}`} onClick={() => apply({ showVisionReversal: !showVisionReversal })}>Rev</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showVisionRange ? 'tool-chip-active' : ''}`} onClick={() => apply({ showVisionRange: !showVisionRange })}>Range</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showReactionZone ? 'tool-chip-active' : ''}`} onClick={() => apply({ showReactionZone: !showReactionZone })} title="캔들 위 반응구간(네모 구간)">반응구간</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showRsiPanel ? 'tool-chip-active' : ''}`} onClick={() => apply({ showRsiPanel: !showRsiPanel })}>RSI 패널</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showMacdPanel ? 'tool-chip-active' : ''}`} onClick={() => apply({ showMacdPanel: !showMacdPanel })}>MACD</button>
                  <button type="button" className={`tool-chip tool-chip-button ${showBbPanel ? 'tool-chip-active' : ''}`} onClick={() => apply({ showBbPanel: !showBbPanel })}>BB</button>
                </div>
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>가격 표시 위치 (축 쪽)</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  <button type="button" className={`tool-chip tool-chip-button ${priceDisplayPosition === 'left' ? 'tool-chip-active' : ''}`} style={{ padding: '6px 12px' }} onClick={() => setPriceDisplayPosition('left')} title="가격을 축 왼쪽으로 정렬">좌</button>
                  <button type="button" className={`tool-chip tool-chip-button ${priceDisplayPosition === 'center' ? 'tool-chip-active' : ''}`} style={{ padding: '6px 12px' }} onClick={() => setPriceDisplayPosition('center')} title="가격을 축 기준 중앙 정렬">중</button>
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
                      <th style={{ textAlign: 'left', padding: '6px 8px 8px', fontWeight: 600 }}>라벨</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px 8px', fontWeight: 600 }}>글자체</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px 8px', fontWeight: 600 }}>크기</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px 8px', fontWeight: 600 }}>정렬</th>
                    </tr>
                  </thead>
                  <tbody>
                    {screenOverlays.map((o: any) => (
                      <tr key={o.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <td style={{ padding: '6px 8px', color: '#e2e8f0', whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }} title={o.label || o.id}>{o.label || o.id}</td>
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
                        <td style={{ padding: '4px 8px' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button type="button" className={`tool-chip tool-chip-button ${getLabelAlign(o.id) === 'left' ? 'tool-chip-active' : ''}`} style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => setLabelAlign(o.id, 'left')}>좌</button>
                            <button type="button" className={`tool-chip tool-chip-button ${getLabelAlign(o.id) === 'center' ? 'tool-chip-active' : ''}`} style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => setLabelAlign(o.id, 'center')}>중</button>
                            <button type="button" className={`tool-chip tool-chip-button ${getLabelAlign(o.id) === 'right' ? 'tool-chip-active' : ''}`} style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => setLabelAlign(o.id, 'right')}>우</button>
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
        {screenOverlays.map((item: any) => {
          const off = overlayOffsets[item.id] ?? { dx: 0, dy: 0 };
          const isDragging = dragState?.id === item.id;
          const liveOff = isDragging ? { dx: dragState.currentDx, dy: dragState.currentDy } : off;
          if (['zone', 'fvg', 'ob', 'supplyZone', 'demandZone', 'bprZone', 'reactionZone'].includes(item.kind) && typeof item.x2 === 'number' && typeof item.y2 === 'number') {
            const baseLeft = Math.min(item.x1, item.x2);
            const baseWidth = Math.abs(item.x2 - item.x1);
            const xMaxRight = item.xMaxRight ?? (baseLeft + baseWidth);
            const width = Math.max(baseWidth, xMaxRight - baseLeft);
            const left = baseLeft + liveOff.dx;
            const top = Math.min(item.y1, item.y2) + liveOff.dy;
            const height = Math.abs(item.y2 - item.y1);
            const align = getLabelAlign(item.id);
            const justifyContent = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
            const zoneHigh = typeof item.price1 === 'number' && typeof item.price2 === 'number' ? Math.max(item.price1, item.price2) : (item.price1 ?? item.price2);
            const zoneLow = typeof item.price1 === 'number' && typeof item.price2 === 'number' ? Math.min(item.price1, item.price2) : (item.price1 ?? item.price2);
            const hasPrices = typeof zoneHigh === 'number' && typeof zoneLow === 'number';
            const pricePosLeft = priceDisplayPosition === 'left';
            const zonePriceColor = toSolidOverlayColor(item.color);
            const priceBoxRight = item.priceStripRight ?? left + width;
            const priceBoxStyle: React.CSSProperties = {
              position: 'absolute',
              left: priceBoxRight,
              textAlign: pricePosLeft ? 'right' : 'center',
              whiteSpace: 'nowrap',
              fontSize: 10,
              fontWeight: 600,
              color: zonePriceColor,
              background: 'rgba(8,15,25,0.82)',
              padding: '2px 6px',
              borderRadius: 4,
              pointerEvents: 'none',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.2)',
            };
            return (
              <div key={item.id} style={{ position: 'absolute', left: 0, top: 0 }}>
                <div
                  className="overlay-zone"
                  style={{ left, top, width, height, background: item.color || 'rgba(113,247,189,0.18)', display: 'flex', alignItems: 'center', justifyContent, paddingLeft: 6, paddingRight: 6, cursor: isDragging ? 'grabbing' : 'grab' }}
                  onMouseDown={(e) => startLabelDrag(item.id, left, xMaxRight, liveOff, e)}
                >
                  <span style={{ position: 'static', whiteSpace: 'nowrap', fontSize: getFontSize(item.id), fontFamily: getFontFamily(item.id) || undefined, color: '#f3f8ff', background: 'rgba(8,15,25,.58)', padding: '2px 6px', borderRadius: 999 }}>{item.label}</span>
                </div>
                {hasPrices && (
                  <>
                    <div style={{ ...priceBoxStyle, top: top - PRICE_BOX_OFFSET_VERTICAL, transform: 'translateY(-50%) translateX(-100%)' }}>{formatOverlayPrice(zoneHigh)}</div>
                    <div style={{ ...priceBoxStyle, top: top + height + PRICE_BOX_OFFSET_VERTICAL, transform: 'translateY(-50%) translateX(-100%)' }}>{formatOverlayPrice(zoneLow)}</div>
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
            const lineHeight = Math.max(20, Math.abs(item.y2 - item.y1));
            const yAtRight = item.y1 + (item.y2 - item.y1) * ((xMaxRight - item.x1) / segW);
            const minX = baseMinX + liveOff.dx;
            const minY = baseMinY + liveOff.dy;
            const x1 = item.x1 - baseMinX;
            const y1 = item.y1 - baseMinY;
            const x2 = xMaxRight - baseMinX;
            const y2 = yAtRight - baseMinY;
            const align = getLabelAlign(item.id);
            const textX = align === 'left' ? x1 + 6 : align === 'right' ? Math.max(x1 + 6, x2 - 4) : (x1 + x2) / 2;
            const textAnchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
            const linePriceText = typeof item.price1 === 'number'
              ? (typeof item.price2 === 'number' && Math.abs(item.price1 - item.price2) > 1e-6
                ? `${formatOverlayPrice(item.price1)} ~ ${formatOverlayPrice(item.price2)}`
                : formatOverlayPrice(item.price1))
              : '';
            const labelNudge = item.id === 'tailong-resistance' ? -10 : item.id === 'tailong-support' ? 10 : 0;
            const labelOnlyY = Math.max(12, lineHeight / 2) + labelNudge;
            const priceAnchorEnd = priceDisplayPosition === 'left';
            const linePriceColor = toSolidOverlayColor(item.color);
            const keyLevelDisplayLabel = item.kind === 'keyLevel' && analysis
              ? (item.id.startsWith('key-mustBreak-') && (analysis as { breakoutLevelProbability?: number }).breakoutLevelProbability != null
                ? `${item.label} · ${(analysis as { breakoutLevelProbability: number }).breakoutLevelProbability}%`
                : item.id.startsWith('key-invalidation-') && (analysis as { invalidationLevelProbability?: number }).invalidationLevelProbability != null
                  ? `${item.label} · ${(analysis as { invalidationLevelProbability: number }).invalidationLevelProbability}%`
                  : item.label)
              : item.label;
            return (
              <div key={item.id} style={{ position: 'absolute', left: 0, top: 0 }}>
                <svg
                  className="overlay-svg-item"
                  style={{ left: minX, top: minY, width: lineWidth, height: lineHeight, cursor: isDragging ? 'grabbing' : 'grab' }}
                  viewBox={`0 0 ${lineWidth} ${lineHeight}`}
                  onMouseDown={(e) => startLabelDrag(item.id, minX, xMaxRight, liveOff, e)}
                >
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={item.color || '#62efe0'} strokeWidth={getLineStrokeWidth(item)} strokeDasharray={item.kind === 'scenario' ? '6 5' : undefined} vectorEffect="non-scaling-stroke" />
                  {keyLevelDisplayLabel ? <text x={textX} y={labelOnlyY} fill="#f3f8ff" fontSize={getFontSize(item.id)} fontFamily={getFontFamily(item.id)} textAnchor={textAnchor}>{keyLevelDisplayLabel}</text> : null}
                </svg>
                {linePriceText ? (
                  <div
                    style={{
                      position: 'absolute',
                      left: (item as any).priceStripRight ?? minX + lineWidth,
                      top: minY + y2 - PRICE_BOX_OFFSET_VERTICAL,
                      transform: 'translateY(-50%) translateX(-100%)',
                      textAlign: priceAnchorEnd ? 'right' : 'center',
                      whiteSpace: 'nowrap',
                      fontSize: getFontSize(item.id),
                      fontFamily: getFontFamily(item.id) || undefined,
                      fontWeight: 600,
                      color: linePriceColor,
                      background: 'rgba(8,15,25,0.82)',
                      padding: '2px 6px',
                      borderRadius: 4,
                      pointerEvents: 'none',
                      boxShadow: '0 0 0 1px rgba(0,0,0,0.2)',
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
          const pinLeft = item.x1 + liveOff.dx;
          const pinTop = item.y1 + liveOff.dy;
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
              {[item.label, typeof item.price1 === 'number' ? formatOverlayPrice(item.price1) : null].filter(Boolean).join(' · ')}
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
        {uiMode === 'EXECUTION' && (analysis?.verdict === 'LONG' || analysis?.verdict === 'SHORT') && (analysis?.confidence ?? 0) >= 80 && (
          <ExecutionOverlay analysis={analysis} positions={executionPositions} theme={theme} />
        )}
      </div>

      {showRsiPanel && analysis?.indicators && (
        <div className="indicator-panel" style={{ bottom: 48 }}>
          <div className="rsi-panel-title">RSI / StochRSI</div>
          <div className="rsi-panel-chart">
            {(() => {
              const ind = analysis.indicators;
              const rsi = ind.rsi || [];
              const k = ind.stochK || [];
              const d = ind.stochD || [];
              const tail = Math.min(60, rsi.length);
              const slice = (arr: number[]) => arr.slice(-tail);
              const rs = slice(rsi);
              const ks = slice(k);
              const ds = slice(d);
              const max = Math.max(100, ...rs, ...ks, ...ds);
              const min = Math.min(0, ...rs, ...ks, ...ds);
              const h = 40;
              const toY = (v: number) => h - ((v - min) / (max - min || 1)) * h;
              return (
                <svg width="100%" height={h} preserveAspectRatio="none" viewBox={`0 0 ${Math.max(1, tail)} ${h}`}>
                  {rs.length > 1 && <polyline fill="none" stroke="#62efe0" strokeWidth="0.5" points={rs.map((v, i) => `${i},${toY(v)}`).join(' ')} />}
                  {ks.length > 1 && <polyline fill="none" stroke="#4df2a3" strokeWidth="0.5" strokeDasharray="2 2" points={ks.map((v, i) => `${i},${toY(v)}`).join(' ')} />}
                  {ds.length > 1 && <polyline fill="none" stroke="#ffb86b" strokeWidth="0.5" strokeDasharray="2 2" points={ds.map((v, i) => `${i},${toY(v)}`).join(' ')} />}
                  <line x1={0} y1={toY(30)} x2={tail} y2={toY(30)} stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
                  <line x1={0} y1={toY(70)} x2={tail} y2={toY(70)} stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
                </svg>
              );
            })()}
          </div>
          <div className="rsi-panel-legend">
            <span style={{ color: '#62efe0' }}>RSI</span>
            <span style={{ color: '#4df2a3' }}>K</span>
            <span style={{ color: '#ffb86b' }}>D</span>
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
