/**
 * Smart Money Breakout Channels [AlgoAlpha] — Pine v6 포팅 (교육·참고).
 * © AlgoAlpha — MPL-2.0 (https://mozilla.org/MPL/2.0/)
 *
 * `requestUpAndDownVolume` 미지원 → 캔들 OHLCV 기반 매수/매도 체결 추정(Comparison·Delta).
 */
import type { Candle, OverlayItem } from '@/types';

export type BreakoutChannelsVolMode = 'Volume' | 'Comparison' | 'Delta';

export type BreakoutChannelsAlgoAlphaOptions = {
  overlap?: boolean;
  strongCloses?: boolean;
  normLength?: number;
  boxLength?: number;
  showVolume?: boolean;
  volMode?: BreakoutChannelsVolMode;
  volScale?: number;
  greenHex?: string;
  redHex?: string;
  /** 내부 볼륨 미니캔들 최대 개수(성능) */
  maxVolBars?: number;
  /**
   * 완료된 채널만 제한: 0 = 전부 그림(기본).
   * 양수면 종료 봉(endIdx)이 가장 최근인 N개만 그리고, 나머지 완료 채널의 돌파 마커도 숨김.
   */
  maxHistoryCompletedChannels?: number;
};

export type BreakoutChannelsGauge = {
  top: number;
  bottom: number;
  pointerFrac: number;
  vold: number;
  hvold: number;
  lvold: number;
};

export type BreakoutChannelsBundle = {
  overlays: OverlayItem[];
  commentaryLines: string[];
  gauge: BreakoutChannelsGauge | null;
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

function trueRange(c: Candle, prevClose: number): number {
  return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
}

function wilderAtrSeries(candles: Candle[], period: number): (number | null)[] {
  const n = candles.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < period + 1) return out;
  const tr: number[] = [];
  for (let i = 0; i < n; i++) {
    const prevC = i > 0 ? candles[i - 1].close : candles[i].open;
    tr.push(trueRange(candles[i], prevC));
  }
  const p = Math.max(1, period);
  let atr = 0;
  for (let i = 0; i < p; i++) atr += tr[i];
  atr /= p;
  out[p - 1] = atr;
  for (let i = p; i < n; i++) {
    atr = (atr * (p - 1) + tr[i]) / p;
    out[i] = atr;
  }
  return out;
}

function rollingHighestLowest(
  candles: Candle[],
  i: number,
  len: number
): { hi: number; lo: number } | null {
  if (len < 1 || i < 0) return null;
  const from = Math.max(0, i - len + 1);
  let hi = -Infinity;
  let lo = Infinity;
  for (let j = from; j <= i; j++) {
    hi = Math.max(hi, candles[j].high);
    lo = Math.min(lo, candles[j].low);
  }
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
  return { hi, lo };
}

function stdevAt(values: number[], i: number, len: number): number | null {
  if (i < len - 1) return null;
  const from = i - len + 1;
  let sum = 0;
  for (let j = from; j <= i; j++) sum += values[j];
  const mean = sum / len;
  if (len < 2) return 0;
  let v = 0;
  for (let j = from; j <= i; j++) {
    const d = values[j] - mean;
    v += d * d;
  }
  return Math.sqrt(v / (len - 1));
}

/** Pine ta.highestbars: 오프셋(현재 봉=0)으로 윈도우 내 최댓값 위치 */
function highestbars(series: number[], i: number, win: number): number {
  const from = Math.max(0, i - win + 1);
  let best = series[i];
  let bestOff = 0;
  for (let j = from; j <= i; j++) {
    const off = i - j;
    if (series[j] > best || (series[j] === best && off < bestOff)) {
      best = series[j];
      bestOff = off;
    }
  }
  return bestOff;
}

function lowestbars(series: number[], i: number, win: number): number {
  const from = Math.max(0, i - win + 1);
  let best = series[i];
  let bestOff = 0;
  for (let j = from; j <= i; j++) {
    const off = i - j;
    if (series[j] < best || (series[j] === best && off < bestOff)) {
      best = series[j];
      bestOff = off;
    }
  }
  return bestOff;
}

function crossover(
  a: number | null,
  b: number | null,
  a1: number | null,
  b1: number | null
): boolean {
  return (
    a != null &&
    b != null &&
    a1 != null &&
    b1 != null &&
    a > b &&
    a1 <= b1
  );
}

