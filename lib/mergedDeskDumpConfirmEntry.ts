/**
 * 폭락존 TF별 상승확정/하락확정 → 별도 진입 타점.
 * - floor CONFIRM_UP(상승확정) → LONG
 * - floor CONFIRM_DOWN(하락확정) → SHORT
 * - ceiling CONFIRM_RESIST(저항확정) → SHORT
 * 마감봉 기준(진행봉 제외) · 존 터치/근접 시. 확정 수익·승률 아님.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  detectMtfDumpCeilingZone,
  detectMtfDumpZone,
} from '@/lib/mergedDeskMtfDumpZoneBridge';
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

export const DUMP_CONFIRM_AUTO_TFS = ['3m', '5m', '15m'] as const;
/** 사용자 지시: BTC만 — 다른 코인 확장 금지 */
export const DUMP_CONFIRM_SYMBOLS = ['BTCUSDT'] as const;

export type DumpConfirmSignal = {
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp1: number;
  zoneBot: number;
  zoneTop: number;
  lifeState: DumpLifeState;
  lifeKo: string;
  signalId: string;
  noteKo: string;
  closedBarTime: number;
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

/**
 * 단일 TF · 마감봉에서 폭락 확정 상태면 진입 시그널.
 */
export function scanDumpConfirmOnClosedBar(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  leverage?: number;
  tp1RoePct?: number;
  slRoePct?: number;
}): DumpConfirmSignal | null {
  const raw = params.candles;
  if (!Array.isArray(raw) || raw.length < 18) return null;
  /** 진행봉 제외 — 리페인트 완화 */
  const candles = raw.slice(0, -1);
  const n = candles.length;
  if (n < 16) return null;

  const tf = normalizeChartTimeframe(params.timeframe);
  const closed = candles[n - 1]!;
  const prev = candles[n - 2];
  const closePx = Number(closed.close);
  const closedT = Number(closed.time) || 0;
  if (!(closePx > 0) || !(closedT > 0)) return null;

  const floor = detectMtfDumpZone(candles, tf);
  const ceiling = detectMtfDumpCeilingZone(candles, tf);

  type Cand = {
    direction: 'LONG' | 'SHORT';
    bot: number;
    top: number;
    mid: number;
    life: DumpLifeState;
    role: 'floor' | 'ceiling';
  };
  const cands: Cand[] = [];

  if (floor && floor.top > floor.bot) {
    const life = evaluateDumpLifeCycle({
      chartCandles: candles,
      top: floor.top,
      bot: floor.bot,
      mid: floor.mid,
      bandRole: 'floor',
    });
    if (life.state === 'CONFIRM_UP') {
      cands.push({
        direction: 'LONG',
        bot: floor.bot,
        top: floor.top,
        mid: floor.mid,
        life: life.state,
        role: 'floor',
      });
    } else if (life.state === 'CONFIRM_DOWN') {
      cands.push({
        direction: 'SHORT',
        bot: floor.bot,
        top: floor.top,
        mid: floor.mid,
        life: life.state,
        role: 'floor',
      });
    }
  }

  if (ceiling && ceiling.top > ceiling.bot) {
    const life = evaluateDumpLifeCycle({
      chartCandles: candles,
      top: ceiling.top,
      bot: ceiling.bot,
      mid: ceiling.mid,
      bandRole: 'ceiling',
    });
    if (life.state === 'CONFIRM_RESIST') {
      cands.push({
        direction: 'SHORT',
        bot: ceiling.bot,
        top: ceiling.top,
        mid: ceiling.mid,
        life: life.state,
        role: 'ceiling',
      });
    }
  }

  if (!cands.length) return null;

  /** 같은 TF에 롱·숏 확정이 동시에 있으면 스킵(혼선) */
  const dirs = new Set(cands.map((c) => c.direction));
  if (dirs.size > 1) return null;

  const pick = cands[0]!;
  const pad = Math.max((pick.top - pick.bot) * 0.15, pick.mid * 0.0008);
  const touched =
    touches(closed, pick.bot, pick.top) ||
    (prev ? touches(prev, pick.bot, pick.top) : false) ||
    nearZone(closePx, pick.bot, pick.top, pad);
  if (!touched) return null;

  const lev = Math.max(1, Math.min(125, Number(params.leverage) || 10));
  const tpRoe = Math.max(3, Math.min(20, Number(params.tp1RoePct) || FAST_TP1_ROE_PCT));
  const slRoe = Math.max(5, Math.min(40, Number(params.slRoePct) || FAST_SL_ROE_PCT));
  const tp1 = roeTargetPrice(closePx, pick.direction, lev, tpRoe / 100);
  const opp = pick.direction === 'LONG' ? 'SHORT' : 'LONG';
  const sl = roeTargetPrice(closePx, opp, lev, slRoe / 100);
  if (pick.direction === 'LONG' && !(sl < closePx && tp1 > closePx)) return null;
  if (pick.direction === 'SHORT' && !(sl > closePx && tp1 < closePx)) return null;

  const sym = String(params.symbol || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const symbol = sym.endsWith('USDT') ? sym : `${sym}USDT`;
  const lifeKo = DUMP_LIFE_KO[pick.life];
  const chip = symbol.replace('USDT', '');
  const signalId = `dumpcfm-${symbol}-${tf}-${pick.direction}-${pick.life}-${Math.round(closedT)}`;

  return {
    symbol,
    timeframe: tf,
    direction: pick.direction,
    entry: closePx,
    sl,
    tp1,
    zoneBot: pick.bot,
    zoneTop: pick.top,
    lifeState: pick.life,
    lifeKo,
    signalId,
    noteKo: `${chip} ${tf} 폭락존${lifeKo} · ${pick.direction === 'LONG' ? '롱' : '숏'} · SL-${slRoe}%ROE · TP+${tpRoe}%ROE`,
    closedBarTime: closedT,
  };
}

export function listDumpConfirmSymbols(enabled?: string[] | null): string[] {
  const base = [...DUMP_CONFIRM_SYMBOLS];
  if (!enabled?.length) return base;
  const set = new Set(enabled.map((s) => String(s).toUpperCase()));
  return base.filter((s) => set.has(s));
}

export function listDumpConfirmTimeframes(): string[] {
  return [...DUMP_CONFIRM_AUTO_TFS];
}

/**
 * 로켓 등과 합류용 — 해당 TF 마감봉 기준 확정 방향(터치 불필요).
 */
export function dumpConfirmBiasOnTf(params: {
  timeframe: string;
  candles: Candle[];
}): { direction: 'LONG' | 'SHORT'; life: DumpLifeState; lifeKo: string } | null {
  const raw = params.candles;
  if (!Array.isArray(raw) || raw.length < 18) return null;
  const candles = raw.slice(0, -1);
  if (candles.length < 16) return null;
  const tf = normalizeChartTimeframe(params.timeframe);

  const floor = detectMtfDumpZone(candles, tf);
  if (floor && floor.top > floor.bot) {
    const life = evaluateDumpLifeCycle({
      chartCandles: candles,
      top: floor.top,
      bot: floor.bot,
      mid: floor.mid,
      bandRole: 'floor',
    });
    if (life.state === 'CONFIRM_UP') {
      return { direction: 'LONG', life: life.state, lifeKo: DUMP_LIFE_KO[life.state] };
    }
    if (life.state === 'CONFIRM_DOWN') {
      return { direction: 'SHORT', life: life.state, lifeKo: DUMP_LIFE_KO[life.state] };
    }
  }

  const ceiling = detectMtfDumpCeilingZone(candles, tf);
  if (ceiling && ceiling.top > ceiling.bot) {
    const life = evaluateDumpLifeCycle({
      chartCandles: candles,
      top: ceiling.top,
      bot: ceiling.bot,
      mid: ceiling.mid,
      bandRole: 'ceiling',
    });
    if (life.state === 'CONFIRM_RESIST') {
      return { direction: 'SHORT', life: life.state, lifeKo: DUMP_LIFE_KO[life.state] };
    }
  }
  return null;
}
