/**
 * Institutional Delta Sweeps [BOSWaves] — Pine v6 (© BOSWaves, MPL-2.0) 로직 포팅. 교육·참고.
 */
import type { Candle, OverlayItem } from '@/types';
import { candleBarDurationSec } from '@/lib/candleTfDuration';

export type BosWavesZzStyle = 'Dotted' | 'Dashed' | 'Solid';

export type BosWavesOptions = {
  swingLeft?: number;
  swingRight?: number;
  cooldownBars?: number;
  showLiqZones?: boolean;
  liqZoneWidth?: number;
  liqLineWidth?: number;
  maxZoneAge?: number;
  showSweepZone?: boolean;
  showSweepData?: boolean;
  showBuySellZones?: boolean;
  zoneExtension?: number;
  zoneBorderWidth?: number;
  showZigZag?: boolean;
  zzStyle?: BosWavesZzStyle;
  zzWidth?: number;
  bullHex?: string;
  bearHex?: string;
  sweepBullHex?: string;
  sweepBearHex?: string;
};

type InternalZone = {
  startIndex: number;
  price: number;
  isHigh: boolean;
  swept: boolean;
  sweepIndex: number;
  zoneTop: number;
  zoneMid: number;
  zoneBot: number;
  fadeOuterA: number;
  fadeInnerA: number;
  fadeLineA: number;
  fadeBorderA: number;
};

type ZzSeg = { i1: number; i2: number; p1: number; p2: number; useBearColor: boolean };

export type BosWavesSimStats = {
  bullSweepCount: number;
  bearSweepCount: number;
  avgBullDepth: number;
  avgBearDepth: number;
  activePoolCount: number;
};

function trueRange(c: Candle, prevClose: number): number {
  return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
}

function wilderAtrAt(candles: Candle[], period: number, endIdx: number): number | null {
  const n = endIdx + 1;
  if (n < period + 1) return null;
  const tr: number[] = [];
  for (let i = 0; i < n; i++) {
    const prevC = i > 0 ? candles[i - 1].close : candles[i].open;
    tr.push(trueRange(candles[i], prevC));
  }
  const p = Math.max(1, period);
  let atr = 0;
  for (let i = 0; i < p; i++) atr += tr[i];
  atr /= p;
  for (let i = p; i < n; i++) {
    atr = (atr * (p - 1) + tr[i]) / p;
  }
  return atr;
}

function highestHigh(candles: Candle[], i: number, len: number): number {
  let m = -Infinity;
  const from = Math.max(0, i - len + 1);
  for (let j = from; j <= i; j++) m = Math.max(m, candles[j].high);
  return m;
}

function lowestLow(candles: Candle[], i: number, len: number): number {
  let m = Infinity;
  const from = Math.max(0, i - len + 1);
  for (let j = from; j <= i; j++) m = Math.min(m, candles[j].low);
  return m;
}

function isPivotHighConfirmed(candles: Candle[], confIdx: number, L: number, R: number): boolean {
  const p = confIdx - R;
  if (p < L || p + R >= candles.length) return false;
  const h = candles[p].high;
  for (let k = p - L; k <= p + R; k++) {
    if (k === p) continue;
    if (candles[k].high >= h) return false;
  }
  return true;
}

