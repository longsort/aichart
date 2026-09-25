/**
 * Mirage LSP — TradingView 참조 이미지형 구조 비주얼.
 * zone: 분석 캔들(time1) → 마지막 봉(time2) · 추세선: 피벗 wick 스냅.
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import { mirageOptionsForTimeframe } from '@/lib/mirageLiquiditySweepIndicator';
import {
  collectSwingPivots,
  computeCandleTrendChannelGeom,
  mergedDeskChannelLookbackBars,
  mergedDeskPivotMinBars,
  pickSwingPivotPair,
  type CandlePivot,
} from '@/lib/mergedDeskCandleTrendline';

function fallbackSwingPivotPair(
  candles: Candle[],
  timeframe: string,
  side: 'high' | 'low',
  start: number,
  lastIdx: number
): [CandlePivot, CandlePivot] | null {
  if (lastIdx - start < 3) return null;
  const minGap = Math.max(3, mergedDeskPivotMinBars(timeframe));
  let extremeIdx = start;
  for (let i = start; i <= lastIdx; i++) {
    const v = side === 'high' ? candles[i]!.high : candles[i]!.low;
    const best = side === 'high' ? candles[extremeIdx]!.high : candles[extremeIdx]!.low;
    if (side === 'high' ? v >= best : v <= best) extremeIdx = i;
  }
  let p1Idx = extremeIdx;
  if (lastIdx - p1Idx < minGap) {
    p1Idx = Math.max(start, lastIdx - minGap);
  }
  const p1: CandlePivot = {
    i: p1Idx,
    price: side === 'high' ? candles[p1Idx]!.high : candles[p1Idx]!.low,
    time: Number(candles[p1Idx]!.time),
  };
  const p2: CandlePivot = {
    i: lastIdx,
    price: side === 'high' ? candles[lastIdx]!.high : candles[lastIdx]!.low,
    time: Number(candles[lastIdx]!.time),
  };
  if (p2.i - p1.i < 2) return null;
  return [p1, p2];
}
import {
  mergedDeskAnalysisZoneTimes,
  snapMergedOverlayTimeToCandles,
  type MergedDeskAnalysisZoneContext,
} from '@/lib/mergedAnalysisOverlayTimes';
import { buildMergedDeskAdvancedCandleZones } from '@/lib/mergedDeskAdvancedCandleZones';

/** SMC 참조 — 얇은 선·낮은 채움·고대비 테두리 (가시성 강화) */
const TV_RESIST_ZONE = 'rgba(236,72,153,0.22)';
const TV_SUPPORT_ZONE = 'rgba(59,130,246,0.22)';
const TV_CONSOL_ZONE = 'rgba(148,163,184,0.18)';
const TV_RANGE_ZONE = 'rgba(34,197,94,0.18)';
const TV_BREAKOUT_ZONE = 'rgba(56,189,248,0.18)';
const TV_FVG_BULL = 'rgba(56,189,248,0.18)';
const TV_FVG_BEAR = 'rgba(250,204,21,0.17)';
const TV_CHANNEL_FILL = 'rgba(148,163,184,0.12)';
const TV_TRI_RES = 'rgba(251,113,133,0.92)';
const TV_TRI_SUP = 'rgba(96,165,250,0.92)';
const MIRAGE_TV_MAX_ZONES = 8;

/** zone·선 라벨 — 한글 짧은 캡션 */
function bi(_en: string, ko: string): string {
  return ko;
}

function tvTrendLine(params: {
  id: string;
  label?: string;
  t1: number;
  p1: number;
  t2: number;
  p2: number;
  color: string;
  extraClass: string;
  dash?: string;
  width?: number;
}): OverlayItem {
  return {
    id: params.id,
    kind: 'trendLine',
    label: params.label ?? '',
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: params.t1 as UTCTimestamp,
    price1: params.p1,
    time2: params.t2 as UTCTimestamp,
    price2: params.p2,
    confidence: 0.78,
    color: params.color,
    lineDash: params.dash ?? '6 4',
    lineStrokeWidth: params.width ?? 1.5,
    category: 'mirageLSP',
    overlayZoneExtraClass: `${params.extraClass} merged-ares-mlsp-tv-trend`,
    noProject: true,
    lineLabelColor: params.color,
    labelTextColor: params.color,
  };
}

