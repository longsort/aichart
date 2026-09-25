/**
 * 15m 폭락감시 + 윗꼬리 + 저항추정≥70 + 직전 거래량 매도(빨강) → 숏.
 * BTC/ETH/BNB/XRP/SOL 코인별 추가 경로 (기존 신호 유지).
 * 마감봉만 · 확정 수익·승률 아님.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { detectMtfDumpCeilingZone } from '@/lib/mergedDeskMtfDumpZoneBridge';
import {
  DUMP_LIFE_KO,
  evaluateDumpLifeCycle,
  type DumpLifeState,
} from '@/lib/mergedDeskDumpLifeCycle';
import { roeTargetPrice } from '@/lib/mergedDeskAutoScalpEngine';
import {
  FAST_SL_ROE_PCT,
  FAST_TP1_ROE_PCT,
} from '@/lib/mergedDeskAutoTradeConfig';
import {
  WICK_ZONE_MIN_FRAC,
  resolveWick15mLeverage,
  wickRoeStopPrice,
} from '@/lib/mergedDeskWick15mTrade';
import { aiZoneDualEstimateWait } from '@/lib/mergedDeskAiZoneDualWait';
import { snapVolBarAt } from '@/lib/mergedDeskVolBurstRoeStats';
import { estimateBarBuySell } from '@/lib/volumeDirectionStats';

export const DUMP_WATCH_WICK_TF = '15m';
export const DUMP_WATCH_WICK_PCT_MIN = 70;
/** 직전 마감봉 포함 연속 매도 거래량 봉 수 */
export const DUMP_WATCH_WICK_SELL_BARS = 3;
export const DUMP_WATCH_WICK_SOURCE = 'dump-watch-wick' as const;

export const DUMP_WATCH_WICK_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'SOLUSDT',
] as const;

export type DumpWatchWickSignal = {
  symbol: string;
  timeframe: typeof DUMP_WATCH_WICK_TF;
  direction: 'SHORT';
  entry: number;
  sl: number;
  tp1: number;
  signalId: string;
  noteKo: string;
  closedBarTime: number;
  shortPct: number;
  longPct: number;
  zoneBot: number;
  zoneTop: number;
  lifeState: DumpLifeState;
  upperWickPct: number;
  sellVolBars: number;
};

function touches(c: Candle, bot: number, top: number): boolean {
  const hi = Number(c.high);
  const lo = Number(c.low);
  if (!(hi > 0) || !(lo > 0)) return false;
  return lo <= top && hi >= bot;
}

function nearZone(closePx: number, bot: number, top: number, pad: number): boolean {
  return closePx >= bot - pad && closePx <= top + pad;
}

function barSellTone(candles: Candle[], idx: number): boolean {
  const snap = snapVolBarAt(candles, idx);
  if (snap) return snap.tone === 'sell';
  const c = candles[idx];
  if (!c) return false;
  return estimateBarBuySell(c).direction === 'sell';
}

/** 마감봉 포함 연속 N봉 거래량 매도(빨강) */
export function consecutiveSellVolBars(
  candles: Candle[],
  closedIdx: number,
  need: number = DUMP_WATCH_WICK_SELL_BARS
): number {
  let n = 0;
  for (let i = 0; i < need; i++) {
    const idx = closedIdx - i;
    if (idx < 0 || !barSellTone(candles, idx)) break;
    n += 1;
  }
  return n;
}

function coinLabel(symbol: string): string {
  const s = String(symbol || '')
    .toUpperCase()
    .replace(/USDT$/, '')
    .replace(/[^A-Z0-9]/g, '');
  return s || 'ALT';
}

/**
 * 15m 마감봉 · 폭락감시(ceiling) 터치 + 윗꼬리 + 숏추정≥70 + 연속 매도거래량 → SHORT.
 */