function isPivotLowConfirmed(candles: Candle[], confIdx: number, L: number, R: number): boolean {
  const p = confIdx - R;
  if (p < L || p + R >= candles.length) return false;
  const lo = candles[p].low;
  for (let k = p - L; k <= p + R; k++) {
    if (k === p) continue;
    if (candles[k].low <= lo) return false;
  }
  return true;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const s = hex.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

function zzDash(style: BosWavesZzStyle): string | undefined {
  if (style === 'Dotted') return '2 5';
  if (style === 'Dashed') return '8 6';
  return undefined;
}

function eqPrice(a: number, b: number): boolean {
  const t = Math.max(1e-12, Math.abs(b) * 1e-10);
  return Math.abs(a - b) <= t;
}

function fadeAlphas(age: number, maxZoneAge: number): { outer: number; inner: number; border: number; line: number } {
  const fadePct = Math.min(age / maxZoneAge, 1);
  const cometCurve = fadePct ** 3;
  const bgTransp = 90 + 10 * cometCurve;
  const innerTransp = 85 + 15 * cometCurve;
  const borderTransp = 60 + 40 * cometCurve;
  const lineTransp = 40 + 60 * cometCurve;
  return {
    outer: (100 - bgTransp) / 100,
    inner: (100 - innerTransp) / 100,
    border: (100 - borderTransp) / 100,
    line: (100 - lineTransp) / 100,
  };
}

const MIN_BARS = 260;
const MAX_ZONES_TRACK = 180;

function simulateBosWaves(
  candles: Candle[],
  timeframe: string,
  opts?: BosWavesOptions
): {
  zones: InternalZone[];
  zzSegs: ZzSeg[];
  sweepExtras: OverlayItem[];
  stats: BosWavesSimStats;
} {
  const n = candles.length;
  const L = Math.max(5, Math.min(60, opts?.swingLeft ?? 20));
  const R = Math.max(5, Math.min(60, opts?.swingRight ?? 20));
  const cooldown = Math.max(0, Math.min(100, opts?.cooldownBars ?? 10));
  const showLiq = opts?.showLiqZones !== false;
  const liqW = Math.max(0.1, Math.min(1, opts?.liqZoneWidth ?? 0.3));
  const maxAge = Math.max(50, Math.min(500, opts?.maxZoneAge ?? 200));
  const showSweepZ = opts?.showSweepZone !== false;
  const showSweepLbl = opts?.showSweepData !== false;
  const showProj = opts?.showBuySellZones !== false;
  const zoneExt = Math.max(10, Math.min(200, opts?.zoneExtension ?? 50));
  const showZz = opts?.showZigZag !== false;
  const bullH = opts?.bullHex ?? '#089981';
  const bearH = opts?.bearHex ?? '#F23645';
  const sweepBullH = opts?.sweepBullHex ?? bullH;
  const sweepBearH = opts?.sweepBearHex ?? bearH;

  const barSec = candleBarDurationSec(timeframe, Number(candles[Math.max(0, n - 1)].time));
  const tAfter = (idx: number, bars: number) => {
    const t = Number(candles[Math.min(n - 1, Math.max(0, idx))].time);
    return t + bars * barSec;
  };

  let isDownMove = false;
  let highSwing = { idx: 0, price: candles[0].high };
  let lowSwing = { idx: 0, price: candles[0].low };
  const zones: InternalZone[] = [];
  let lastBullSweepBar = -1e9;
  let lastBearSweepBar = -1e9;
  const zzSegs: ZzSeg[] = [];
  const sweepExtras: OverlayItem[] = [];
  let sweepSeq = 0;
  let bullCount = 0;
  let bearCount = 0;
  let avgBullDepth = 0;
  let avgBearDepth = 0;

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const H = highestHigh(candles, i, L);
    const Lo = lowestLow(candles, i, L);

    const prevDown = isDownMove;
    if (eqPrice(c.high, H)) isDownMove = true;
    if (eqPrice(c.low, Lo)) isDownMove = false;

    if (i >= 1) {
      const H1 = highestHigh(candles, i - 1, L);
      const L1 = lowestLow(candles, i - 1, L);
      if (eqPrice(candles[i - 1].high, H1) && c.high < H) {
        highSwing = { idx: i - 1, price: candles[i - 1].high };
      }
      if (eqPrice(candles[i - 1].low, L1) && c.low > Lo) {
        lowSwing = { idx: i - 1, price: candles[i - 1].low };
      }
    }

    if (showZz && i >= L + R && prevDown !== isDownMove) {
      zzSegs.push({
        i1: highSwing.idx,
        i2: lowSwing.idx,
        p1: highSwing.price,
        p2: lowSwing.price,
        useBearColor: isDownMove,
      });
      if (zzSegs.length > 120) zzSegs.shift();
    }

    const atr = wilderAtrAt(candles, 200, i);
    if (showLiq && atr != null && i >= L + R) {
      if (isPivotHighConfirmed(candles, i, L, R)) {
        const pIdx = i - R;
        const pivotPrice = candles[pIdx].high;
        const zoneTop = pivotPrice + atr * liqW;
        const zoneMid = pivotPrice + atr * liqW * 0.3;
        const fa = fadeAlphas(0, maxAge);
        zones.push({
          startIndex: pIdx,
          price: pivotPrice,
          isHigh: true,
          swept: false,
          sweepIndex: -1,
          zoneTop,
          zoneMid,
          zoneBot: pivotPrice,
          fadeOuterA: fa.outer,
          fadeInnerA: fa.inner,
          fadeLineA: fa.line,
          fadeBorderA: fa.border,
        });
      }
      if (isPivotLowConfirmed(candles, i, L, R)) {
        const pIdx = i - R;
        const pivotPrice = candles[pIdx].low;
        const zoneBot = pivotPrice - atr * liqW;
        const zoneMid = pivotPrice - atr * liqW * 0.3;
        const fa = fadeAlphas(0, maxAge);
        zones.push({
          startIndex: pIdx,
          price: pivotPrice,
          isHigh: false,
          swept: false,
          sweepIndex: -1,
          zoneTop: pivotPrice,
          zoneMid,
          zoneBot,
          fadeOuterA: fa.outer,
          fadeInnerA: fa.inner,
          fadeLineA: fa.line,
          fadeBorderA: fa.border,
        });
      }
    }

    for (let zi = zones.length - 1; zi >= 0; zi--) {
      const z = zones[zi];
      if (z.swept) continue;
      const age = i - z.startIndex;
      if (age > maxAge) {
        zones.splice(zi, 1);
        continue;
      }
      const fa = fadeAlphas(age, maxAge);
      z.fadeOuterA = fa.outer;
      z.fadeInnerA = fa.inner;
      z.fadeLineA = fa.line;
      z.fadeBorderA = fa.border;

      if (z.isHigh && c.high > z.price && c.close < z.price && c.open < z.price) {
        if (i >= lastBearSweepBar + cooldown) {
          z.swept = true;
          z.sweepIndex = i;
          lastBearSweepBar = i;
          const pen = ((c.high - z.price) / z.price) * 100;
          bearCount += 1;
          avgBearDepth = ((avgBearDepth * (bearCount - 1)) + pen) / bearCount;
          sweepSeq += 1;
          if (showSweepZ && i > 0 && i + 1 < n) {
            sweepExtras.push({
              id: `candle-analysis-bosw-sweep-hl-${z.startIndex}-b-${sweepSeq}`,
              kind: 'zone',
              label: '',
              x1: 0,
              y1: 0,
              x2: 1,
              y2: 1,
              time1: Number(candles[i - 1].time),
              time2: Number(candles[Math.min(n - 1, i + 1)].time),
              price1: c.high,
              price2: z.price,
              confidence: 78,
              color: rgba(sweepBearH, 0.12),
              lineLabelColor: sweepBearH,
              category: 'boswaves',
              labelTooltip: 'Bearish liquidity sweep (wick)',
            });
          }
          if (showSweepLbl) {
            sweepExtras.push({
              id: `candle-analysis-bosw-sweep-lbl-${z.startIndex}-b-${sweepSeq}`,
              kind: 'label',
              label: `SWEEP ${pen.toFixed(2)}%`,
              x1: 0,
              y1: 0,
              time1: Number(c.time),
              price1: c.high * 1.0002,
              confidence: 76,
              color: sweepBearH,
              category: 'boswaves',
              labelTextColor: '#ffffff',
              labelBackgroundColor: rgba(sweepBearH, 0.45),
              labelTooltip: 'BOSWaves bearish sweep depth %',
            });
          }
          if (showProj) {
            const zt = c.high;
            const zb = Math.max(c.open, c.close);
            sweepExtras.push({
              id: `candle-analysis-bosw-proj-sell-${i}-${sweepSeq}`,
              kind: 'zone',
              label: 'SELL ZONE',
              x1: 0,
              y1: 0,
              x2: 1,
              y2: 1,
              time1: Number(c.time),
              time2: tAfter(i, zoneExt),
              price1: zt,
              price2: zb,
              confidence: 72,
              color: rgba(bearH, 0.08),
              lineLabelColor: bearH,
              category: 'boswaves',
              labelTooltip: 'Projected after bearish sweep (Pine BOSWaves)',
            });
          }
        }
      } else if (!z.isHigh && c.low < z.price && c.close > z.price && c.open > z.price) {
        if (i >= lastBullSweepBar + cooldown) {
          z.swept = true;
          z.sweepIndex = i;
          lastBullSweepBar = i;
          const pen = ((z.price - c.low) / z.price) * 100;
          bullCount += 1;
          avgBullDepth = ((avgBullDepth * (bullCount - 1)) + pen) / bullCount;
          sweepSeq += 1;
          if (showSweepZ && i > 0 && i + 1 < n) {
            sweepExtras.push({
              id: `candle-analysis-bosw-sweep-hl-${z.startIndex}-bull-${sweepSeq}`,
              kind: 'zone',
              label: '',
              x1: 0,
              y1: 0,
              x2: 1,
              y2: 1,
              time1: Number(candles[i - 1].time),
              time2: Number(candles[Math.min(n - 1, i + 1)].time),
              price1: z.price,
              price2: c.low,
              confidence: 78,
              color: rgba(sweepBullH, 0.12),
              lineLabelColor: sweepBullH,
              category: 'boswaves',
              labelTooltip: 'Bullish liquidity sweep (wick)',
            });
          }
          if (showSweepLbl) {
            sweepExtras.push({
              id: `candle-analysis-bosw-sweep-lbl-${z.startIndex}-bull-${sweepSeq}`,
              kind: 'label',
              label: `SWEEP ${pen.toFixed(2)}%`,
              x1: 0,
              y1: 0,
              time1: Number(c.time),
              price1: c.low * 0.9998,
              confidence: 76,
              color: sweepBullH,
              category: 'boswaves',
              labelTextColor: '#ffffff',
              labelBackgroundColor: rgba(sweepBullH, 0.45),
              labelTooltip: 'BOSWaves bullish sweep depth %',
            });
          }
          if (showProj) {
            const zt = Math.min(c.open, c.close);
            const zb = c.low;
            sweepExtras.push({
              id: `candle-analysis-bosw-proj-buy-${i}-${sweepSeq}`,
              kind: 'zone',
              label: 'BUY ZONE',
              x1: 0,
              y1: 0,
              x2: 1,
              y2: 1,
              time1: Number(c.time),
              time2: tAfter(i, zoneExt),
              price1: zt,
              price2: zb,
              confidence: 72,
              color: rgba(bullH, 0.08),
              lineLabelColor: bullH,
              category: 'boswaves',
              labelTooltip: 'Projected after bullish sweep (Pine BOSWaves)',
            });
          }
        }
      }
    }

    while (zones.length > MAX_ZONES_TRACK) {
      let oldest = 0;
      let oldestKey = 1e9;
      for (let k = 0; k < zones.length; k++) {
        const key = zones[k].swept ? zones[k].sweepIndex : zones[k].startIndex;
        if (key < oldestKey) {
          oldestKey = key;
          oldest = k;
        }
      }
      zones.splice(oldest, 1);
    }
  }

  const activePoolCount = zones.filter((z) => !z.swept).length;
  return {
    zones,
    zzSegs,
    sweepExtras,
    stats: {
      bullSweepCount: bullCount,
      bearSweepCount: bearCount,
      avgBullDepth,
      avgBearDepth,
      activePoolCount,
    },
  };
}

