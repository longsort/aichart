/**
 * HTF 폭락존 터치 → 롱/숏 (코인별 추가 경로).
 * TF: 1h · 4h · 1d · 1w · 1M
 * floor → LONG · ceiling → SHORT
 * 터치마다 X · 신규터치 + 종가반응 + 지지/거부확률≥60% 만.
 * 기존 LTF 신호 유지. 확정 수익·승률 아님.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  detectMtfDumpCeilingZone,
  detectMtfDumpZone,
} from '@/lib/mergedDeskMtfDumpZoneBridge';
import { roeTargetPrice } from '@/lib/mergedDeskAutoScalpEngine';
import {
  FAST_SL_ROE_PCT,
  FAST_TP1_ROE_PCT,
} from '@/lib/mergedDeskAutoTradeConfig';
import { resolveWick15mLeverage } from '@/lib/mergedDeskWick15mTrade';
import { resolveAutoTradeTfHold } from '@/lib/doksuri1/autoTradeTfHoldScale';
import {
  DUMP_ZONE_HOLD_MIN_PCT,
  evaluateDumpZoneTouchProbGate,
} from '@/lib/mergedDeskDumpZoneProbGate';

export const HTF_DUMP_TOUCH_TFS = ['1h', '4h', '1d', '1w', '1M'] as const;
export const HTF_DUMP_TOUCH_SOURCE = 'htf-dump-touch' as const;

export const HTF_DUMP_TOUCH_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'SOLUSDT',
] as const;

export type HtfDumpTouchSignal = {
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp1: number;
  zoneBot: number;
  zoneTop: number;
  bandRole: 'floor' | 'ceiling';
  signalId: string;
  noteKo: string;
  closedBarTime: number;
  tp1RoePct: number;
  /** 지지/거부 홀드 확률 % · 게이트 통과값 */
  holdPct: number;
};

function candleTouchesZone(c: Candle, bot: number, top: number): boolean {
  const hi = Number(c.high);
  const lo = Number(c.low);
  if (!(hi > 0) || !(lo > 0)) return false;
  return lo <= top && hi >= bot;
}

function coinChip(symbol: string): string {
  return String(symbol || '')
    .toUpperCase()
    .replace(/USDT$/, '')
    .replace(/[^A-Z0-9]/g, '') || 'ALT';
}

