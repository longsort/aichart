/**
 * BNB 3m·5m·15m SFP 자동매매.
 * 스윙 스윕+회수(SFP) → 롱/숏 · SL=스윕 바깥+헌팅버퍼 · TP ROE 5%.
 * 추가: 마감봉만 · 최소스윕깊이 · 종가회수품질 · AI추정≥55% · RR.
 * 확정 수익·승률 아님.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { buildMergedDeskBlueRedChannels } from '@/lib/mergedDeskBlueRedChannels';
import { detectRbRailSfp } from '@/lib/mergedDeskRbEdgeConfluenceGate';
import { roeTargetPrice } from '@/lib/mergedDeskAutoScalpEngine';
import { listProfileLiveTfs } from '@/lib/mergedDeskCoinExitProfile';

export const BNB_SFP_AUTO_TFS = ['3m', '5m', '15m'] as const;
export const BNB_SFP_SYMBOL = 'BNBUSDT';
export const BNB_SFP_TP1_ROE_PCT = 5;
export const BNB_SFP_AI_MIN_PCT = 55;

export function listBnbSfpAutoTimeframes(): string[] {
  /** 통계 프로파일 skip/prefer 반영 · 없으면 3m·5m */
  return listProfileLiveTfs(BNB_SFP_SYMBOL, ['3m', '5m']);
}

function atr14(candles: Candle[]): number {
  const n = candles.length;
  if (n < 5) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    s += Math.max(a.high - a.low, Math.abs(a.high - b.close), Math.abs(a.low - b.close));
    c += 1;
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
}

function swingLow(candles: Candle[], end: number, look: number): { price: number; i: number } | null {
  const from = Math.max(2, end - look);
  let bestI = -1;
  let best = Infinity;
  for (let i = from; i <= end - 2; i++) {
    const p = Number(candles[i]!.low);
    if (!(p > 0)) continue;
    const l1 = Number(candles[i - 1]?.low) || p;
    const l2 = Number(candles[i + 1]?.low) || p;
    if (p <= l1 && p <= l2 && p < best) {
      best = p;
      bestI = i;
    }
  }
  return bestI >= 0 ? { price: best, i: bestI } : null;
}

function swingHigh(candles: Candle[], end: number, look: number): { price: number; i: number } | null {
  const from = Math.max(2, end - look);
  let bestI = -1;
  let best = -Infinity;
  for (let i = from; i <= end - 2; i++) {
    const p = Number(candles[i]!.high);
    if (!(p > 0)) continue;
    const h1 = Number(candles[i - 1]?.high) || p;
    const h2 = Number(candles[i + 1]?.high) || p;
    if (p >= h1 && p >= h2 && p > best) {
      best = p;
      bestI = i;
    }
  }
  return bestI >= 0 ? { price: best, i: bestI } : null;
}

export type BnbSfpSignal = {
  symbol: typeof BNB_SFP_SYMBOL;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp1: number;
  sfpPrice: number;
  sweepExtreme: number;
  signalId: string;
  noteKo: string;
  slReasonKo: string;
  aiZonePct?: number;
  railConfirm: boolean;
  closedBarTime: number;
  tp1RoePct: number;
};

/**
 * 마감봉 SFP: 스윙 이탈(스윕) + 종가 회수.
 * LONG SL = 스윕저점 아래 · SHORT SL = 스윕고점 위 (스탑헌팅 버퍼).
 */
