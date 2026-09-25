'use client';

/**
 * 타점엔진 차트 — TradingView 지표 스타일.
 * 존=반투명 밴드 · E/SL/TP·구조=전폭 가격선 · 이벤트=캔들 마크.
 * 선진거래량 = 통합·분석과 동일 스택(매도적/매수녹) + 거래량 막대 라벨.
 * 캔들 색 = 통합·분석과 동일(설정 클래식/모노/AI톤 · 존·선 근접 · 거래량 테두리).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  LineType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { ChartCandleCloseTimer } from '@/app/components/ChartCandleCloseTimer';
import {
  clearTapointChartView,
  writeTapointChartView,
} from '@/lib/eagle1Tapoint/tapointChartViewPersist';
import type {
  TapointChartLineStyle,
  TapointChartSignals,
  TapointChartZoneBand,
} from '@/lib/eagle1Tapoint/chartSignals';
import type {
  TapointInstBand2Segment,
  TapointInstBandSegment,
  TapointParallelChannelSeg,
} from '@/lib/eagle1Tapoint/buildTapointSharedMergedLayers';
import {
  pceUpperColor,
  pceLowerColor,
} from '@/lib/eagle1Tapoint/buildTapointSharedMergedLayers';
import type { Candle } from '@/types';
import {
  buildMergedDeskAdvVolumePack,
  compactAdvVolBarLabelKo,
} from '@/lib/mergedDeskAdvVolumeRead';
import { layoutVolumeMarkersHorizontal } from '@/lib/volumeHistogramIntelligence';
import {
  ChartVolBarLabels,
  chartVolBarLabelGlyph,
  type ChartVolBarLabelItem,
} from '@/app/components/ChartVolBarLabels';
import { loadSettings } from '@/lib/settings';
import { SETTINGS_CHANGED_EVENT } from '@/lib/useSettingsChangeTick';
import { readDumpZoneUserStyle } from '@/lib/mergedDeskDumpZoneStyle';
import {
  buildTapointCandlestickPaintData,
  resolveTapointCandleSeriesOptions,
} from '@/lib/eagle1Tapoint/sharedMergedDeskCandlePaint';

export type TapointCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type TapointLevels = {
  entry?: number | null;
  sl?: number | null;
  tp1?: number | null;
  tp2?: number | null;
  tp3?: number | null;
  zoneLo?: number | null;
  zoneHi?: number | null;
  zoneMid?: number | null;
};

type Props = {
  candles: TapointCandle[];
  /** 선진거래량 팩 TF (통합모드와 동일 로직) */
  timeframe?: string;
  /** 심볼 바뀌면 뷰 홀드·지문 리셋 */
  symbol?: string;
  levels?: TapointLevels | null;
  signals?: TapointChartSignals | null;
  decisionKo?: string;
  onRestoreCandles?: () => void;
  /** 통합·분석 공동 — 기관밴드1: ST 존상·존하 쌍선(채널/볼밴형) */
  institutionalBandOn?: boolean;
  institutionalBandSegments?: TapointInstBandSegment[] | null;
  /** 기관밴드2 — SuperTrend 활성선만 (롱=초록 / 숏=빨강 전환) */
  institutionalBand2On?: boolean;
  institutionalBand2Segments?: TapointInstBand2Segment[] | null;
  /** 독수리1호 평행채널 — 통합분석과 공동 */
  parallelChannelOn?: boolean;
  parallelChannelSegments?: TapointParallelChannelSeg[] | null;
};

type ZoneLayout = TapointChartZoneBand & { top: number; height: number; visible: boolean };
type StructLineLabel = {
  id: string;
  title: string;
  top: number;
  left: number;
  width: number;
  color: string;
  labelSide: 'above' | 'below';
  visible: boolean;
  /** SWEEP 등 — 가로 점선 */
  dashed?: boolean;
};

type SweepMarkLabel = {
  id: string;
  title: string;
  top: number;
  left: number;
  color: string;
  side: 'above' | 'below';
  visible: boolean;
};

function toSec(t: number): UTCTimestamp {
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 0 as UTCTimestamp;
  return (n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)) as UTCTimestamp;
}

function styleToLwc(s: TapointChartLineStyle | undefined): LineStyle {
  if (s === 'dashed') return LineStyle.Dashed;
  if (s === 'dotted') return LineStyle.Dotted;
  if (s === 'sparse') return LineStyle.SparseDotted;
  return LineStyle.Solid;
}

function normalizeRows(candles: TapointCandle[]) {
  const seen = new Set<number>();
  const rows: Array<{
    time: UTCTimestamp;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> = [];
  for (const c of candles || []) {
    const time = toSec(c.time);
    const open = Number(c.open);
    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);
    const volume = Number(c.volume) || 0;
    if (!(time > 0) || !(open > 0) || !(close > 0) || !(high > 0) || !(low > 0)) continue;
    if (seen.has(time as number)) continue;
    seen.add(time as number);
    rows.push({
      time,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
      volume,
    });
  }
  rows.sort((a, b) => (a.time as number) - (b.time as number));
  return rows;
}