export function scanDumpWatchWickShortOnClosedBar(params: {
  symbol: string;
  candles: Candle[];
  longPct?: number | null;
  shortPct?: number | null;
  leverage?: number | null;
  pctMin?: number;
  sellBarsNeed?: number;
  tp1RoePct?: number;
  slRoePct?: number;
}): DumpWatchWickSignal | null {
  const raw = params.candles;
  if (!Array.isArray(raw) || raw.length < 20) return null;

  /** 진행봉 제외 */
  const candles = raw.slice(0, -1);
  const n = candles.length;
  if (n < 18) return null;
  const closedIdx = n - 1;
  const closed = candles[closedIdx]!;
  const prev = candles[closedIdx - 1];

  const openPx = Number(closed.open);
  const closePx = Number(closed.close);
  const hi = Number(closed.high);
  const lo = Number(closed.low);
  const closedT = Number(closed.time) || 0;
  if (!(closePx > 0) || !(hi > lo) || !(closedT > 0)) return null;

  const longPct = Math.max(0, Math.min(100, Number(params.longPct) || 0));
  const shortPct = Math.max(0, Math.min(100, Number(params.shortPct) || 0));
  const pctMin = Math.max(50, Math.min(95, Number(params.pctMin) || DUMP_WATCH_WICK_PCT_MIN));
  if (shortPct < pctMin) return null;

  const lev = resolveWick15mLeverage(params.leverage);
  const dual = aiZoneDualEstimateWait({
    longPct,
    shortPct,
    price: closePx,
    leverage: lev,
    direction: 'SHORT',
  });
  if (dual.wait) return null;

  const tf = normalizeChartTimeframe(DUMP_WATCH_WICK_TF);
  const ceiling = detectMtfDumpCeilingZone(candles, tf);
  if (!ceiling || !(ceiling.top > ceiling.bot)) return null;

  const life = evaluateDumpLifeCycle({
    chartCandles: candles,
    top: ceiling.top,
    bot: ceiling.bot,
    mid: ceiling.mid,
    bandRole: 'ceiling',
  });
  /** 폭락감시·저항감시·저항확정만 (상승/반등 확정 제외) */
  const watchOk =
    life.state === 'WATCH' ||
    life.state === 'RESIST_WATCH' ||
    life.state === 'CONFIRM_RESIST';
  if (!watchOk) return null;

  const pad = Math.max((ceiling.top - ceiling.bot) * 0.2, ceiling.mid * 0.001);
  const touched =
    touches(closed, ceiling.bot, ceiling.top) ||
    (prev ? touches(prev, ceiling.bot, ceiling.top) : false) ||
    nearZone(closePx, ceiling.bot, ceiling.top, pad) ||
    nearZone(hi, ceiling.bot, ceiling.top, pad);
  if (!touched) return null;

  const range = hi - lo;
  const body = Math.max(Math.abs(closePx - openPx), range * 0.01);
  const upperWick = hi - Math.max(openPx, closePx);
  const lowerWick = Math.min(openPx, closePx) - lo;
  const upperFrac = upperWick / range;
  const upperWickOk =
    upperFrac >= WICK_ZONE_MIN_FRAC &&
    upperWick >= body * 0.35 &&
    upperWick >= lowerWick * 0.85;
  if (!upperWickOk) return null;

  /** 종가가 봉 중반 이하 — 거절 후 재상승 몸통 방지 */
  const mid = (hi + lo) / 2;
  if (closePx > mid) return null;

  const need = Math.max(2, Math.min(5, Number(params.sellBarsNeed) || DUMP_WATCH_WICK_SELL_BARS));
  const sellN = consecutiveSellVolBars(candles, closedIdx, need);
  if (sellN < need) return null;

  const tpRoe = Math.max(3, Math.min(20, Number(params.tp1RoePct) || FAST_TP1_ROE_PCT));
  const slRoe = Math.max(5, Math.min(40, Number(params.slRoePct) || FAST_SL_ROE_PCT));
  const tp1 = roeTargetPrice(closePx, 'SHORT', lev, tpRoe / 100);
  const sl = wickRoeStopPrice(closePx, 'SHORT', lev, slRoe);
  if (!(sl > closePx) || !(tp1 < closePx)) return null;

  const sym = String(params.symbol || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const symbol = sym.endsWith('USDT') ? sym : `${sym}USDT`;
  const chip = coinLabel(symbol);
  const lifeKo = DUMP_LIFE_KO[life.state] || '폭락감시';
  const signalId = `dwwick-${symbol}-SHORT-${Math.round(closedT)}`;

  return {
    symbol,
    timeframe: DUMP_WATCH_WICK_TF,
    direction: 'SHORT',
    entry: closePx,
    sl,
    tp1,
    signalId,
    noteKo: `${chip} 15m 폭락감시+윗꼬리+저항${shortPct.toFixed(0)}%≥${pctMin}%+매도량${sellN} · ${lifeKo} · ${lev}x · SL-${slRoe}%ROE · TP+${tpRoe}%ROE`,
    closedBarTime: closedT,
    shortPct,
    longPct,
    zoneBot: ceiling.bot,
    zoneTop: ceiling.top,
    lifeState: life.state,
    upperWickPct: upperFrac * 100,
    sellVolBars: sellN,
  };
}

export function listDumpWatchWickSymbols(enabled?: string[] | null): string[] {
  const base = [...DUMP_WATCH_WICK_SYMBOLS];
  if (!enabled?.length) return base;
  const set = new Set(enabled.map((s) => String(s).toUpperCase()));
  return base.filter((s) => set.has(s));
}