function uvDvFromCandle(c: Candle): { uv: number; dv: number } {
  const o = c.open;
  const h = c.high;
  const l = c.low;
  const cl = c.close;
  const v = c.volume;
  const rng = h - l;
  let buyV: number;
  if (rng === 0) buyV = v * 0.5;
  else if (cl >= o) buyV = v * ((Math.abs(cl - o) + (Math.min(o, cl) - l)) / rng);
  else buyV = v * ((h - Math.max(o, cl)) / rng);
  const sellV = Math.max(0, v - buyV);
  return { uv: buyV, dv: sellV };
}

type Channel = {
  uid: number;
  leftIdx: number;
  h: number;
  l: number;
  vola: number;
};

type Completed = Channel & { endIdx: number };

function intervalsOverlap(topA: number, botA: number, topB: number, botB: number): boolean {
  return topA > botB && botA < topB;
}

function simulate(
  candles: Candle[],
  opts: BreakoutChannelsAlgoAlphaOptions
): {
  completed: Completed[];
  active: Channel[];
  markers: Array<{ barIdx: number; price: number; kind: 'bull' | 'bear'; chUid: number }>;
  lastGauge: BreakoutChannelsGauge | null;
} | null {
  const n = candles.length;
  const normLen = Math.max(1, Math.floor(opts.normLength ?? 100));
  const boxLen = Math.max(1, Math.floor(opts.boxLength ?? 14));
  const overlap = opts.overlap === true;
  const strong = opts.strongCloses !== false;
  const volMode = opts.volMode ?? 'Comparison';
  const showVol = opts.showVolume !== false;

  const minN = Math.max(normLen + 2, boxLen + 20, 105);
  if (n < minN) return null;

  const normPrice: number[] = new Array(n).fill(0.5);
  for (let i = 0; i < n; i++) {
    const hl = rollingHighestLowest(candles, i, normLen);
    if (!hl || hl.hi <= hl.lo) normPrice[i] = 0.5;
    else normPrice[i] = (candles[i].close - hl.lo) / (hl.hi - hl.lo);
  }

  const volOfNorm: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    volOfNorm[i] = stdevAt(normPrice, i, 14);
  }

  const upper: (number | null)[] = new Array(n).fill(null);
  const lower: (number | null)[] = new Array(n).fill(null);
  const win = boxLen + 1;
  for (let i = 0; i < n; i++) {
    if (volOfNorm[i] == null) continue;
    const hb = highestbars(volOfNorm as number[], i, win);
    const lb = lowestbars(volOfNorm as number[], i, win);
    upper[i] = (hb + boxLen) / boxLen;
    lower[i] = (lb + boxLen) / boxLen;
  }

  let lastLowerCrossUpper = -1;
  const durationArr: number[] = new Array(n).fill(1);
  const hBand: number[] = new Array(n).fill(0);
  const lBand: number[] = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const u = upper[i];
    const l = lower[i];
    const u1 = i > 0 ? upper[i - 1] : null;
    const l1 = i > 0 ? lower[i - 1] : null;
    if (l != null && u != null && l1 != null && u1 != null && crossover(l, u, l1, u1)) {
      lastLowerCrossUpper = i;
    }
    const barsSince = lastLowerCrossUpper < 0 ? 0 : i - lastLowerCrossUpper;
    const duration = Math.max(barsSince, 1);
    durationArr[i] = duration;
    const hh = rollingHighestLowest(candles, i, duration);
    if (hh) {
      hBand[i] = hh.hi;
      lBand[i] = hh.lo;
    }
  }

  const atr = wilderAtrSeries(candles, boxLen);
  const smaVol20: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const from = Math.max(0, i - 19);
    let s = 0;
    for (let j = from; j <= i; j++) s += candles[j].volume;
    smaVol20[i] = s / (i - from + 1);
  }

  let cumDelta = 0;
  const cumDeltaArr: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const { uv, dv } = uvDvFromCandle(candles[i]);
    cumDelta += uv - dv;
    cumDeltaArr[i] = cumDelta;
  }

  let hvold = cumDeltaArr[0];
  let lvold = cumDeltaArr[0];

  const active: Channel[] = [];
  const completed: Completed[] = [];
  const markers: Array<{ barIdx: number; price: number; kind: 'bull' | 'bear'; chUid: number }> = [];
  let nextUid = 1;

  const canCreate = (top: number, bot: number): boolean => {
    if (overlap) return true;
    for (const ch of active) {
      if (intervalsOverlap(top, bot, ch.h, ch.l)) return false;
    }
    return true;
  };

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const u = upper[i];
    const l = lower[i];
    const u1 = i > 0 ? upper[i - 1] : null;
    const l1 = i > 0 ? lower[i - 1] : null;

    const vold = cumDeltaArr[i];

    if (l != null && u != null && l1 != null && u1 != null && crossover(l, u, l1, u1)) {
      hvold = vold;
      lvold = vold;
    }
    if (vold > hvold) hvold = vold;
    if (vold < lvold) lvold = vold;

    const dur = durationArr[i];
    const crossUL =
      u != null && l != null && u1 != null && l1 != null && crossover(u, l, u1, l1);
    if (crossUL && dur > 10) {
      const h = hBand[i];
      const lo = lBand[i];
      const atrv = atr[i];
      const range = h - lo;
      let vola = atrv != null ? atrv / 2 : range * 0.05;
      vola = Math.min(vola, range * 0.48);
      if (h > lo && canCreate(h, lo)) {
        active.unshift({ uid: nextUid++, leftIdx: Math.max(0, i - dur), h, l: lo, vola });
      }
    }

    const pxWeak = strong ? (c.open + c.close) / 2 : c.close;
    for (let k = active.length - 1; k >= 0; k--) {
      const ch = active[k];
      const range = Math.max(1e-12, ch.h - ch.l);
      const pad = Math.max(range * 0.01, Math.abs(ch.h) * 1e-6, 1e-8);
      const bodyH = Math.abs(c.close - c.open);
      const bodyTop = Math.max(c.open, c.close);
      const bodyBot = Math.min(c.open, c.close);
      let bullBreak: boolean;
      let bearBreak: boolean;
      if (strong && bodyH > 1e-12) {
        const outsideUp = Math.max(0, bodyTop - ch.h);
        const outsideDn = Math.max(0, ch.l - bodyBot);
        bullBreak = c.close > ch.h && outsideUp / bodyH > 0.5;
        bearBreak = c.close < ch.l && outsideDn / bodyH > 0.5;
      } else {
        bullBreak = pxWeak > ch.h;
        bearBreak = pxWeak < ch.l;
      }
      if (bullBreak) {
        markers.push({ barIdx: i, price: ch.l - pad, kind: 'bull', chUid: ch.uid });
        completed.push({ ...ch, endIdx: i });
        active.splice(k, 1);
      } else if (bearBreak) {
        markers.push({ barIdx: i, price: ch.h + pad, kind: 'bear', chUid: ch.uid });
        completed.push({ ...ch, endIdx: i });
        active.splice(k, 1);
      }
    }
  }

  let lastGauge: BreakoutChannelsGauge | null = null;
  if (active.length > 0) {
    const ch = active[0];
    const topBound = ch.h;
    const bottomBound = ch.l;
    if (topBound > bottomBound) {
      const vold = cumDeltaArr[n - 1];
      const span = hvold - lvold;
      let delvol = 0;
      if (Math.abs(span) > 1e-12) {
        delvol = -100 * 2 * ((vold - lvold) / span - 0.5);
      }
      delvol = Math.max(-100, Math.min(100, delvol));
      const pointerFrac = (delvol + 100) / 200;
      lastGauge = {
        top: topBound,
        bottom: bottomBound,
        pointerFrac,
        vold,
        hvold,
        lvold,
      };
    }
  }

  return { completed, active, markers, lastGauge: showVol ? lastGauge : null };
}

