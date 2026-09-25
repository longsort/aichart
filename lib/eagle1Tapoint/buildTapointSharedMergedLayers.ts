/**
 * 타점엔진 — 통합·분석과 동일 엔진으로 기관밴드(선+터치)·폭락존·로켓·장바구니·SFP 레이어.
 * 로켓·마커는 봉 open time에 고정(과거 스크롤용). 기존 타점 신호는 유지·추가만.
 */
import type { Candle, OverlayItem } from '@/types';
import type { AnalyzeResponse } from '@/types';
import {
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  computeInstitutionalBandInteractionMarkersUnion,
  computeInstitutionalSuperTrendEnvelopeSegmentsByTrend,
  institutionalBandTouchMinGapBars,
} from '@/lib/institutionalSuperBand';
import { institutionalEnvelopeParamsForTf } from '@/lib/mergedDeskEnvelopeMtfLink';
import {
  buildMergedDeskMtfDumpZonePack,
  type MtfDumpZonePack,
} from '@/lib/mergedDeskMtfDumpZoneBridge';
import { loadMtfDumpZoneRegistry } from '@/lib/mergedDeskMtfDumpZoneRegistry';
import type {
  TapointChartMarker,
  TapointChartSignals,
  TapointChartZoneBand,
} from '@/lib/eagle1Tapoint/chartSignals';
import { normalizeChartTimeframe } from '@/lib/constants';
import { formatInstitutionalBandTouchMarkerChartText, institutionalBandTouchMarkerStyle } from '@/lib/institutionalBandTouchChartText';
import { detectMergedAnalysisKeyZones } from '@/lib/mergedAnalysisKeyZones';
import { detectMergedCriticalZones } from '@/lib/mergedAnalysisCriticalZones';
import { scanMergedLeadingCandleSignals } from '@/lib/mergedAnalysisLeadingSignals';
import { buildMergedDeskBlueRedChannels } from '@/lib/mergedDeskBlueRedChannels';
import { detectRbRailSfp } from '@/lib/mergedDeskRbEdgeConfluenceGate';
import { loadSettings } from '@/lib/settings';
import {
  buildParallelChannelEngine,
  getLowerPrice,
  getMidPrice,
  getUpperPrice,
  type ChannelType,
} from '@/lib/eagle1/parallelChannelEngine';

export type TapointInstBandLinePoint = { time: number; value: number };

export type TapointInstBandSegment = {
  dir: 'long' | 'short';
  upper: TapointInstBandLinePoint[];
  lower: TapointInstBandLinePoint[];
};

export function buildTapointInstitutionalBandSegments(
  candles: Candle[]
): TapointInstBandSegment[] {
  if (!candles || candles.length < 8) return [];
  try {
    const segs = computeInstitutionalSuperTrendEnvelopeSegmentsByTrend(candles);
    return segs.map((s) => ({
      dir: s.dir,
      upper: (s.upper || []).map((p) => ({
        time: Number(p.time),
        value: Number(p.value),
      })),
      lower: (s.lower || []).map((p) => ({
        time: Number(p.time),
        value: Number(p.value),
      })),
    }));
  } catch {
    return [];
  }
}

/** 기관밴드2 — 통합분석식 SuperTrend 활성선만 (롱=하단초록 · 숏=상단빨강) */
export type TapointInstBand2Segment = {
  dir: 'long' | 'short';
  points: TapointInstBandLinePoint[];
};

export function buildTapointInstitutionalBand2Segments(
  candles: Candle[],
  chartTf?: string
): TapointInstBand2Segment[] {
  if (!candles || candles.length < 8) return [];
  try {
    const { period, mult } = institutionalEnvelopeParamsForTf(chartTf || null);
    const segs = computeInstitutionalSuperTrendEnvelopeSegmentsByTrend(candles, period, mult);
    return segs
      .map((s) => {
        const raw = s.dir === 'long' ? s.lower : s.upper;
        const points = (raw || [])
          .map((p) => ({
            time: Number(p.time),
            value: Number(p.value),
          }))
          .filter((p) => p.time > 0 && p.value > 0);
        return { dir: s.dir, points };
      })
      .filter((s) => s.points.length >= 2);
  } catch {
    return [];
  }
}

