/**
 * $$$$ 돈구간 — 분석 zone·라인·터치 캔들에 스냅(앵커).
 */
import type { Candle, OverlayItem } from '@/types';
import type { MonthDeskMoneyZone } from '@/lib/monthDeskMoneyZone';

export type MonthDeskMoneyPoolLike = MonthDeskMoneyZone & {
  anchorBarIndices?: number[];
  anchorTimes?: number[];
};

export type MonthDeskMoneyAnchor = {
  id: string;
  time1: number;
  time2: number;
  priceTop: number;
  priceBot: number;
  sideHint?: 'LONG' | 'SHORT';
};

export type MonthDeskMoneyPoolGeometry = {
  time1: number;
  time2: number;
  priceTop: number;
  priceBot: number;
  labelTime: number;
  labelPrice: number;
  /** 분석 zone에 붙었는지 */
  snappedToAnchorId?: string;
};

const ANCHOR_ID_PRIORITY = [
  'month-desk-unified-zone',
  'month-desk-typeom-core',
  'month-desk-typeom-pocket',
  'month-desk-plan-entry',
  'month-desk-plan-risk-zone',
  'month-desk-plan-reward-zone',
];

function isAnchorZone(o: OverlayItem): boolean {
  const kind = String(o.kind || '');
  const id = String(o.id || '');
  if (kind === 'zone' || kind === 'ob' || kind === 'supplyZone' || kind === 'demandZone') {
    if (id.startsWith('month-desk-')) return true;
    if (id.startsWith('phz-') && kind === 'zone') return true;
    if (id.startsWith('hotzone-') && kind === 'zone') return true;
  }
  return ANCHOR_ID_PRIORITY.includes(id);
}

function sideFromOverlay(o: OverlayItem): 'LONG' | 'SHORT' | undefined {
  const kind = String(o.kind || '');
  const id = String(o.id || '');
  if (kind === 'supplyZone' || id.includes('short') || id.includes('supply')) return 'SHORT';
  if (kind === 'demandZone' || id.includes('long') || id.includes('demand')) return 'LONG';
  return undefined;
}

export function extractMonthDeskMoneyAnchors(overlays: OverlayItem[]): MonthDeskMoneyAnchor[] {
  const out: MonthDeskMoneyAnchor[] = [];
  for (const o of overlays) {
    if (!isAnchorZone(o)) continue;
    const t1 = Number(o.time1);
    const t2 = Number(o.time2 ?? o.time1);
    const p1 = Number(o.price1);
    const p2 = Number(o.price2);
    if (![t1, t2, p1, p2].every((x) => Number.isFinite(x))) continue;
    out.push({
      id: String(o.id || ''),
      time1: Math.min(t1, t2),
      time2: Math.max(t1, t2),
      priceTop: Math.max(p1, p2),
      priceBot: Math.min(p1, p2),
      sideHint: sideFromOverlay(o),
    });
  }
  out.sort((a, b) => {
    const ia = ANCHOR_ID_PRIORITY.indexOf(a.id);
    const ib = ANCHOR_ID_PRIORITY.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return out;
}

function relDiff(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-9);
}

function barTimeAfter(candles: Candle[], idx: number, bars = 1): number {
  const j = Math.min(candles.length - 1, idx + bars);
  return Number(candles[j]?.time);
}

export function resolveMonthDeskMoneyPoolGeometry(
  z: MonthDeskMoneyPoolLike,
  candles: Candle[],
  anchors: MonthDeskMoneyAnchor[],
  opts?: { tightCore?: boolean }
): MonthDeskMoneyPoolGeometry {
  const n = candles.length;
  const end = n - 1;
  const indices =
    z.anchorBarIndices?.length ? z.anchorBarIndices : z.anchorTimes?.map((t) => candles.findIndex((c) => Number(c.time) === t)).filter((i) => i >= 0) ?? [];

  let time1 = z.barTimeStart;
  let time2 = z.barTimeEnd || z.barTimeStart;
  if (indices.length) {
    time1 = Number(candles[Math.min(...indices)]?.time);
    const lastIdx = Math.max(...indices);
    time2 = barTimeAfter(candles, lastIdx, 1);
  }

  let priceTop = z.priceTop;
  let priceBot = z.priceBot;
  if (indices.length && !opts?.tightCore) {
    const highs = indices.map((i) => candles[i]?.high).filter((x) => Number.isFinite(x)) as number[];
    const lows = indices.map((i) => candles[i]?.low).filter((x) => Number.isFinite(x)) as number[];
    if (highs.length && lows.length) {
      const swingTop = Math.max(...highs);
      const swingBot = Math.min(...lows);
      const mid = (swingTop + swingBot) / 2;
      const pad = Math.max((swingTop - swingBot) * 0.035, mid * 0.00035);
      priceTop = swingTop + pad;
      priceBot = swingBot - pad;
    }
  }

  const poolMid = (priceTop + priceBot) / 2;
  let snappedToAnchorId: string | undefined;
  if (opts?.tightCore) {
    const lastIdx = indices.length ? Math.max(...indices) : end;
    const labelTime = Number(candles[lastIdx]?.time) || time2;
    const labelCandle = candles[lastIdx] ?? candles[end];
    const labelPrice =
      z.side === 'SHORT'
        ? Number(labelCandle?.high ?? z.priceMid)
        : Number(labelCandle?.low ?? z.priceMid);
    return { time1, time2, priceTop, priceBot, labelTime, labelPrice, snappedToAnchorId };
  }
  for (const a of anchors) {
    const sideOk = !a.sideHint || a.sideHint === z.side;
    if (!sideOk) continue;
    const priceOverlap = poolMid <= a.priceTop && poolMid >= a.priceBot;
    const timeOverlap = time2 >= a.time1 && time1 <= a.time2;
    if (!priceOverlap && relDiff(poolMid, (a.priceTop + a.priceBot) / 2) > 0.04) continue;
    if (!timeOverlap && relDiff(time1, a.time1) > 0.15) continue;

    time1 = Math.min(time1, a.time1);
    time2 = Math.max(time2, a.time2);
    priceTop = Math.max(priceTop, a.priceTop);
    priceBot = Math.min(priceBot, a.priceBot);
    snappedToAnchorId = a.id;
    break;
  }

  const lastIdx = indices.length ? Math.max(...indices) : end;
  const labelTime = Number(candles[lastIdx]?.time) || time2;
  const labelCandle = candles[lastIdx] ?? candles[end];
  const labelPrice =
    z.side === 'SHORT'
      ? Number(labelCandle?.high ?? z.priceMid)
      : Number(labelCandle?.low ?? z.priceMid);

  return {
    time1,
    time2,
    priceTop,
    priceBot,
    labelTime,
    labelPrice,
    snappedToAnchorId,
  };
}
