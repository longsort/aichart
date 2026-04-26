/**
 * Breaker Blocks Signals [AlgoAlpha] — TradingView Pine v6 포팅 (교육·참고).
 * 원본: 오픈 소스 스크립트(AlgoAlpha). 앱 내 표시 시 원저작자·라이선스 준수.
 */
import type { Candle, OverlayItem } from '@/types';

export type BreakerBlocksAlgoAlphaOptions = {
  preventOverlap?: boolean;
  zLen?: number;
  maxAge?: number;
  bullColHex?: string;
  bearColHex?: string;
  /** 브레이커 형성·리젝션 마커 최대 개수(과다 DOM 방지) */
  maxMarkers?: number;
};

type ActiveBox = {
  uid: number;
  leftIdx: number;
  top: number;
  bot: number;
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const s = hex.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbaHex(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

function rollingMeanStdev(arr: number[], i: number, len: number): { mean: number; stdev: number } | null {
  if (i < len - 1) return null;
  const from = i - len + 1;
  let sum = 0;
  for (let j = from; j <= i; j++) sum += arr[j];
  const mean = sum / len;
  if (len < 2) return { mean, stdev: 0 };
  let v = 0;
  for (let j = from; j <= i; j++) {
    const d = arr[j] - mean;
    v += d * d;
  }
  const stdev = Math.sqrt(v / (len - 1));
  return { mean, stdev };
}

function valueWhenLast<T>(pred: (j: number) => boolean, pick: (j: number) => T, i: number): T | null {
  for (let j = i; j >= 0; j--) {
    if (pred(j)) return pick(j);
  }
  return null;
}

function intervalsOverlap(topA: number, botA: number, topB: number, botB: number): boolean {
  return topA > botB && botA < topB;
}

type SimResult = {
  finalBoxes: Array<ActiveBox & { role: 'bullOb' | 'bearOb' | 'bullBr' | 'bearBr' }>;
  markers: Array<{
    uid: number;
    barIdx: number;
    price: number;
    kind: 'breakerBull' | 'breakerBear' | 'rejectBull' | 'rejectBear';
  }>;
  stats: { bullOb: number; bearOb: number; bullBr: number; bearBr: number };
};

function simulate(candles: Candle[], opts: BreakerBlocksAlgoAlphaOptions): SimResult | null {
  const n = candles.length;
  const zLen = Math.max(1, Math.floor(opts.zLen ?? 100));
  const maxAge = Math.max(1, Math.floor(opts.maxAge ?? 500));
  const preventOverlap = opts.preventOverlap !== false;
  const maxMarkers = Math.max(20, Math.min(500, opts.maxMarkers ?? 200));

  if (n < zLen + 3) return null;

  const updist = new Array(n).fill(0);
  const downdist = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const c = candles[i];
    if (c.close > c.open) {
      updist[i] = (i > 0 ? updist[i - 1] : 0) + (c.close - c.open);
    } else {
      updist[i] = 0;
    }
    if (c.close < c.open) {
      downdist[i] = (i > 0 ? downdist[i - 1] : 0) + (c.open - c.close);
    } else {
      downdist[i] = 0;
    }
  }

  const zUp = new Array<number | null>(n).fill(null);
  const zDn = new Array<number | null>(n).fill(null);
  for (let i = 0; i < n; i++) {
    const u = rollingMeanStdev(updist, i, zLen);
    if (u && u.stdev > 0) zUp[i] = (updist[i] - u.mean) / u.stdev;
    const d = rollingMeanStdev(downdist, i, zLen);
    if (d && d.stdev > 0) zDn[i] = (downdist[i] - d.mean) / d.stdev;
  }

  let nextUid = 1;
  const bullBoxes: ActiveBox[] = [];
  const bearBoxes: ActiveBox[] = [];
  const breakerBullBoxes: ActiveBox[] = [];
  const breakerBearBoxes: ActiveBox[] = [];
  const markers: SimResult['markers'] = [];

  const pushMarker = (barIdx: number, price: number, kind: SimResult['markers'][0]['kind']) => {
    if (markers.length >= maxMarkers) {
      markers.shift();
    }
    markers.push({ uid: nextUid++, barIdx, price, kind });
  };

  const mintick = (i: number) => {
    const c = candles[i];
    const r = Math.max(1e-12, c.high - c.low);
    return Math.max(r * 1e-9, Math.abs(c.close) * 1e-10, 0.01);
  };

  const canCreate = (tNew: number, bNew: number): boolean => {
    if (!preventOverlap) return true;
    for (const b of bullBoxes) {
      if (intervalsOverlap(tNew, bNew, b.top, b.bot)) return false;
    }
    for (const b of bearBoxes) {
      if (intervalsOverlap(tNew, bNew, b.top, b.bot)) return false;
    }
    for (const b of breakerBullBoxes) {
      if (intervalsOverlap(tNew, bNew, b.top, b.bot)) return false;
    }
    for (const b of breakerBearBoxes) {
      if (intervalsOverlap(tNew, bNew, b.top, b.bot)) return false;
    }
    return true;
  };

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const c1 = i > 0 ? candles[i - 1] : c;

    const zu = zUp[i];
    const zu1 = i > 0 ? zUp[i - 1] : null;
    const zd = zDn[i];
    const zd1 = i > 0 ? zDn[i - 1] : null;

    const negZd = zd != null ? -zd : null;
    const negZd1 = zd1 != null ? -zd1 : null;

    const bullish =
      zu != null &&
      zu > 4 &&
      zu1 != null &&
      zu1 <= 4 &&
      zu1 !== 0;

    const bearish =
      negZd != null &&
      negZd < -4 &&
      negZd1 != null &&
      negZd1 >= -4 &&
      negZd1 !== 0;

    if (bullish) {
      const lastDownIdx = valueWhenLast(
        (j) => candles[j].close < candles[j].open,
        (j) => j,
        i
      );
      if (lastDownIdx != null) {
        const hi = candles[lastDownIdx].high;
        const lo = candles[lastDownIdx].low;
        if (canCreate(hi, lo)) {
          bullBoxes.unshift({ uid: nextUid++, leftIdx: lastDownIdx, top: hi, bot: lo });
        }
      }
    }

    if (bearish) {
      const lastUpIdx = valueWhenLast(
        (j) => candles[j].close > candles[j].open,
        (j) => j,
        i
      );
      if (lastUpIdx != null) {
        const hi = candles[lastUpIdx].high;
        const lo = candles[lastUpIdx].low;
        if (canCreate(hi, lo)) {
          bearBoxes.unshift({ uid: nextUid++, leftIdx: lastUpIdx, top: hi, bot: lo });
        }
      }
    }

    for (let bi = bullBoxes.length - 1; bi >= 0; bi--) {
      const b = bullBoxes[bi];
      const topB = b.top;
      const botB = b.bot;
      const mitigatedB = i > 0 && c.close < botB && c1.close < botB;
      const startB = b.leftIdx;
      const expiredB = i - startB >= maxAge;
      if (mitigatedB || expiredB) {
        const makeBreaker = mitigatedB;
        bullBoxes.splice(bi, 1);
        if (makeBreaker && canCreate(topB, botB)) {
          breakerBearBoxes.unshift({ uid: nextUid++, leftIdx: i, top: topB, bot: botB });
          pushMarker(i, topB, 'breakerBear');
        }
      }
    }

    for (let bi = bearBoxes.length - 1; bi >= 0; bi--) {
      const b = bearBoxes[bi];
      const topS = b.top;
      const botS = b.bot;
      const mitigatedS = i > 0 && c.close > topS && c1.close > topS;
      const startS = b.leftIdx;
      const expiredS = i - startS >= maxAge;
      if (mitigatedS || expiredS) {
        const makeBreaker = mitigatedS;
        bearBoxes.splice(bi, 1);
        if (makeBreaker && canCreate(topS, botS)) {
          breakerBullBoxes.unshift({ uid: nextUid++, leftIdx: i, top: topS, bot: botS });
          pushMarker(i, botS, 'breakerBull');
        }
      }
    }

    for (let bi = breakerBullBoxes.length - 1; bi >= 0; bi--) {
      const b = breakerBullBoxes[bi];
      const topB = b.top;
      const botB = b.bot;
      const mitigatedB = i > 0 && c.close < botB && c1.close < botB;
      const startB = b.leftIdx;
      const expiredB = i - startB >= maxAge;
      if (!mitigatedB && !expiredB && c.high > botB && c.low < topB && c.close > topB) {
        const pad = Math.max(Math.abs(topB - botB) * 0.1, mintick(i) * 2);
        pushMarker(i, botB - pad, 'rejectBull');
      }
      if (mitigatedB || expiredB) {
        breakerBullBoxes.splice(bi, 1);
      }
    }

    for (let bi = breakerBearBoxes.length - 1; bi >= 0; bi--) {
      const b = breakerBearBoxes[bi];
      const topS = b.top;
      const botS = b.bot;
      const mitigatedS = i > 0 && c.close > topS && c1.close > topS;
      const startS = b.leftIdx;
      const expiredS = i - startS >= maxAge;
      if (!mitigatedS && !expiredS && c.high > botS && c.low < topS && c.close < botS) {
        const pad = Math.max(Math.abs(topS - botS) * 0.1, mintick(i) * 2);
        pushMarker(i, topS + pad, 'rejectBear');
      }
      if (mitigatedS || expiredS) {
        breakerBearBoxes.splice(bi, 1);
      }
    }
  }

  const finalBoxes: SimResult['finalBoxes'] = [];
  for (const b of bullBoxes) finalBoxes.push({ ...b, role: 'bullOb' });
  for (const b of bearBoxes) finalBoxes.push({ ...b, role: 'bearOb' });
  for (const b of breakerBullBoxes) finalBoxes.push({ ...b, role: 'bullBr' });
  for (const b of breakerBearBoxes) finalBoxes.push({ ...b, role: 'bearBr' });

  return {
    finalBoxes,
    markers,
    stats: {
      bullOb: bullBoxes.length,
      bearOb: bearBoxes.length,
      bullBr: breakerBullBoxes.length,
      bearBr: breakerBearBoxes.length,
    },
  };
}