export function scanBnbSfpOnClosedBar(params: {
  candles: Candle[];
  timeframe: string;
  leverage?: number;
  minRr?: number;
  longPct?: number;
  shortPct?: number;
}): BnbSfpSignal | null {
  const candles = params.candles;
  const n = candles.length;
  if (n < 24) return null;
  const tf = normalizeChartTimeframe(params.timeframe);
  /** 마감봉만 (형성봉 제외) — 리페인트↓ */
  const iClosed = n - 2;
  const closed = candles[iClosed]!;
  const closedT = Number(closed.time) || 0;
  const closePx = Number(closed.close);
  const hi = Number(closed.high);
  const lo = Number(closed.low);
  if (!(closePx > 0) || !(closedT > 0) || !(hi > lo)) return null;

  const atr = atr14(candles.slice(0, iClosed + 1));
  const minSweep = Math.max(atr * 0.15, closePx * 0.00035);
  const hunt = Math.max(atr * 0.2, closePx * 0.0004);
  const range = hi - lo;
  const closePos = (closePx - lo) / range;

  const swL = swingLow(candles, iClosed, 28);
  const swH = swingHigh(candles, iClosed, 28);

  let direction: 'LONG' | 'SHORT' | null = null;
  let sfpPrice = 0;
  let sweepExtreme = 0;

  /** 롱 SFP: 스윙저 이탈 후 종가 회수 + 종가가 봉 상단쪽 */
  if (
    swL &&
    lo < swL.price - minSweep * 0.35 &&
    closePx > swL.price &&
    closePos >= 0.45
  ) {
    direction = 'LONG';
    sfpPrice = swL.price;
    sweepExtreme = lo;
  } else if (
    swH &&
    hi > swH.price + minSweep * 0.35 &&
    closePx < swH.price &&
    closePos <= 0.55
  ) {
    direction = 'SHORT';
    sfpPrice = swH.price;
    sweepExtreme = hi;
  }

  if (!direction) return null;

  /** 레일 SFP 같은 방향이면 보강(없어도 스윙SFP면 진입) */
  let railConfirm = false;
  try {
    const geoms = buildMergedDeskBlueRedChannels(candles.slice(0, iClosed + 1), tf).geoms;
    const geom = geoms.find((g) => g.primary) ?? geoms[0] ?? null;
    if (geom) {
      const rail = detectRbRailSfp(candles.slice(0, iClosed + 1), geom, atr);
      if (rail) {
        if (direction === 'LONG' && rail.side === 'bull') railConfirm = true;
        if (direction === 'SHORT' && rail.side === 'bear') railConfirm = true;
      }
    }
  } catch {
    /* ignore */
  }

  /** AI존 추정 게이트 (ETH 60보다 약간 완화 55 — SFP 자리 우선) */
  const longPct = Number(params.longPct) || 0;
  const shortPct = Number(params.shortPct) || 0;
  if (direction === 'LONG' && longPct > 0 && longPct < BNB_SFP_AI_MIN_PCT) return null;
  if (direction === 'SHORT' && shortPct > 0 && shortPct < BNB_SFP_AI_MIN_PCT) return null;

  const lev = Math.max(1, Math.min(125, Number(params.leverage) || 10));
  const tp1 = roeTargetPrice(closePx, direction, lev, BNB_SFP_TP1_ROE_PCT / 100);

  let sl: number;
  let slReasonKo: string;
  if (direction === 'LONG') {
    sl = Math.min(sweepExtreme, sfpPrice) - hunt;
    if (!(sl < closePx)) return null;
    slReasonKo = `롱SL · SFP스윕저 ${sweepExtreme.toFixed(2)} 아래(+헌팅) → ${sl.toFixed(2)}`;
  } else {
    sl = Math.max(sweepExtreme, sfpPrice) + hunt;
    if (!(sl > closePx)) return null;
    slReasonKo = `숏SL · SFP스윕고 ${sweepExtreme.toFixed(2)} 위(+헌팅) → ${sl.toFixed(2)}`;
  }

  const risk = Math.abs(closePx - sl);
  const reward = Math.abs(tp1 - closePx);
  const minRr = Math.max(1, Number(params.minRr) || 1.2);
  if (!(risk > 0) || reward / risk < minRr * 0.95) return null;

  const aiPct = direction === 'LONG' ? longPct : shortPct;
  const signalId = `bnb-sfp-${tf}-${direction}-${closedT}`;
  return {
    symbol: BNB_SFP_SYMBOL,
    timeframe: tf,
    direction,
    entry: closePx,
    sl,
    tp1,
    sfpPrice,
    sweepExtreme,
    signalId,
    noteKo: `BNB ${tf} SFP${direction === 'LONG' ? '롱' : '숏'}${railConfirm ? '+레일' : ''} · TP ROE ${BNB_SFP_TP1_ROE_PCT}%${aiPct > 0 ? ` · AI${aiPct.toFixed(0)}%` : ''}`,
    slReasonKo,
    aiZonePct: aiPct > 0 ? aiPct : undefined,
    railConfirm,
    closedBarTime: closedT,
    tp1RoePct: BNB_SFP_TP1_ROE_PCT,
  };
}
