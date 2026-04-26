/**
 * Volumetric Inverse Fair Value Gap (VIFVG) [UAlgo] — Pine v6 포팅.
 * © UAlgo — CC BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/)
 * 교육·참고용.
 */
import type { Candle, OverlayItem } from '@/types';

export type VifvgUAlgoOptions = {
  fvgThresholdAtr?: number;
  strictMode?: boolean;
  showLastN?: number;
  showGhost?: boolean;
  bullBarHex?: string;
  bearBarHex?: string;
  strBarHex?: string;
  bgDarkHex?: string;
  ghostHex?: string;
  borderHex?: string;
  labelTextHex?: string;
};

type PendingFVG = {
  createdTime: number;
  top: number;
  btm: number;
  isBullGap: boolean;
  processed: boolean;
};

type ActiveIFVG = {
  id: string;
  startTime: number;
  originTime: number;
  top: number;
  btm: number;
  isBullIfvg: boolean;
  pctBull: number;
  pctBear: number;
  pctStrength: number;
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

/** Pine calc_metrics */
function calcMetrics(o: number, h: number, l: number, c: number, v: number): { pBull: number; pBear: number } {
  const rng = h - l;
  let buyV: number;
  if (rng === 0) {
    buyV = v * 0.5;
  } else if (c >= o) {
    buyV = v * ((Math.abs(c - o) + (Math.min(o, c) - l)) / rng);
  } else {
    buyV = v * ((h - Math.max(o, c)) / rng);
  }
  const sellV = v - buyV;
  const total = buyV + sellV;
  const pBull = total > 0 ? buyV / total : 0;
  const pBear = total > 0 ? sellV / total : 0;
  return { pBull, pBear };
}

/** ta.percentrank(volume, 100) / 100 근사 */
function volumePercentRank01(candles: Candle[], idx: number, len: number): number {
  const from = Math.max(0, idx - len + 1);
  const vols = candles.slice(from, idx + 1).map((c) => c.volume);
  const v = candles[idx].volume;
  if (vols.length < 2) return 0.5;
  let lessEq = 0;
  for (const x of vols) {
    if (x <= v) lessEq += 1;
  }
  return Math.max(0, Math.min(1, lessEq / vols.length));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const s = hex.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbaHex(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

const MIN_BARS = 115;

function simulateVifvg(candles: Candle[], opts?: VifvgUAlgoOptions): ActiveIFVG[] {
  const n = candles.length;
  if (n < MIN_BARS) return [];

  const fvgTh = Math.max(0.1, opts?.fvgThresholdAtr ?? 0.5);
  const strict = opts?.strictMode !== false;
  const showLastN = Math.max(1, Math.min(50, opts?.showLastN ?? 10));
  const pendingMax = 30;

  const pending: PendingFVG[] = [];
  const active: ActiveIFVG[] = [];
  let idSeq = 0;

  for (let i = 2; i < n; i++) {
    const c = candles[i];
    const c1 = candles[i - 1];
    const c2 = candles[i - 2];
    const atr = wilderAtrAt(candles, 14, i);
    if (atr == null || !(atr > 0)) continue;

    const bullCond = strict ? c.low > c2.high : c.close > c2.high;
    const bearCond = strict ? c.high < c2.low : c.close < c2.low;

    let gapSize = 0;
    let added: PendingFVG | null = null;

    if (bullCond && c1.close > c1.open) {
      gapSize = c.low - c2.high;
      if (gapSize >= atr * fvgTh) {
        added = {
          createdTime: Number(c1.time),
          top: c.low,
          btm: c2.high,
          isBullGap: true,
          processed: false,
        };
      }
    } else if (bearCond && c1.close < c1.open) {
      gapSize = c2.low - c.high;
      if (gapSize >= atr * fvgTh) {
        added = {
          createdTime: Number(c1.time),
          top: c2.low,
          btm: c.high,
          isBullGap: false,
          processed: false,
        };
      }
    }

    if (added) pending.push(added);
    while (pending.length > pendingMax) pending.shift();

    const close = c.close;
    for (let pi = pending.length - 1; pi >= 0; pi--) {
      const p = pending[pi];
      if (p.processed) continue;
      let inverted = false;
      let toBull = false;
      if (!p.isBullGap && close > p.top) {
        inverted = true;
        toBull = true;
      }
      if (p.isBullGap && close < p.btm) {
        inverted = true;
        toBull = false;
      }
      if (inverted) {
        const { pBull, pBear } = calcMetrics(c.open, c.high, c.low, c.close, c.volume);
        const pStr = volumePercentRank01(candles, i, 100);
        idSeq += 1;
        active.push({
          id: `t${Number(c.time)}-o${p.createdTime}-${idSeq}`,
          startTime: Number(c.time),
          originTime: p.createdTime,
          top: p.top,
          btm: p.btm,
          isBullIfvg: toBull,
          pctBull: pBull,
          pctBear: pBear,
          pctStrength: pStr,
        });
        p.processed = true;
      }
    }

    for (let ai = active.length - 1; ai >= 0; ai--) {
      const it = active[ai];
      if (it.isBullIfvg && close < it.btm) {
        active.splice(ai, 1);
        continue;
      }
      if (!it.isBullIfvg && close > it.top) {
        active.splice(ai, 1);
      }
    }

    while (active.length > showLastN) active.shift();
  }

  return active;
}

function overlaysFromActives(candles: Candle[], actives: ActiveIFVG[], opts?: VifvgUAlgoOptions): OverlayItem[] {
  if (!actives.length) return [];
  const n = candles.length;
  const tEnd = Number(candles[n - 1].time);
  const showGhost = opts?.showGhost !== false;

  const bullH = opts?.bullBarHex ?? '#00e676';
  const bearH = opts?.bearBarHex ?? '#ff5252';
  const strH = opts?.strBarHex ?? '#00e5ff';
  const bgH = opts?.bgDarkHex ?? '#131722';
  const ghostH = opts?.ghostHex ?? '#8a91a5';
  const borderH = opts?.borderHex ?? '#8a91a5';
  const txtH = opts?.labelTextHex ?? '#ffffff';

  const out: OverlayItem[] = [];

  for (const it of actives) {
    const { top, btm, startTime: tStart, originTime: tOrigin, pctBull, pctBear, pctStrength } = it;
    const safeId = it.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const totalH = top - btm;
    const hSlice = totalH / 3;
    const y1 = top;
    const y2 = top - hSlice;
    const y3 = top - 2 * hSlice;
    const y4 = btm;
    const dur = Math.max(1, tEnd - tStart);
    const tMid = Math.round((tStart + tEnd) / 2);
    const wBull = tStart + dur * pctBull;
    const wBear = tStart + dur * pctBear;
    const wStr = tStart + dur * pctStrength;

    if (showGhost && tOrigin < tStart) {
      out.push({
        id: `candle-analysis-vifvg-ghost-${safeId}`,
        kind: 'zone',
        label: '',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: tOrigin,
        time2: tStart,
        price1: top,
        price2: btm,
        confidence: 64,
        color: rgbaHex(ghostH, 0.12),
        lineLabelColor: borderH,
        category: 'vifvg',
        labelTooltip: 'FVG (ghost) — CC BY-NC-SA UAlgo',
      });
    }

    out.push({
      id: `candle-analysis-vifvg-frame-${safeId}`,
      kind: 'zone',
      label: it.isBullIfvg ? 'IFVG ↑' : 'IFVG ↓',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: tStart,
      time2: tEnd,
      price1: top,
      price2: btm,
      confidence: 68,
      color: 'rgba(0,0,0,0.02)',
      lineLabelColor: borderH,
      category: 'vifvg',
      labelTooltip: `VIFVG · Bull ${Math.round(pctBull * 100)}% · Bear ${Math.round(pctBear * 100)}% · Str ${Math.round(pctStrength * 100)}%`,
    });

    const pushRow = (
      suffix: string,
      rowTop: number,
      rowBot: number,
      bgAlpha: number,
      barHex: string,
      barAlpha: number,
      tBarEnd: number
    ) => {
      out.push({
        id: `candle-analysis-vifvg-bg-${suffix}-${safeId}`,
        kind: 'zone',
        label: '',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: tStart,
        time2: tEnd,
        price1: rowTop,
        price2: rowBot,
        confidence: 60,
        color: rgbaHex(bgH, bgAlpha),
        lineLabelColor: borderH,
        category: 'vifvg',
        labelTooltip: 'VIFVG row bg',
      });
      out.push({
        id: `candle-analysis-vifvg-bar-${suffix}-${safeId}`,
        kind: 'zone',
        label: '',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: tStart,
        time2: Math.max(tStart + 1, tBarEnd),
        price1: rowTop,
        price2: rowBot,
        confidence: 62,
        color: rgbaHex(barHex, barAlpha),
        lineLabelColor: barHex,
        category: 'vifvg',
        labelTooltip: 'VIFVG volumetric bar',
      });
    };

    pushRow('bull', y1, y2, 0.35, bullH, 0.72, wBull);
    pushRow('bear', y2, y3, 0.35, bearH, 0.72, wBear);
    pushRow('str', y3, y4, 0.35, strH, 0.72, wStr);

    const midBull = top - hSlice * 0.5;
    const midBear = top - hSlice * 1.5;
    const midStr = top - hSlice * 2.5;

    out.push({
      id: `candle-analysis-vifvg-lbl-bull-${safeId}`,
      kind: 'label',
      label: `Bull: ${Math.round(pctBull * 100)}%`,
      x1: 0,
      y1: 0,
      time1: tMid,
      price1: midBull,
      confidence: 58,
      color: txtH,
      category: 'vifvg',
      labelTextColor: txtH,
      labelBackgroundColor: 'rgba(8,15,25,0.35)',
      labelTooltip: 'Buy-volume share (row 1)',
    });
    out.push({
      id: `candle-analysis-vifvg-lbl-bear-${safeId}`,
      kind: 'label',
      label: `Bear: ${Math.round(pctBear * 100)}%`,
      x1: 0,
      y1: 0,
      time1: tMid,
      price1: midBear,
      confidence: 58,
      color: txtH,
      category: 'vifvg',
      labelTextColor: txtH,
      labelBackgroundColor: 'rgba(8,15,25,0.35)',
      labelTooltip: 'Sell-volume share (row 2)',
    });
    out.push({
      id: `candle-analysis-vifvg-lbl-str-${safeId}`,
      kind: 'label',
      label: `Str: ${Math.round(pctStrength * 100)}%`,
      x1: 0,
      y1: 0,
      time1: tMid,
      price1: midStr,
      confidence: 58,
      color: txtH,
      category: 'vifvg',
      labelTextColor: txtH,
      labelBackgroundColor: 'rgba(8,15,25,0.35)',
      labelTooltip: 'Volume strength rank (row 3)',
    });
  }

  return out;
}

function commentaryFromActives(actives: ActiveIFVG[], opts?: VifvgUAlgoOptions): string[] {
  if (!actives.length) return [];
  const last = actives[actives.length - 1];
  const strict = opts?.strictMode !== false;
  const th = opts?.fvgThresholdAtr ?? 0.5;
  return [
    '— UAlgo VIFVG · Volumetric Inverse FVG (CC BY-NC-SA 4.0 · Pine 포팅) —',
    `민감도 ATR×${th} · Strict ${strict ? 'ON' : 'OFF'} · 표시 ${actives.length}개 (최근 N 유지)`,
    `최근 IFVG: ${last.isBullIfvg ? 'Bull' : 'Bear'} · Bull ${Math.round(last.pctBull * 100)}% · Bear ${Math.round(last.pctBear * 100)}% · Str ${Math.round(last.pctStrength * 100)}%`,
    '(참고용·비조언 · NC 라이선스)',
  ];
}

export function buildVifvgUAlgoBundle(
  candles: Candle[],
  _timeframe: string,
  opts?: VifvgUAlgoOptions
): { overlays: OverlayItem[]; commentaryLines: string[] } {
  if (candles.length < MIN_BARS) return { overlays: [], commentaryLines: [] };
  const actives = simulateVifvg(candles, opts);
  return {
    overlays: overlaysFromActives(candles, actives, opts),
    commentaryLines: commentaryFromActives(actives, opts),
  };
}

export function buildVifvgUAlgoOverlays(candles: Candle[], timeframe: string, opts?: VifvgUAlgoOptions): OverlayItem[] {
  return buildVifvgUAlgoBundle(candles, timeframe, opts).overlays;
}