function overlaysFromSim(candles: Candle[], sim: SimResult, opts: BreakerBlocksAlgoAlphaOptions): OverlayItem[] {
  const n = candles.length;
  const last = n - 1;
  const tEnd = candles[last].time;
  const greyBorder = 'rgba(148,163,184,0.45)';
  const greyFill = 'rgba(148,163,184,0.12)';
  const bullH = opts.bullColHex ?? '#00ffbb';
  const bearH = opts.bearColHex ?? '#ff1100';

  const out: OverlayItem[] = [];

  for (const b of sim.finalBoxes) {
    const tStart = candles[b.leftIdx].time;
    const idBase = `candle-analysis-brk-${b.role}-${b.uid}`;
    let label: string;
    let fill: string;
    let border: string;
    let cat: OverlayItem['category'] = 'breakerBlocks';

    if (b.role === 'bullOb') {
      label = 'BB·Demand OB';
      fill = greyFill;
      border = greyBorder;
    } else if (b.role === 'bearOb') {
      label = 'BB·Supply OB';
      fill = greyFill;
      border = greyBorder;
    } else if (b.role === 'bullBr') {
      label = 'BB·Bull breaker';
      fill = rgbaHex(bullH, 0.14);
      border = rgbaHex(bullH, 0.55);
    } else {
      label = 'BB·Bear breaker';
      fill = rgbaHex(bearH, 0.14);
      border = rgbaHex(bearH, 0.55);
    }

    out.push({
      id: `${idBase}-zone`,
      kind: 'zone',
      label,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: tStart,
      time2: tEnd,
      price1: b.top,
      price2: b.bot,
      confidence: 62,
      color: fill,
      lineLabelColor: border,
      category: cat,
      labelTooltip: 'AlgoAlpha Breaker Blocks (Pine 포팅)',
    });

    const mid = (b.top + b.bot) / 2;
    const lineColor =
      b.role === 'bullOb' || b.role === 'bearOb' ? greyBorder : b.role === 'bullBr' ? rgbaHex(bullH, 0.5) : rgbaHex(bearH, 0.5);
    out.push({
      id: `${idBase}-mid`,
      kind: 'trendLine',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: tStart,
      time2: tEnd,
      price1: mid,
      price2: mid,
      confidence: 55,
      color: lineColor,
      lineLabelColor: lineColor,
      lineDash: '5 5',
      lineStrokeWidth: 1,
      category: cat,
      noProject: true,
      labelTooltip: 'Breaker mid',
    });
  }

  for (const m of sim.markers) {
    const t = candles[m.barIdx].time;
    const col =
      m.kind === 'breakerBear' || m.kind === 'rejectBear' ? (opts.bearColHex ?? '#ff1100') : (opts.bullColHex ?? '#00ffbb');
    const txt = m.kind === 'breakerBear' || m.kind === 'rejectBear' ? '▼' : '▲';
    const lbl =
      m.kind === 'breakerBull'
        ? 'BB Bull'
        : m.kind === 'breakerBear'
          ? 'BB Bear'
          : m.kind === 'rejectBull'
            ? 'BB Rej↑'
            : 'BB Rej↓';
    out.push({
      id: `candle-analysis-brk-mk-${m.kind}-${m.uid}`,
      kind: 'label',
      label: txt,
      x1: 0,
      y1: 0,
      time1: t,
      price1: m.price,
      confidence: 58,
      color: col,
      lineLabelColor: col,
      labelTextColor: col,
      labelBackgroundColor: 'rgba(8,15,25,0.5)',
      category: 'breakerBlocks',
      labelTooltip: lbl,
    });
  }

  return out;
}

