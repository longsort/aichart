/**
 * S급 구조전환 신호 — Dual/신호B와 믹스 금지.
 * 조건: 유효 OB(+FVG합류) 터치 + (스윕 또는 최근 CHoCH/BOS) 동방.
 * BPR 단독 진입 금지. 확정 승률·수익 아님.
 */
import type { Candle } from '@/types';
import {
  detectSmcStructureOrderBlocks,
  isObBrokenByClose,
  type SmcObHit,
} from '@/lib/smcStructureOrderBlocks';
import { buildMergedDeskBlueRedChannels } from '@/lib/mergedDeskBlueRedChannels';
import { detectRbRailSfp } from '@/lib/mergedDeskRbEdgeConfluenceGate';
import { aiZoneFeeRrGate } from '@/lib/mergedDeskAiZoneFeeGate';
import { aiZoneEvidenceGate } from '@/lib/mergedDeskAiZoneEvidenceGate';
import {
  readAiZoneEntrySnapshot,
  type AiZoneEntrySnapshot,
} from '@/lib/mergedDeskAiZoneSnapshot';
import { FAST_TP1_ROE_PCT } from '@/lib/mergedDeskAutoTradeConfig';
import { roeTargetPrice } from '@/lib/mergedDeskAutoScalpEngine';
import { ROCKET_CART_SYMBOLS } from '@/lib/mergedDeskBtcRocketCartSignal';

export const STRUCTURE_S_SOURCE = 'structure-s' as const;
export const STRUCTURE_S_TF = '15m';
export const STRUCTURE_S_LOOKBACK = 12;

export function structureSSymbolAllowed(symbol: string): boolean {
  const u = String(symbol || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const full = u.endsWith('USDT') ? u : `${u}USDT`;
  return (ROCKET_CART_SYMBOLS as readonly string[]).includes(full);
}

export type StructureSFilters = {
  zone: boolean;
  sweepOrChoch: boolean;
  fee: boolean;
  htfOk: boolean;
};

export type StructureSProbe = {
  symbol: string;
  timeframe: typeof STRUCTURE_S_TF;
  slotKo: '신호C';
  ready: boolean;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  waitingKo: string;
  filter: StructureSFilters;
  updatedAt: number;
};

export type StructureSCandidate = {
  symbol: string;
  timeframe: typeof STRUCTURE_S_TF;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number;
  score: number;
  signalKo: string;
  evidenceKo: string;
  source: typeof STRUCTURE_S_SOURCE;
  signalId: string;
  analysisTags: string[];
  closedBarTime: number;
  arriveTime: number;
  netRoePct: number;
  rr: number;
  waitingKo: string;
  filter: StructureSFilters;
};

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 5) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    s += Math.max(
      a.high - a.low,
      Math.abs(a.high - b.close),
      Math.abs(a.low - b.close)
    );
    c += 1;
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
}

function emptyFilter(p?: Partial<StructureSFilters>): StructureSFilters {
  return {
    zone: false,
    sweepOrChoch: false,
    fee: false,
    htfOk: true,
    ...p,
  };
}

function probeOut(
  waitingKo: string,
  filter: StructureSFilters,
  symbol: string,
  extra?: Partial<StructureSProbe>
): StructureSProbe {
  return {
    symbol,
    timeframe: STRUCTURE_S_TF,
    slotKo: '신호C',
    ready: false,
    direction: 'NEUTRAL',
    waitingKo,
    filter,
    updatedAt: Date.now(),
    ...extra,
  };
}

function priceInOb(entry: number, ob: SmcObHit, pad: number): boolean {
  return entry >= ob.low - pad && entry <= ob.high + pad;
}

/**
 * S급 1회 평가 — Dual 코어·로켓장바와 독립.
 */