export function buildTapointMtfDumpZoneBands(
  candles: Candle[],
  chartTf: string,
  candlesByTf: Record<string, Candle[] | null | undefined>,
  symbol: string
): { zones: TapointChartZoneBand[]; pack: MtfDumpZonePack | null } {
  if (!candles || candles.length < 12) return { zones: [], pack: null };
  try {
    const registry = loadMtfDumpZoneRegistry(symbol);
    const pack = buildMergedDeskMtfDumpZonePack({
      chartCandles: candles,
      chartTf,
      candlesByTf: {
        ...candlesByTf,
        [normalizeChartTimeframe(chartTf)]: candles,
      },
      registryZones: registry,
      displayMode: 'mtf',
    });
    const zones: TapointChartZoneBand[] = (pack.overlays || [])
      .filter((o) => o.kind === 'zone' || String(o.id || '').includes('mtf-dump'))
      .map((o, i) => overlayToZoneBand(o, i))
      .filter((z): z is TapointChartZoneBand => z != null);
    /** overlays가 비면 zones 스펙에서 면 생성 */
    if (!zones.length && pack.zones?.length) {
      for (const z of pack.zones.slice(0, 12)) {
        const lo = Math.min(Number(z.bot), Number(z.top));
        const hi = Math.max(Number(z.bot), Number(z.top));
        if (!(hi > lo) || !(lo > 0)) continue;
        const floor = z.bandRole !== 'ceiling';
        zones.push({
          id: `tap-dump-${z.sourceTf}-${z.bandRole}-${Math.round(z.mid)}`,
          lo,
          hi,
          labelKo: z.labelKo || `폭락${z.sourceTf}`,
          fill: floor ? 'rgba(56,189,248,0.14)' : 'rgba(248,113,113,0.16)',
          stroke: floor ? '#38bdf8' : '#f87171',
          kind: 'mtf-dump',
          priority: 40,
        });
      }
    }
    return { zones, pack };
  } catch {
    return { zones: [], pack: null };
  }
}

function overlayToZoneBand(o: OverlayItem, i: number): TapointChartZoneBand | null {
  const p1 = Number(o.price1 ?? o.y1);
  const p2 = Number(o.price2 ?? o.y2 ?? p1);
  const lo = Math.min(p1, p2);
  const hi = Math.max(p1, p2);
  if (!(hi > lo) || !(lo > 0)) return null;
  const id = String(o.id || `dump-${i}`);
  const label = String(o.label || o.zoneFaceBase || '폭락존');
  const floor = /floor|지지|반등/i.test(`${id} ${label}`);
  return {
    id: `tap-${id}`,
    lo,
    hi,
    labelKo: label.slice(0, 28),
    fill: floor ? 'rgba(56,189,248,0.14)' : 'rgba(248,113,113,0.16)',
    stroke: floor ? '#38bdf8' : '#f87171',
    kind: 'mtf-dump',
    priority: 40,
  };
}