function commentaryFromSim(sim: SimResult, opts: BreakerBlocksAlgoAlphaOptions): string[] {
  const zLen = opts.zLen ?? 100;
  const maxAge = opts.maxAge ?? 500;
  const po = opts.preventOverlap !== false;
  const { stats } = sim;
  const lines: string[] = [
    '— AlgoAlpha Breaker Blocks (Pine v6 포팅 · 교육·참고) —',
    `Z=${zLen} · MaxAge=${maxAge} · 겹침방지 ${po ? 'ON' : 'OFF'} · 활성: 수요OB ${stats.bullOb} · 공급OB ${stats.bearOb} · 불 브레이커 ${stats.bullBr} · 베어 브레이커 ${stats.bearBr}`,
  ];
  return lines;
}

export function buildBreakerBlocksAlgoAlphaBundle(
  candles: Candle[],
  _timeframe: string,
  opts?: BreakerBlocksAlgoAlphaOptions
): { overlays: OverlayItem[]; commentaryLines: string[] } {
  const o = opts ?? {};
  const sim = simulate(candles, o);
  if (!sim) return { overlays: [], commentaryLines: [] };
  return {
    overlays: overlaysFromSim(candles, sim, o),
    commentaryLines: commentaryFromSim(sim, o),
  };
}

export function buildBreakerBlocksAlgoAlphaOverlays(
  candles: Candle[],
  timeframe: string,
  opts?: BreakerBlocksAlgoAlphaOptions
): OverlayItem[] {
  return buildBreakerBlocksAlgoAlphaBundle(candles, timeframe, opts).overlays;
}
