/**
 * 마감·안착 — SMC **$$$$ 돈구간**(유동성 풀) zone 표시 (교육·참고).
 * 그림과 동일 개념: EQH/EQL(등고·등저), 인듀스먼트, 내부구간 유동성, 스윕.
 */
import type { Candle, OverlayItem } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { capZoneVerticalSpan, monthDeskZoneLookbackBars } from '@/lib/monthDeskZonePrecision';
import { monthDeskTrainerMoneyColors } from '@/lib/monthDeskChartTrainerTheme';

export const MONTH_DESK_MONEY_LABEL = '$$$$';

/** 차트·카드에 붙는 방향 접두 (롱=등저·매도 유동성 / 숏=등고·매수 유동성) */
export function monthDeskMoneySideKo(side: 'LONG' | 'SHORT'): string {
  return side === 'LONG' ? '롱' : '숏';
}

export function monthDeskMoneyChartLabel(side: 'LONG' | 'SHORT', extra?: string): string {
  const base = `${monthDeskMoneySideKo(side)} ${MONTH_DESK_MONEY_LABEL}`;
  return extra ? `${base} · ${extra}` : base;
}

/** 돈구간 방향 = 스윕 후 관찰 시나리오 (확정 매매 아님) */
export function monthDeskMoneyDirectionHint(side: 'LONG' | 'SHORT'): string {
  return side === 'LONG'
    ? '등저(EQL)·매도측 유동성 — 아래 스윕(×) 후 반등·롱 관찰'
    : '등고(EQH)·매수측 유동성 — 위 스윕(×) 후 하락·숏 관찰';
}

export const MONTH_DESK_CORE_MONEY_ENTRY_ID = 'month-desk-core-money-entry';

export function monthDeskCoreMoneyEntryLabel(side: 'LONG' | 'SHORT', _priceMid?: number): string {
  return side === 'LONG' ? `★핵심롱·${MONTH_DESK_MONEY_LABEL}` : `★핵심숏·${MONTH_DESK_MONEY_LABEL}`;
}

