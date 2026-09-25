import type { Candle, OverlayItem } from '@/types';
import { normalizeHex6 } from './chartHexColor';

/** Pine: Trend Channels With Liquidity Breaks [ChartPrime] 기본값 */
export type ChartPrimeTrendChannelOpts = {
  length: number;
  show: boolean;
  wait: boolean;
  extend: boolean;
  enableLiquid: boolean;
  /** Pine linefill — false면 대각선만 */
  showFills: boolean;
  /**
   * 채널 두께(ATR×6 기반 offset) 배율. 1=기본, 0.45~0.6이면 밴드가 캔들·피벗에 더 밀착(매매 착시용).
   */
  channelWidthScale: number;
  topColor: string;
  centerColor: string;
  bottomColor: string;
};

const DEFAULT_OPTS: ChartPrimeTrendChannelOpts = {
  length: 8,
  show: true,
  wait: true,
  extend: false,
  enableLiquid: false,
  showFills: true,
  channelWidthScale: 1,
  topColor: '#337C4F',
  centerColor: '#9ca3af',
  bottomColor: '#A52D2D',
};

function roundTick(p: number): number {
  if (!Number.isFinite(p)) return p;
  const a = Math.abs(p);
  const d = a >= 1000 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 6 : 8;
  return Math.round(p * 10 ** d) / 10 ** d;
}

function trueRange(c: Candle, prevClose: number): number {
  return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
}

function atrAt(candles: Candle[], endIdx: number, period: number): number {
  const e = Math.min(endIdx, candles.length - 1);
  if (e < 1) return Math.max(1e-12, candles[e]?.high - candles[e]?.low || 1e-8);
  const from = Math.max(1, e - period + 1);
  let s = 0;
  let n = 0;
  for (let i = from; i <= e; i++) {
    const prevC = candles[i - 1];
    s += trueRange(candles[i], prevC.close);
    n++;
  }
  return n > 0 ? s / n : 1e-8;
}

function wmaVolume(candles: Candle[], i: number, len: number): number {
  let num = 0;
  let den = 0;
  const from = Math.max(0, i - len + 1);
  let w = 1;
  for (let j = from; j <= i; j++, w++) {
    const v = candles[j].volume || 0;
    num += v * w;
    den += w;
  }
  return den > 0 ? num / den : 0;
}

function minMaxNorm(candles: Candle[], i: number, look: number, val: number): number {
  const from = Math.max(0, i - look + 1);
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = from; j <= i; j++) {
    const v = candles[j].volume || 0;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  if (!Number.isFinite(lo) || hi <= lo) return 50;
  const out = ((val - lo) / (hi - lo)) * 100;
  return Math.max(0, Math.min(100, out));
}