function finish(
  params: {
    symbol: string;
    tf: string;
    direction: 'LONG' | 'SHORT';
    closePx: number;
    closedT: number;
    bot: number;
    top: number;
    bandRole: 'floor' | 'ceiling';
    leverage?: number | null;
    tp1RoePct?: number;
    slRoePct?: number;
    holdPct: number;
    holdLabelKo: string;
  }
): HtfDumpTouchSignal | null {
  const lev = resolveWick15mLeverage(params.leverage);
  const hold = resolveAutoTradeTfHold(params.tf);
  const tpRoe = Math.max(
    3,
    Math.min(40, Number(params.tp1RoePct) || hold.tp1RoePct || FAST_TP1_ROE_PCT)
  );
  const slRoe = Math.max(5, Math.min(40, Number(params.slRoePct) || FAST_SL_ROE_PCT));
  const tp1 = roeTargetPrice(params.closePx, params.direction, lev, tpRoe / 100);
  const opp = params.direction === 'LONG' ? 'SHORT' : 'LONG';
  const sl = roeTargetPrice(params.closePx, opp, lev, slRoe / 100);
  if (params.direction === 'LONG' && !(sl < params.closePx && tp1 > params.closePx)) return null;
  if (params.direction === 'SHORT' && !(sl > params.closePx && tp1 < params.closePx)) return null;

  const sym = String(params.symbol || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const symbol = sym.endsWith('USDT') ? sym : `${sym}USDT`;
  const chip = coinChip(symbol);
  const roleKo = params.bandRole === 'ceiling' ? '폭락감시' : '폭락존';
  const signalId = `htfdump-${symbol}-${params.tf}-${params.direction}-${Math.round(params.closedT)}`;

  return {
    symbol,
    timeframe: params.tf,
    direction: params.direction,
    entry: params.closePx,
    sl,
    tp1,
    zoneBot: params.bot,
    zoneTop: params.top,
    bandRole: params.bandRole,
    signalId,
    noteKo: `${chip} ${params.tf} ${roleKo} · ${params.holdLabelKo} · ${params.direction === 'LONG' ? '롱' : '숏'} · ${lev}x · SL-${slRoe}%ROE · TP+${tpRoe}%ROE`,
    closedBarTime: params.closedT,
    tp1RoePct: tpRoe,
    holdPct: params.holdPct,
  };
}

/**
 * 단일 HTF · 마감봉.
 * floor→LONG · ceiling→SHORT. 둘 다면 가까운 쪽.
 * 확률·신규터치 게이트 통과 시에만.
 */
export function scanHtfDumpTouchOnClosedBar(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  leverage?: number | null;
  tp1RoePct?: number;
  slRoePct?: number;
  minHoldPct?: number;
}): HtfDumpTouchSignal | null {
  const candles = params.candles;
  const n = candles.length;
  if (n < 16) return null;
  const tf = normalizeChartTimeframe(params.timeframe);
  if (!(HTF_DUMP_TOUCH_TFS as readonly string[]).includes(tf)) return null;

  const closedIdx = n - 2;
  const closed = candles[closedIdx];
  if (!closed) return null;
  const closePx = Number(closed.close);
  const closedT = Number(closed.time) || 0;
  if (!(closePx > 0) || !(closedT > 0)) return null;

  const floor = detectMtfDumpZone(candles, tf);
  const ceiling = detectMtfDumpCeilingZone(candles, tf);
  const minHold = params.minHoldPct ?? DUMP_ZONE_HOLD_MIN_PCT;

  type Cand = {
    direction: 'LONG' | 'SHORT';
    bot: number;
    top: number;
    mid: number;
    bandRole: 'floor' | 'ceiling';
    holdPct: number;
    holdLabelKo: string;
  };
  const hits: Cand[] = [];

  if (floor && floor.top > floor.bot) {
    if (candleTouchesZone(closed, floor.bot, floor.top)) {
      const gate = evaluateDumpZoneTouchProbGate({
        candles,
        closedIdx,
        bot: floor.bot,
        top: floor.top,
        mid: floor.mid,
        bandRole: 'floor',
        minHoldPct: minHold,
      });
      if (gate.ok && gate.holdPct != null) {
        hits.push({
          direction: 'LONG',
          bot: floor.bot,
          top: floor.top,
          mid: floor.mid,
          bandRole: 'floor',
          holdPct: gate.holdPct,
          holdLabelKo: gate.labelKo,
        });
      }
    }
  }
  if (ceiling && ceiling.top > ceiling.bot) {
    if (candleTouchesZone(closed, ceiling.bot, ceiling.top)) {
      const gate = evaluateDumpZoneTouchProbGate({
        candles,
        closedIdx,
        bot: ceiling.bot,
        top: ceiling.top,
        mid: ceiling.mid,
        bandRole: 'ceiling',
        minHoldPct: minHold,
      });
      if (gate.ok && gate.holdPct != null) {
        hits.push({
          direction: 'SHORT',
          bot: ceiling.bot,
          top: ceiling.top,
          mid: ceiling.mid,
          bandRole: 'ceiling',
          holdPct: gate.holdPct,
          holdLabelKo: gate.labelKo,
        });
      }
    }
  }
  if (!hits.length) return null;

  let pick = hits[0]!;
  if (hits.length > 1) {
    pick = hits.reduce((a, b) =>
      a.holdPct !== b.holdPct
        ? a.holdPct >= b.holdPct
          ? a
          : b
        : Math.abs(closePx - a.mid) <= Math.abs(closePx - b.mid)
          ? a
          : b
    );
  }

  return finish({
    symbol: params.symbol,
    tf,
    direction: pick.direction,
    closePx,
    closedT,
    bot: pick.bot,
    top: pick.top,
    bandRole: pick.bandRole,
    leverage: params.leverage,
    tp1RoePct: params.tp1RoePct,
    slRoePct: params.slRoePct,
    holdPct: pick.holdPct,
    holdLabelKo: pick.holdLabelKo,
  });
}

/** 여러 HTF 스캔 후 1건 (상위 TF 우선: 1M→1w→1d→4h→1h) */
export function pickBestHtfDumpTouch(
  signals: HtfDumpTouchSignal[]
): HtfDumpTouchSignal | null {
  if (!signals.length) return null;
  const rank = (tf: string) => {
    const i = (HTF_DUMP_TOUCH_TFS as readonly string[]).indexOf(tf);
    return i >= 0 ? i : 99;
  };
  /** 뒤쪽(월)이 우선이므로 역순 정렬 */
  return [...signals].sort((a, b) => rank(b.timeframe) - rank(a.timeframe))[0] || null;
}

export function listHtfDumpTouchSymbols(enabled?: string[] | null): string[] {
  const base = [...HTF_DUMP_TOUCH_SYMBOLS];
  if (!enabled?.length) return base;
  const set = new Set(enabled.map((s) => String(s).toUpperCase()));
  return base.filter((s) => set.has(s));
}

export function listHtfDumpTouchTimeframes(): string[] {
  return [...HTF_DUMP_TOUCH_TFS];
}