function tvZone(params: {
  id: string;
  caption: string;
  t1: number;
  t2: number;
  top: number;
  bot: number;
  color: string;
  extraClass: string;
  spanOnly?: boolean;
  /** HQ 롱A/숏A형 pill — long=녹 short=빨 */
  pillSide?: 'long' | 'short';
}): OverlayItem {
  const pillCls =
    params.pillSide === 'long'
      ? 'merged-desk-pill-zone merged-desk-hotzone-entry overlay-zone--hotzone-signal--long'
      : params.pillSide === 'short'
        ? 'merged-desk-pill-zone merged-desk-hotzone-entry overlay-zone--hotzone-signal--short'
        : '';
  return {
    id: params.id,
    kind:
      params.pillSide === 'long'
        ? 'demandZone'
        : params.pillSide === 'short'
          ? 'supplyZone'
          : 'zone',
    label: params.caption,
    labelTooltip: params.caption,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: params.t1 as UTCTimestamp,
    time2: params.t2 as UTCTimestamp,
    price1: params.top,
    price2: params.bot,
    confidence: 0.72,
    color:
      params.pillSide === 'long'
        ? 'rgba(34,197,94,0.28)'
        : params.pillSide === 'short'
          ? 'rgba(239,68,68,0.26)'
          : params.color,
    category: 'mirageLSP',
    zoneFillPreserve: true,
    zoneSpanOnly: params.spanOnly ?? false,
    structureBias:
      params.pillSide === 'long' ? 'bullish' : params.pillSide === 'short' ? 'bearish' : undefined,
    zoneFaceBase: params.caption,
    zoneFaceLang: 'ko',
    overlayZoneExtraClass: `${params.extraClass} merged-ares-mlsp-tv-zone-face ${pillCls}`.trim(),
  };
}

function lookbackBars(timeframe: string, n: number): number {
  const preset = mirageOptionsForTimeframe(timeframe);
  const lb = preset.lookbackBars ?? mergedDeskChannelLookbackBars(timeframe);
  return Math.min(Math.max(lb, mergedDeskPivotMinBars(timeframe) * 4), n - 4);
}

/** 전 TF 동일 최소 봉 — 1m~1M 모두 Mirage zone·추세 작도 */
function mirageTvMinCandles(_timeframe: string): number {
  return 12;
}

function priceOnPivotLine(p1: CandlePivot, p2: CandlePivot, idx: number): number {
  const slopePerBar = (p2.price - p1.price) / Math.max(1, p2.i - p1.i);
  return p1.price + slopePerBar * (idx - p1.i);
}

function detectFvgZones(candles: Candle[], start: number): Array<{
  t1: number;
  t2: number;
  top: number;
  bot: number;
  bias: 'bullish' | 'bearish';
}> {
  const out: Array<{ t1: number; t2: number; top: number; bot: number; bias: 'bullish' | 'bearish' }> = [];
  for (let i = Math.max(start + 2, 2); i < candles.length; i++) {
    const c0 = candles[i - 2]!;
    const c2 = candles[i]!;
    const t1 = Number(c0.time);
    const t2 = Number(c2.time);
    if (c2.low > c0.high) {
      out.push({ t1, t2, top: c2.low, bot: c0.high, bias: 'bullish' });
    } else if (c2.high < c0.low) {
      out.push({ t1, t2, top: c0.low, bot: c2.high, bias: 'bearish' });
    }
  }
  return out.slice(-3);
}

