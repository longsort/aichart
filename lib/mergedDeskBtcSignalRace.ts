/**
 * Dual 신호 레이스 — 신호A(Dual Fast) · 신호B(로켓장바) · 신호C(S급 구조).
 * 선도착(먼저 READY) 방향 진입 · 동시 READY면 A→B→C.
 * Dual 게이지 미혼입 · 확정 승률·수익 아님.
 */
import type { Candle } from '@/types';
import {
  buildRbScalpDriveCandidate,
  type RbScalpDriveCandidate,
} from '@/lib/mergedDeskRbScalpDriveTrade';
import {
  BTC_ROCKET_CART_SOURCE,
  BTC_ROCKET_CART_SYMBOL,
  BTC_ROCKET_CART_TF,
  buildBtcRocketCartSignal,
  type BtcRocketCartCandidate,
  type BtcRocketCartProbe,
} from '@/lib/mergedDeskBtcRocketCartSignal';
import {
  STRUCTURE_S_SOURCE,
  STRUCTURE_S_TF,
  buildStructureSSignal,
  type StructureSCandidate,
  type StructureSProbe,
} from '@/lib/mergedDeskStructureSSignal';
import type { AiZoneEntrySnapshot } from '@/lib/mergedDeskAiZoneSnapshot';

export type BtcRaceSlotId = 'A' | 'B' | 'C';

export type BtcRaceLaneCandidate = {
  slot: BtcRaceSlotId;
  slotKo: string;
  source: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number;
  score: number;
  signalKo: string;
  evidenceKo: string;
  signalId: string;
  analysisTags: string[];
  closedBarTime: number;
  arriveTime: number;
  netRoePct: number;
  rr: number;
};

export type BtcRaceResult = {
  winner: BtcRaceLaneCandidate | null;
  signalA: BtcRaceLaneCandidate | null;
  signalB: BtcRaceLaneCandidate | null;
  signalC: BtcRaceLaneCandidate | null;
  probeB: BtcRocketCartProbe;
  probeC: StructureSProbe;
  reasonKo: string;
};

const SLOT_PRIORITY: Record<BtcRaceSlotId, number> = { A: 0, B: 1, C: 2 };

function fromFast(c: RbScalpDriveCandidate): BtcRaceLaneCandidate {
  return {
    slot: 'A',
    slotKo: '신호A',
    source: c.source,
    direction: c.direction,
    entry: c.entry,
    sl: c.sl,
    tp: c.tp,
    score: c.score,
    signalKo: `신호A · ${c.signalKo}`,
    evidenceKo: c.evidenceKo,
    signalId: c.signalId,
    analysisTags: [...(c.analysisTags || []), '레이스', '신호A'],
    closedBarTime: c.closedBarTime,
    arriveTime: c.closedBarTime,
    netRoePct: c.netRoePct,
    rr: c.rr,
  };
}

function fromRocketCart(c: BtcRocketCartCandidate): BtcRaceLaneCandidate {
  return {
    slot: 'B',
    slotKo: '신호B',
    source: c.source,
    direction: c.direction,
    entry: c.entry,
    sl: c.sl,
    tp: c.tp,
    score: c.score,
    signalKo: c.signalKo,
    evidenceKo: c.evidenceKo,
    signalId: c.signalId,
    analysisTags: c.analysisTags,
    closedBarTime: c.closedBarTime,
    arriveTime: c.cartBarTime || c.closedBarTime,
    netRoePct: c.netRoePct,
    rr: c.rr,
  };
}

function fromStructureS(c: StructureSCandidate): BtcRaceLaneCandidate {
  return {
    slot: 'C',
    slotKo: '신호C',
    source: c.source,
    direction: c.direction,
    entry: c.entry,
    sl: c.sl,
    tp: c.tp,
    score: c.score,
    signalKo: c.signalKo,
    evidenceKo: c.evidenceKo,
    signalId: c.signalId,
    analysisTags: c.analysisTags,
    closedBarTime: c.closedBarTime,
    arriveTime: c.arriveTime,
    netRoePct: c.netRoePct,
    rr: c.rr,
  };
}

/** READY 후보 중 선도착 → 동시이면 A→B→C */
export function pickBtcSignalRaceWinner(
  lanes: BtcRaceLaneCandidate[]
): BtcRaceLaneCandidate | null {
  if (!lanes.length) return null;
  const sorted = [...lanes].sort((a, b) => {
    if (a.arriveTime !== b.arriveTime) return a.arriveTime - b.arriveTime;
    return SLOT_PRIORITY[a.slot] - SLOT_PRIORITY[b.slot];
  });
  return sorted[0] ?? null;
}

/**
 * Dual 레이스 1회 — A Fast · B 로켓장바 · C S급구조.
 */