function percentileNearestRank(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

type LiquidityLabel = 'LV' | 'MV' | 'HV';

function liquidityBreak(
  candles: Candle[],
  i: number,
  volNormHist: number[],
  cumVolAvg: number[],
  cumRankAvg: number[]
): LiquidityLabel {
  const vol = volNormHist[i] ?? 0;
  const avg = cumVolAvg[i] ?? 0;
  const from = Math.max(0, i - 99);
  const slice = volNormHist.slice(from, i + 1);
  const rank = percentileNearestRank(slice, 75);
  const avgRank = cumRankAvg[i] ?? 0;
  if (vol < avg) return 'LV';
  if (vol > avg && vol < avgRank) return 'MV';
  return 'HV';
}

function pivotHighConfirmed(candles: Candle[], i: number, L: number): number | null {
  const center = i - L;
  if (center < L || center + L >= candles.length) return null;
  const h = candles[center].high;
  for (let k = center - L; k <= center + L; k++) {
    if (k === center) continue;
    if (candles[k].high > h) return null;
  }
  return h;
}

function pivotLowConfirmed(candles: Candle[], i: number, L: number): number | null {
  const center = i - L;
  if (center < L || center + L >= candles.length) return null;
  const lo = candles[center].low;
  for (let k = center - L; k <= center + L; k++) {
    if (k === center) continue;
    if (candles[k].low < lo) return null;
  }
  return lo;
}

function atan2p(dy: number, dx: number): number {
  if (dx > 0) return Math.atan(dy / dx);
  if (dx < 0 && dy >= 0) return Math.atan(dy / dx) + Math.PI;
  if (dx < 0 && dy < 0) return Math.atan(dy / dx) - Math.PI;
  if (dx === 0 && dy > 0) return Math.PI / 2;
  if (dx === 0 && dy < 0) return -Math.PI / 2;
  return 0;
}

type LineGeom = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type ChannelPack = {
  kind: 'down' | 'up';
  top: LineGeom;
  topZone: LineGeom;
  topMid: LineGeom;
  bottomMid: LineGeom;
  bottomZone: LineGeom;
  bottom: LineGeom;
  center: LineGeom;
};

function linePriceAtX(g: LineGeom, x: number): number {
  const dx = g.x2 - g.x1;
  if (Math.abs(dx) < 1e-12) return g.y1;
  return g.y1 + ((g.y2 - g.y1) / dx) * (x - g.x1);
}

function snapLineGeomToCandleBars(
  candles: Candle[],
  g: LineGeom
): { time1: number; price1: number; time2: number; price2: number } {
  const n = candles.length;
  const i1 = Math.max(0, Math.min(n - 1, Math.floor(g.x1)));
  const i2 = Math.max(0, Math.min(n - 1, Math.floor(g.x2)));
  return {
    time1: Number(candles[i1]!.time),
    price1: roundTick(linePriceAtX(g, i1)),
    time2: Number(candles[i2]!.time),
    price2: roundTick(linePriceAtX(g, i2)),
  };
}

function pushChannelOverlays(
  out: OverlayItem[],
  pack: ChannelPack,
  candles: Candle[],
  minP: number,
  maxP: number,
  visTime: (c: Candle[], i: number) => number,
  visIdx: (c: Candle[], i: number) => number,
  xiNorm: (idx: number) => number,
  topHex: string,
  bottomHex: string,
  centerHex: string,
  zoneTopStroke: string,
  zoneTopMidStroke: string,
  zoneBotMidStroke: string,
  zoneBotStroke: string
): void {
  const push = (id: string, g: LineGeom, color: string, dash: string | undefined, w: number) => {
    const snap = snapLineGeomToCandleBars(candles, g);
    out.push({
      id: `cptc-${pack.kind}-${id}`,
      kind: 'trendLine',
      label: '',
      x1: xiNorm(g.x1),
      y1: (maxP - snap.price1) / Math.max(1e-9, maxP - minP),
      x2: xiNorm(g.x2),
      y2: (maxP - snap.price2) / Math.max(1e-9, maxP - minP),
      time1: snap.time1,
      time2: snap.time2,
      price1: snap.price1,
      price2: snap.price2,
      confidence: 62,
      color,
      lineLabelColor: color,
      category: 'chartPrimeTrendChannels',
      lineDash: dash,
      lineStrokeWidth: w,
      noProject: true,
      overlayZoneExtraClass: 'chart-prime-candle-trend',
    });
  };

  push('top', pack.top, topHex, undefined, 2);
  push('topz', pack.topZone, zoneTopStroke, undefined, 1);
  push('topmid', pack.topMid, zoneTopMidStroke, undefined, 1);
  push('botmid', pack.bottomMid, zoneBotMidStroke, undefined, 1);
  push('botz', pack.bottomZone, zoneBotStroke, undefined, 1);
  push('bot', pack.bottom, bottomHex, undefined, 2);
  push('center', pack.center, centerHex, '4 4', 1);
}

/** Pine color.new(hex, transp): transp 0=불투명, 100=완전 투명 */
function pineColorNew(hex: string, transparency: number): string {
  const a = Math.max(0.05, Math.min(0.92, (100 - transparency) / 100));
  const m = hex.replace('#', '').match(/^([0-9a-fA-F]{6})$/);
  if (!m) return `rgba(80, 80, 80, ${a})`;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function hexWithAlpha(hex: string, alphaPct: number): string {
  const m = hex.replace('#', '').match(/^([0-9a-fA-F]{6})$/);
  if (!m) return `rgba(80,80,80,${alphaPct / 100})`;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${Math.min(0.95, alphaPct / 100)})`;
}

function pushChannelBandFills(
  out: OverlayItem[],
  pack: ChannelPack,
  candles: Candle[],
  visTime: (c: Candle[], i: number) => number,
  visIdx: (c: Candle[], i: number) => number,
  topHex: string,
  bottomHex: string,
  fillOpts: { enableLiquid: boolean; volumeScore: number }
): void {
  /** Pine: color.new(c, 60 + (100 - volume_score) / 5) on outer linefills when Volume BG */
  const outerTransp = fillOpts.enableLiquid
    ? Math.min(94, Math.max(40, 60 + (100 - fillOpts.volumeScore) / 5))
    : 80;
  const band = (suffix: string, upper: LineGeom, lower: LineGeom, fill: string) => {
    const up = snapLineGeomToCandleBars(candles, upper);
    const lo = snapLineGeomToCandleBars(candles, lower);
    out.push({
      id: `cptc-${pack.kind}-fill-${suffix}`,
      kind: 'channelBand',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: up.time1,
      time2: up.time2,
      price1: up.price1,
      price2: up.price2,
      confidence: 48,
      color: fill,
      category: 'chartPrimeTrendChannels',
      overlayZoneExtraClass: 'chart-prime-candle-trend',
      channelBand: {
        time1: up.time1,
        time2: up.time2,
        priceHigh1: up.price1,
        priceHigh2: up.price2,
        priceLow1: lo.price1,
        priceLow2: lo.price2,
      },
    });
  };

  band('top-mid', pack.top, pack.topMid, pineColorNew(topHex, 20));
  band('top-outer', pack.topMid, pack.topZone, pineColorNew(topHex, outerTransp));
  band('bot-mid', pack.bottomMid, pack.bottom, pineColorNew(bottomHex, 20));
  band('bot-outer', pack.bottomZone, pack.bottomMid, pineColorNew(bottomHex, outerTransp));
}

function buildDownPack(
  prevPh: number,
  lastPh: number,
  prevIdx: number,
  lastIdx: number,
  L: number,
  offset: number
): ChannelPack {
  const x1 = prevIdx - L;
  const x2 = lastIdx - L;
  const top: LineGeom = {
    x1,
    y1: roundTick(prevPh + offset / 7),
    x2,
    y2: roundTick(lastPh + offset / 7),
  };
  const topZone: LineGeom = {
    x1,
    y1: roundTick(prevPh - offset / 7),
    x2,
    y2: roundTick(lastPh - offset / 7),
  };
  const topMid: LineGeom = { x1, y1: prevPh, x2, y2: lastPh };
  const bottom: LineGeom = {
    x1,
    y1: roundTick(prevPh - offset - offset / 7),
    x2,
    y2: roundTick(lastPh - offset - offset / 7),
  };
  const bottomZone: LineGeom = {
    x1,
    y1: roundTick(prevPh - offset + offset / 7),
    x2,
    y2: roundTick(lastPh - offset + offset / 7),
  };
  const bottomMid: LineGeom = {
    x1,
    y1: roundTick(prevPh - offset),
    x2,
    y2: roundTick(lastPh - offset),
  };
  const center: LineGeom = {
    x1,
    y1: roundTick((prevPh + prevPh - offset) / 2),
    x2,
    y2: roundTick((lastPh + lastPh - offset) / 2),
  };
  return { kind: 'down', top, topZone, topMid, bottomMid, bottomZone, bottom, center };
}

function buildUpPack(
  prevPl: number,
  lastPl: number,
  prevIdx: number,
  lastIdx: number,
  L: number,
  offset: number
): ChannelPack {
  const x1 = prevIdx - L;
  const x2 = lastIdx - L;
  const top: LineGeom = {
    x1,
    y1: roundTick(prevPl + offset + offset / 7),
    x2,
    y2: roundTick(lastPl + offset + offset / 7),
  };
  const topZone: LineGeom = {
    x1,
    y1: roundTick(prevPl + offset - offset / 7),
    x2,
    y2: roundTick(lastPl + offset - offset / 7),
  };
  const topMid: LineGeom = {
    x1,
    y1: roundTick(prevPl + offset),
    x2,
    y2: roundTick(lastPl + offset),
  };
  const bottom: LineGeom = {
    x1,
    y1: roundTick(prevPl - offset / 7),
    x2,
    y2: roundTick(lastPl - offset / 7),
  };
  const bottomZone: LineGeom = {
    x1,
    y1: roundTick(prevPl + offset / 7),
    x2,
    y2: roundTick(lastPl + offset / 7),
  };
  const bottomMid: LineGeom = { x1, y1: prevPl, x2, y2: lastPl };
  const center: LineGeom = {
    x1,
    y1: roundTick((prevPl + prevPl + offset) / 2),
    x2,
    y2: roundTick((lastPl + lastPl + offset) / 2),
  };
  return { kind: 'up', top, topZone, topMid, bottomMid, bottomZone, bottom, center };
}

function extendPack(pack: ChannelPack, dydx: number, newX2: number): void {
  const ext = (g: LineGeom) => {
    const steps = newX2 - g.x2;
    g.y2 = roundTick(g.y2 + dydx * steps);
    g.x2 = newX2;
  };
  ext(pack.top);
  ext(pack.topZone);
  ext(pack.topMid);
  ext(pack.bottomMid);
  ext(pack.bottomZone);
  ext(pack.bottom);
  ext(pack.center);
}

/** 마감 밴드 융합용 — 동결 채널을 봉 i까지 연장해 중심가 평가 */
function evalPackAtBarForBias(pack: ChannelPack, barIndex: number): ChannelPack {
  const p = JSON.parse(JSON.stringify(pack)) as ChannelPack;
  if (barIndex > p.center.x2 + 1e-9) {
    const dx = p.top.x2 - p.top.x1;
    const dydx = Math.abs(dx) > 1e-12 ? (p.top.y2 - p.top.y1) / dx : 0;
    extendPack(p, dydx, barIndex);
  }
  return p;
}

/** 종가 vs CP 채널 중심 — up 채널은 양수가 롱 쪽, down 채널은 음수가 숏 쪽 */
function cpChannelBiasScoreAt(
  i: number,
  candles: Candle[],
  downCount: number,
  downPack: ChannelPack | null,
  upCount: number,
  upPack: ChannelPack | null,
  frozenDown: ChannelPack | null,
  frozenUp: ChannelPack | null,
  lastFrozen: 'down' | 'up' | null
): number {
  let pack: ChannelPack | null = null;
  let live = false;
  if (downCount === 1 && downPack) {
    pack = downPack;
    live = true;
  } else if (upCount === 1 && upPack) {
    pack = upPack;
    live = true;
  } else if (lastFrozen === 'down' && frozenDown) pack = frozenDown;
  else if (lastFrozen === 'up' && frozenUp) pack = frozenUp;
  else pack = frozenDown ?? frozenUp;
  if (!pack) return 0;
  const ep = live ? pack : evalPackAtBarForBias(pack, i);
  const cx = linePriceAtX(ep.center, i);
  const tx = linePriceAtX(ep.top, i);
  const bx = linePriceAtX(ep.bottom, i);
  const half = Math.max(1e-9, Math.abs(tx - bx) / 2);
  const pos = Math.max(-1, Math.min(1, (candles[i].close - cx) / half));
  if (ep.kind === 'up') return 0.92 * pos + 0.38;
  return -0.92 * pos - 0.38;
}

function cpChannelCenterPriceAt(
  i: number,
  candles: Candle[],
  downCount: number,
  downPack: ChannelPack | null,
  upCount: number,
  upPack: ChannelPack | null,
  frozenDown: ChannelPack | null,
  frozenUp: ChannelPack | null,
  lastFrozen: 'down' | 'up' | null
): number | null {
  let pack: ChannelPack | null = null;
  let live = false;
  if (downCount === 1 && downPack) {
    pack = downPack;
    live = true;
  } else if (upCount === 1 && upPack) {
    pack = upPack;
    live = true;
  } else if (lastFrozen === 'down' && frozenDown) pack = frozenDown;
  else if (lastFrozen === 'up' && frozenUp) pack = frozenUp;
  else pack = frozenDown ?? frozenUp;
  if (!pack) return null;
  const ep = live ? pack : evalPackAtBarForBias(pack, i);
  return linePriceAtX(ep.center, i);
}

/** 마감 밴드 — CP 융합 점수 + 채널 중심 가격(보조선) */
export type ChartPrimeBiasCenterPack = {
  biasScores: number[];
  centerPrices: (number | null)[];
};

/**
 * Chart Prime 채널 엔진과 동일 상태 전개 — 편향 점수와 봉별 중심 가격.
 */
export function computeChartPrimeBiasAndCenterSeries(
  candles: Candle[],
  partial?: Partial<ChartPrimeTrendChannelOpts>
): ChartPrimeBiasCenterPack {
  const opt = { ...DEFAULT_OPTS, ...partial };
  const widthScale = Math.max(0.28, Math.min(1.35, Number(opt.channelWidthScale) || 1));
  const L = Math.max(2, Math.min(30, Math.floor(opt.length)));
  const n = candles.length;
  const scores = new Array(n).fill(0);
  const centers: (number | null)[] = new Array(n).fill(null);
  if (n < L * 2 + 3) return { biasScores: scores, centerPrices: centers };

  const volNormHist = new Array(n).fill(0);
  let cumVolSum = 0;
  const cumVolAvg = new Array(n).fill(0);
  const rankHist = new Array(n).fill(0);
  let cumRankSum = 0;
  const cumRankAvg = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const wv = wmaVolume(candles, i, 21);
    volNormHist[i] = minMaxNorm(candles, i, 100, wv);
    cumVolSum += volNormHist[i];
    cumVolAvg[i] = cumVolSum / (i + 1);
    const from = Math.max(0, i - 99);
    const rank = percentileNearestRank(volNormHist.slice(from, i + 1), 75);
    rankHist[i] = rank;
    cumRankSum += rank;
    cumRankAvg[i] = cumRankSum / (i + 1);
  }

  let prevPh: number | null = null;
  let prevPhIdx: number | null = null;
  let lastPh: number | null = null;
  let lastPhIdx: number | null = null;
  let prevPl: number | null = null;
  let prevPlIdx: number | null = null;
  let lastPl: number | null = null;
  let lastPlIdx: number | null = null;

  let prevPhLag: number | null = null;
  let prevPlLag: number | null = null;

  let downCount = 0;
  let upCount = 0;
  let downDydx = 0;
  let upDydx = 0;
  let downPack: ChannelPack | null = null;
  let upPack: ChannelPack | null = null;
  let frozenDown: ChannelPack | null = null;
  let frozenUp: ChannelPack | null = null;
  let lastFrozen: 'down' | 'up' | null = null;

  for (let i = 2 * L; i < n; i++) {
    const ph = pivotHighConfirmed(candles, i, L);
    const pl = pivotLowConfirmed(candles, i, L);

    if (ph != null) {
      prevPh = lastPh;
      prevPhIdx = lastPhIdx;
      lastPh = ph;
      lastPhIdx = i;
    }
    if (pl != null) {
      prevPl = lastPl;
      prevPlIdx = lastPlIdx;
      lastPl = pl;
      lastPlIdx = i;
    }

    const atr10 = atrAt(candles, i, 10) * 6 * widthScale;

    if (
      prevPh != null &&
      lastPh != null &&
      prevPhIdx != null &&
      lastPhIdx != null &&
      prevPh !== prevPhLag &&
      lastPhIdx !== prevPhIdx &&
      atan2p(lastPh - prevPh, lastPhIdx - prevPhIdx) <= 0 &&
      downCount === 0 &&
      (!opt.wait || upCount !== 1)
    ) {
      downCount = 1;
      downDydx = (lastPh - prevPh) / (lastPhIdx - prevPhIdx);
      downPack = buildDownPack(prevPh, lastPh, prevPhIdx, lastPhIdx, L, atr10);
      if (!opt.show) {
        upCount = 0;
        upPack = null;
        frozenUp = null;
      }
    }

    if (
      prevPl != null &&
      lastPl != null &&
      prevPlIdx != null &&
      lastPlIdx != null &&
      prevPl !== prevPlLag &&
      lastPlIdx !== prevPlIdx &&
      atan2p(lastPl - prevPl, lastPlIdx - prevPlIdx) >= 0 &&
      upCount === 0 &&
      (!opt.wait || downCount !== 1)
    ) {
      upCount = 1;
      upDydx = (lastPl - prevPl) / (lastPlIdx - prevPlIdx);
      upPack = buildUpPack(prevPl, lastPl, prevPlIdx, lastPlIdx, L, atr10);
      if (!opt.show) {
        downCount = 0;
        downPack = null;
        frozenDown = null;
      }
    }

    if (downCount === 1 && downPack) {
      if (!opt.extend) {
        extendPack(downPack, downDydx, i);
      }
      const topP = linePriceAtX(downPack.top, i);
      const botP = linePriceAtX(downPack.bottom, i);
      if (candles[i].low > topP) {
        downCount = 0;
        frozenDown = JSON.parse(JSON.stringify(downPack)) as ChannelPack;
        lastFrozen = 'down';
      } else if (candles[i].high < botP) {
        downCount = 0;
        frozenDown = JSON.parse(JSON.stringify(downPack)) as ChannelPack;
        lastFrozen = 'down';
      }
    }

    if (upCount === 1 && upPack) {
      if (!opt.extend) {
        extendPack(upPack, upDydx, i);
      }
      const topP = linePriceAtX(upPack.top, i);
      const botP = linePriceAtX(upPack.bottom, i);
      if (candles[i].low > topP) {
        upCount = 0;
        frozenUp = JSON.parse(JSON.stringify(upPack)) as ChannelPack;
        lastFrozen = 'up';
      } else if (candles[i].high < botP) {
        upCount = 0;
        frozenUp = JSON.parse(JSON.stringify(upPack)) as ChannelPack;
        lastFrozen = 'up';
      }
    }

    prevPhLag = prevPh;
    prevPlLag = prevPl;

    scores[i] = cpChannelBiasScoreAt(i, candles, downCount, downPack, upCount, upPack, frozenDown, frozenUp, lastFrozen);
    centers[i] = cpChannelCenterPriceAt(i, candles, downCount, downPack, upCount, upPack, frozenDown, frozenUp, lastFrozen);
  }

  return { biasScores: scores, centerPrices: centers };
}

/**
 * Chart Prime 채널 엔진과 동일 상태 전개로 봉별 편향 점수(-대략~대략) — 마감 밴드 색 융합 전용.
 */
export function computeChartPrimeBiasScoreSeries(
  candles: Candle[],
  partial?: Partial<ChartPrimeTrendChannelOpts>
): number[] {
  return computeChartPrimeBiasAndCenterSeries(candles, partial).biasScores;
}

/**
 * 캔들 변동(ATR%)·타임프레임에 맞춰 피벗 길이(L) 제안.
 * 변동이 낮으면 긴 피벗(노이즈 감소), 높으면 짧은 피벗(스윙 반영).
 */
export function computeSuggestedChartPrimePivotLength(candles: Candle[], timeframe?: string): number {
  const n = candles.length;
  if (n < 12) {
    return Math.max(2, Math.min(30, Math.floor(Math.max(4, n) / 4)));
  }
  const end = n - 1;
  const atr10 = atrAt(candles, end, 10);
  const last = candles[end];
  const px = Math.max(1e-12, (last.high + last.low + last.close) / 3);
  const atrPct = atr10 / px;
  const lo = 0.0035;
  const hi = 0.055;
  const t = Math.max(0, Math.min(1, (atrPct - lo) / (hi - lo + 1e-12)));
  let len = Math.round(15 - t * 11);
  const tfBias: Record<string, number> = {
    '1m': -2,
    '3m': -2,
    '5m': -1,
    '15m': 0,
    '30m': 0,
    '1h': 1,
    '4h': 2,
    '1d': 3,
    '1w': 4,
  };
  len += tfBias[timeframe ?? ''] ?? 0;
  return Math.max(2, Math.min(30, len));
}

export function computeChartPrimeTrendChannelOverlays(
  candles: Candle[],
  minP: number,
  maxP: number,
  visTime: (c: Candle[], i: number) => number,
  visIdx: (c: Candle[], i: number) => number,
  partial?: Partial<ChartPrimeTrendChannelOpts>
): { overlays: OverlayItem[]; engineSnippet: Record<string, unknown> } {
  const opt = { ...DEFAULT_OPTS, ...partial };
  opt.topColor = normalizeHex6(opt.topColor, DEFAULT_OPTS.topColor);
  opt.centerColor = normalizeHex6(opt.centerColor, DEFAULT_OPTS.centerColor);
  opt.bottomColor = normalizeHex6(opt.bottomColor, DEFAULT_OPTS.bottomColor);
  const widthScale = Math.max(0.28, Math.min(1.35, Number(opt.channelWidthScale) || 1));
  const L = Math.max(2, Math.min(30, Math.floor(opt.length)));
  const n = candles.length;
  if (n < L * 2 + 3) return { overlays: [], engineSnippet: {} };

  const lastVi = Math.max(1, n - 1);
  const xiNorm = (idx: number) => Math.max(0, Math.min(idx, lastVi)) / lastVi;

  const volNormHist = new Array(n).fill(0);
  let cumVolSum = 0;
  const cumVolAvg = new Array(n).fill(0);
  const rankHist = new Array(n).fill(0);
  let cumRankSum = 0;
  const cumRankAvg = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const wv = wmaVolume(candles, i, 21);
    volNormHist[i] = minMaxNorm(candles, i, 100, wv);
    cumVolSum += volNormHist[i];
    cumVolAvg[i] = cumVolSum / (i + 1);
    const from = Math.max(0, i - 99);
    const rank = percentileNearestRank(volNormHist.slice(from, i + 1), 75);
    rankHist[i] = rank;
    cumRankSum += rank;
    cumRankAvg[i] = cumRankSum / (i + 1);
  }

  let prevPh: number | null = null;
  let prevPhIdx: number | null = null;
  let lastPh: number | null = null;
  let lastPhIdx: number | null = null;
  let prevPl: number | null = null;
  let prevPlIdx: number | null = null;
  let lastPl: number | null = null;
  let lastPlIdx: number | null = null;

  let prevPhLag: number | null = null;
  let prevPlLag: number | null = null;

  let downCount = 0;
  let upCount = 0;
  let downDydx = 0;
  let upDydx = 0;
  let downPack: ChannelPack | null = null;
  let upPack: ChannelPack | null = null;
  let frozenDown: ChannelPack | null = null;
  let frozenUp: ChannelPack | null = null;
  let lastFrozen: 'down' | 'up' | null = null;

  let lastBreakLabel: { i: number; text: LiquidityLabel; color: string; y: number } | null = null;

  let zoneTopStroke = 'rgba(51,124,79,0.45)';
  let zoneTopMidStroke = 'rgba(51,124,79,0.55)';
  let zoneBotMidStroke = 'rgba(165,45,45,0.55)';
  let zoneBotStroke = 'rgba(165,45,45,0.45)';

  for (let i = 2 * L; i < n; i++) {
    const ph = pivotHighConfirmed(candles, i, L);
    const pl = pivotLowConfirmed(candles, i, L);

    if (ph != null) {
      prevPh = lastPh;
      prevPhIdx = lastPhIdx;
      lastPh = ph;
      lastPhIdx = i;
    }
    if (pl != null) {
      prevPl = lastPl;
      prevPlIdx = lastPlIdx;
      lastPl = pl;
      lastPlIdx = i;
    }

    const atr10 = atrAt(candles, i, 10) * 6 * widthScale;

    if (
      prevPh != null &&
      lastPh != null &&
      prevPhIdx != null &&
      lastPhIdx != null &&
      prevPh !== prevPhLag &&
      lastPhIdx !== prevPhIdx &&
      atan2p(lastPh - prevPh, lastPhIdx - prevPhIdx) <= 0 &&
      downCount === 0 &&
      (!opt.wait || upCount !== 1)
    ) {
      downCount = 1;
      downDydx = (lastPh - prevPh) / (lastPhIdx - prevPhIdx);
      downPack = buildDownPack(prevPh, lastPh, prevPhIdx, lastPhIdx, L, atr10);
      if (!opt.show) {
        upCount = 0;
        upPack = null;
        frozenUp = null;
      }
    }

    if (
      prevPl != null &&
      lastPl != null &&
      prevPlIdx != null &&
      lastPlIdx != null &&
      prevPl !== prevPlLag &&
      lastPlIdx !== prevPlIdx &&
      atan2p(lastPl - prevPl, lastPlIdx - prevPlIdx) >= 0 &&
      upCount === 0 &&
      (!opt.wait || downCount !== 1)
    ) {
      upCount = 1;
      upDydx = (lastPl - prevPl) / (lastPlIdx - prevPlIdx);
      upPack = buildUpPack(prevPl, lastPl, prevPlIdx, lastPlIdx, L, atr10);
      if (!opt.show) {
        downCount = 0;
        downPack = null;
        frozenDown = null;
      }
    }

    const liq = liquidityBreak(candles, i, volNormHist, cumVolAvg, cumRankAvg);
    const atr20 = (atrAt(candles, i, 20) / 1.5) * widthScale;

    zoneTopStroke = hexWithAlpha(opt.topColor, 45);
    zoneTopMidStroke = hexWithAlpha(opt.topColor, 55);
    zoneBotMidStroke = hexWithAlpha(opt.bottomColor, 55);
    zoneBotStroke = hexWithAlpha(opt.bottomColor, 45);
    if (opt.enableLiquid) {
      const vs = volNormHist[i];
      const hiA = Math.min(95, 60 + (100 - vs) / 5);
      const loA = Math.min(95, 60 + (100 - vs) / 5);
      zoneTopStroke = hexWithAlpha(opt.topColor, hiA);
      zoneTopMidStroke = hexWithAlpha(opt.topColor, Math.min(98, hiA + 8));
      zoneBotMidStroke = hexWithAlpha(opt.bottomColor, Math.min(98, loA + 8));
      zoneBotStroke = hexWithAlpha(opt.bottomColor, loA);
    }

    if (downCount === 1 && downPack) {
      if (!opt.extend) {
        extendPack(downPack, downDydx, i);
      }
      const topP = linePriceAtX(downPack.top, i);
      const botP = linePriceAtX(downPack.bottom, i);
      if (candles[i].low > topP) {
        downCount = 0;
        frozenDown = JSON.parse(JSON.stringify(downPack)) as ChannelPack;
        lastFrozen = 'down';
        lastBreakLabel = { i, text: liq, color: opt.topColor, y: downPack.top.y2 - atr20 };
      } else if (candles[i].high < botP) {
        downCount = 0;
        frozenDown = JSON.parse(JSON.stringify(downPack)) as ChannelPack;
        lastFrozen = 'down';
        lastBreakLabel = { i, text: liq, color: opt.bottomColor, y: downPack.bottom.y2 + atr20 };
      }
    }

    if (upCount === 1 && upPack) {
      if (!opt.extend) {
        extendPack(upPack, upDydx, i);
      }
      const topP = linePriceAtX(upPack.top, i);
      const botP = linePriceAtX(upPack.bottom, i);
      if (candles[i].low > topP) {
        upCount = 0;
        frozenUp = JSON.parse(JSON.stringify(upPack)) as ChannelPack;
        lastFrozen = 'up';
        lastBreakLabel = { i, text: liq, color: opt.topColor, y: upPack.top.y2 - atr20 };
      } else if (candles[i].high < botP) {
        upCount = 0;
        frozenUp = JSON.parse(JSON.stringify(upPack)) as ChannelPack;
        lastFrozen = 'up';
        lastBreakLabel = { i, text: liq, color: opt.bottomColor, y: upPack.bottom.y2 + atr20 };
      }
    }

    prevPhLag = prevPh;
    prevPlLag = prevPl;
  }

  const out: OverlayItem[] = [];
  let packToDraw: ChannelPack | null = null;
  if (downCount === 1 && downPack) packToDraw = downPack;
  else if (upCount === 1 && upPack) packToDraw = upPack;
  else if (lastFrozen === 'down' && frozenDown) packToDraw = frozenDown;
  else if (lastFrozen === 'up' && frozenUp) packToDraw = frozenUp;
  else packToDraw = frozenDown ?? frozenUp;

  if (packToDraw) {
    const lastBarX = n - 1;
    let drawPack = packToDraw;
    if (opt.extend) {
      drawPack = JSON.parse(JSON.stringify(packToDraw)) as ChannelPack;
      const dxTop = drawPack.top.x2 - drawPack.top.x1;
      const dydx =
        Math.abs(dxTop) > 1e-12 ? (drawPack.top.y2 - drawPack.top.y1) / dxTop : 0;
      extendPack(drawPack, dydx, lastBarX);
    }
    const volScoreLast = volNormHist.length ? volNormHist[volNormHist.length - 1] ?? 50 : 50;
    if (opt.showFills !== false) {
      pushChannelBandFills(out, drawPack, candles, visTime, visIdx, opt.topColor, opt.bottomColor, {
        enableLiquid: opt.enableLiquid,
        volumeScore: volScoreLast,
      });
    }
    pushChannelOverlays(
      out,
      drawPack,
      candles,
      minP,
      maxP,
      visTime,
      visIdx,
      xiNorm,
      opt.topColor,
      opt.bottomColor,
      opt.centerColor,
      zoneTopStroke,
      zoneTopMidStroke,
      zoneBotMidStroke,
      zoneBotStroke
    );
  }

  if (lastBreakLabel) {
    const lb = lastBreakLabel;
    const pi = visIdx(candles, lb.i);
    out.push({
      id: 'cptc-break-liq',
      kind: 'label',
      label: lb.text,
      x1: xiNorm(lb.i),
      y1: (maxP - lb.y) / Math.max(1e-9, maxP - minP),
      time1: visTime(candles, pi),
      price1: lb.y,
      confidence: 70,
      color: lb.color,
      labelBackgroundColor: lb.color,
      labelTextColor: '#e5e7eb',
      category: 'chartPrimeTrendChannels',
    });
  }

  return {
    overlays: out,
    engineSnippet: {
      chartPrimeTrendChannelActive: downCount === 1 ? 'down' : upCount === 1 ? 'up' : 'none',
      chartPrimeLastLiquidityLabel: lastBreakLabel?.text ?? null,
    },
  };
}
