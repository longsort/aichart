/**
 * Trade management after a frozen plan. Original path points never follow price.
 */

import type { Eagle1Bar } from './structureEngine';

export type TradeManageState =
  | 'NONE'
  | 'OPEN'
  | 'TP1_HIT'
  | 'BREAKEVEN'
  | 'TP2_HIT'
  | 'TP3_HIT'
  | 'INVALIDATED';

export type FrozenPathPoint = {
  time: number;
  price: number;
  label: string;
};

export type FrozenTrade = {
  identity: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp1: number;
  tp2: number | null;
  tp3: number | null;
  state: TradeManageState;
  path: FrozenPathPoint[];
  altPath: FrozenPathPoint[];
  pathState: '진행중' | '이탈주의' | '무효';
  openedAt: number;
};

export function planIdentity(params: {
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
}): string {
  return `${params.direction}:${Math.round(params.entry * 10) / 10}:${Math.round(params.sl * 10) / 10}`;
}

export function buildFrozenPath(params: {
  lastTime: number;
  tfSec: number;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp1: number;
  tp2: number | null;
  tp3: number | null;
}): { path: FrozenPathPoint[]; altPath: FrozenPathPoint[] } {
  const step = Math.max(60, params.tfSec);
  const path: FrozenPathPoint[] = [
    { time: params.lastTime, price: params.entry, label: '진입' },
    { time: params.lastTime + step, price: params.tp1, label: '목표1' },
  ];
  if (params.tp2 != null) path.push({ time: params.lastTime + step * 3, price: params.tp2, label: '목표2' });
  if (params.tp3 != null) path.push({ time: params.lastTime + step * 6, price: params.tp3, label: '목표3' });
  const altPath: FrozenPathPoint[] = [
    { time: params.lastTime, price: params.entry, label: '진입' },
    { time: params.lastTime + step * 2, price: params.sl, label: '무효가격' },
  ];
  return { path, altPath };
}

function hitBothSameBar(direction: 'LONG' | 'SHORT', bar: Eagle1Bar, sl: number, tp: number): 'sl' | 'tp' | null {
  if (direction === 'LONG') {
    const slHit = bar.low <= sl;
    const tpHit = bar.high >= tp;
    if (slHit && tpHit) return 'sl';
    if (slHit) return 'sl';
    if (tpHit) return 'tp';
  } else {
    const slHit = bar.high >= sl;
    const tpHit = bar.low <= tp;
    if (slHit && tpHit) return 'sl';
    if (slHit) return 'sl';
    if (tpHit) return 'tp';
  }
  return null;
}

export function pathStateFromPrice(params: {
  close: number;
  direction: 'LONG' | 'SHORT';
  sl: number;
  entry: number;
  tradeState: TradeManageState;
}): FrozenTrade['pathState'] {
  if (params.tradeState === 'INVALIDATED') return '무효';
  if (params.tradeState === 'TP3_HIT') return '진행중';
  const against =
    params.direction === 'LONG'
      ? params.close < params.entry && params.close > params.sl
      : params.close > params.entry && params.close < params.sl;
  if (against) return '이탈주의';
  return '진행중';
}

export function advanceFrozenTrade(params: {
  prev: FrozenTrade | null | undefined;
  candles: Eagle1Bar[];
  endExclusive?: number;
  candidate: {
    direction: 'LONG' | 'SHORT';
    entry: number;
    sl: number;
    tp1: number;
    tp2: number | null;
    tp3: number | null;
    lastTime: number;
    tfSec: number;
    confirm: boolean;
  };
}): FrozenTrade | null {
  const n = Math.min(params.candles.length, params.endExclusive ?? params.candles.length);
  const last = params.candles[n - 1];
  if (!last) return null;
  const id = planIdentity(params.candidate);
  let trade = params.prev && params.prev.identity === id ? { ...params.prev } : null;

  if (!trade) {
    if (!params.candidate.confirm) return params.prev ?? null;
    const built = buildFrozenPath({
      lastTime: params.candidate.lastTime,
      tfSec: params.candidate.tfSec,
      direction: params.candidate.direction,
      entry: params.candidate.entry,
      sl: params.candidate.sl,
      tp1: params.candidate.tp1,
      tp2: params.candidate.tp2,
      tp3: params.candidate.tp3,
    });
    trade = {
      identity: id,
      direction: params.candidate.direction,
      entry: params.candidate.entry,
      sl: params.candidate.sl,
      tp1: params.candidate.tp1,
      tp2: params.candidate.tp2,
      tp3: params.candidate.tp3,
      state: 'OPEN',
      path: built.path,
      altPath: built.altPath,
      pathState: '진행중',
      openedAt: params.candidate.lastTime,
    };
  }

  const from = params.candles.findIndex((c) => c.time >= trade!.openedAt);
  const start = from >= 0 ? from : Math.max(0, n - 8);
  for (let i = start; i < n; i++) {
    const bar = params.candles[i]!;
    if (trade.state === 'INVALIDATED' || trade.state === 'TP3_HIT') break;
    const nextTp =
      trade.state === 'OPEN' || trade.state === 'BREAKEVEN'
        ? trade.tp1
        : trade.state === 'TP1_HIT'
          ? trade.tp2
          : trade.tp3;
    const slNow = trade.state === 'TP1_HIT' || trade.state === 'BREAKEVEN' ? trade.entry : trade.sl;
    if (nextTp == null) continue;
    const hit = hitBothSameBar(trade.direction, bar, slNow, nextTp);
    if (hit === 'sl') {
      trade = { ...trade, state: 'INVALIDATED' };
      break;
    }
    if (hit === 'tp') {
      if (trade.state === 'OPEN' || trade.state === 'BREAKEVEN') {
        trade = { ...trade, state: 'TP1_HIT' };
      } else if (trade.state === 'TP1_HIT') {
        trade = { ...trade, state: 'TP2_HIT' };
      } else if (trade.state === 'TP2_HIT') {
        trade = { ...trade, state: 'TP3_HIT' };
      }
    }
  }

  const close = last.close;
  return {
    ...trade,
    pathState: pathStateFromPrice({
      close,
      direction: trade.direction,
      sl: trade.sl,
      entry: trade.entry,
      tradeState: trade.state,
    }),
  };
}

export function pathPointsUnchanged(a: FrozenPathPoint[], b: FrozenPathPoint[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => p.time === b[i]!.time && p.price === b[i]!.price && p.label === b[i]!.label);
}