export function buildStructureSSignal(params: {
  symbol?: string;
  candles: Candle[];
  leverage?: number;
  minRr?: number;
  tp1RoePct?: number;
  snap?: AiZoneEntrySnapshot | null;
  price?: number | null;
}): { candidate: StructureSCandidate | null; probe: StructureSProbe } {
  const raw = String(params.symbol || 'BTCUSDT')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const symbol = raw.endsWith('USDT') ? raw : `${raw}USDT`;
  if (!structureSSymbolAllowed(symbol)) {
    return {
      candidate: null,
      probe: probeOut('신호C · 심볼불가', emptyFilter(), symbol),
    };
  }

  const candles = params.candles;
  const n = candles.length;
  if (n < 40) {
    return {
      candidate: null,
      probe: probeOut('신호C · 15m캔들부족', emptyFilter(), symbol),
    };
  }

  const closedIdx = n - 2;
  const closed = candles[closedIdx]!;
  const closedT = Number(closed.time) || 0;
  const entry =
    Number(params.price) > 0 ? Number(params.price) : Number(closed.close);
  if (!(entry > 0) || !(closedT > 0)) {
    return {
      candidate: null,
      probe: probeOut('신호C · 가격없음', emptyFilter(), symbol),
    };
  }

  const atr = atrApprox(candles);
  const pad = Math.max(atr * 0.25, entry * 0.0004);
  const look = STRUCTURE_S_LOOKBACK;
  const { validObs } = detectSmcStructureOrderBlocks(candles);
  const recentObs = validObs.filter(
    (o) =>
      o.index <= closedIdx &&
      closedIdx - o.bosIndex <= look + 8 &&
      !isObBrokenByClose(o, candles.slice(0, closedIdx + 1))
  );

  let bestOb: SmcObHit | null = null;
  let direction: 'LONG' | 'SHORT' | null = null;
  for (const o of [...recentObs].reverse()) {
    if (!priceInOb(entry, o, pad)) continue;
    bestOb = o;
    direction = o.bias === 'bullish' ? 'LONG' : 'SHORT';
    break;
  }

  const zoneOk = bestOb != null && direction != null;
  if (!zoneOk || !bestOb || !direction) {
    return {
      candidate: null,
      probe: probeOut(
        '신호C · OB·FVG자리대기(S급)',
        emptyFilter({ zone: false }),
        symbol
      ),
    };
  }

  /** 스윕(레일 SFP) 동방 */
  let sweepOk = false;
  try {
    const ch = buildMergedDeskBlueRedChannels(candles, STRUCTURE_S_TF);
    const geom = ch.geoms.find((g) => g.primary) ?? ch.geoms[0] ?? null;
    if (geom) {
      const sfp = detectRbRailSfp(
        candles.slice(0, closedIdx + 1),
        geom,
        atr
      );
      if (sfp) {
        const sfpDir = sfp.side === 'bull' ? 'LONG' : 'SHORT';
        if (sfpDir === direction) sweepOk = true;
      }
    }
  } catch {
    sweepOk = false;
  }

  /** 최근 구조 돌파(OB의 bosIndex)가 닫힌봉 근처면 CHoCH/BOS 인정 */
  const chochOk = closedIdx - bestOb.bosIndex <= look;
  const sweepOrChoch = sweepOk || chochOk;

  if (!sweepOrChoch) {
    return {
      candidate: null,
      probe: probeOut(
        '신호C · 스윕·CHoCH대기',
        emptyFilter({ zone: true, sweepOrChoch: false }),
        symbol,
        { direction }
      ),
    };
  }

  const snap = params.snap ?? readAiZoneEntrySnapshot(symbol);
  let htfOk = true;
  if (snap) {
    const ev = aiZoneEvidenceGate({ direction, price: entry, snap });
    if (ev.conflictN > 0) htfOk = false;
  }
  if (!htfOk) {
    return {
      candidate: null,
      probe: probeOut(
        '신호C · 상위역행차단',
        emptyFilter({ zone: true, sweepOrChoch: true, htfOk: false }),
        symbol,
        { direction }
      ),
    };
  }

  const lev = Math.max(1, Math.min(125, Number(params.leverage) || 40));
  const tpRoe = Math.max(5, Number(params.tp1RoePct) || FAST_TP1_ROE_PCT) / 100;
  const tp = roeTargetPrice(entry, direction, lev, tpRoe);
  const buf = Math.max(atr * 0.15, entry * 0.00035);
  let sl =
    direction === 'LONG'
      ? Math.min(bestOb.low - buf, entry - atr * 0.35)
      : Math.max(bestOb.high + buf, entry + atr * 0.35);
  const minRr = Math.max(1.2, Number(params.minRr) || 1.2);
  const reward = Math.abs(tp - entry);
  const maxRisk = reward / minRr;
  if (direction === 'LONG') {
    sl = Math.max(sl, entry - maxRisk);
    if (!(sl > 0) || !(sl < entry)) {
      return {
        candidate: null,
        probe: probeOut('신호C · SL산출실패', emptyFilter({ zone: true }), symbol, {
          direction,
        }),
      };
    }
  } else {
    sl = Math.min(sl, entry + maxRisk);
    if (!(sl > entry)) {
      return {
        candidate: null,
        probe: probeOut('신호C · SL산출실패', emptyFilter({ zone: true }), symbol, {
          direction,
        }),
      };
    }
  }

  const fee = aiZoneFeeRrGate({
    entry,
    sl,
    tp,
    direction,
    leverage: lev,
    minRr,
  });
  const filter = emptyFilter({
    zone: true,
    sweepOrChoch: true,
    fee: fee.ok === true,
    htfOk: true,
  });
  if (!fee.ok) {
    return {
      candidate: null,
      probe: probeOut(
        `신호C · ${fee.reasonKo || '수수료미달'}`,
        filter,
        symbol,
        { direction }
      ),
    };
  }

  const bits = [
    'OB·FVG',
    sweepOk ? '스윕' : null,
    chochOk ? 'CHoCH/BOS' : null,
  ].filter(Boolean);
  const signalId = `s-grade-${symbol}-${direction}-${Math.round(closedT)}`;
  const candidate: StructureSCandidate = {
    symbol,
    timeframe: STRUCTURE_S_TF,
    direction,
    entry,
    sl,
    tp,
    score: Math.min(99, 68 + (sweepOk ? 4 : 0) + (chochOk ? 3 : 0)),
    signalKo: `신호C · S급 · ${bits.join('+')} · ${direction}`,
    evidenceKo: `구조전환 · ${bits.join('·')} · ${fee.reasonKo}`,
    source: STRUCTURE_S_SOURCE,
    signalId,
    analysisTags: ['신호C', 'S급', '구조전환', ...bits.map(String), direction, symbol],
    closedBarTime: closedT,
    arriveTime: closedT,
    netRoePct: fee.netRoePct,
    rr: fee.rr,
    waitingKo: '신호C · S급충족',
    filter,
  };

  return {
    candidate,
    probe: {
      symbol,
      timeframe: STRUCTURE_S_TF,
      slotKo: '신호C',
      ready: true,
      direction,
      waitingKo: '신호C · S급충족 · 레이스대기',
      filter,
      updatedAt: Date.now(),
    },
  };
}