export function runBtcSignalRace(params: {
  symbol?: string;
  candlesFast: Candle[];
  timeframeFast: string;
  candles3m?: Candle[] | null;
  candlesS?: Candle[] | null;
  leverage?: number;
  minRr?: number;
  tp1RoePct?: number;
  snap?: AiZoneEntrySnapshot | null;
  price?: number | null;
  candles15m?: Candle[] | null;
}): BtcRaceResult {
  const raw = String(params.symbol || BTC_ROCKET_CART_SYMBOL)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const symbol = raw.endsWith('USDT') ? raw : `${raw}USDT`;
  const coinKo = symbol.replace(/USDT$/, '');
  const lev = params.leverage;
  const minRr = params.minRr;
  const tp1RoePct = params.tp1RoePct;
  const price = params.price;
  const snap = params.snap;

  let signalA: BtcRaceLaneCandidate | null = null;
  const fast = buildRbScalpDriveCandidate({
    symbol,
    timeframe: params.timeframeFast,
    candles: params.candlesFast,
    leverage: lev || 40,
    minRr,
    tp1RoePct,
    snap,
    price,
    candles15m: params.candles15m,
  });
  if (fast) {
    signalA = fromFast(fast);
    signalA.analysisTags = [
      ...(signalA.analysisTags || []).filter((t) => t !== 'BTC레이스'),
      `${coinKo}레이스`,
      '신호A',
    ];
  }

  const c3 =
    params.candles3m && params.candles3m.length >= 40
      ? params.candles3m
      : String(params.timeframeFast).toLowerCase() === BTC_ROCKET_CART_TF
        ? params.candlesFast
        : null;

  let signalB: BtcRaceLaneCandidate | null = null;
  let probeB: BtcRocketCartProbe;
  if (c3) {
    const built = buildBtcRocketCartSignal({
      symbol,
      candles: c3,
      leverage: lev,
      minRr,
      tp1RoePct,
      snap,
      price,
    });
    probeB = built.probe;
    if (built.candidate) signalB = fromRocketCart(built.candidate);
  } else {
    probeB = {
      symbol,
      timeframe: BTC_ROCKET_CART_TF,
      slotKo: '신호B',
      ready: false,
      direction: 'NEUTRAL',
      waitingKo: '신호B · 3m차트필요',
      filter: {
        place: false,
        seq: false,
        fee: false,
        htfOk: true,
        extensionOk: false,
      },
      rocketBarTime: null,
      cartBarTime: null,
      updatedAt: Date.now(),
    };
  }

  const cS =
    params.candlesS && params.candlesS.length >= 40
      ? params.candlesS
      : params.candles15m && params.candles15m.length >= 40
        ? params.candles15m
        : null;

  let signalC: BtcRaceLaneCandidate | null = null;
  let probeC: StructureSProbe;
  if (cS) {
    const built = buildStructureSSignal({
      symbol,
      candles: cS,
      leverage: lev,
      minRr,
      tp1RoePct,
      snap,
      price,
    });
    probeC = built.probe;
    if (built.candidate) signalC = fromStructureS(built.candidate);
  } else {
    probeC = {
      symbol,
      timeframe: STRUCTURE_S_TF,
      slotKo: '신호C',
      ready: false,
      direction: 'NEUTRAL',
      waitingKo: '신호C · 15m캔들필요',
      filter: {
        zone: false,
        sweepOrChoch: false,
        fee: false,
        htfOk: true,
      },
      updatedAt: Date.now(),
    };
  }

  const ready: BtcRaceLaneCandidate[] = [];
  if (signalA) ready.push(signalA);
  if (signalB) ready.push(signalB);
  if (signalC) ready.push(signalC);
  const winner = pickBtcSignalRaceWinner(ready);

  let reasonKo = `${coinKo}레이스 · 대기`;
  if (winner) {
    reasonKo = `${coinKo}레이스 · ${winner.slotKo} 선도착 · ${winner.direction}`;
  } else {
    reasonKo = `${coinKo}레이스 · A:${signalA ? 'READY' : '대기'} · B:${probeB.waitingKo} · C:${probeC.waitingKo}`;
  }

  return { winner, signalA, signalB, signalC, probeB, probeC, reasonKo };
}

export function isBtcRocketCartSource(src: string | null | undefined): boolean {
  const s = String(src || '');
  return s === BTC_ROCKET_CART_SOURCE || /^btc-rkcart-/i.test(s);
}

export function isStructureSSource(src: string | null | undefined): boolean {
  const s = String(src || '');
  return s === STRUCTURE_S_SOURCE || /^s-grade-/i.test(s);
}

const PROBE_KEY = 'ailongshort.mergedDesk.btcSignalB.v1';
export const BTC_SIGNAL_B_EVENT = 'ailongshort.btcSignalB';

export function writeBtcSignalBProbe(probe: BtcRocketCartProbe): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PROBE_KEY, JSON.stringify(probe));
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BTC_SIGNAL_B_EVENT));
  }
}

export function readBtcSignalBProbe(): BtcRocketCartProbe | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PROBE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BtcRocketCartProbe;
  } catch {
    return null;
  }
}