/** analyze 구조로켓 → 타점 마커 (봉 time 고정) */
export function buildTapointRocketMarkersFromAnalysis(
  analysis: AnalyzeResponse | null | undefined,
  candles: Candle[]
): TapointChartMarker[] {
  const rows = analysis?.structureRocketSignals;
  if (!Array.isArray(rows) || !rows.length || !candles?.length) return [];
  const byOpen = new Map<number, Candle>();
  for (const c of candles) {
    const t = Number(c.time);
    if (t > 0) byOpen.set(t, c);
  }
  const out: TapointChartMarker[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const dir = r?.direction;
    if (dir !== 'LONG' && dir !== 'SHORT') continue;
    const rt = typeof r.time === 'number' && Number.isFinite(r.time) ? r.time : NaN;
    if (!Number.isFinite(rt)) continue;
    /** 해당 시각을 품은 봉 open에 스냅 */
    let bar: Candle | null = byOpen.get(rt) ?? null;
    if (!bar) {
      let best: Candle | null = null;
      let bestDist = Infinity;
      for (const c of candles) {
        const t = Number(c.time);
        if (t > rt) continue;
        const d = rt - t;
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      bar = best;
    }
    if (!bar) continue;
    const tOpen = Number(bar.time);
    const key = `${tOpen}|${dir}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const long = dir === 'LONG';
    out.push({
      time: tOpen,
      price: long ? Number(bar.low) : Number(bar.high),
      label: long ? '🚀' : '📉',
      color: long ? '#22c55e' : '#ef4444',
      position: long ? 'belowBar' : 'aboveBar',
      shape: long ? 'arrowUp' : 'arrowDown',
    });
  }
  return out;
}


/** 기관밴드 LH/SH 터치 마커 — ChartView와 동일 엔진 */
export function buildTapointInstBandTouchMarkers(
  candles: Candle[],
  chartTf: string
): TapointChartMarker[] {
  if (!candles || candles.length < 16) return [];
  try {
    const s = loadSettings();
    const mask = s.institutionalBandTouchTierMask || { A: true, B: true, C: false };
    const marks = computeInstitutionalBandInteractionMarkersUnion(
      candles,
      INSTITUTIONAL_BAND_DEFAULT_PERIOD,
      INSTITUTIONAL_BAND_DEFAULT_MULT,
      {
        minBarsBetween: institutionalBandTouchMinGapBars(chartTf),
        tierEnabled: {
          A: mask.A !== false,
          B: mask.B !== false,
          C: mask.C === true,
        },
      }
    );
    const out: TapointChartMarker[] = [];
    for (const ev of marks.slice(-24)) {
      const tm = Number(ev.time);
      if (!Number.isFinite(tm) || tm <= 0) continue;
      const isLong = ev.verdict === 'LONG';
      const st = institutionalBandTouchMarkerStyle(ev);
      const bar = candles.find((c) => Number(c.time) === tm);
      const px = isLong ? Number(bar?.low) : Number(bar?.high);
      if (!(px > 0)) continue;
      out.push({
        time: tm,
        price: px,
        label: formatInstitutionalBandTouchMarkerChartText(ev),
        color: st.color,
        position: isLong ? 'belowBar' : 'aboveBar',
        shape: isLong ? 'arrowUp' : 'arrowDown',
      });
    }
    return out;
  } catch {
    return [];
  }
}

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 8) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    const tr = Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    if (Number.isFinite(tr)) {
      s += tr;
      c += 1;
    }
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
}

/** 피벗 스윕→회수 SFP (채널 없을 때) */
function detectTapointPivotSfp(
  candles: Candle[],
  atr: number
): { side: 'bull' | 'bear'; price: number; time: number } | null {
  const n = candles.length;
  if (n < 16 || !(atr > 0)) return null;
  const eps = atr * 0.1;
  let swingLow = Infinity;
  let swingHigh = -Infinity;
  for (let i = Math.max(2, n - 30); i < n - 3; i++) {
    const lo = Number(candles[i]!.low);
    const hi = Number(candles[i]!.high);
    let isLow = true;
    let isHigh = true;
    for (let k = i - 2; k <= i + 2; k++) {
      if (k === i) continue;
      if (Number(candles[k]!.low) < lo) isLow = false;
      if (Number(candles[k]!.high) > hi) isHigh = false;
    }
    if (isLow && lo < swingLow) swingLow = lo;
    if (isHigh && hi > swingHigh) swingHigh = hi;
  }
  if (!(swingLow < Infinity) || !(swingHigh > 0)) return null;
  const look = Math.min(8, n - 2);
  for (let k = 1; k <= look; k++) {
    const c = candles[n - 1 - k]!;
    const t = Number(c.time) || 0;
    if (c.low < swingLow - eps * 0.2 && c.close > swingLow) {
      return { side: 'bull', price: swingLow, time: t };
    }
    if (c.high > swingHigh + eps * 0.2 && c.close < swingHigh) {
      return { side: 'bear', price: swingHigh, time: t };
    }
  }
  return null;
}

/** 장바구니세트 — leading confirmed/strong → 🛒/⚡ */
export function buildTapointCartBasketMarkers(
  candles: Candle[],
  chartTf: string
): TapointChartMarker[] {
  if (!candles || candles.length < 24) return [];
  try {
    const keyZones = detectMergedAnalysisKeyZones(candles, chartTf);
    const criticalZones = detectMergedCriticalZones({
      candles,
      timeframe: chartTf,
      keyZones,
    });
    const leading = scanMergedLeadingCandleSignals({
      candles,
      timeframe: chartTf,
      keyZones,
      criticalZones,
    });
    const picks = leading
      .filter((s) => s.tier === 'confirmed' || s.tier === 'strong')
      .sort((a, b) => a.time - b.time)
      .slice(-12);
    const out: TapointChartMarker[] = [];
    const seen = new Set<number>();
    for (const pick of picks) {
      const tm = Number(pick.time);
      if (!(tm > 0) || seen.has(tm)) continue;
      seen.add(tm);
      const bar = candles.find((c) => Number(c.time) === tm);
      const long = pick.direction === 'LONG';
      out.push({
        time: tm,
        price: long ? Number(bar?.low || 0) : Number(bar?.high || 0),
        label:
          long
            ? pick.tier === 'confirmed'
              ? '🛒'
              : '🛒강'
            : pick.tier === 'confirmed'
              ? '⚡'
              : '⚡강',
        color: long ? '#22c55e' : '#f97316',
        position: long ? 'belowBar' : 'aboveBar',
        shape: long ? 'arrowUp' : 'arrowDown',
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** SFP — 채널 레일 우선, 없으면 피벗 스윕회수 (최근 이벤트) */
export function buildTapointSfpMarkers(
  candles: Candle[],
  chartTf: string
): TapointChartMarker[] {
  if (!candles || candles.length < 20) return [];
  const atr = atrApprox(candles);
  const out: TapointChartMarker[] = [];
  try {
    let sfp: { side: 'bull' | 'bear'; price: number; time: number } | null = null;
    try {
      const gs = buildMergedDeskBlueRedChannels(candles, chartTf).geoms;
      const geom = gs.find((g) => g.primary) ?? gs[0] ?? null;
      if (geom && atr > 0) {
        sfp = detectRbRailSfp(candles, geom, atr);
      }
    } catch {
      sfp = null;
    }
    if (!sfp) sfp = detectTapointPivotSfp(candles, atr);
    if (sfp && sfp.time > 0) {
      const long = sfp.side === 'bull';
      out.push({
        time: sfp.time,
        price: sfp.price,
        label: long ? 'SFP↑' : 'SFP↓',
        color: long ? '#4ade80' : '#fb7185',
        position: long ? 'belowBar' : 'aboveBar',
        shape: 'circle',
      });
    }
  } catch {
    return [];
  }
  return out;
}

/** 독수리1호 평행채널 — 타점 LineSeries용 (상·중·하) */
export type TapointParallelChannelSeg = {
  id: string;
  type: ChannelType;
  score: number;
  upper: TapointInstBandLinePoint[];
  mid: TapointInstBandLinePoint[];
  lower: TapointInstBandLinePoint[];
};

function pceEdgeColor(type: ChannelType): string {
  void type;
  return '#ef4444';
}

function pceUpperColor(): string {
  return '#ef4444';
}

function pceLowerColor(): string {
  return '#22c55e';
}

function pceMidColor(type: ChannelType): string {
  void type;
  return '#a1a1aa';
}

export { pceEdgeColor, pceMidColor, pceUpperColor, pceLowerColor };

export function buildTapointParallelChannelSegments(
  candles: Candle[],
  lockKey?: string
): TapointParallelChannelSeg[] {
  if (!candles || candles.length < 40) return [];
  try {
    const pack = buildParallelChannelEngine(
      candles,
      lockKey ? { lockKey } : undefined
    );
    const out: TapointParallelChannelSeg[] = [];
    for (const ch of pack.channels) {
      const i0 = Math.max(0, Math.min(ch.startIndex, candles.length - 1));
      const i1 = Math.max(i0, Math.min(ch.lastIndex, candles.length - 1));
      const step = Math.max(1, Math.floor((i1 - i0) / 48));
      const upper: TapointInstBandLinePoint[] = [];
      const mid: TapointInstBandLinePoint[] = [];
      const lower: TapointInstBandLinePoint[] = [];
      for (let i = i0; i <= i1; i += step) {
        const t = Number(candles[i]!.time);
        if (!(t > 0)) continue;
        upper.push({ time: t, value: getUpperPrice(ch, i) });
        mid.push({ time: t, value: getMidPrice(ch, i) });
        lower.push({ time: t, value: getLowerPrice(ch, i) });
      }
      /** 끝점 강제 */
      if (i1 > i0 && (i1 - i0) % step !== 0) {
        const t = Number(candles[i1]!.time);
        if (t > 0) {
          upper.push({ time: t, value: getUpperPrice(ch, i1) });
          mid.push({ time: t, value: getMidPrice(ch, i1) });
          lower.push({ time: t, value: getLowerPrice(ch, i1) });
        }
      }
      if (upper.length < 2 || lower.length < 2) continue;
      out.push({
        id: ch.id,
        type: ch.type,
        score: ch.score,
        upper,
        mid,
        lower,
      });
    }
    return out.slice(0, 1);
  } catch {
    return [];
  }
}

/** 기존 타점 신호 + 공동 레이어 병합 (로켓·장바구니·SFP·밴드터치 추가 · SWEEP 우선) */
export function mergeTapointSignalsWithSharedLayers(params: {
  base: TapointChartSignals | null;
  dumpZones: TapointChartZoneBand[];
  rocketMarkers: TapointChartMarker[];
  bandTouchMarkers?: TapointChartMarker[];
  cartMarkers?: TapointChartMarker[];
  sfpMarkers?: TapointChartMarker[];
  dumpOn: boolean;
  rocketOn: boolean;
  bandTouchOn?: boolean;
  cartOn?: boolean;
  sfpOn?: boolean;
}): TapointChartSignals {
  const base = params.base || { lines: [], zones: [], markers: [], legendKo: [] };
  /** 타점 핵심존(전투·FVG·Breaker) 먼저 · 폭락존은 뒤에 */
  const coreKinds = new Set(['battle', 'fvg', 'bpr', 'breaker', 'ob', 'cluster', 'demand', 'supply']);
  const baseZones = (base.zones || []).filter((z) => z.kind !== 'mtf-dump');
  const dump = params.dumpOn ? params.dumpZones : [];
  const zones = [
    ...baseZones.filter((z) => coreKinds.has(String(z.kind))),
    ...baseZones.filter((z) => !coreKinds.has(String(z.kind))),
    ...dump,
  ];
  const sharedLabels = /^(🚀|📉|🛒|🛒강|⚡|⚡강|SFP↑|SFP↓|L[HP]?[★◆·]|S[HP]?[★◆·]|⚡L|⚡S)/;
  const baseMarks = (base.markers || []).filter((m) => !sharedLabels.test(String(m.label || '')));
  const sweeps = baseMarks.filter((m) => /sweep/i.test(String(m.label || '')));
  const rest = baseMarks.filter((m) => !/sweep/i.test(String(m.label || '')));
  const rockets = params.rocketOn ? (params.rocketMarkers || []).slice(-8) : [];
  const bandTouch = params.bandTouchOn ? (params.bandTouchMarkers || []).slice(-12) : [];
  const carts = params.cartOn ? (params.cartMarkers || []).slice(-10) : [];
  const sfps = params.sfpOn ? (params.sfpMarkers || []).slice(-6) : [];
  /** SWEEP 먼저 · 공동 마커는 뒤에 추가 (기존 타점 마커 유지) */
  const markers = [
    ...sweeps.slice(-24),
    ...rest.slice(-8),
    ...bandTouch,
    ...carts,
    ...sfps,
    ...rockets,
  ];
  const legendKo = [...(base.legendKo || [])];
  if (params.dumpOn && params.dumpZones.length) legendKo.push(`폭락존 ${params.dumpZones.length}`);
  if (params.rocketOn && params.rocketMarkers.length) {
    legendKo.push(`로켓·하락 ${params.rocketMarkers.length}`);
  }
  if (params.bandTouchOn && bandTouch.length) legendKo.push(`기관터치 ${bandTouch.length}`);
  if (params.cartOn && carts.length) legendKo.push(`장바구니 ${carts.length}`);
  if (params.sfpOn && sfps.length) legendKo.push(`SFP ${sfps.length}`);
  return {
    lines: base.lines || [],
    zones,
    markers,
    legendKo,
  };
}
