/**
 * ETH 폭락존 3m·5m·15m 1년 walk-forward.
 * AI게이트는 히스토리에서 생략(구조만) · 실전은 AI≥60%.
 * 확정 승률·수익 아님.
 */
import type { Candle } from '@/types';
import {
  ETH_DUMP_TP1_ROE_PCT,
  scanDumpTouchOnClosedBar,
} from '@/lib/mergedDeskBgDumpTouchEngine';
import {
  aggregateCoinYearTrades,
  simulateTpSlTrade,
  strideForYearTf,
  type CoinYearAggPack,
  type YearSimTrade,
} from '@/lib/doksuri1/coinYearReplayShared';

export const ETH_DUMP_YEAR_SYMBOL = 'ETHUSDT';
export const ETH_DUMP_YEAR_TFS = ['3m', '5m', '15m'] as const;

function maxHold(tf: string): number {
  if (tf === '3m') return 40;
  if (tf === '5m') return 36;
  return 32;
}

function winBars(tf: string): number {
  if (tf === '3m') return 280;
  if (tf === '5m') return 240;
  return 200;
}

export function runEthDumpTfReplay(params: {
  candles: Candle[];
  timeframe: string;
  leverage: number;
}): YearSimTrade[] {
  const candles = params.candles;
  const tf = params.timeframe;
  const stride = strideForYearTf(tf);
  const WIN = winBars(tf);
  const hold = maxHold(tf);
  const trades: YearSimTrade[] = [];
  let nextOk = 48;
  const n = candles.length;

  for (let iClosed = 48; iClosed < n - hold - 2; iClosed += stride) {
    if (iClosed < nextOk) continue;
    const from = Math.max(0, iClosed - WIN + 1);
    /** slice 끝 = iClosed+1 (형성봉 자리) → closed = n-2 = iClosed */
    const slice = candles.slice(from, iClosed + 2);
    if (slice.length < 24) continue;
    const sig = scanDumpTouchOnClosedBar({
      symbol: ETH_DUMP_YEAR_SYMBOL,
      timeframe: tf,
      candles: slice,
      leverage: params.leverage,
      minRr: 1.2,
      tp1RoePctOverride: ETH_DUMP_TP1_ROE_PCT,
    });
    if (!sig) continue;

    const sim = simulateTpSlTrade({
      candles,
      fromIdx: iClosed,
      side: sig.direction,
      entry: sig.entry,
      stop: sig.sl,
      tp1: sig.tp1,
      maxHold: hold,
    });
    trades.push({
      timeframe: tf,
      direction: sig.direction,
      entryTime: sig.closedBarTime,
      entry: sig.entry,
      stop: sig.sl,
      tp1: sig.tp1,
      slDistPct: (Math.abs(sig.entry - sig.sl) / sig.entry) * 100,
      tpDistPct: (Math.abs(sig.tp1 - sig.entry) / sig.entry) * 100,
      ...sim,
      tag: 'dump-zone',
    });
    nextOk = iClosed + Math.max(stride * 2, sim.barsHeld);
  }
  return trades;
}

export function runEthDumpYearReplay(params: {
  byTf: Array<{ timeframe: string; candles: Candle[]; source?: string }>;
  leverage?: number;
}): CoinYearAggPack {
  const lev = params.leverage ?? 30;
  const all: YearSimTrade[] = [];
  const candleMeta: CoinYearAggPack['candleMeta'] = [];

  for (const row of params.byTf) {
    const c = row.candles;
    const from = Number(c[0]?.time) || 0;
    const to = Number(c[c.length - 1]?.time) || 0;
    candleMeta.push({
      timeframe: row.timeframe,
      count: c.length,
      days: from > 0 && to > from ? (to - from) / 86400 : 0,
      source: row.source,
    });
    all.push(
      ...runEthDumpTfReplay({
        candles: c,
        timeframe: row.timeframe,
        leverage: lev,
      })
    );
  }

  /** TP ROE 5% @ lev → 가격% (예: 5/30 ≈ 0.1667) · *100 버그 금지 */
  const fixedTpPricePct = ETH_DUMP_TP1_ROE_PCT / lev;

  return aggregateCoinYearTrades({
    symbol: ETH_DUMP_YEAR_SYMBOL,
    routeKo: '폭락존3·5·15',
    trades: all,
    baseLeverage: lev,
    candleMeta,
    fixedTpPricePct,
    preferTfs: ['5m', '3m'],
    skipTfs: ['15m'],
    hintKo:
      '폭락존 터치→존SL·TP는 MFE캡(ROE5%환산) · 15m통계열위→스킵권장 · 히스토리 AI생략 · 확정아님',
  });
}