/** 현재가·강도 기준 단일 핵심 $$$$ 풀 (타점 zone 1개) */
export function pickMonthDeskCoreMoneyPool(
  pools: Array<MonthDeskMoneyZone & { displayRank?: number; strength: number }>,
  preferSide?: 'LONG' | 'SHORT' | null,
  close?: number
): (MonthDeskMoneyZone & { displayRank?: number; strength: number }) | null {
  if (!pools.length) return null;
  const ranked = [...pools].sort((a, b) => b.strength - a.strength);
  if (preferSide === 'LONG' || preferSide === 'SHORT') {
    const sidePool = ranked.find((p) => p.side === preferSide);
    if (sidePool) return sidePool;
  }
  if (close != null && Number.isFinite(close)) {
    let best = ranked[0]!;
    let bestDist = Infinity;
    for (const p of ranked) {
      const d = Math.abs(p.priceMid - close);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }
  return ranked[0]!;
}

export type MonthDeskMoneyPoolKind =
  | 'eqh'
  | 'eql'
  | 'eqh_cluster'
  | 'eql_cluster'
  | 'inducement'
  | 'internal_trend'
  | 'sweep';

export type MonthDeskMoneyZone = {
  side: 'LONG' | 'SHORT';
  priceTop: number;
  priceBot: number;
  priceMid: number;
  poolKind: MonthDeskMoneyPoolKind;
  swept: boolean;
  barTimeStart: number;
  barTimeEnd: number;
  strength: number;
  headlineKo: string;
  /** 등고/등저 터치 개수 */
  touchCount: number;
  /** 유동성 터치 스윙 봉 시각·인덱스 */
  anchorTimes?: number[];
  anchorBarIndices?: number[];
  /** internal_trend: 대각 추세선 끝점 */
  trendTime1?: number;
  trendPrice1?: number;
  trendTime2?: number;
  trendPrice2?: number;
};

export type MonthDeskMoneyZoneHud = {
  long: MonthDeskMoneyZone | null;
  short: MonthDeskMoneyZone | null;
  pools: MonthDeskMoneyZone[];
};

type Swing = { type: 'high' | 'low'; index: number; price: number; time: number };

function atr14(candles: Candle[]): number {
  const n = candles.length;
  if (n < 16) {
    const last = candles[n - 1];
    return Math.max((last?.high ?? 0) - (last?.low ?? 0), (last?.close ?? 1) * 0.004);
  }
  let sum = 0;
  for (let i = n - 14; i < n; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  return sum / 14;
}

function collectSwings(candles: Candle[], L: number, start: number, end: number): Swing[] {
  const out: Swing[] = [];
  const i0 = Math.max(L, start);
  const i1 = Math.min(end, candles.length - L - 1);
  for (let i = i0; i <= i1; i++) {
    let isH = true;
    let isL = true;
    for (let k = 1; k <= L; k++) {
      if (candles[i - k].high >= candles[i].high) isH = false;
      if (candles[i + k].high > candles[i].high) isH = false;
      if (candles[i - k].low <= candles[i].low) isL = false;
      if (candles[i + k].low < candles[i].low) isL = false;
    }
    if (isH) out.push({ type: 'high', index: i, price: candles[i].high, time: Number(candles[i].time) });
    if (isL) out.push({ type: 'low', index: i, price: candles[i].low, time: Number(candles[i].time) });
  }
  return out.sort((a, b) => a.index - b.index);
}

function priceTol(ref: number, chartTf: string): number {
  if (chartTf === '1w' || chartTf === '1M') return 0.0035;
  if (chartTf === '1d') return 0.0028;
  return 0.0022;
}

function bandAround(price: number, atr: number, ref: number, touchSpan?: number, chartTf?: string): {
  top: number;
  bot: number;
} {
  const t = normalizeChartTimeframe(chartTf ?? '4h');
  const touchHalf = touchSpan ? Math.min(touchSpan * 0.28, atr * 0.22) : 0;
  const half = Math.max(atr * 0.11, ref * 0.0009, touchHalf);
  const raw = { top: price + half, bot: price - half };
  const maxSpan =
    t === '1w' || t === '1M'
      ? Math.max(atr * 0.38, ref * 0.0038)
      : t === '1d'
        ? Math.max(atr * 0.34, ref * 0.0032)
        : Math.max(atr * 0.3, ref * 0.0026);
  return capZoneVerticalSpan(raw.top, raw.bot, price, maxSpan);
}

/** 차트 $$$$ 면 — 과도한 세로 폭 클램프 */
export function tightenMoneyZoneVerticalSpan(
  top: number,
  bot: number,
  mid: number,
  atr: number,
  chartTf?: string
): { top: number; bot: number } {
  const ref = Math.max(Math.abs(mid), 1e-9);
  const t = normalizeChartTimeframe(chartTf ?? '4h');
  const maxSpan =
    t === '1w' || t === '1M'
      ? Math.max(atr * 0.36, ref * 0.0035)
      : t === '1d'
        ? Math.max(atr * 0.32, ref * 0.003)
        : Math.max(atr * 0.28, ref * 0.0025);
  return capZoneVerticalSpan(top, bot, mid, maxSpan);
}

function wasSweptBuySide(candles: Candle[], poolPrice: number, fromIdx: number, end: number): boolean {
  for (let j = Math.max(fromIdx, end - 16); j <= end; j++) {
    const c = candles[j];
    if (c.high > poolPrice && c.close < poolPrice) return true;
  }
  return false;
}

function wasSweptSellSide(candles: Candle[], poolPrice: number, fromIdx: number, end: number): boolean {
  for (let j = Math.max(fromIdx, end - 16); j <= end; j++) {
    const c = candles[j];
    if (c.low < poolPrice && c.close > poolPrice) return true;
  }
  return false;
}

/** 등고/등저 스윙을 가격 클러스터로 묶음 (2개 이상 = $$$$ 존) */
function clusterSwings(swings: Swing[], tolFrac: number): Swing[][] {
  if (swings.length < 2) return [];
  const sorted = [...swings].sort((a, b) => a.price - b.price);
  const clusters: Swing[][] = [];
  let cur: Swing[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i]!;
    const ref = cur[0]!.price;
    if (Math.abs(s.price - ref) / Math.max(ref, 1e-12) <= tolFrac) {
      cur.push(s);
    } else {
      if (cur.length >= 2) clusters.push([...cur].sort((a, b) => a.index - b.index));
      cur = [s];
    }
  }
  if (cur.length >= 2) clusters.push([...cur].sort((a, b) => a.index - b.index));
  return clusters;
}

function zoneFromCluster(
  cluster: Swing[],
  side: 'LONG' | 'SHORT',
  kind: MonthDeskMoneyPoolKind,
  candles: Candle[],
  end: number,
  close: number,
  atr: number,
  chartTf: string
): MonthDeskMoneyZone {
  const prices = cluster.map((s) => s.price);
  const poolPrice = side === 'SHORT' ? Math.max(...prices) : Math.min(...prices);
  const tStart = Math.min(...cluster.map((s) => s.time));
  const lastIdx = cluster[cluster.length - 1]!.index;
  const span = Math.max(...prices) - Math.min(...prices);
  const band = bandAround(poolPrice, atr, close, span, chartTf);
  const swept =
    side === 'SHORT'
      ? wasSweptBuySide(candles, poolPrice, lastIdx, end)
      : wasSweptSellSide(candles, poolPrice, lastIdx, end);
  const dist = Math.abs(close - poolPrice);
  const strength =
    (swept ? 45 : 0) +
    cluster.length * 8 +
    Math.max(0, 38 - (dist / atr) * 7) +
    (kind.includes('cluster') ? 12 : 0);
  const kindKo =
    side === 'SHORT'
      ? cluster.length >= 3
        ? '매수측 유동성(등고점 다중)'
        : '매수측 유동성(EQH)'
      : cluster.length >= 3
        ? '매도측 유동성(등저점 다중)'
        : '매도측 유동성(EQL)';

  return {
    side,
    priceTop: band.top,
    priceBot: band.bot,
    priceMid: poolPrice,
    poolKind: kind,
    swept,
    barTimeStart: tStart,
    barTimeEnd: Number(candles[lastIdx]?.time),
    strength,
    touchCount: cluster.length,
    anchorTimes: cluster.map((s) => s.time),
    anchorBarIndices: cluster.map((s) => s.index),
    headlineKo: `${MONTH_DESK_MONEY_LABEL} ${side === 'LONG' ? '롱' : '숏'} · ${kindKo}${swept ? ' · 스윕' : ''}`,
  };
}

/** 되돌림 구간 내부 고점/저점 추세선 유동성 (그림의 $$$ 대각선) */
function detectInternalTrendLiquidity(
  swings: Swing[],
  side: 'LONG' | 'SHORT',
  candles: Candle[],
  end: number,
  close: number,
  atr: number,
  chartTf: string
): MonthDeskMoneyZone | null {
  const seq = swings.filter((s) => (side === 'SHORT' ? s.type === 'high' : s.type === 'low'));
  if (seq.length < 3) return null;
  const recent = seq.filter((s) => s.index >= Math.max(0, end - 220));
  if (recent.length < 3) return null;

  let bestRun: Swing[] = [];
  for (let i = 0; i < recent.length - 2; i++) {
    const run: Swing[] = [recent[i]!];
    for (let j = i + 1; j < recent.length; j++) {
      const ok =
        side === 'SHORT'
          ? recent[j]!.price <= run[run.length - 1]!.price + atr * 0.15
          : recent[j]!.price >= run[run.length - 1]!.price - atr * 0.15;
      if (!ok) break;
      run.push(recent[j]!);
    }
    if (run.length > bestRun.length) bestRun = run;
  }
  if (bestRun.length < 3) return null;

  const prices = bestRun.map((s) => s.price);
  const poolPrice = side === 'SHORT' ? Math.max(...prices) : Math.min(...prices);
  const tStart = bestRun[0]!.time;
  const lastIdx = bestRun[bestRun.length - 1]!.index;
  const band = bandAround(poolPrice, atr, close, Math.max(...prices) - Math.min(...prices), chartTf);
  const swept =
    side === 'SHORT'
      ? wasSweptBuySide(candles, poolPrice, lastIdx, end)
      : wasSweptSellSide(candles, poolPrice, lastIdx, end);

  const first = bestRun[0]!;
  const last = bestRun[bestRun.length - 1]!;
  return {
    side,
    priceTop: band.top,
    priceBot: band.bot,
    priceMid: poolPrice,
    poolKind: 'internal_trend',
    swept,
    barTimeStart: tStart,
    barTimeEnd: Number(candles[end]?.time),
    strength: 55 + bestRun.length * 5 + (swept ? 20 : 0),
    touchCount: bestRun.length,
    trendTime1: first.time,
    trendPrice1: first.price,
    trendTime2: last.time,
    trendPrice2: last.price,
    anchorTimes: bestRun.map((s) => s.time),
    anchorBarIndices: bestRun.map((s) => s.index),
    headlineKo: `${MONTH_DESK_MONEY_LABEL} ${side === 'LONG' ? '롱' : '숏'} · 내부구간 유동성(추세선)`,
  };
}

export function detectMonthDeskMoneyZones(
  candles: Candle[],
  timeframe?: string,
  swingPivot = 2,
  maxPools = 4
): MonthDeskMoneyZoneHud {
  const empty: MonthDeskMoneyZoneHud = { long: null, short: null, pools: [] };
  const n = candles.length;
  if (n < 24) return empty;

  const chartTf = normalizeChartTimeframe(timeframe ?? '4h');
  const L = Math.max(2, Math.min(4, Math.floor(swingPivot || 2)));
  const lookback = monthDeskZoneLookbackBars(chartTf, Math.min(320, n - L - 2));
  const start = Math.max(L, n - lookback);
  const end = n - 1;
  const close = Number(candles[end]?.close);
  const atr = atr14(candles);
  if (!Number.isFinite(close) || atr <= 0) return empty;

  const tol = priceTol(close, chartTf);
  const swings = collectSwings(candles, L, start, end);
  const highs = swings.filter((s) => s.type === 'high');
  const lows = swings.filter((s) => s.type === 'low');

  const pools: MonthDeskMoneyZone[] = [];

  for (const cluster of clusterSwings(highs, tol)) {
    pools.push(zoneFromCluster(cluster, 'SHORT', 'eqh_cluster', candles, end, close, atr, chartTf));
  }
  for (const cluster of clusterSwings(lows, tol)) {
    pools.push(zoneFromCluster(cluster, 'LONG', 'eql_cluster', candles, end, close, atr, chartTf));
  }

  const internalShort = detectInternalTrendLiquidity(highs, 'SHORT', candles, end, close, atr, chartTf);
  const internalLong = detectInternalTrendLiquidity(lows, 'LONG', candles, end, close, atr, chartTf);
  if (internalShort) pools.push(internalShort);
  if (internalLong) pools.push(internalLong);

  const deduped: MonthDeskMoneyZone[] = [];
  for (const p of pools.sort((a, b) => b.strength - a.strength)) {
    const overlap = deduped.some(
      (d) =>
        d.side === p.side &&
        Math.abs(d.priceMid - p.priceMid) / Math.max(p.priceMid, 1e-12) < tol * 1.2
    );
    if (!overlap) deduped.push(p);
    if (deduped.length >= maxPools) break;
  }

  const long = deduped.filter((p) => p.side === 'LONG').sort((a, b) => b.strength - a.strength)[0] ?? null;
  const short = deduped.filter((p) => p.side === 'SHORT').sort((a, b) => b.strength - a.strength)[0] ?? null;

  return { long, short, pools: deduped };
}

export function buildMonthDeskMoneyZoneOverlays(
  hud: MonthDeskMoneyZoneHud,
  candles: Candle[]
): OverlayItem[] {
  const out: OverlayItem[] = [];
  const n = candles.length;
  if (n < 2 || !hud.pools.length) return out;
  const tEnd = Number(candles[n - 1]?.time);

  hud.pools.forEach((z, idx) => {
    const isLong = z.side === 'LONG';
    const t1 = Math.min(z.barTimeStart, tEnd);
    const sideTag = isLong ? 'long' : 'short';
    const tc = monthDeskTrainerMoneyColors(isLong);
    const fill = tc.fill;
    const border = tc.border;

    out.push({
      id: `month-desk-money-${sideTag}-${idx}-zone`,
      kind: 'zone',
      label: `${MONTH_DESK_MONEY_LABEL} ${isLong ? '롱' : '숏'}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: tEnd,
      price1: z.priceTop,
      price2: z.priceBot,
      confidence: Math.min(96, Math.round(z.strength)),
      color: fill,
      category: 'scenario',
      labelTooltip: [
        z.headlineKo,
        `가격 ${fmt(z.priceBot)} ~ ${fmt(z.priceTop)} · 터치 ${z.touchCount}`,
        z.swept ? '스윕(×) 후 반전 관찰 — 유동성 흡수' : '유동성 풀 — 스윕 전·유인 구간',
        'SMC 교육·참고 — 확정 매매 아님',
      ].join('\n'),
      zoneFillPreserve: true,
      zonePulse: z.swept,
      lineLabelColor: tc.borderGold,
      labelBackgroundColor: tc.bg,
      labelTextColor: tc.text,
      overlayZoneExtraClass: `overlay-zone--monthdesk-money overlay-zone--monthdesk-money--${sideTag} overlay-zone--monthdesk-money--pool`,
    });

    const isInternalTrend =
      z.poolKind === 'internal_trend' &&
      z.trendTime1 != null &&
      z.trendPrice1 != null &&
      z.trendTime2 != null &&
      z.trendPrice2 != null;

    out.push({
      id: `month-desk-money-${sideTag}-${idx}-line`,
      kind: 'trendLine',
      label: MONTH_DESK_MONEY_LABEL,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: isInternalTrend ? z.trendTime1! : t1,
      time2: isInternalTrend ? z.trendTime2! : tEnd,
      price1: isInternalTrend ? z.trendPrice1! : z.priceMid,
      price2: isInternalTrend ? z.trendPrice2! : z.priceMid,
      confidence: 90,
      color: tc.line,
      lineLabelColor: tc.text,
      lineDash: '6 4',
      category: 'scenario',
      labelTooltip: z.headlineKo,
      noProject: !isInternalTrend,
    });

    if (!isInternalTrend) {
      out.push({
        id: `month-desk-money-${sideTag}-${idx}-hline`,
        kind: 'trendLine',
        label: '',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        time1: t1,
        time2: tEnd,
        price1: z.priceMid,
        price2: z.priceMid,
        confidence: 85,
        color: tc.lineSoft,
        lineDash: '4 6',
        category: 'scenario',
        noProject: true,
      });
    }

    const labelTime = z.barTimeStart + (tEnd - t1) * 0.55;
    out.push({
      id: `month-desk-money-${sideTag}-${idx}-mark`,
      kind: 'label',
      label: MONTH_DESK_MONEY_LABEL,
      x1: 0,
      y1: 0,
      time1: labelTime,
      price1: z.priceMid + (z.priceTop - z.priceMid) * (isLong ? 0.55 : 0.45),
      confidence: 92,
      color: tc.text,
      lineLabelColor: tc.borderGold,
      labelBackgroundColor: tc.markBg,
      labelTextColor: tc.text,
      category: 'scenario',
      labelTooltip: z.headlineKo,
      noProject: true,
    });
  });

  return out;
}

function relPriceDiff(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-9);
}

export type MonthDeskHistoricalMoneyZoneOptions = {
  /** 핵심타점과 동일 풀이면 제외 */
  excludePriceMid?: number | null;
  maxPerSide?: number;
  timeframe?: string;
};

/**
 * HTF·주봉·월봉 — 현재 타점 외 과거 $$$$ 풀(하방·상방 구간) 참고 zone.
 */
export function buildMonthDeskHistoricalMoneyZoneOverlays(
  hud: MonthDeskMoneyZoneHud,
  candles: Candle[],
  options?: MonthDeskHistoricalMoneyZoneOptions
): OverlayItem[] {
  const n = candles.length;
  if (n < 12 || !hud.pools.length) return [];

  const tEnd = Number(candles[n - 1]?.time);
  const tChartStart = Number(candles[0]?.time);
  if (!Number.isFinite(tEnd)) return [];

  const maxPer = Math.max(1, Math.min(3, options?.maxPerSide ?? 2));
  const excl = options?.excludePriceMid;
  const chartTf = normalizeChartTimeframe(options?.timeframe ?? '4h');
  const out: OverlayItem[] = [];

  const emitSide = (side: 'LONG' | 'SHORT', pools: MonthDeskMoneyZone[]) => {
    let nOut = 0;
    for (let i = 0; i < pools.length; i++) {
      const z = pools[i]!;
      if (excl != null && Number.isFinite(excl) && relPriceDiff(z.priceMid, excl) < 0.018) continue;
      const sideTag = side === 'LONG' ? 'long' : 'short';
      const t1 = Math.min(
        z.barTimeStart,
        Number.isFinite(tChartStart) ? tChartStart : z.barTimeStart,
        tEnd
      );
      const atrHint = Math.max((z.priceTop - z.priceBot) * 0.5, z.priceMid * 0.003);
      const tight = tightenMoneyZoneVerticalSpan(z.priceTop, z.priceBot, z.priceMid, atrHint, chartTf);
      out.push({
        id: `month-desk-history-money-${sideTag}-${nOut}-zone`,
        kind: side === 'LONG' ? 'demandZone' : 'supplyZone',
        label: side === 'LONG' ? `과거·핵심롱` : `과거·핵심숏`,
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        time1: t1,
        time2: tEnd,
        price1: tight.top,
        price2: tight.bot,
        confidence: Math.min(72, Math.round(z.strength * 0.85)),
        color: side === 'LONG' ? 'rgba(250,204,21,0.1)' : 'rgba(251,191,36,0.09)',
        category: 'scenario',
        labelTooltip: [
          `과거 ${z.headlineKo}`,
          `가격 ${fmt(z.priceBot)} ~ ${fmt(z.priceTop)}`,
          '차트 좌측·하방/상방 참고 — 현재 타점과 별도',
          '교육·참고 — 확정 매매 아님',
        ].join('\n'),
        zoneFillPreserve: true,
        lineLabelColor: side === 'LONG' ? 'rgba(74,222,128,0.55)' : 'rgba(248,113,113,0.55)',
        overlayZoneExtraClass: `overlay-zone--monthdesk-history-money overlay-zone--monthdesk-history-money--${sideTag}`,
        noProject: true,
      });
      nOut++;
      if (nOut >= maxPer) break;
    }
  };

  const longPools = hud.pools.filter((p) => p.side === 'LONG').sort((a, b) => b.strength - a.strength);
  const shortPools = hud.pools.filter((p) => p.side === 'SHORT').sort((a, b) => b.strength - a.strength);
  emitSide('LONG', longPools);
  emitSide('SHORT', shortPools);

  return out;
}

function fmt(p: number): string {
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

export function monthDeskMoneyZoneHudLines(hud: MonthDeskMoneyZoneHud): string[] {
  const lines: string[] = [];
  for (const p of hud.pools.slice(0, 4)) {
    lines.push(
      `${p.side === 'LONG' ? '롱' : '숏'} ${MONTH_DESK_MONEY_LABEL} ${fmt(p.priceMid)}${p.swept ? '·스윕' : ''}`
    );
  }
  return lines;
}