function rowsToCandles(
  rows: Array<{
    time: UTCTimestamp;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>
): Candle[] {
  return rows.map((r) => ({
    time: r.time as number,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
  }));
}

/** 봉 지문 — 동일 데이터면 setData/fit 스킵(반짝·리셋 방지) */
function candleFingerprint(rows: TapointCandle[]): string {
  const n = rows?.length || 0;
  if (!n) return '0';
  const a = rows[0]!;
  const b = rows[n - 1]!;
  return `${n}|${toSec(a.time)}|${toSec(b.time)}|${Number(b.close)}|${Number(b.high)}|${Number(b.low)}`;
}

/** 봉 개수·시간축만 — 팁 OHLC 무시 (구조 동일 여부) */
function candleAxisFingerprint(rows: TapointCandle[]): string {
  const n = rows?.length || 0;
  if (!n) return '0';
  const a = rows[0]!;
  const b = rows[n - 1]!;
  return `${n}|${toSec(a.time)}|${toSec(b.time)}`;
}

export default function TapointCleanChart({
  candles,
  timeframe = '3m',
  symbol = '',
  levels,
  signals,
  decisionKo,
  onRestoreCandles,
  institutionalBandOn = false,
  institutionalBandSegments = null,
  institutionalBand2On = false,
  institutionalBand2Segments = null,
  parallelChannelOn = false,
  parallelChannelSegments = null,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const volBuyRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const bandSeriesRef = useRef<ISeriesApi<'Line'>[]>([]);
  const band2SeriesRef = useRef<ISeriesApi<'Line'>[]>([]);
  const pceSeriesRef = useRef<ISeriesApi<'Line'>[]>([]);
  const markersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const candlesRef = useRef(candles);
  const signalsRef = useRef(signals);
  const levelsRef = useRef(levels);
  const timeframeRef = useRef(timeframe);
  const symbolRef = useRef(symbol);
  /**
   * 줌/팬(시간축)만 유지 — 사용자가 직접 움직인 뒤에만 pin.
   * 가격축 autoScale 잠금·크로스헤어 저장 금지 → 거래량만 남고 캔들 블랙 현상 방지.
   * 심볼·TF별 localStorage에 저장해 리로드·서버 재접속 후에도 자리 유지.
   */
  const viewHoldRef = useRef({
    /** 휠·드래그로만 true — subscribe 범위변경으로 pin 하지 않음(우측 붙음 방지) */
    interacted: false,
    logical: null as { from: number; to: number } | null,
    /** 초 단위 가시 시간 — 봉 추가돼도 자리 유지 */
    timeRange: null as { from: number; to: number } | null,
    skipSave: false,
    /** setData 직후 복원 중 — onVis가 우측 뷰를 저장하지 않게 */
    restoring: false,
  });
  const persistViewTimerRef = useRef<number | null>(null);
  const lastAxisFpRef = useRef('');
  const lastGoodRowsRef = useRef<TapointCandle[]>([]);
  const lastAppliedFpRef = useRef('');
  const hostWasZeroRef = useRef(false);
  const advMarkersRef = useRef<Array<{ time: number; text: string; color: string }>>([]);
  const [hintKo, setHintKo] = useState('');
  const [zoneLayouts, setZoneLayouts] = useState<ZoneLayout[]>([]);
  const [structLabels, setStructLabels] = useState<StructLineLabel[]>([]);
  const structLabelsRef = useRef<StructLineLabel[]>([]);
  const [sweepLabels, setSweepLabels] = useState<SweepMarkLabel[]>([]);
  const sweepLabelsRef = useRef<SweepMarkLabel[]>([]);
  const [markLabels, setMarkLabels] = useState<
    Array<{ key: string; text: string; color: string; x: number; y: number; above: boolean }>
  >([]);
  const [pinLabels, setPinLabels] = useState<
    Array<{ id: string; text: string; color: string; top: number; left: number }>
  >([]);

  const [volLabels, setVolLabels] = useState<{
    top: number;
    items: ChartVolBarLabelItem[];
  } | null>(null);
  const [advOn, setAdvOn] = useState(false);
  const [settingsTick, setSettingsTick] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const labelFontPx = useMemo(() => {
    const n = Number(loadSettings().tapointChartLabelFontSize);
    return Math.max(7, Math.min(16, Math.round(Number.isFinite(n) ? n : 9)));
  }, [settingsTick]);
  const labelColor = useMemo(() => {
    const c = String(loadSettings().tapointChartLabelColor || '');
    return /^#[0-9a-fA-F]{6}$/.test(c) ? c : '';
  }, [settingsTick]);
  const ink = (c: string) => labelColor || c;
  const dumpStyle = useMemo(() => readDumpZoneUserStyle(), [settingsTick]);
  const dumpEdgePx = dumpStyle;
  candlesRef.current = candles;
  signalsRef.current = signals;
  levelsRef.current = levels;
  timeframeRef.current = timeframe;
  symbolRef.current = symbol;

  const schedulePersistView = useCallback(() => {
    const hold = viewHoldRef.current;
    if (!hold.interacted || (!hold.logical && !hold.timeRange)) return;
    if (persistViewTimerRef.current != null) {
      window.clearTimeout(persistViewTimerRef.current);
    }
    persistViewTimerRef.current = window.setTimeout(() => {
      persistViewTimerRef.current = null;
      const h = viewHoldRef.current;
      if (!h.interacted || (!h.logical && !h.timeRange)) return;
      writeTapointChartView(symbolRef.current, timeframeRef.current, {
        logical: h.logical,
        timeRange: h.timeRange,
        interacted: true,
      });
    }, 280);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onSettings = () => setSettingsTick((t) => t + 1);
    window.addEventListener(SETTINGS_CHANGED_EVENT, onSettings);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, onSettings);
  }, []);

  /** Bitget 선물 봉마감 카운트다운 — 분·시·일·주·월 거래소 정렬 */
  useEffect(() => {
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const lastClose = useMemo(() => {
    const n = candles?.length || 0;
    if (!n) return null;
    const c = Number(candles[n - 1]?.close);
    return Number.isFinite(c) && c > 0 ? c : null;
  }, [candles]);

  const lastFitKeyRef = useRef('');
  const applyCandleDataRef = useRef<
    (rowsIn: TapointCandle[], opts?: { forceFit?: boolean; reason?: string }) => void
  >(() => {});
  const layoutZonesRef = useRef<() => void>(() => {});
  const schedulePersistViewRef = useRef(schedulePersistView);
  schedulePersistViewRef.current = schedulePersistView;

  const layoutVolLabels = useCallback(() => {
    const chart = chartRef.current;
    const host = hostRef.current;
    const markers = advMarkersRef.current;
    if (!chart || !host || !markers.length) {
      setVolLabels(null);
      return;
    }
    const rows = normalizeRows(candlesRef.current);
    const laid = layoutVolumeMarkersHorizontal(
      markers.map((m) => ({
        time: toSec(m.time),
        position: 'aboveBar' as const,
        shape: 'square' as const,
        color: m.color,
        text: m.text,
      })),
      rows.map((c) => ({ time: Number(c.time) })),
      6,
      4
    );
    if (!laid.length) {
      setVolLabels(null);
      return;
    }
    const rect = host.getBoundingClientRect();
    const top = Math.max(0, Math.round(rect.height * 0.82) + 2);
    const ts = chart.timeScale();
    const items: ChartVolBarLabelItem[] = [];
    let lastX = -9999;
    for (const m of laid) {
      const tx = compactAdvVolBarLabelKo(String(m.text || ''));
      if (!tx) continue;
      let x: number | null = null;
      try {
        const xc = ts.timeToCoordinate(m.time);
        if (xc != null && Number.isFinite(Number(xc))) x = Number(xc);
      } catch {
        /* ignore */
      }
      if (x == null) continue;
      const xPad = 28;
      if (x < -xPad || x > rect.width + xPad) continue;
      const xClamped = Math.max(8, Math.min(rect.width - 8, x));
      if (items.length && Math.abs(xClamped - lastX) < 14) continue;
      lastX = xClamped;
      items.push({
        key: `${m.time}|${tx}`,
        x: xClamped,
        text: tx,
        color: m.color,
        glyph: chartVolBarLabelGlyph(tx),
      });
      if (items.length >= 24) break;
    }
    setVolLabels(items.length ? { top, items } : null);
  }, []);

  const layoutZones = useCallback(() => {
    try {
    const series = candleRef.current;
    const host = hostRef.current;
    const hostH = host?.clientHeight || 0;
    if (!series) {
      setZoneLayouts([]);
      setStructLabels([]);
      setSweepLabels([]);
      setMarkLabels([]);
      setPinLabels([]);
      sweepLabelsRef.current = [];
      layoutVolLabels();
      return;
    }
    const clampLabelY = (price: number, yIn: number | null): number | null => {
      if (!(hostH > 0) || !(price > 0)) return yIn != null && Number.isFinite(yIn) ? yIn : null;
      if (yIn != null && Number.isFinite(yIn)) {
        return Math.max(12, Math.min(hostH - 16, yIn));
      }
      try {
        const topP = Number(series.coordinateToPrice(0));
        const botP = Number(series.coordinateToPrice(Math.max(1, hostH - 1)));
        if (!Number.isFinite(topP) || !Number.isFinite(botP)) return null;
        const hi = Math.max(topP, botP);
        const lo = Math.min(topP, botP);
        if (price >= hi) return 12;
        if (price <= lo) return Math.max(12, hostH - 16);
      } catch {
        /* ignore */
      }
      return null;
    };

    const zones = signalsRef.current?.zones || [];
    const next: ZoneLayout[] = [];
    for (const z of zones) {
      const yHi = series.priceToCoordinate(z.hi);
      const yLo = series.priceToCoordinate(z.lo);
      if (yHi == null && yLo == null) {
        const yA = clampLabelY(z.hi, null);
        const yB = clampLabelY(z.lo, null);
        if (yA == null || yB == null) {
          next.push({ ...z, top: 0, height: 0, visible: false });
          continue;
        }
        const top = Math.min(yA, yB);
        const height = Math.max(3, Math.abs(yB - yA));
        next.push({ ...z, top, height, visible: true });
        continue;
      }
      const yHiUse = yHi == null ? clampLabelY(z.hi, null) : yHi;
      const yLoUse = yLo == null ? clampLabelY(z.lo, null) : yLo;
      if (yHiUse == null || yLoUse == null) {
        next.push({ ...z, top: 0, height: 0, visible: false });
        continue;
      }
      const top = Math.min(yHiUse, yLoUse);
      const height = Math.max(3, Math.abs(yLoUse - yHiUse));
      /** 줌으로 가격이 화면 밖으로 나가도 라벨은 가장자리에 유지 */
      next.push({ ...z, top, height, visible: true });
    }
    setZoneLayouts(next);

    /**
     * BOS/CHoCH/EQL/SWEEP — 이미지형 가로줄(형성봉→우측) + 선 위/아래 라벨.
     * SWEEP = 노랑 점선.
     */
    const chart = chartRef.current;
    const hostW = host?.clientWidth || 0;
    const ts = chart?.timeScale();
    const structNext: StructLineLabel[] = [];
    const seenPrice = new Set<string>();
    const prevMap = new Map(structLabelsRef.current.map((s) => [s.id, s]));
    for (const L of signalsRef.current?.lines || []) {
      const title = String(L.title || '');
      if (!/^(BOS|CHoCH|CHOCH|EQL|EQH|SWEEP)\b/i.test(title)) continue;
      if (L.group !== 'structure' && L.group !== 'liquidity') continue;
      const kindKey = /^(BOS|CHoCH|CHOCH|EQL|EQH|SWEEP)/i.exec(title)?.[1]?.toUpperCase() || 'X';
      const pk = `${kindKey}|${Math.round(Number(L.price))}`;
      if (seenPrice.has(pk)) continue;
      seenPrice.add(pk);
      const short = title.replace(/CHOCH/i, 'CHoCH').slice(0, 14);
      const isSweep = /^SWEEP\b/i.test(title);
      const labelSide: 'above' | 'below' =
        L.labelSide === 'above' || L.labelSide === 'below'
          ? L.labelSide
          : /EQH/i.test(title)
            ? 'above'
            : 'below';
      const prev = prevMap.get(L.id);
      let top: number | null = null;
      try {
        const y = series.priceToCoordinate(L.price);
        if (y != null && Number.isFinite(Number(y))) top = Math.round(Number(y));
      } catch {
        top = null;
      }
      if (top == null && prev) {
        structNext.push({
          ...prev,
          title: short,
          color: L.color || prev.color,
          labelSide,
          dashed: isSweep || L.lineStyle === 'dashed' || prev.dashed,
          visible: true,
        });
        if (structNext.length >= 80) break;
        continue;
      }
      const topClamped = clampLabelY(L.price, top);
      if (topClamped == null) continue;

      /** 화면 밖 timeToCoordinate=null → 가장자리 클램프 (드래그 시 라벨 유지) */
      const edgeL = 4;
      const edgeR = Math.max(40, hostW - 56);
      let x1 = edgeL;
      let x2 = edgeR;
      let gotX1 = false;
      let gotX2 = false;
      if (ts && hostW > 0) {
        const t0 = L.timeFrom != null ? Number(toSec(L.timeFrom)) : NaN;
        if (Number.isFinite(t0) && t0 > 0) {
          try {
            const xc = ts.timeToCoordinate(t0 as never);
            if (xc != null && Number.isFinite(Number(xc))) {
              x1 = Number(xc);
              gotX1 = true;
            } else {
              x1 = edgeL;
              gotX1 = true;
            }
          } catch {
            x1 = edgeL;
            gotX1 = true;
          }
        }
        const t1 =
          L.timeTo != null
            ? Number(toSec(L.timeTo))
            : (() => {
                const rows = normalizeRows(candlesRef.current);
                return rows.length ? Number(rows[rows.length - 1]!.time) : NaN;
              })();
        if (Number.isFinite(t1) && t1 > 0) {
          try {
            const xc2 = ts.timeToCoordinate(t1 as never);
            if (xc2 != null && Number.isFinite(Number(xc2))) {
              x2 = Number(xc2);
              gotX2 = true;
            } else {
              x2 = edgeR;
              gotX2 = true;
            }
          } catch {
            x2 = edgeR;
            gotX2 = true;
          }
        }
      }
      if (prev && (!gotX1 || !gotX2)) {
        if (!gotX1) x1 = prev.left;
        if (!gotX2) x2 = prev.left + prev.width;
      }
      const leftRaw = Math.min(x1, x2);
      const rightRaw = Math.max(x1, x2);
      const left = Math.max(edgeL - 40, Math.min(leftRaw, edgeR));
      const right = Math.max(left + 28, Math.min(rightRaw, edgeR + 40));
      const width = Math.max(28, right - left);
      const onScreen = true;
      structNext.push({
        id: L.id,
        title: short,
        top: topClamped,
        left,
        width,
        color: L.color || (isSweep ? '#facc15' : '#a78bfa'),
        labelSide,
        dashed: isSweep || L.lineStyle === 'dashed',
        visible: onScreen || Boolean(prev),
      });
      if (structNext.length >= 80) break;
    }
    structLabelsRef.current = structNext;
    setStructLabels(structNext);

    const markNext: Array<{
      key: string;
      text: string;
      color: string;
      x: number;
      y: number;
      above: boolean;
    }> = [];
    for (const m of signalsRef.current?.markers || []) {
      const text = String(m.label || '').trim();
      if (!text) continue;
      if (/sweep/i.test(text)) continue;
      const sec = Number(toSec(m.time));
      if (!(sec > 0) || !ts) continue;
      let x: number | null = null;
      try {
        const xc = ts.timeToCoordinate(sec as never);
        if (xc != null && Number.isFinite(Number(xc))) x = Number(xc);
      } catch {
        x = null;
      }
      if (x == null || x < 0 || x > hostW - 8) continue;
      const yRaw = series.priceToCoordinate(m.price);
      const y = clampLabelY(m.price, yRaw == null ? null : Number(yRaw));
      if (y == null) continue;
      markNext.push({
        key: `${sec}|${text}|${m.position}`,
        text,
        color: m.color || '#e2e8f0',
        x,
        y,
        above: m.position !== 'belowBar',
      });
    }
    setMarkLabels(markNext);

    const pinNext: Array<{ id: string; text: string; color: string; top: number; left: number }> = [];
    const seenPin = new Set<string>();
    const candleX = (sec: number): number | null => {
      if (!ts || !(sec > 0)) return null;
      try {
        const xc = ts.timeToCoordinate(sec as never);
        if (xc != null && Number.isFinite(Number(xc))) return Number(xc);
      } catch {
        return null;
      }
      return null;
    };
    const rowsNow = normalizeRows(candlesRef.current);
    const lastSec = rowsNow.length ? Number(rowsNow[rowsNow.length - 1]!.time) : NaN;
    let fallbackX = candleX(lastSec);
    try {
      const xc = ts.logicalToCoordinate((rowsNow.length - 1 + 10) as never);
      if (xc != null && Number.isFinite(Number(xc))) fallbackX = Number(xc);
    } catch {
      /* ignore */
    }
    const pushPin = (
      id: string,
      text: string,
      color: string,
      price: number | null | undefined,
      timeFrom?: number
    ) => {
      const label = String(text || '').trim();
      const px = Number(price);
      if (!label || !(px > 0)) return;
      const key = `${label}|${Math.round(px)}`;
      if (seenPin.has(key)) return;
      const yRaw = series.priceToCoordinate(px);
      const y = clampLabelY(px, yRaw == null ? null : Number(yRaw));
      if (y == null) return;
      const anchored = timeFrom != null ? candleX(Number(toSec(timeFrom))) : null;
      const left = anchored != null ? anchored : fallbackX;
      if (left == null || left < 0 || left > hostW - 8) return;
      seenPin.add(key);
      pinNext.push({ id: id || key, text: label, color: color || '#e2e8f0', top: y, left });
    };
    for (const L of signalsRef.current?.lines || []) {
      if (/^(BOS|CHoCH|CHOCH|EQL|EQH|SWEEP)\b/i.test(String(L.title || ''))) continue;
      pushPin(L.id, L.title, L.color, L.price, L.timeFrom);
    }
    const lv = levelsRef.current;
    if (lv) {
      pushPin('lv-entry', '진입', '#38bdf8', lv.entry);
      pushPin('lv-sl', '손절', '#f87171', lv.sl);
      pushPin('lv-tp1', '익절1', '#4ade80', lv.tp1);
      pushPin('lv-tp2', '익절2', '#22c55e', lv.tp2);
      pushPin('lv-tp3', '익절3', '#16a34a', lv.tp3);
    }
    setPinLabels(pinNext);

    /**
     * 캔들 SWEEP 마크 (연속 2회 = 봉 위/아래 노란 점+글자).
     * 가로 점선은 struct hline 유지. 글자는 HTML — 줌에도 남음.
     */
    const sweepNext: SweepMarkLabel[] = [];
    const seenSweepMark = new Set<string>();
    for (const m of signalsRef.current?.markers || []) {
      const text = String(m.label || '').trim();
      if (!/sweep/i.test(text)) continue;
      const sec = Number(toSec(m.time));
      if (!(sec > 0) || !ts) continue;
      let x: number | null = null;
      try {
        const xc = ts.timeToCoordinate(sec as never);
        if (xc != null && Number.isFinite(Number(xc))) x = Number(xc);
      } catch {
        x = null;
      }
      if (x == null || x < 0 || x > hostW - 8) continue;
      const yRaw = series.priceToCoordinate(m.price);
      const y = clampLabelY(m.price, yRaw == null ? null : Number(yRaw));
      if (y == null) continue;
      const side: 'above' | 'below' = m.position === 'belowBar' ? 'below' : 'above';
      /** 같은 봉에 위·아래 이중 SWEEP 금지 · 연속 다른 봉은 sec가 다름 */
      const id = String(sec);
      if (seenSweepMark.has(id)) continue;
      seenSweepMark.add(id);
      sweepNext.push({
        id,
        title: 'SWEEP',
        top: y,
        left: Math.round(x),
        color: m.color || '#facc15',
        side,
        visible: true,
      });
    }
    sweepLabelsRef.current = sweepNext;
    setSweepLabels(sweepNext);

    layoutVolLabels();
    } catch {
      /* 팩터펼침·리사이즈 중 좌표/라벨 예외 무시 */
    }
  }, [layoutVolLabels]);

  const applyCandleData = useCallback(
    (rowsIn: TapointCandle[], opts?: { forceFit?: boolean; reason?: string }) => {
      const series = candleRef.current;
      const vol = volRef.current;
      const buy = volBuyRef.current;
      if (!series || !vol) return;

      let rows = normalizeRows(rowsIn);
      /** 심볼·TF이 아직 안 맞으면 빈 배열 — 이전 봉을 다른 화면으로 그리지 않음 */
      if (!rows.length) return;
      lastGoodRowsRef.current = rowsToCandles(rows) as TapointCandle[];

      const candleRows = rowsToCandles(rows) as TapointCandle[];
      const fp = candleFingerprint(candleRows);
      const axisFp = candleAxisFingerprint(candleRows);
      if (
        !opts?.forceFit &&
        fp === lastAppliedFpRef.current &&
        (opts?.reason === 'candles' ||
          opts?.reason === 'resize' ||
          opts?.reason === 'settings' ||
          opts?.reason === 'signals' ||
          opts?.reason === 'levels')
      ) {
        requestAnimationFrame(() => layoutZonesRef.current());
        return;
      }

      /**
       * 신호/레벨 폴링 — 봉 동일하면 setData 금지(맨 우측 붙음 주원인).
       * 가격선·마커는 별도 effect가 처리.
       */
      if (
        !opts?.forceFit &&
        fp === lastAppliedFpRef.current &&
        (opts?.reason === 'signals' || opts?.reason === 'levels')
      ) {
        requestAnimationFrame(() => layoutZonesRef.current());
        return;
      }

      const settings = loadSettings();
      const hold = viewHoldRef.current;
      const chartApi = chartRef.current;
      const shouldFit =
        opts?.forceFit === true ||
        lastFitKeyRef.current.split('|')[0] !== String(timeframeRef.current);

      try {
        series.applyOptions({
          ...resolveTapointCandleSeriesOptions(settings),
          visible: true,
        });
        if (!hold.interacted || shouldFit) {
          series.priceScale().applyOptions({ autoScale: true });
        }
      } catch {
        /* ignore */
      }

      /** 캔들 setData 직전 — 지금 화면 그대로 스냅샷 (pin 여부 무관) */
      const snapHold = () => {
        if (!chartApi) return;
        try {
          const lr = chartApi.timeScale().getVisibleLogicalRange();
          if (lr && Number.isFinite(lr.from) && Number.isFinite(lr.to) && lr.to - lr.from > 2) {
            hold.logical = { from: lr.from, to: lr.to };
          }
          const tr = chartApi.timeScale().getVisibleRange();
          if (
            tr &&
            Number.isFinite(Number(tr.from)) &&
            Number.isFinite(Number(tr.to)) &&
            Number(tr.to) > Number(tr.from)
          ) {
            hold.timeRange = { from: Number(tr.from), to: Number(tr.to) };
          }
        } catch {
          /* ignore */
        }
      };

      /** setData 후 우측 점프 방지 — 스냅샷 가시범위 강제 복원 */
      const restoreView = () => {
        if (!chartApi || opts?.forceFit) return false;
        /** logical 우선: 봉 추가돼도 같은 구간 유지 (timeRange는 우측으로 늘어날 수 있음) */
        if (hold.logical) {
          try {
            chartApi.timeScale().setVisibleLogicalRange(hold.logical);
            return true;
          } catch {
            /* fall through time */
          }
        }
        try {
          if (
            hold.timeRange &&
            Number.isFinite(hold.timeRange.from) &&
            Number.isFinite(hold.timeRange.to) &&
            hold.timeRange.to > hold.timeRange.from
          ) {
            chartApi.timeScale().setVisibleRange({
              from: hold.timeRange.from as never,
              to: hold.timeRange.to as never,
            });
            return true;
          }
        } catch {
          /* ignore */
        }
        return false;
      };

      const unlockSaveSoon = () => {
        requestAnimationFrame(() => {
          restoreView();
          requestAnimationFrame(() => {
            restoreView();
            hold.restoring = false;
            hold.skipSave = false;
            layoutZonesRef.current();
          });
        });
      };

      /** setData/update 직전 — 가시범위 스냅샷 + 저장 잠금 */
      snapHold();
      hold.skipSave = true;
      hold.restoring = true;

      const painted = (() => {
        try {
          const data = buildTapointCandlestickPaintData(candleRows, {
            timeframe: timeframeRef.current || '3m',
            signals: signalsRef.current,
            levels: levelsRef.current,
            settings,
            pulsePhase: 0,
            reducedMotion: true,
          });
          if (Array.isArray(data) && data.length >= Math.min(8, rows.length)) return data;
        } catch {
          /* fall through */
        }
        return rows;
      })();

      /**
       * 봉 개수·시간축 동일 + 팁만 갱신 → update (setData 회피 = 우측 점프 방지)
       */
      const tipOnly =
        !opts?.forceFit &&
        !shouldFit &&
        lastAxisFpRef.current === axisFp &&
        lastAppliedFpRef.current !== '' &&
        lastAppliedFpRef.current !== fp &&
        rows.length > 0;

      let wroteOk = false;
      if (tipOnly) {
        try {
          const last = (Array.isArray(painted) ? painted : rows)[rows.length - 1] as {
            time: unknown;
            open: number;
            high: number;
            low: number;
            close: number;
            volume?: number;
          };
          series.update(last as never);
          try {
            const vLast = rows[rows.length - 1]!;
            vol.update({
              time: vLast.time,
              value: vLast.volume,
              color:
                vLast.close >= vLast.open
                  ? 'rgba(34,197,94,0.35)'
                  : 'rgba(248,113,113,0.35)',
            } as never);
          } catch {
            /* vol tip optional */
          }
          wroteOk = true;
        } catch {
          wroteOk = false;
        }
      }

      if (!wroteOk) {
        try {
          series.setData(painted as typeof rows);
          wroteOk = true;
        } catch {
          try {
            series.setData(rows);
            wroteOk = true;
          } catch {
            setHintKo('캔들 그리기 실패 · 기존봉 유지 · 캔들복원');
            hold.restoring = false;
            hold.skipSave = false;
            return;
          }
        }

        let usedAdv = false;
        try {
          const pack = buildMergedDeskAdvVolumePack(candleRows, {
            timeframe: timeframeRef.current || '3m',
            swingAnchorOn: true,
            spotPx: rows[rows.length - 1]?.close ?? null,
          });
          if (pack.sellHist.length > 0) {
            vol.setData(pack.sellHist);
            vol.applyOptions({
              visible: true,
              base: 0,
              lastValueVisible: false,
              priceLineVisible: false,
            });
            if (buy) {
              buy.applyOptions({
                visible: true,
                base: 0,
                lastValueVisible: false,
                priceLineVisible: false,
                color: 'rgba(34,197,94,0.88)',
              });
              buy.setData(pack.buyHist);
            }
            advMarkersRef.current = (pack.markers || [])
              .map((m) => ({
                time: Number(m.time),
                text: String(m.text || ''),
                color: String(m.color || '#94a3b8'),
              }))
              .filter((m) => m.time > 0 && m.text);
            usedAdv = true;
          }
        } catch {
          usedAdv = false;
        }

        if (!usedAdv) {
          advMarkersRef.current = [];
          try {
            buy?.setData([]);
            buy?.applyOptions({ visible: false });
          } catch {
            /* ignore */
          }
          vol.setData(
            rows.map((r) => ({
              time: r.time,
              value: r.volume,
              color: r.close >= r.open ? 'rgba(34,197,94,0.35)' : 'rgba(248,113,113,0.35)',
            }))
          );
        }
        setAdvOn(usedAdv);
      }

      lastAppliedFpRef.current = fp;
      lastAxisFpRef.current = axisFp;

      if (opts?.reason !== 'signals' && opts?.reason !== 'levels') {
        setHintKo('');
      }

      const fitKey = `${timeframeRef.current}|${rows[0]?.time}|${rows.length}`;

      /** 전체 맞춤(fitContent)은 과거 구간을 먼저 보여 준 뒤 실시간으로 튕긴다. 오른쪽 끝만 고정 */
      const pinLiveEdge = () => {
        if (!chartApi || rows.length < 2) return;
        const n = rows.length;
        const vis = Math.min(130, Math.max(48, n));
        const to = n + 2;
        const from = Math.max(0, to - vis);
        try {
          chartApi.timeScale().setVisibleLogicalRange({ from, to });
          lastFitKeyRef.current = fitKey;
          hold.logical = { from, to };
          hold.timeRange = null;
        } catch {
          /* ignore */
        }
      };

      if (chartApi && shouldFit && !hold.interacted) {
        pinLiveEdge();
        hold.restoring = false;
        hold.skipSave = false;
      } else if (chartApi && !opts?.forceFit) {
        /**
         * 캔들이 움직여도 화면 고정.
         * tipOnly(update)도 1회 복원 — LWC가 가끔 우측으로 붙는 케이스 차단.
         */
        if (!hold.interacted) {
          if (!tipOnly) pinLiveEdge();
          hold.restoring = false;
          hold.skipSave = false;
        } else {
          restoreView();
          if (tipOnly) {
            hold.restoring = false;
            hold.skipSave = false;
          } else {
            unlockSaveSoon();
          }
        }
      } else {
        hold.restoring = false;
        hold.skipSave = false;
      }
      requestAnimationFrame(() => layoutZonesRef.current());
    },
    []
  );

  applyCandleDataRef.current = applyCandleData;
  layoutZonesRef.current = layoutZones;

  const restoreCandles = () => {
    clearTapointChartView(symbolRef.current, timeframeRef.current);
    viewHoldRef.current.interacted = false;
    viewHoldRef.current.logical = null;
    viewHoldRef.current.timeRange = null;
    viewHoldRef.current.skipSave = false;
    viewHoldRef.current.restoring = false;
    lastFitKeyRef.current = '';
    lastAppliedFpRef.current = '';
    lastAxisFpRef.current = '';
    const src =
      (candlesRef.current?.length || 0) >= 8
        ? candlesRef.current
        : lastGoodRowsRef.current;
    applyCandleData(src, { forceFit: true, reason: 'restore' });
    onRestoreCandles?.();
    setHintKo('캔들복원·최신');
    window.setTimeout(() => setHintKo(''), 1200);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const chart = createChart(host, {
      width: host.clientWidth,
      height: host.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#0b1220' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(30,41,59,0.45)' },
        horzLines: { color: 'rgba(30,41,59,0.45)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#1e293b',
        autoScale: true,
        /** 드래그 중 부시리즈 remove/add 로 null priceRange 나는 LWC 버그 완화 */
        mode: 0,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
        mouseWheel: true,
        pinch: true,
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
        /** 새 봉·팁 갱신 시 맨 오른쪽으로 붙지 않음 — 사용자 줌/팬 유지 */
        shiftVisibleRangeOnNewBar: false,
        rightOffset: 2,
      },
    });
    const candle = chart.addSeries(CandlestickSeries, {
      ...resolveTapointCandleSeriesOptions(loadSettings()),
      priceLineVisible: true,
    });
    const vol = chart.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const volBuy = chart.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      priceLineVisible: false,
      lastValueVisible: false,
      color: 'rgba(34,197,94,0.88)',
    });
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    chart.priceScale('right').applyOptions({
      scaleMargins: { top: 0.08, bottom: 0.22 },
    });
    chartRef.current = chart;
    candleRef.current = candle;
    volRef.current = vol;
    volBuyRef.current = volBuy;
    markersApiRef.current = createSeriesMarkers(candle, []);

    /**
     * pin은 휠/드래그(제스처)로만 건다. fitContent·setData 복원은 pin 안 함.
     * 이미 pin 된 뒤에만 가시범위를 갱신 저장.
     */
    const saveLogical = (fromUserGesture = false) => {
      const hold = viewHoldRef.current;
      if (hold.skipSave || hold.restoring) return;
      if (fromUserGesture) {
        hold.interacted = true;
        try {
          candle.priceScale().applyOptions({ autoScale: false });
        } catch {
          /* ignore */
        }
      }
      if (!hold.interacted) return;
      try {
        const lr = chart.timeScale().getVisibleLogicalRange();
        if (lr && Number.isFinite(lr.from) && Number.isFinite(lr.to) && lr.to - lr.from > 2) {
          hold.logical = { from: lr.from, to: lr.to };
        }
        const tr = chart.timeScale().getVisibleRange();
        if (
          tr &&
          Number.isFinite(Number(tr.from)) &&
          Number.isFinite(Number(tr.to)) &&
          Number(tr.to) > Number(tr.from)
        ) {
          hold.timeRange = { from: Number(tr.from), to: Number(tr.to) };
        }
      } catch {
        /* ignore */
      }
      if (fromUserGesture) schedulePersistViewRef.current();
      else if (hold.logical || hold.timeRange) schedulePersistViewRef.current();
    };
    const pinFromUser = () => {
      const hold = viewHoldRef.current;
      if (hold.skipSave || hold.restoring) return;
      hold.interacted = true;
      try {
        candle.priceScale().applyOptions({ autoScale: false });
      } catch {
        /* ignore */
      }
      saveLogical(true);
    };
    const onWheelPin = () => pinFromUser();
    let dragPinned = false;
    const onPointerDown = () => {
      dragPinned = true;
    };
    const onPointerMove = () => {
      if (dragPinned) pinFromUser();
    };
    const onPointerUp = () => {
      if (dragPinned) pinFromUser();
      dragPinned = false;
    };
    /** capture: LWC 캔들이 이벤트를 먹어도 호스트에서 pin */
    host.addEventListener('wheel', onWheelPin, { passive: true, capture: true });
    host.addEventListener('pointerdown', onPointerDown, true);
    host.addEventListener('pointermove', onPointerMove, true);
    host.addEventListener('pointerup', onPointerUp, true);
    host.addEventListener('pointercancel', onPointerUp, true);
    const onVis = () => {
      saveLogical(false);
      layoutZonesRef.current();
      requestAnimationFrame(() => layoutZonesRef.current());
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVis);
    try {
      (chart.timeScale() as { subscribeVisibleTimeRangeChange?: (cb: () => void) => void }).subscribeVisibleTimeRangeChange?.(onVis);
    } catch {
      /* older LWC */
    }
    /** 크로스헤어로 가격축 잠그지 않음 — 캔들 소실 원인 */

    const ro = new ResizeObserver(() => {
      try {
        const w = host.clientWidth;
        const h = host.clientHeight;
        if (!w || !h || h < 40) {
          hostWasZeroRef.current = true;
          return;
        }
        chart.applyOptions({
          width: Math.max(1, w),
          height: Math.max(1, h),
        });
        if (hostWasZeroRef.current) {
          hostWasZeroRef.current = false;
          /** 레이아웃 복구 시 봉 재도포(반짝 후 블랙 방지) */
          applyCandleDataRef.current(
            (candlesRef.current?.length || 0) >= 8
              ? candlesRef.current
              : lastGoodRowsRef.current,
            { forceFit: false, reason: 'resize' }
          );
        }
        layoutZonesRef.current();
      } catch {
        /* 팩터펼침 리사이즈 중 LWC 예외 — 페이지 크래시 방지 */
      }
    });
    ro.observe(host);

    viewHoldRef.current.interacted = false;
    viewHoldRef.current.logical = null;
    viewHoldRef.current.timeRange = null;
    applyCandleDataRef.current(candlesRef.current, {
      forceFit: false,
      reason: 'mount',
    });

    return () => {
      if (persistViewTimerRef.current != null) {
        window.clearTimeout(persistViewTimerRef.current);
        persistViewTimerRef.current = null;
      }
      ro.disconnect();
      host.removeEventListener('wheel', onWheelPin, true);
      host.removeEventListener('pointerdown', onPointerDown, true);
      host.removeEventListener('pointermove', onPointerMove, true);
      host.removeEventListener('pointerup', onPointerUp, true);
      host.removeEventListener('pointercancel', onPointerUp, true);
      try {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVis);
      } catch {
        /* ignore */
      }
      try {
        (chart.timeScale() as { unsubscribeVisibleTimeRangeChange?: (cb: () => void) => void }).unsubscribeVisibleTimeRangeChange?.(onVis);
      } catch {
        /* ignore */
      }
      linesRef.current = [];
      for (const s of bandSeriesRef.current) {
        try {
          chart.removeSeries(s);
        } catch {
          /* ignore */
        }
      }
      bandSeriesRef.current = [];
      for (const s of band2SeriesRef.current) {
        try {
          chart.removeSeries(s);
        } catch {
          /* ignore */
        }
      }
      band2SeriesRef.current = [];
      for (const s of pceSeriesRef.current) {
        try {
          chart.removeSeries(s);
        } catch {
          /* ignore */
        }
      }
      pceSeriesRef.current = [];
      markersApiRef.current = null;
      try {
        chart.remove();
      } catch {
        /* ignore */
      }
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      volBuyRef.current = null;
    };
    // 차트 인스턴스 1회만 — applyCandleData 의존으로 재생성하면 블랙/리셋
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    viewHoldRef.current.skipSave = false;
    viewHoldRef.current.restoring = false;
    viewHoldRef.current.interacted = false;
    viewHoldRef.current.logical = null;
    viewHoldRef.current.timeRange = null;
    lastAppliedFpRef.current = '';
    lastAxisFpRef.current = '';
    lastFitKeyRef.current = '';
    lastGoodRowsRef.current = [];
  }, [timeframe, symbol]);

  /** 봉·TF·설정만 전체 갱신 · 신호 폴링은 색만 */
  useEffect(() => {
    applyCandleDataRef.current(candles, {
      forceFit: false,
      reason: settingsTick > 0 ? 'settings' : 'candles',
    });
  }, [candles, timeframe, settingsTick]);

  useEffect(() => {
    /** 신호/레벨 변경 시 setData 금지 — 우측 붙음 방지. 존 라벨만 재배치 */
    if (!candleRef.current) return;
    requestAnimationFrame(() => layoutZonesRef.current());
  }, [signals, levels]);

  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    for (const pl of linesRef.current) {
      try {
        series.removePriceLine(pl);
      } catch {
        /* ignore */
      }
    }
    linesRef.current = [];

    const add = (
      price: number | null | undefined,
      color: string,
      _title: string,
      style: LineStyle = LineStyle.Solid,
      lineWidth: number = 2
    ) => {
      if (!(price != null && price > 0)) return;
      const pl = series.createPriceLine({
        price,
        color,
        lineWidth: Math.min(3, Math.max(1, lineWidth)) as 1 | 2 | 3 | 4,
        lineStyle: style,
        /** 이름은 캔들·선 위 HTML. 가격축에는 숫자만 */
        axisLabelVisible: true,
        title: '',
      });
      linesRef.current.push(pl);
    };

    const sigLines = signals?.lines || [];
    if (sigLines.length) {
      for (const L of sigLines) {
        /** BOS/CHoCH/EQL/EQH/SWEEP 는 HTML 가로줄+선위아래 라벨로만 (이미지형) */
        if (/^(BOS|CHoCH|CHOCH|EQL|EQH|SWEEP)\b/i.test(String(L.title || ''))) continue;
        add(L.price, L.color, L.title, styleToLwc(L.lineStyle), L.lineWidth);
      }
    } else {
      if (!signals?.zones?.length) {
        add(levels?.zoneHi ?? null, 'rgba(56,189,248,0.85)', '존상', LineStyle.Dotted);
        add(levels?.zoneLo ?? null, 'rgba(56,189,248,0.85)', '존하', LineStyle.Dotted);
      }
      add(levels?.entry ?? null, '#38bdf8', '진입');
      add(levels?.sl ?? null, '#f87171', '손절');
      add(levels?.tp1 ?? null, '#4ade80', '익절1');
      add(levels?.tp2 ?? null, '#22c55e', '익절2', LineStyle.Dashed);
      add(levels?.tp3 ?? null, '#16a34a', '익절3', LineStyle.Dashed);
    }

    const api = markersApiRef.current;
    if (api) {
      const candleTimes = normalizeRows(candlesRef.current).map((r) => r.time as number);
      const snap = (sec: number): UTCTimestamp | null => {
        if (!(sec > 0) || !candleTimes.length) return null;
        let best = candleTimes[0]!;
        let bestD = Math.abs(best - sec);
        for (const t of candleTimes) {
          const d = Math.abs(t - sec);
          if (d < bestD) {
            best = t;
            bestD = d;
          }
        }
        if (candleTimes.length >= 2) {
          const step =
            Math.abs(candleTimes[candleTimes.length - 1]! - candleTimes[candleTimes.length - 2]!) ||
            60;
          if (bestD > step * 2.8) return null;
        }
        return best as UTCTimestamp;
      };
      /** 글자는 HTML로 고정 — LWC 마커 글자는 확대·축소 때 사라짐 */
      const mks = (signals?.markers || []).map((m) => {
          const sec = toSec(m.time) as number;
          const time = snap(sec);
          if (!time) return null;
          const isSweep = /sweep/i.test(String(m.label || ''));
          return {
            time,
            position: m.position,
            color: m.color,
            shape: isSweep ? 'circle' : m.shape,
            text: '',
          };
        })
        .filter(Boolean) as Array<{
        time: UTCTimestamp;
        position: 'aboveBar' | 'belowBar';
        color: string;
        shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
        text: string;
      }>;
      try {
        api.setMarkers(mks);
      } catch {
        /* ignore */
      }
    }

    requestAnimationFrame(() => layoutZones());
  }, [levels, signals, layoutZones]);

  /** 기관밴드 지문 — candles 매틱마다 removeSeries 하면 가격축 드래그 중 Value is null */
  const bandSig = useMemo(() => {
    if (!institutionalBandOn || !institutionalBandSegments?.length) return '';
    const parts: string[] = [];
    for (const seg of institutionalBandSegments) {
      const u0 = seg.upper[0];
      const u1 = seg.upper[seg.upper.length - 1];
      const l0 = seg.lower[0];
      const l1 = seg.lower[seg.lower.length - 1];
      parts.push(
        `${seg.dir}:${seg.upper.length}:${seg.lower.length}:${u0?.time}:${u0?.value}:${u1?.time}:${u1?.value}:${l0?.value}:${l1?.value}`
      );
    }
    return parts.join('|');
  }, [institutionalBandOn, institutionalBandSegments]);

  /** 통합분석 공동 — 기관밴드 LineSeries · setData 재사용 · 디바운스 */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled || chartRef.current !== chart) return;
      const clearBands = () => {
        for (const s of bandSeriesRef.current) {
          try {
            chart.removeSeries(s);
          } catch {
            /* ignore */
          }
        }
        bandSeriesRef.current = [];
      };
      if (!institutionalBandOn || !institutionalBandSegments?.length || !bandSig) {
        clearBands();
        return;
      }
      type LinePt = { time: Time; value: number };
      const jobs: Array<{ color: string; pts: LinePt[] }> = [];
      for (const seg of institutionalBandSegments) {
        const long = seg.dir === 'long';
        const color = long ? '#22c55e' : '#ef4444';
        for (const key of ['upper', 'lower'] as const) {
          const raw = seg[key]
            .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value) && p.value > 0)
            .map((p) => ({ time: Number(toSec(p.time)), value: Number(p.value) }))
            .sort((a, b) => a.time - b.time);
          const pts: LinePt[] = [];
          let lastT = -1;
          for (const p of raw) {
            if (!(p.time > 0) || !(p.value > 0)) continue;
            if (p.time === lastT) {
              pts[pts.length - 1] = { time: p.time as Time, value: p.value };
            } else if (p.time > lastT) {
              pts.push({ time: p.time as Time, value: p.value });
              lastT = p.time;
            }
          }
          if (pts.length >= 2) jobs.push({ color, pts });
        }
      }
      if (!jobs.length) {
        clearBands();
        return;
      }
      /** 개수 같으면 setData만 — 가격축 인스턴스 유지 */
      const prev = bandSeriesRef.current;
      if (prev.length === jobs.length) {
        for (let i = 0; i < jobs.length; i++) {
          try {
            prev[i]!.applyOptions({ color: jobs[i]!.color });
            prev[i]!.setData(jobs[i]!.pts as never);
          } catch {
            /* ignore */
          }
        }
        return;
      }
      clearBands();
      const created: ISeriesApi<'Line'>[] = [];
      for (const job of jobs) {
        try {
          const series = chart.addSeries(LineSeries, {
            color: job.color,
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            priceScaleId: 'right',
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
            /** 캔들 스케일만 주도 — 밴드가 빈 range 만들면 scrollPriceTo null */
            autoscaleInfoProvider: () => null,
          });
          series.setData(job.pts as never);
          created.push(series);
        } catch {
          /* ignore */
        }
      }
      bandSeriesRef.current = created;
      const hold = viewHoldRef.current;
      const chartApi = chartRef.current;
      if (hold.interacted && chartApi) {
        hold.skipSave = true;
        hold.restoring = true;
        try {
          if (hold.timeRange && hold.timeRange.to > hold.timeRange.from) {
            chartApi.timeScale().setVisibleRange({
              from: hold.timeRange.from as never,
              to: hold.timeRange.to as never,
            });
          } else if (hold.logical) {
            chartApi.timeScale().setVisibleLogicalRange(hold.logical);
          }
        } catch {
          /* ignore */
        }
        requestAnimationFrame(() => {
          hold.restoring = false;
          hold.skipSave = false;
        });
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [institutionalBandOn, institutionalBandSegments, bandSig]);

  /** 기관밴드2 지문 — 활성선 세그먼트 */
  const band2Sig = useMemo(() => {
    if (!institutionalBand2On || !institutionalBand2Segments?.length) return '';
    const parts: string[] = [];
    for (const seg of institutionalBand2Segments) {
      const p0 = seg.points[0];
      const p1 = seg.points[seg.points.length - 1];
      parts.push(
        `${seg.dir}:${seg.points.length}:${p0?.time}:${p0?.value}:${p1?.time}:${p1?.value}`
      );
    }
    return parts.join('|');
  }, [institutionalBand2On, institutionalBand2Segments]);

  /** 기관밴드2 — SuperTrend 활성선(초록↔빨강) · WithSteps · setData 재사용 */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled || chartRef.current !== chart) return;
      const clearBands = () => {
        for (const s of band2SeriesRef.current) {
          try {
            chart.removeSeries(s);
          } catch {
            /* ignore */
          }
        }
        band2SeriesRef.current = [];
      };
      if (!institutionalBand2On || !institutionalBand2Segments?.length || !band2Sig) {
        clearBands();
        return;
      }
      type LinePt = { time: Time; value: number };
      const jobs: Array<{ color: string; pts: LinePt[] }> = [];
      for (const seg of institutionalBand2Segments) {
        const color = seg.dir === 'long' ? '#22c55e' : '#ef4444';
        const raw = seg.points
          .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value) && p.value > 0)
          .map((p) => ({ time: Number(toSec(p.time)), value: Number(p.value) }))
          .sort((a, b) => a.time - b.time);
        const pts: LinePt[] = [];
        let lastT = -1;
        for (const p of raw) {
          if (!(p.time > 0) || !(p.value > 0)) continue;
          if (p.time === lastT) {
            pts[pts.length - 1] = { time: p.time as Time, value: p.value };
          } else if (p.time > lastT) {
            pts.push({ time: p.time as Time, value: p.value });
            lastT = p.time;
          }
        }
        if (pts.length >= 2) jobs.push({ color, pts });
      }
      if (!jobs.length) {
        clearBands();
        return;
      }
      const prev = band2SeriesRef.current;
      if (prev.length === jobs.length) {
        for (let i = 0; i < jobs.length; i++) {
          try {
            prev[i]!.applyOptions({ color: jobs[i]!.color });
            prev[i]!.setData(jobs[i]!.pts as never);
          } catch {
            /* ignore */
          }
        }
        return;
      }
      clearBands();
      const created: ISeriesApi<'Line'>[] = [];
      for (const job of jobs) {
        try {
          const series = chart.addSeries(LineSeries, {
            color: job.color,
            lineWidth: 3,
            lineStyle: LineStyle.Solid,
            lineType: LineType.WithSteps,
            priceScaleId: 'right',
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
            autoscaleInfoProvider: () => null,
          });
          series.setData(job.pts as never);
          created.push(series);
        } catch {
          /* ignore */
        }
      }
      band2SeriesRef.current = created;
      const hold = viewHoldRef.current;
      const chartApi = chartRef.current;
      if (hold.interacted && chartApi) {
        hold.skipSave = true;
        hold.restoring = true;
        try {
          if (hold.timeRange && hold.timeRange.to > hold.timeRange.from) {
            chartApi.timeScale().setVisibleRange({
              from: hold.timeRange.from as never,
              to: hold.timeRange.to as never,
            });
          } else if (hold.logical) {
            chartApi.timeScale().setVisibleLogicalRange(hold.logical);
          }
        } catch {
          /* ignore */
        }
        requestAnimationFrame(() => {
          hold.restoring = false;
          hold.skipSave = false;
        });
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [institutionalBand2On, institutionalBand2Segments, band2Sig]);

  /** 평행채널 지문 */
  const pceSig = useMemo(() => {
    if (!parallelChannelOn || !parallelChannelSegments?.length) return '';
    const parts: string[] = [];
    for (const seg of parallelChannelSegments) {
      const u0 = seg.upper[0];
      const u1 = seg.upper[seg.upper.length - 1];
      const l0 = seg.lower[0];
      const l1 = seg.lower[seg.lower.length - 1];
      parts.push(
        `${seg.id}:${seg.type}:${seg.score}:${seg.upper.length}:${u0?.time}:${u1?.value}:${l0?.value}:${l1?.value}`
      );
    }
    return parts.join('|');
  }, [parallelChannelOn, parallelChannelSegments]);

  /** 독수리1호 평행채널 — 상·중·하 LineSeries (통합분석과 공동) */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled || chartRef.current !== chart) return;
      const clearPce = () => {
        for (const s of pceSeriesRef.current) {
          try {
            chart.removeSeries(s);
          } catch {
            /* ignore */
          }
        }
        pceSeriesRef.current = [];
      };
      if (!parallelChannelOn || !parallelChannelSegments?.length || !pceSig) {
        clearPce();
        return;
      }
      type LinePt = { time: Time; value: number };
      const jobs: Array<{ color: string; width: number; style: LineStyle; pts: LinePt[] }> = [];
      const toPts = (rawIn: Array<{ time: number; value: number }>): LinePt[] => {
        const raw = rawIn
          .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value) && p.value > 0)
          .map((p) => ({ time: Number(toSec(p.time)), value: Number(p.value) }))
          .sort((a, b) => a.time - b.time);
        const pts: LinePt[] = [];
        let lastT = -1;
        for (const p of raw) {
          if (!(p.time > 0) || !(p.value > 0)) continue;
          if (p.time === lastT) {
            pts[pts.length - 1] = { time: p.time as Time, value: p.value };
          } else if (p.time > lastT) {
            pts.push({ time: p.time as Time, value: p.value });
            lastT = p.time;
          }
        }
        return pts;
      };
      for (const seg of parallelChannelSegments) {
        const up = toPts(seg.upper);
        const lo = toPts(seg.lower);
        /** 저항=빨강 · 지지=초록 */
        if (up.length >= 2)
          jobs.push({ color: pceUpperColor(), width: 2, style: LineStyle.Solid, pts: up });
        if (lo.length >= 2)
          jobs.push({ color: pceLowerColor(), width: 2, style: LineStyle.Solid, pts: lo });
        const md = toPts(seg.mid);
        if (md.length >= 2)
          jobs.push({ color: pceMidColor(seg.type), width: 1, style: LineStyle.Dashed, pts: md });
      }
      if (!jobs.length) {
        clearPce();
        return;
      }
      const prev = pceSeriesRef.current;
      if (prev.length === jobs.length) {
        for (let i = 0; i < jobs.length; i++) {
          try {
            prev[i]!.applyOptions({
              color: jobs[i]!.color,
              lineWidth: jobs[i]!.width as 1 | 2 | 3 | 4,
              lineStyle: jobs[i]!.style,
            });
            prev[i]!.setData(jobs[i]!.pts as never);
          } catch {
            /* ignore */
          }
        }
        return;
      }
      clearPce();
      const created: ISeriesApi<'Line'>[] = [];
      for (const job of jobs) {
        try {
          const series = chart.addSeries(LineSeries, {
            color: job.color,
            lineWidth: job.width as 1 | 2 | 3 | 4,
            lineStyle: job.style,
            priceScaleId: 'right',
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
            autoscaleInfoProvider: () => null,
          });
          series.setData(job.pts as never);
          created.push(series);
        } catch {
          /* ignore */
        }
      }
      pceSeriesRef.current = created;
      const hold = viewHoldRef.current;
      const chartApi = chartRef.current;
      if (hold.interacted && chartApi) {
        hold.skipSave = true;
        hold.restoring = true;
        try {
          if (hold.timeRange && hold.timeRange.to > hold.timeRange.from) {
            chartApi.timeScale().setVisibleRange({
              from: hold.timeRange.from as never,
              to: hold.timeRange.to as never,
            });
          } else if (hold.logical) {
            chartApi.timeScale().setVisibleLogicalRange(hold.logical);
          }
        } catch {
          /* ignore */
        }
        requestAnimationFrame(() => {
          hold.restoring = false;
          hold.skipSave = false;
        });
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [parallelChannelOn, parallelChannelSegments, pceSig]);

  const legend = signals?.legendKo?.length ? signals.legendKo.join(' · ') : '';
  const zoneCount = signals?.zones?.length || 0;
  const lineCount = signals?.lines?.length || 0;
  const markCount = signals?.markers?.length || 0;

  return (
    <div
      className="tap-clean-chart"
      style={{ ['--tap-label-fs' as string]: `${labelFontPx}px` }}
    >
      {decisionKo ? <div className="tap-clean-badge">{decisionKo}</div> : null}
      {legend || zoneCount || lineCount || advOn ? (
        <div className="tap-clean-legend" title={legend}>
          {advOn ? '선진거래량 · ' : ''}
          존 {zoneCount} · 선 {lineCount}
          {markCount ? ` · 마크 ${markCount}` : ''}
          {legend ? ` · ${legend}` : ''}
        </div>
      ) : null}
      <button
        type="button"
        className="tap-clean-restore"
        title="캔들 다시 그리기 · 최신 우측으로 복귀"
        onClick={restoreCandles}
      >
        캔들복원
      </button>
      {hintKo ? <div className="tap-clean-hint">{hintKo}</div> : null}

      <div ref={hostRef} className="tap-clean-host" />

      <div className="tap-zone-layer" aria-hidden>
        {zoneLayouts
          .filter((z) => z.visible)
          .map((z) => {
            const isDump = z.kind === 'mtf-dump';
            const hiPx = Number(z.hi);
            const loPx = Number(z.lo);
            const fmtEdge = (p: number) =>
              p >= 1000 ? String(Math.round(p)) : p.toFixed(p >= 100 ? 1 : 2);
            return (
              <div
                key={`band-${z.id}`}
                className={[
                  'tap-zone-band',
                  z.kind === 'battle' ? 'tap-zone-band--battle' : '',
                  isDump ? 'tap-zone-band--dump' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  top: z.top,
                  height: z.height,
                  background: z.fill,
                  borderTopColor: z.stroke,
                  borderBottomColor: z.stroke,
                }}
              >
                {isDump && hiPx > 0 && loPx > 0 ? (
                  <>
                    <span
                      className="tap-dump-edge tap-dump-edge--hi"
                      style={{
                        color: dumpEdgePx.edgePriceColor,
                        borderColor: dumpEdgePx.edgePriceColor,
                        fontSize: dumpEdgePx.edgePriceFontSize,
                      }}
                      title={`폭락존 상단 ${fmtEdge(hiPx)}`}
                    >
                      {fmtEdge(hiPx)}
                    </span>
                    <span
                      className="tap-dump-edge tap-dump-edge--lo"
                      style={{
                        color: dumpEdgePx.edgePriceColor,
                        borderColor: dumpEdgePx.edgePriceColor,
                        fontSize: dumpEdgePx.edgePriceFontSize,
                      }}
                      title={`폭락존 하단 ${fmtEdge(loPx)}`}
                    >
                      {fmtEdge(loPx)}
                    </span>
                  </>
                ) : null}
              </div>
            );
          })}
        {(() => {
          /** 폭락존 면 위에 핵심 라벨이 가려지지 않게 별도 레이어 + 세로 스태거 */
          const coreLabelKinds = new Set([
            'battle',
            'fvg',
            'bpr',
            'breaker',
            'ob',
            'cluster',
            'demand',
            'supply',
          ]);
          const visibles = zoneLayouts.filter((z) => z.visible && String(z.labelKo || '').trim());
          const core = visibles
            .filter((z) => coreLabelKinds.has(String(z.kind)))
            .sort((a, b) => a.top - b.top);
          const rest = visibles.filter((z) => !coreLabelKinds.has(String(z.kind)));
          const placed: Array<{ z: (typeof visibles)[0]; labelTop: number; left: number }> = [];
          const minGap = Math.max(12, Math.round((Number(labelFontPx) || 9) * 1.35));
          const labelHostH = hostRef.current?.clientHeight || 0;
          const keepLabelY = (y: number) =>
            labelHostH > 0 ? Math.max(8, Math.min(labelHostH - 16, y)) : Math.max(8, y);
          const placeOnZone = (z: (typeof visibles)[0]) => {
            const labelTop = keepLabelY(Math.round(z.top + Math.max(2, z.height * 0.5 - 6)));
            let left = 10;
            for (const p of placed) {
              if (Math.abs(labelTop - p.labelTop) < minGap) left = Math.max(left, p.left + 108);
            }
            placed.push({ z, labelTop, left: Math.min(left, 420) });
          };
          for (const z of core) placeOnZone(z);
          for (const z of rest) placeOnZone(z);
          return (
            <div className="tap-zone-label-layer">
              {placed.map(({ z, labelTop, left }) => {
                const isCore = coreLabelKinds.has(String(z.kind));
                const isBattle = z.kind === 'battle';
                const isDump = z.kind === 'mtf-dump';
                const text = isBattle
                  ? `⚔ ${z.labelKo}`
                  : z.labelKo;
                return (
                  <span
                    key={`lab-${z.id}`}
                    className={[
                      'tap-zone-label',
                      isBattle ? 'tap-zone-label--battle' : '',
                      isCore ? 'tap-zone-label--core' : '',
                      isDump ? 'tap-zone-label--dump' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{
                      top: labelTop,
                      left,
                      color: ink(
                        isDump && dumpStyle.colorMode === 'custom' ? dumpStyle.borderHex : z.stroke
                      ),
                      borderColor:
                        isDump && dumpStyle.colorMode === 'custom' ? dumpStyle.borderHex : z.stroke,
                      fontSize: isDump ? dumpStyle.faceLabelFontSize : undefined,
                    }}
                  >
                    {text}
                  </span>
                );
              })}
            </div>
          );
        })()}
        {markLabels.map((m) => (
          <span
            key={m.key}
            className={`tap-mark-label${m.above ? ' tap-mark-label--above' : ' tap-mark-label--below'}`}
            style={{ left: m.x, top: m.y, color: ink(m.color), borderColor: ink(m.color) }}
          >
            {m.text}
          </span>
        ))}
        {pinLabels.map((p) => (
          <span
            key={p.id}
            className="tap-pin-label"
            style={{ top: p.top, left: p.left, color: ink(p.color), borderColor: ink(p.color) }}
          >
            {p.text}
          </span>
        ))}
        {structLabels
          .filter((s) => s.visible)
          .map((s) => (
            <div
              key={s.id}
              className={`tap-struct-hline${s.dashed ? ' tap-struct-hline--dash' : ''}`}
              style={{
                top: s.top,
                left: s.left,
                width: s.width,
                borderColor: s.color,
              }}
            >
              <span
                className={`tap-struct-label tap-struct-label--${s.labelSide}`}
                style={{ color: ink(s.color), borderColor: ink(s.color) }}
              >
                {s.title}
              </span>
            </div>
          ))}
        {sweepLabels
          .filter((s) => s.visible)
          .map((s) => (
            <div
              key={s.id}
              className={`tap-sweep-mark tap-sweep-mark--${s.side}`}
              style={{ top: s.top, left: s.left, color: s.color, borderColor: s.color }}
            >
              {s.title}
            </div>
          ))}
      </div>

      <ChartCandleCloseTimer
        timeframe={timeframe}
        nowMs={nowMs}
        lastPrice={lastClose}
        hostRef={hostRef}
        chartRef={chartRef}
        seriesRef={candleRef}
        exchange="bitget"
      />
      {volLabels ? <ChartVolBarLabels top={volLabels.top} items={volLabels.items} /> : null}
      <style jsx>{`
        .tap-clean-chart {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 520px;
          background: #0b1220;
          overflow: hidden;
        }
        .tap-clean-host {
          position: absolute;
          inset: 0;
          z-index: 1;
        }
        .tap-zone-layer {
          position: absolute;
          inset: 0;
          z-index: 12;
          pointer-events: none;
          overflow: visible;
        }
        .tap-zone-band {
          position: absolute;
          left: 0;
          right: 56px;
          border-top: 1px solid;
          border-bottom: 1px solid;
          box-sizing: border-box;
        }
        .tap-zone-band--dump {
          border-top-width: 1.5px;
          border-bottom-width: 1.5px;
        }
        /** 폭락존 분석가 — 상·하 테두리 우측 (통합분석 edge-px 와 동일) */
        .tap-dump-edge {
          position: absolute;
          right: 4px;
          z-index: 9;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.02em;
          line-height: 1;
          padding: 1px 4px;
          border-radius: 2px;
          border: 1px solid;
          background: rgba(15, 23, 42, 0.9);
          white-space: nowrap;
          pointer-events: none;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
        }
        .tap-dump-edge--hi {
          top: 0;
          transform: translateY(-50%);
        }
        .tap-dump-edge--lo {
          bottom: 0;
          transform: translateY(50%);
        }
        .tap-struct-hline {
          position: absolute;
          height: 0;
          border-top: 1.5px solid;
          pointer-events: none;
          z-index: 3;
        }
        .tap-struct-hline--dash {
          border-top-style: dashed;
          border-top-width: 1.75px;
        }
        .tap-struct-label {
          position: absolute;
          left: 0;
          font-size: var(--tap-label-fs, 9px);
          font-weight: 700;
          letter-spacing: 0.02em;
          padding: 0 5px;
          border: 1px solid;
          border-radius: 3px;
          background: rgba(11, 18, 32, 0.88);
          white-space: nowrap;
          line-height: 1.25;
          pointer-events: none;
        }
        .tap-struct-label--below {
          top: 0;
          transform: translate(2px, 4px);
        }
        .tap-struct-label--above {
          top: 0;
          transform: translate(2px, calc(-100% - 4px));
        }
        .tap-mark-label {
          position: absolute;
          z-index: 16;
          font-size: var(--tap-label-fs, 10px);
          font-weight: 800;
          letter-spacing: 0.01em;
          padding: 0 4px;
          border: 1px solid;
          border-radius: 3px;
          background: rgba(11, 18, 32, 0.92);
          white-space: nowrap;
          line-height: 1.25;
          pointer-events: none;
        }
        .tap-mark-label--above {
          transform: translate(-50%, calc(-100% - 4px));
        }
        .tap-mark-label--below {
          transform: translate(-50%, 4px);
        }
        .tap-pin-label {
          position: absolute;
          z-index: 17;
          transform: translate(2px, -50%);
          font-size: var(--tap-label-fs, 10px);
          font-weight: 800;
          padding: 0 5px;
          border: 1px solid;
          border-radius: 3px;
          background: rgba(11, 18, 32, 0.92);
          white-space: nowrap;
          line-height: 1.25;
          pointer-events: none;
        }
        .tap-sweep-mark {
          position: absolute;
          z-index: 6;
          transform: translate(-50%, -50%);
          font-size: var(--tap-label-fs, 9px);
          font-weight: 800;
          letter-spacing: 0.04em;
          padding: 0 4px;
          border: 1px solid;
          border-radius: 3px;
          background: rgba(11, 18, 32, 0.9);
          white-space: nowrap;
          pointer-events: none;
          line-height: 1.25;
          color: #facc15;
        }
        .tap-sweep-mark--above {
          transform: translate(-50%, calc(-100% - 14px));
        }
        .tap-sweep-mark--below {
          transform: translate(-50%, 14px);
        }
        .tap-zone-band--battle {
          border-top-width: 2px;
          border-bottom-width: 2px;
          border-style: dashed;
        }
        .tap-zone-label-layer {
          position: absolute;
          inset: 0;
          z-index: 14;
          pointer-events: none;
          overflow: visible;
        }
        .tap-zone-label {
          position: absolute;
          padding: 1px 6px;
          border-radius: 3px;
          font-size: var(--tap-label-fs, 9px);
          font-weight: 700;
          letter-spacing: -0.02em;
          background: rgba(2, 6, 23, 0.88);
          border: 1px solid;
          white-space: nowrap;
          max-width: min(46%, 280px);
          overflow: hidden;
          text-overflow: ellipsis;
          transform: none;
          text-align: left;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
        }
        .tap-zone-label--core {
          z-index: 7;
          max-width: min(72%, 360px);
        }
        /** 전투합류 라벨 = 존 면 안 */
        .tap-zone-label--battle {
          left: auto;
          font-size: var(--tap-label-fs, 9px) !important;
          font-weight: 800 !important;
          padding: 2px 7px !important;
          background: rgba(250, 204, 21, 0.28) !important;
          max-width: min(74%, 380px);
          white-space: nowrap;
          line-height: 1.25;
          text-align: left;
          z-index: 8;
          overflow: visible;
        }
        .tap-clean-badge {
          position: absolute;
          z-index: 4;
          top: 10px;
          left: 12px;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #e2e8f0;
          background: rgba(15, 23, 42, 0.82);
          border: 1px solid #1e2a3f;
          pointer-events: none;
        }
        .tap-clean-legend {
          position: absolute;
          z-index: 4;
          top: 40px;
          left: 12px;
          max-width: min(72%, 560px);
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          line-height: 1.35;
          color: #cbd5e1;
          background: rgba(15, 23, 42, 0.78);
          border: 1px solid #1e2a3f;
          pointer-events: none;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .tap-clean-restore {
          position: absolute;
          z-index: 4;
          top: 10px;
          right: 12px;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #e0f2fe;
          background: rgba(14, 165, 233, 0.22);
          border: 1px solid #38bdf8;
          cursor: pointer;
        }
        .tap-clean-restore:hover {
          background: rgba(14, 165, 233, 0.38);
        }
        .tap-clean-hint {
          position: absolute;
          z-index: 4;
          top: 44px;
          right: 12px;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          color: #86efac;
          background: rgba(15, 23, 42, 0.88);
          border: 1px solid #14532d;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
