/**
 * BNB SFP 3m·5m·15m 1년 walk-forward.
 * 히스토리 AI% = 0 (게이트 스킵) · 실전은 AI≥55%.
 * 확정 승률·수익 아님.
 */
import type { Candle } from '@/types';
import {
  BNB_SFP_SYMBOL,
  BNB_SFP_TP1_ROE_PCT,
  scanBnbSfpOnClosedBar,
} from '@/lib/mergedDeskBnbSfpTrade';
import {
  aggregateCoinYearTrades,
  simulateTpSlTrade,
  strideForYearTf,
  type CoinYearAggPack,
  type YearSimTrade,
} from '@/lib/doksuri1/coinYearReplayShared';

export const BNB_SFP_YEAR_TFS = ['3m', '5m', '15m'] as const;

function maxHold(tf: string): number {
  if (tf === '3m') return 40;
  if (tf === '5m') return 36;
  return 32;
}

function winBars(tf: string): number {
  if (tf === '3m') return 260;
  if (tf === '5m') return 220;
  return 180;
}

export function runBnbSfpTfReplay(params: {
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
    const slice = candles.slice(from, iClosed + 2);
    if (slice.length < 28) continue;
    const sig = scanBnbSfpOnClosedBar({
      candles: slice,
      timeframe: tf,
      leverage: params.leverage,
      minRr: 1.2,
      longPct: 0,
      shortPct: 0,
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
      tag: sig.railConfirm ? 'sfp+rail' : 'sfp',
    });
    nextOk = iClosed + Math.max(stride * 2, sim.barsHeld);
  }
  return trades;
}

export function runBnbSfpYearReplay(params: {
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
      ...runBnbSfpTfReplay({
        candles: c,
        timeframe: row.timeframe,
        leverage: lev,
      })
    );
  }

  const fixedTpPricePct = BNB_SFP_TP1_ROE_PCT / lev;
  const railN = all.filter((t) => t.tag === 'sfp+rail').length;

  const pack = aggregateCoinYearTrades({
    symbol: BNB_SFP_SYMBOL,
    routeKo: 'SFP3·5·15',
    trades: all,
    baseLeverage: lev,
    candleMeta,
    fixedTpPricePct,
    preferTfs: ['5m', '3m'],
    skipTfs: ['15m'],
    hintKo: `SFP 스윕+회수 · SL헌팅 · TP=MFE캡(ROE5%환산) · 레일${railN} · 15m스킵권장 · 히스토리AI생략 · 확정아님`,
  });
  return pack;
}