function buildOverlays(
  candles: Candle[],
  sim: NonNullable<ReturnType<typeof simulate>>,
  opts: BreakoutChannelsAlgoAlphaOptions,
  timeframe: string
): OverlayItem[] {
  const n = candles.length;
  const lastIdx = n - 1;
  const tLast = candles[lastIdx].time;
  const smaVol20: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const from = Math.max(0, i - 19);
    let s = 0;
    for (let j = from; j <= i; j++) s += candles[j].volume;
    smaVol20[i] = s / (i - from + 1);
  }
  const greenH = opts.greenHex ?? '#00ffbb';
  const redH = opts.redHex ?? '#ff1100';
  const volMode = opts.volMode ?? 'Comparison';
  const showVol = opts.showVolume !== false;
  const volScale = Math.max(0.1, Math.min(2, opts.volScale ?? 0.5));
  const maxVolBars = Math.max(24, Math.min(200, opts.maxVolBars ?? 120));

  const barMs = (() => {
    const map: Record<string, number> = {
      '1m': 60_000,
      '3m': 180_000,
      '5m': 300_000,
      '15m': 900_000,
      '1h': 3_600_000,
      '4h': 14_400_000,
      '1d': 86_400_000,
      '1w': 604_800_000,
      '1M': 2_592_000_000,
    };
    return map[timeframe] ?? 60_000;
  })();

  const maxHist = Math.max(0, Math.min(500, Math.floor(opts.maxHistoryCompletedChannels ?? 0)));
  const activeUidSet = new Set(sim.active.map((c) => c.uid));
  let completedUidDrawSet: Set<number>;
  let completedDraw: Completed[];
  if (maxHist > 0 && sim.completed.length > maxHist) {
    const byEnd = [...sim.completed].sort((a, b) => b.endIdx - a.endIdx);
    completedUidDrawSet = new Set(byEnd.slice(0, maxHist).map((c) => c.uid));
    completedDraw = sim.completed.filter((c) => completedUidDrawSet.has(c.uid));
  } else {
    completedUidDrawSet = new Set(sim.completed.map((c) => c.uid));
    completedDraw = sim.completed;
  }

  const out: OverlayItem[] = [];

  /** 완료 채널은 TradingView 느낌에 맞게 채도·선을 낮춤(활성 채널만 또렷하게). */
  const pushChannel = (ch: Channel, endIdx: number, dimmed: boolean) => {
    const tL = candles[Math.max(0, ch.leftIdx)].time;
    const tR = candles[Math.min(endIdx, n - 1)].time;
    const { h, l, vola, uid } = ch;
    const mid = (h + l) / 2;
    const topStripBot = h - vola;
    const botStripTop = l + vola;

    const baseFill = dimmed ? 0.22 : 0.38;
    const baseLine = dimmed ? 0.14 : 0.22;
    const stripA = dimmed ? 0.17 : 0.32;
    const stripLab = dimmed ? 0.35 : 0.55;
    const midA = dimmed ? 0.22 : 0.35;
    const midLab = dimmed ? 0.3 : 0.45;
    const edgeCol = dimmed ? rgbaHex(redH, 0.55) : redH;
    const edgeColG = dimmed ? rgbaHex(greenH, 0.55) : greenH;
    const edgeW = dimmed ? 1.25 : 2;

    out.push({
      id: `zone-smbc-${uid}-base`,
      kind: 'zone',
      label: 'SMBC',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: tL,
      time2: tR,
      price1: h,
      price2: l,
      confidence: 54,
      color: `rgba(71,85,105,${baseFill})`,
      lineLabelColor: `rgba(148,163,184,${baseLine})`,
      category: 'smBreakoutChannels',
      labelTooltip: 'Smart Money Breakout Channel — 본문(회색)',
    });
    out.push({
      id: `zone-smbc-${uid}-upper`,
      kind: 'zone',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: tL,
      time2: tR,
      price1: h,
      price2: topStripBot,
      confidence: 56,
      color: rgbaHex(redH, stripA),
      lineLabelColor: rgbaHex(redH, stripLab),
      category: 'smBreakoutChannels',
      labelTooltip: '상단 저항 밴드',
    });
    out.push({
      id: `zone-smbc-${uid}-lower`,
      kind: 'zone',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: tL,
      time2: tR,
      price1: botStripTop,
      price2: l,
      confidence: 56,
      color: rgbaHex(greenH, stripA),
      lineLabelColor: rgbaHex(greenH, stripLab),
      category: 'smBreakoutChannels',
      labelTooltip: '하단 지지 밴드',
    });
    out.push({
      id: `zone-smbc-${uid}-mid`,
      kind: 'trendLine',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: tL,
      time2: tR,
      price1: mid,
      price2: mid,
      confidence: 50,
      color: `rgba(226,232,240,${midA})`,
      lineLabelColor: `rgba(226,232,240,${midLab})`,
      lineDash: '5 5',
      lineStrokeWidth: 1,
      category: 'smBreakoutChannels',
      noProject: true,
      labelTooltip: '채널 중심',
    });
    out.push({
      id: `zone-smbc-${uid}-edge-top`,
      kind: 'trendLine',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: tL,
      time2: tR,
      price1: h,
      price2: h,
      confidence: 58,
      color: edgeCol,
      lineLabelColor: edgeCol,
      lineStrokeWidth: edgeW,
      category: 'smBreakoutChannels',
      noProject: true,
      labelTooltip: '채널 상단 경계(빨강 실선)',
    });
    out.push({
      id: `zone-smbc-${uid}-edge-bot`,
      kind: 'trendLine',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: tL,
      time2: tR,
      price1: l,
      price2: l,
      confidence: 58,
      color: edgeColG,
      lineLabelColor: edgeColG,
      lineStrokeWidth: edgeW,
      category: 'smBreakoutChannels',
      noProject: true,
      labelTooltip: '채널 하단 경계(초록 실선)',
    });
  };

  for (const ch of completedDraw) {
    pushChannel(ch, ch.endIdx, true);
  }
  for (const ch of sim.active) {
    pushChannel(ch, lastIdx, false);
  }

  /** 채널별로 해당 구간 봉에만 볼륨 막대. TV처럼 상·하 vola 밴드 안쪽으로 가격 클램프. */
  const pushVolBarsForChannel = (ch: Channel, endBarIdx: number) => {
    const mid = (ch.h + ch.l) / 2;
    const topLimit = ch.h - ch.vola;
    const botLimit = ch.l + ch.vola;
    if (!(topLimit > mid + 1e-12 && botLimit < mid - 1e-12)) return;

    const chH = (ch.h - ch.l) * volScale;
    const quarter = Math.max(1e-12, chH / 4);
    const endJ = Math.min(endBarIdx, lastIdx);
    let jFrom = ch.leftIdx;
    if (endJ - jFrom + 1 > maxVolBars) jFrom = endJ - maxVolBars + 1;

    for (let j = jFrom; j <= endJ; j++) {
      const c = candles[j];
      const sm = Math.max(1e-12, smaVol20[j]);
      let upperOpen = mid;
      let upperClose = mid;
      let upperHigh = mid;
      let upperLow = mid;
      let lowerOpen = mid;
      let lowerClose = mid;
      let lowerHigh = mid;
      let lowerLow = mid;
      const { uv, dv } = uvDvFromCandle(c);

      if (volMode === 'Volume') {
        const volH = (c.volume / sm) * quarter;
        upperClose = mid + volH;
        upperHigh = upperClose;
        lowerClose = mid - volH;
        lowerLow = lowerClose;
      } else if (volMode === 'Comparison') {
        const uvH = (uv / sm) * quarter;
        const dvH = (dv / sm) * quarter;
        upperClose = mid + uvH;
        upperHigh = upperClose;
        lowerOpen = mid;
        lowerClose = mid - dvH;
        lowerHigh = mid;
        lowerLow = lowerClose;
      } else {
        const dlt = uv - dv;
        const dh = (Math.abs(dlt) / sm) * quarter;
        if (dlt >= 0) {
          upperClose = mid + dh;
          upperHigh = upperClose;
        } else {
          lowerClose = mid - dh;
          lowerLow = lowerClose;
        }
      }

      const tNext = j + 1 < n ? candles[j + 1].time : c.time + barMs;
      const tMid = (c.time + tNext) / 2;
      const halfW = barMs * 0.1;
      const tA = tMid - halfW;
      const tB = tMid + halfW;
      const upColor =
        volMode === 'Volume' ? 'rgba(226,232,240,0.35)' : rgbaHex(greenH, 0.34);
      const dnColor = volMode === 'Volume' ? 'rgba(226,232,240,0.35)' : rgbaHex(redH, 0.34);

      let uTop = Math.max(upperOpen, upperClose, upperHigh);
      let uBot = Math.min(upperOpen, upperClose, upperLow);
      uTop = Math.min(uTop, topLimit);
      uBot = Math.max(uBot, mid);
      if (uTop > uBot + 1e-12) {
        out.push({
          id: `zone-smbc-vol-u-${ch.uid}-${j}`,
          kind: 'zone',
          label: '',
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 1,
          time1: tA,
          time2: tB,
          price1: uTop,
          price2: uBot,
          confidence: 48,
          color: upColor,
          lineLabelColor: upColor,
          category: 'smBreakoutChannels',
          labelTooltip: 'Volume (upper)',
        });
      }

      let lTop = Math.max(lowerOpen, lowerClose, lowerHigh);
      let lBot = Math.min(lowerOpen, lowerClose, lowerLow);
      lTop = Math.min(lTop, mid);
      lBot = Math.max(lBot, botLimit);
      if (lTop > lBot + 1e-12) {
        out.push({
          id: `zone-smbc-vol-l-${ch.uid}-${j}`,
          kind: 'zone',
          label: '',
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 1,
          time1: tA,
          time2: tB,
          price1: lTop,
          price2: lBot,
          confidence: 48,
          color: dnColor,
          lineLabelColor: dnColor,
          category: 'smBreakoutChannels',
          labelTooltip: 'Volume (lower)',
        });
      }
    }
  };

  if (showVol) {
    for (const ch of completedDraw) {
      pushVolBarsForChannel(ch, ch.endIdx);
    }
    for (const ch of sim.active) {
      pushVolBarsForChannel(ch, lastIdx);
    }
  }

  for (const m of sim.markers) {
    if (!activeUidSet.has(m.chUid) && !completedUidDrawSet.has(m.chUid)) continue;
    const t = candles[m.barIdx].time;
    const col = m.kind === 'bull' ? greenH : redH;
    const sym = m.kind === 'bull' ? '▲' : '▼';
    out.push({
      id: `zone-smbc-mk-${m.chUid}-${m.barIdx}-${m.kind}`,
      kind: 'label',
      label: sym,
      x1: 0,
      y1: 0,
      time1: t,
      price1: m.price,
      confidence: 60,
      color: col,
      lineLabelColor: col,
      labelTextColor: '#f8fafc',
      labelBackgroundColor: col,
      category: 'smBreakoutChannels',
      labelTooltip: m.kind === 'bull' ? 'Bullish breakout (▲)' : 'Bearish breakout (▼)',
    });
  }

  if (sim.active.length > 0 && sim.lastGauge) {
    const g = sim.lastGauge;
    const c = candles[lastIdx];
    const { uv, dv } = uvDvFromCandle(c);
    let volText = '';
    if (volMode === 'Volume') volText = `${(c.volume / 1000).toFixed(1)}K`;
    else if (volMode === 'Comparison') volText = `${(uv / 1000).toFixed(1)}K/${(dv / 1000).toFixed(1)}K`;
    else volText = `${((uv - dv) / 1000).toFixed(1)}K`;
    const px = opts.strongCloses !== false ? (c.open + c.close) / 2 : c.close;
    const aboveMid = px > (g.top + g.bottom) / 2;
    const tLab = tLast + barMs * 0.4;
    const pLab = aboveMid ? g.bottom + (g.top - g.bottom) * 0.12 : g.top - (g.top - g.bottom) * 0.12;
    out.push({
      id: `zone-smbc-voltxt`,
      kind: 'label',
      label: volText,
      x1: 0,
      y1: 0,
      time1: tLab,
      price1: pLab,
      confidence: 52,
      color: '#e2e8f0',
      labelTextColor: 'rgba(226,232,240,0.92)',
      labelBackgroundColor: 'rgba(15,23,42,0.5)',
      category: 'smBreakoutChannels',
      labelTooltip: 'Volume 텍스트 (Pine 유사)',
    });
  }

  return out;
}

