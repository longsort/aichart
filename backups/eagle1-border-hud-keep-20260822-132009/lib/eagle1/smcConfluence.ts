/**
 * PHASE 6 — SMC/와이코프는 단독 매매가 아니다.
 * 스프링+아래쪽털기+추세전환+POC 재탈환이 겹칠 때만 롱 점수를 보탠다.
 */
import type { PocState } from './zoneEngine';
import { atrAt, type Eagle1Bar, type StructureSnapshot, wyckoffKo } from './structureEngine';

export type SmcWyckoffConfluence = {
  longAdd: number;
  shortAdd: number;
  notes: string[];
  wyckoffOnly: boolean;
  longAligned: boolean;
  shortAligned: boolean;
};

function lastOf(structure: StructureSnapshot, kind: 'SWEEP' | 'CHOCH') {
  return [...structure.events].reverse().find((e) => e.kind === kind) ?? null;
}

export function smcWyckoffConfluence(params: {
  structure: StructureSnapshot;
  pocState?: PocState | null;
  candles?: Eagle1Bar[] | null;
  endExclusive?: number;
}): SmcWyckoffConfluence {
  const notes: string[] = [];
  const wy = params.structure.wyckoff.label;
  if (wy !== 'NONE') {
    notes.push(`와이코프 ${wyckoffKo(wy)} (단독 매매 금지)`);
  }

  const lastSweep = lastOf(params.structure, 'SWEEP');
  const lastChoCH = lastOf(params.structure, 'CHOCH');
  const poc = params.pocState ?? null;
  const springish = wy === 'SPRING' || wy === 'ACCUMULATION';
  const distish = wy === 'UTAD' || wy === 'LPSY' || wy === 'DISTRIBUTION';

  const longAligned =
    springish &&
    lastSweep?.bias === 'bullish' &&
    lastChoCH?.bias === 'bullish' &&
    (poc === 'RECLAIMED' || poc === 'CLOSED_ABOVE');
  const shortAligned =
    distish &&
    lastSweep?.bias === 'bearish' &&
    lastChoCH?.bias === 'bearish' &&
    (poc === 'LOST' || poc === 'CLOSED_BELOW');

  let longAdd = 0;
  let shortAdd = 0;
  if (longAligned) {
    longAdd += 14;
    notes.push('스프링+아래쪽털기+추세전환+최다거래 재탈환');
  }
  if (shortAligned) {
    shortAdd += 14;
    notes.push('고점분산+위쪽털기+추세전환+최다거래 상실');
  }

  const candles = params.candles ?? [];
  const n = Math.min(candles.length, params.endExclusive ?? candles.length);
  const last = n > 0 ? candles[n - 1] : null;
  const atr = n > 1 ? atrAt(candles, n) : 0;
  if (last && atr > 0) {
    const eql = params.structure.equalLows[params.structure.equalLows.length - 1];
    const eqh = params.structure.equalHighs[params.structure.equalHighs.length - 1];
    if (eql != null && Math.abs(last.close - eql) <= atr * 0.4 && lastSweep?.bias === 'bullish') {
      longAdd += 6;
      notes.push('아래쪽 유동성 근처');
    }
    if (eqh != null && Math.abs(last.close - eqh) <= atr * 0.4 && lastSweep?.bias === 'bearish') {
      shortAdd += 6;
      notes.push('위쪽 유동성 근처');
    }
  }

  return {
    longAdd,
    shortAdd,
    notes,
    wyckoffOnly: wy !== 'NONE' && !longAligned && !shortAligned,
    longAligned,
    shortAligned,
  };
}