function overlaysFromSim(
  candles: Candle[],
  timeframe: string,
  opts: BosWavesOptions | undefined,
  sim: ReturnType<typeof simulateBosWaves>
): OverlayItem[] {
  const showLiq = opts?.showLiqZones !== false;
  const showZz = opts?.showZigZag !== false;
  const liqLineW = Math.max(1, Math.min(5, opts?.liqLineWidth ?? 1));
  const zzSt = opts?.zzStyle ?? 'Dotted';
  const zzW = Math.max(1, Math.min(5, opts?.zzWidth ?? 1));
  const bullH = opts?.bullHex ?? '#089981';
  const bearH = opts?.bearHex ?? '#F23645';

  const { zones, zzSegs, sweepExtras } = sim;
  const n = candles.length;
  const lastIdx = n - 1;
  const last = candles[lastIdx];
  const barSec = candleBarDurationSec(timeframe, Number(last.time));
  const tAfter = (idx: number, bars: number) => {
    const t = Number(candles[Math.min(n - 1, Math.max(0, idx))].time);
    return t + bars * barSec;
  };

  const out: OverlayItem[] = [];

  if (showZz) {
    for (let zi = 0; zi < zzSegs.length; zi++) {
      const seg = zzSegs[zi];
      const col = seg.useBearColor ? bearH : bullH;
      out.push({
        id: `candle-analysis-bosw-zz-${seg.i1}-${seg.i2}-${zi}`,
        kind: 'trendLine',
        label: '',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        time1: Number(candles[seg.i1].time),
        time2: Number(candles[seg.i2].time),
        price1: seg.p1,
        price2: seg.p2,
        confidence: 55,
        color: rgba(col, 0.35),
        lineLabelColor: col,
        lineDash: zzDash(zzSt),
        lineStrokeWidth: zzW,
        category: 'boswaves',
        noProject: true,
        labelTooltip: 'BOSWaves structure',
      });
    }
  }

  if (showLiq) {
    for (const z of zones) {
      const col = z.isHigh ? bearH : bullH;
      const tStart = Number(candles[z.startIndex].time);
      const tEnd = z.swept ? Number(candles[z.sweepIndex].time) : tAfter(lastIdx, 5);

      out.push({
        id: `candle-analysis-bosw-pool-o-${z.startIndex}-${z.isHigh ? 'h' : 'l'}`,
        kind: 'zone',
        label: '',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: tStart,
        time2: tEnd,
        price1: z.zoneTop,
        price2: z.zoneBot,
        confidence: 62,
        color: rgba(col, z.fadeOuterA * 0.45),
        lineLabelColor: col,
        category: 'boswaves',
        labelTooltip: z.isHigh ? 'Sell-side liquidity pool' : 'Buy-side liquidity pool',
      });

      const innerTop = z.isHigh ? z.zoneMid : z.zoneTop;
      const innerBot = z.isHigh ? z.zoneBot : z.zoneMid;
      out.push({
        id: `candle-analysis-bosw-pool-i-${z.startIndex}-${z.isHigh ? 'h' : 'l'}`,
        kind: 'zone',
        label: '',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: tStart,
        time2: tEnd,
        price1: innerTop,
        price2: innerBot,
        confidence: 60,
        color: rgba(col, z.fadeInnerA * 0.5),
        lineLabelColor: col,
        category: 'boswaves',
        labelTooltip: 'Liquidity pool (inner)',
      });

      out.push({
        id: `candle-analysis-bosw-level-${z.startIndex}-${z.isHigh ? 'h' : 'l'}`,
        kind: 'fibLine',
        label: z.isHigh ? 'Liq high' : 'Liq low',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        time1: tStart,
        time2: tEnd,
        price1: z.price,
        price2: z.price,
        confidence: 58,
        color: rgba(col, z.fadeLineA * 0.85),
        lineLabelColor: col,
        lineStrokeWidth: liqLineW,
        category: 'boswaves',
        noProject: true,
        labelTooltip: 'Liquidity pivot level',
      });

      out.push({
        id: `candle-analysis-bosw-pivot-${z.startIndex}-${z.isHigh ? 'h' : 'l'}`,
        kind: 'label',
        label: '◆',
        x1: 0,
        y1: 0,
        time1: tStart,
        price1: z.price * (z.isHigh ? 1.00015 : 0.99985),
        confidence: 50,
        color: col,
        category: 'boswaves',
        labelTextColor: col,
        labelBackgroundColor: 'rgba(0,0,0,0.02)',
        labelTooltip: 'Pivot',
      });
    }
  }

  out.push(...sweepExtras);
  return out;
}