export function buildBreakoutChannelsAlgoAlphaBundle(
  candles: Candle[],
  timeframe: string,
  opts?: BreakoutChannelsAlgoAlphaOptions
): BreakoutChannelsBundle {
  const o = opts ?? {};
  const sim = simulate(candles, o);
  if (!sim) {
    return { overlays: [], commentaryLines: [], gauge: null };
  }
  const maxHistLine = Math.max(0, Math.min(500, Math.floor(o.maxHistoryCompletedChannels ?? 0)));
  const lines = [
    '— AlgoAlpha Smart Money Breakout Channels (MPL-2.0 · Pine 포팅) —',
    `중첩 채널 ${o.overlap ? 'ON' : 'OFF'} · 강한 종가 ${o.strongCloses !== false ? 'ON(몸통 50%↑ 밖)' : 'OFF(종가/평균만)'} · 볼륨 ${o.volMode ?? 'Comparison'} (추정)`,
    `활성 채널 ${sim.active.length}개 · 완료 ${sim.completed.length} · 돌파 표식 ${sim.markers.length}개(데이터)`,
    maxHistLine > 0
      ? `과거 완료 채널 표시: 최근 ${maxHistLine}개만(나머지 존·표식 숨김)`
      : '과거 완료 채널 표시: 전체',
  ];
  return {
    overlays: buildOverlays(candles, sim, o, timeframe),
    commentaryLines: lines,
    gauge: sim.lastGauge,
  };
}