function findConsolidationWindow(candles: Candle[], start: number, end: number, win: number): { i0: number; i1: number } | null {
  if (end - start < win + 4) return null;
  let bestI = start;
  let bestRange = Infinity;
  for (let i = start; i <= end - win; i++) {
    const slice = candles.slice(i, i + win);
    const hi = Math.max(...slice.map((c) => c.high));
    const lo = Math.min(...slice.map((c) => c.low));
    const r = hi - lo;
    if (r < bestRange) {
      bestRange = r;
      bestI = i;
    }
  }
  return { i0: bestI, i1: bestI + win - 1 };
}

function findRangeBox(candles: Candle[], tail: number): { i0: number; i1: number; top: number; bot: number } | null {
  if (candles.length < tail + 8) return null;
  const i0 = candles.length - tail;
  const i1 = candles.length - 1;
  const slice = candles.slice(i0, i1 + 1);
  const top = Math.max(...slice.map((c) => c.high));
  const bot = Math.min(...slice.map((c) => c.low));
  const boxRange = top - bot;
  const medRanges: number[] = [];
  for (let i = Math.max(0, candles.length - 80); i < candles.length - 1; i++) {
    medRanges.push(candles[i + 1]!.high - candles[i + 1]!.low);
  }
  medRanges.sort((a, b) => a - b);
  const med = medRanges[Math.floor(medRanges.length / 2)] ?? boxRange;
  if (boxRange > med * 1.35) return null;
  return { i0, i1, top, bot };
}

function zoneMidPrice(z: OverlayItem): number {
  return (Number(z.price1) + Number(z.price2)) / 2;
}

function zoneOverlapRatio(a: OverlayItem, b: OverlayItem): number {
  const aTop = Math.max(Number(a.price1), Number(a.price2));
  const aBot = Math.min(Number(a.price1), Number(a.price2));
  const bTop = Math.max(Number(b.price1), Number(b.price2));
  const bBot = Math.min(Number(b.price1), Number(b.price2));
  const overlap = Math.max(0, Math.min(aTop, bTop) - Math.max(aBot, bBot));
  const minH = Math.min(aTop - aBot, bTop - bBot);
  return minH > 0 ? overlap / minH : 0;
}

function zonePriority(id: string): number {
  if (id.includes('ob-')) return 98;
  if (id.includes('hvp')) return 86;
  if (id.includes('lvp')) return 84;
  if (id.includes('resist')) return 92;
  if (id.includes('support')) return 90;
  if (id.includes('fvg')) return 78;
  if (id.includes('breakout')) return 72;
  if (id.includes('consolidation')) return 58;
  if (id.includes('range')) return 52;
  return 40;
}

/** SMC — 겹침·과다 zone 제거, 최대 4개 */
function capMirageTvZones(items: OverlayItem[], close: number): OverlayItem[] {
  const rest = items.filter((o) => String(o.kind) !== 'zone');
  const zones = items.filter((o) => String(o.kind) === 'zone');
  const scored = zones
    .map((z) => {
      const id = String(z.id || '');
      const dist = Math.abs(zoneMidPrice(z) - close);
      const distPen = close > 0 ? Math.min(28, (dist / close) * 8000) : dist;
      return { z, score: zonePriority(id) - distPen };
    })
    .sort((a, b) => b.score - a.score);

  const mustKeepIds = new Set([
    'merged-ares-mlsp-tv-resist-level',
    'merged-ares-mlsp-tv-major-support',
  ]);
  const mustKeepPrefix = ['merged-ares-mlsp-tv-ob-', 'merged-ares-mlsp-tv-smc-ob-'];
  const mustKeep = scored
    .filter(({ z }) => {
      const id = String(z.id || '');
      return mustKeepIds.has(id) || mustKeepPrefix.some((p) => id.startsWith(p));
    })
    .map(({ z }) => z)
    .slice(0, 4);
  const kept: OverlayItem[] = [...mustKeep];
  for (const { z } of scored) {
    if (kept.length >= MIRAGE_TV_MAX_ZONES) break;
    if (kept.some((k) => String(k.id) === String(z.id))) continue;
    if (kept.some((k) => zoneOverlapRatio(z, k) > 0.52)) continue;
    kept.push(z);
  }
  return [...rest, ...kept];
}