function commentaryFromStats(stats: BosWavesSimStats, opts?: BosWavesOptions): string[] {
  const L = Math.max(5, Math.min(60, opts?.swingLeft ?? 20));
  const R = Math.max(5, Math.min(60, opts?.swingRight ?? 20));
  const cooldown = Math.max(0, Math.min(100, opts?.cooldownBars ?? 10));
  const maxAge = Math.max(50, Math.min(500, opts?.maxZoneAge ?? 200));
  return [
    '— BOSWaves · Institutional Delta Sweeps (MPL-2.0 · Pine 포팅) —',
    `피벗 L${L} R${R} · 쿨다운 ${cooldown}봉 · 유동성 풀 최대 ${maxAge}봉`,
    `스윕 누적: Bull ${stats.bullSweepCount} · Bear ${stats.bearSweepCount}` +
      (stats.bullSweepCount ? ` · 평균 Bull 침투 ${stats.avgBullDepth.toFixed(2)}%` : '') +
      (stats.bearSweepCount ? ` · 평균 Bear 침투 ${stats.avgBearDepth.toFixed(2)}%` : ''),
    `미스윕 유동성 존(차트): ${stats.activePoolCount}개`,
    '(참고용·비조언)',
  ];
}

/** 시뮬 1회 — 오버레이+해설 동시 생성에 사용 */
export function buildBosWavesBundle(
  candles: Candle[],
  timeframe: string,
  opts?: BosWavesOptions
): { overlays: OverlayItem[]; commentaryLines: string[] } {
  if (candles.length < MIN_BARS) return { overlays: [], commentaryLines: [] };
  const sim = simulateBosWaves(candles, timeframe, opts);
  return {
    overlays: overlaysFromSim(candles, timeframe, opts, sim),
    commentaryLines: commentaryFromStats(sim.stats, opts),
  };
}

export function buildBosWavesOverlays(candles: Candle[], timeframe: string, opts?: BosWavesOptions): OverlayItem[] {
  return buildBosWavesBundle(candles, timeframe, opts).overlays;
}

export function buildBosWavesCommentaryLines(candles: Candle[], timeframe: string, opts?: BosWavesOptions): string[] {
  return buildBosWavesBundle(candles, timeframe, opts).commentaryLines;
}
