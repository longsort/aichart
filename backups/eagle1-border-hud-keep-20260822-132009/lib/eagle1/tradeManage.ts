/**
 * Trade management after a frozen plan. Original path points never follow price.
 * PositionManagement: OPEN → TP1 → PROTECT/BE/TRAIL → EXIT. 재진입은 새 identity.
 */

import type { Eagle1Bar } from './structureEngine';

export type TradeManageState =
  | 'NONE'
  | 'OPEN'
  | 'TP1_HIT'
  | 'PROTECT_PROFIT'
  | 'BREAKEVEN'
  | 'TP2_HIT'
  | 'TRAILING'
  | 'TP3_HIT'
  | 'EARLY_EXIT'
  | 'STOPPED_PROFIT'
  | 'STOPPED_LOSS'
  | 'INVALIDATED'
  | 'CLOSED';

export type FrozenPathPoint = {
  time: number;
  price: number;
  label: string;
};

export type FrozenTrade = {
  identity: string;
  /** 재진입 시 새 UUID. 동일 identity 재사용 금지. */
  tradeId: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp1: number;
  tp2: number | null;
  tp3: number | null;
  state: TradeManageState;
  path: FrozenPathPoint[];
  altPath: FrozenPathPoint[];
  pathState: '진행중' | '이탈주의' | '무효' | '종료';
  openedAt: number;
  closedAt?: number;
};

export function planIdentity(params: {
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
}): string {
  return `${params.direction}:${Math.round(params.entry * 10) / 10}:${Math.round(params.sl * 10) / 10}`;
}

function newTradeId(): string {
  return `e1t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isTradeTerminal(state: TradeManageState): boolean {
  return (
    state === 'INVALIDATED' ||
    state === 'STOPPED_LOSS' ||
    state === 'STOPPED_PROFIT' ||
    state === 'EARLY_EXIT' ||
    state === 'TP3_HIT' ||
    state === 'CLOSED'
  );
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
    { time: params.lastTime, price: params.entry, label: 'ENTRY' },
    { time: params.lastTime + step, price: params.tp1, label: 'TP1' },
  ];
  if (params.tp2 != null) path.push({ time: params.lastTime + step * 3, price: params.tp2, label: 'TP2' });
  if (params.tp3 != null) path.push({ time: params.lastTime + step * 6, price: params.tp3, label: 'TP3' });
  const altPath: FrozenPathPoint[] = [
    { time: params.lastTime, price: params.entry, label: 'ENTRY' },
    { time: params.lastTime + step * 2, price: params.sl, label: 'STOP' },
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
  if (isTradeTerminal(params.tradeState)) {
    if (params.tradeState === 'TP3_HIT') return '종료';
    if (params.tradeState === 'STOPPED_PROFIT') return '종료';
    return params.tradeState === 'CLOSED' ? '종료' : '무효';
  }
  const against =
    params.direction === 'LONG'
      ? params.close < params.entry && params.close > params.sl
      : params.close > params.entry && params.close < params.sl;
  if (against) return '이탈주의';
  return '진행중';
}

function activeSl(trade: FrozenTrade): number {
  if (
    trade.state === 'TP1_HIT' ||
    trade.state === 'PROTECT_PROFIT' ||
    trade.state === 'BREAKEVEN' ||
    trade.state === 'TP2_HIT' ||
    trade.state === 'TRAILING'
  ) {
    return trade.entry;
  }
  return trade.sl;
}

function nextTp(trade: FrozenTrade): number | null {
  if (trade.state === 'OPEN') return trade.tp1;
  if (trade.state === 'TP1_HIT' || trade.state === 'PROTECT_PROFIT' || trade.state === 'BREAKEVEN') {
    return trade.tp2;
  }
  if (trade.state === 'TP2_HIT' || trade.state === 'TRAILING') return trade.tp3;
  return null;
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
  let trade =
    params.prev && params.prev.identity === id && !isTradeTerminal(params.prev.state)
      ? { ...params.prev }
      : null;

  /** 종료된 트레이드는 같은 가격 identity여도 재사용하지 않는다 */
  if (params.prev && params.prev.identity === id && isTradeTerminal(params.prev.state)) {
    if (!params.candidate.confirm) return { ...params.prev, state: 'CLOSED', pathState: '종료' };
  }

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
      tradeId: newTradeId(),
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
  } else if (!trade.tradeId) {
    trade = { ...trade, tradeId: newTradeId() };
  }

  const from = params.candles.findIndex((c) => c.time >= trade!.openedAt);
  const start = from >= 0 ? from : Math.max(0, n - 8);
  for (let i = start; i < n; i++) {
    const bar = params.candles[i]!;
    if (isTradeTerminal(trade.state)) break;
    const tp = nextTp(trade);
    const slNow = activeSl(trade);
    if (tp == null) {
      if (trade.state === 'TP2_HIT' || trade.state === 'TRAILING') {
        trade = { ...trade, state: 'TP3_HIT', closedAt: bar.time };
      }
      continue;
    }
    const hit = hitBothSameBar(trade.direction, bar, slNow, tp);
    if (hit === 'sl') {
      const afterTp1 =
        trade.state === 'TP1_HIT' ||
        trade.state === 'PROTECT_PROFIT' ||
        trade.state === 'BREAKEVEN' ||
        trade.state === 'TP2_HIT' ||
        trade.state === 'TRAILING';
      trade = {
        ...trade,
        state: afterTp1 ? 'STOPPED_PROFIT' : 'INVALIDATED',
        closedAt: bar.time,
      };
      break;
    }
    if (hit === 'tp') {
      if (trade.state === 'OPEN') {
        trade = { ...trade, state: 'TP1_HIT' };
      } else if (trade.state === 'TP1_HIT' || trade.state === 'PROTECT_PROFIT' || trade.state === 'BREAKEVEN') {
        trade = { ...trade, state: 'TP2_HIT' };
      } else if (trade.state === 'TP2_HIT' || trade.state === 'TRAILING') {
        trade = { ...trade, state: 'TP3_HIT', closedAt: bar.time };
      }
    } else if (trade.state === 'TP1_HIT') {
      /** TP1 이후 다음 봉부터 수익보호(본전 SL) */
      trade = { ...trade, state: 'PROTECT_PROFIT' };
    } else if (trade.state === 'TP2_HIT') {
      trade = { ...trade, state: 'TRAILING' };
    }
  }

  if (isTradeTerminal(trade.state) && trade.state !== 'CLOSED' && trade.state !== 'TP3_HIT') {
    /* STOPPED_* / INVALIDATED 유지 — HUD가 EXIT로 표시. CLOSED는 명시적 종료 표시용 */
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