function snapT(candles: Candle[], t: number): number {
  return Number(snapMergedOverlayTimeToCandles(t, candles));
}

function wickHigh(candles: Candle[], idx: number): number {
  const c = candles[idx];
  return c ? c.high : NaN;
}

function wickLow(candles: Candle[], idx: number): number {
  const c = candles[idx];
  return c ? c.low : NaN;
}

/** TV Mirage 참조 — 구조 채널·삼각·존 오버레이 */
export function buildMirageTvStructureOverlays(
  candles: Candle[],
  timeframe: string,
  zoneCtx?: MergedDeskAnalysisZoneContext | null
): OverlayItem[] {
  const tf = normalizeChartTimeframe(timeframe);
  const n = candles.length;
  if (n < mirageTvMinCandles(tf)) return [];

  const lb = lookbackBars(tf, n);
  const start = Math.max(0, n - lb);
  const last = candles[n - 1]!;
  const lastTime = snapT(candles, Number(last.time));
  const lastIdx = n - 1;
  const analysisZone = mergedDeskAnalysisZoneTimes(candles, tf, zoneCtx ?? undefined);
  const analysisT1 = snapT(candles, Number(analysisZone.t1));

  const { highs: swingHighs, lows: swingLows } = collectSwingPivots(candles, tf);
  const hiPair =
    pickSwingPivotPair(swingHighs, tf) ?? fallbackSwingPivotPair(candles, tf, 'high', start, lastIdx);
  const loPair =
    pickSwingPivotPair(swingLows, tf) ?? fallbackSwingPivotPair(candles, tf, 'low', start, lastIdx);
  if (!hiPair || !loPair) return [];

  const [h1, h2] = hiPair;
  const [l1, l2] = loPair;

  const visible = candles.slice(start);
  const visHi = Math.max(...visible.map((c) => c.high));
  const visLo = Math.min(...visible.map((c) => c.low));
  const visRange = Math.max(visHi - visLo, last.close * 0.001);
  const pad = visRange * 0.018;

  const out: OverlayItem[] = [];

  const h1Price = h1.price;
  const h2Price = h2.price;
  const l1Price = l1.price;
  const l2Price = l2.price;

  const tH1 = snapT(candles, h1.time);
  const tH2 = snapT(candles, h2.time);
  const tL1 = snapT(candles, l1.time);
  const tL2 = snapT(candles, l2.time);

  const resEndPrice = priceOnPivotLine(h1, h2, lastIdx);
  const supEndPrice = priceOnPivotLine(l1, l2, lastIdx);

  const widthStart = Math.abs(h1Price - l1Price);
  const widthEnd = Math.abs(h2Price - l2Price);
  const converging = widthEnd < widthStart * 0.93;

  if (converging) {
    out.push(
      tvTrendLine({
        id: 'merged-ares-mlsp-tv-tri-res',
        label: bi('Resistance-line', '저항선'),
        t1: tH1,
        p1: h1Price,
        t2: lastTime,
        p2: resEndPrice,
        color: TV_TRI_RES,
        extraClass: 'merged-ares-mlsp-tv-tri-res merged-desk-candle-trend',
        width: 1.5,
      }),
      tvTrendLine({
        id: 'merged-ares-mlsp-tv-tri-sup',
        label: bi('Support-line', '지지선'),
        t1: tL1,
        p1: l1Price,
        t2: lastTime,
        p2: supEndPrice,
        color: TV_TRI_SUP,
        extraClass: 'merged-ares-mlsp-tv-tri-sup merged-desk-candle-trend',
        width: 1.5,
      })
    );

    const apexPrice = (resEndPrice + supEndPrice) / 2;
    const triStart = snapT(candles, Math.min(h2.time, l2.time));
    out.push(
      tvZone({
        id: 'merged-ares-mlsp-tv-breakout',
        caption: bi('Breakout-level', '돌파'),
        t1: Math.max(analysisT1, triStart),
        t2: lastTime,
        top: apexPrice + pad * 0.6,
        bot: apexPrice - pad * 0.6,
        color: TV_BREAKOUT_ZONE,
        extraClass: 'merged-ares-mlsp-tv-breakout-zone',
      })
    );
  }

  const geom = computeCandleTrendChannelGeom(candles, tf);
  const slopeH = (h2.price - h1.price) / Math.max(1, h2.i - h1.i);
  const slopeL = (l2.price - l1.price) / Math.max(1, l2.i - l1.i);
  const downTrend =
    geom != null &&
    slopeH < 0 &&
    slopeL <= 0 &&
    geom.upperEnd.price < h1.price;

  if (downTrend && geom) {
    const channelStart = Math.max(analysisT1, Math.min(h2.time, l2.time));
    const lerp = (t0: number, p0: number, t1: number, p1: number, t: number) => {
      if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return p0;
      const r = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
      return p0 + (p1 - p0) * r;
    };
    const tEnd = lastTime;
    const upper1 = lerp(h1.time, h1.price, geom.upperEnd.time, geom.upperEnd.price, channelStart);
    const upper2 = geom.upperEnd.price;
    const lower1 = lerp(l1.time, l1.price, geom.lowerEnd.time, geom.lowerEnd.price, channelStart);
    const lower2 = geom.lowerEnd.price;
    const tStart = channelStart;

    out.push({
      id: 'merged-ares-mlsp-tv-downtrend-band',
      kind: 'channelBand',
      label: '',
      x1: 0,
      y1: 0.5,
      x2: 1,
      y2: 0.5,
      time1: tStart,
      time2: tEnd,
      price1: upper1,
      price2: lower2,
      confidence: 0.74,
      color: TV_CHANNEL_FILL,
      category: 'mirageLSP',
      structureBias: 'bearish',
      channelBand: {
        time1: tStart,
        time2: tEnd,
        priceHigh1: upper1,
        priceHigh2: upper2,
        priceLow1: lower1,
        priceLow2: lower2,
      },
      overlayZoneExtraClass: 'merged-ares-mlsp-tv-downtrend-channel merged-desk-candle-trend',
      noProject: true,
    });
  }

  /** 저항존 = 최근 스윙고점 정의봉 상단(윅~바디)만 허그 · 합성 pad 두께 금지 */
  const recentHighs = swingHighs.slice(-3);
  const resistPivot =
    recentHighs.length > 0
      ? recentHighs.reduce((best, h) =>
          h.price > best.price || (h.price === best.price && h.i >= best.i) ? h : best
        )
      : h2;
  const resistC = candles[Math.max(0, Math.min(n - 1, resistPivot.i))]!;
  const resistTop = resistC.high;
  const resistBodyTop = Math.max(resistC.open, resistC.close);
  const resistRange = Math.max(resistC.high - resistC.low, 1e-12);
  const resistBot =
    resistTop - resistBodyTop < resistRange * 0.18
      ? resistTop - resistRange * 0.45
      : resistBodyTop;
  const resistT1 = snapT(candles, Number(resistC.time));
  out.push(
    tvZone({
      id: 'merged-ares-mlsp-tv-resist-level',
      caption: bi('Resistance-level', '저항'),
      t1: resistT1,
      t2: lastTime,
      top: resistTop,
      bot: Math.min(resistBot, resistTop - resistRange * 0.12),
      color: TV_RESIST_ZONE,
      extraClass: 'merged-ares-mlsp-tv-resist-zone',
      pillSide: 'short',
    })
  );

  /** 지지존 = 최근 스윙저점 정의봉 하단(윅~바디)만 허그 */
  const recentLows = swingLows.slice(-3);
  const supportPivot =
    recentLows.length > 0
      ? recentLows.reduce((best, l) =>
          l.price < best.price || (l.price === best.price && l.i >= best.i) ? l : best
        )
      : l2;
  const supportC = candles[Math.max(0, Math.min(n - 1, supportPivot.i))]!;
  const supportBot = supportC.low;
  const supportBodyBot = Math.min(supportC.open, supportC.close);
  const supportRange = Math.max(supportC.high - supportC.low, 1e-12);
  const supportTop =
    supportBodyBot - supportBot < supportRange * 0.18
      ? supportBot + supportRange * 0.45
      : supportBodyBot;
  const supportT1 = snapT(candles, Number(supportC.time));
  out.push(
    tvZone({
      id: 'merged-ares-mlsp-tv-major-support',
      caption: bi('Major-Support', '지지'),
      t1: supportT1,
      t2: lastTime,
      top: Math.max(supportTop, supportBot + supportRange * 0.12),
      bot: supportBot,
      color: TV_SUPPORT_ZONE,
      extraClass: 'merged-ares-mlsp-tv-support-zone',
      pillSide: 'long',
    })
  );

  const consWin = findConsolidationWindow(candles, start + Math.floor(lb * 0.2), lastIdx - 8, Math.max(12, Math.floor(lb * 0.18)));
  let hasConsolidation = false;
  if (consWin) {
    hasConsolidation = true;
    const c0 = candles[consWin.i0]!;
    const hi = Math.max(...candles.slice(consWin.i0, consWin.i1 + 1).map((c) => c.high));
    const lo = Math.min(...candles.slice(consWin.i0, consWin.i1 + 1).map((c) => c.low));
    const consT1 = snapT(candles, Number(c0.time));
    out.push(
      tvZone({
        id: 'merged-ares-mlsp-tv-consolidation',
        caption: bi('Consolidation', '횡보'),
        t1: consT1,
        t2: lastTime,
        top: hi,
        bot: lo,
        color: TV_CONSOL_ZONE,
        extraClass: 'merged-ares-mlsp-tv-consolidation-zone',
      })
    );
  }

  const rangeBox = findRangeBox(candles, Math.min(28, Math.floor(lb * 0.32)));
  if (rangeBox && !hasConsolidation) {
    const rangeT1 = snapT(candles, Number(candles[rangeBox.i0]!.time));
    out.push(
      tvZone({
        id: 'merged-ares-mlsp-tv-range',
        caption: bi('Range', '박스'),
        t1: rangeT1,
        t2: lastTime,
        top: rangeBox.top,
        bot: rangeBox.bot,
        color: TV_RANGE_ZONE,
        extraClass: 'merged-ares-mlsp-tv-range-zone',
      })
    );
  }

  const fvgList = detectFvgZones(candles, start).slice(-1);
  for (const [fi, fvg] of fvgList.entries()) {
    const fvgT1 = snapT(candles, fvg.t1);
    const fvgCaption = fvg.bias === 'bullish' ? bi('FVG', 'FVG') : bi('FVG', 'FVG');
    out.push(
      tvZone({
        id: `merged-ares-mlsp-tv-fvg-${fi}-${fvg.t1}`,
        caption: fvgCaption,
        t1: fvgT1,
        t2: lastTime,
        top: fvg.top,
        bot: fvg.bot,
        color: fvg.bias === 'bullish' ? TV_FVG_BULL : TV_FVG_BEAR,
        extraClass: `merged-ares-mlsp-tv-fvg merged-ares-mlsp-tv-fvg-${fvg.bias}`,
        spanOnly: false,
      })
    );
  }

  out.push(...buildMergedDeskAdvancedCandleZones(candles, tf, analysisT1, lastTime));

  return capMirageTvZones(out, Number(last.close));
}
