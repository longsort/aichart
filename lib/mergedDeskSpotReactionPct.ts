/**
 * 현물(종가) 기준 반등·하락 % — zone·거래량 신호용.
 * 확정 수익·승률 아님 · 조건부 참고.
 */
import type { Candle } from '@/types';

export type SpotReactionSide = 'LONG' | 'SHORT';

export function spotPctMove(from: number, to: number): number | null {
  if (!(from > 0) || !Number.isFinite(to)) return null;
  return ((to - from) / from) * 100;
}

export function fmtSpotPctSigned(pct: number | null, digits = 1): string {
  if (pct == null || !Number.isFinite(pct)) return '';
  const a = Math.abs(pct);
  const n = a >= 10 ? a.toFixed(0) : a.toFixed(digits);
  return `${pct >= 0 ? '+' : '−'}${n}%`;
}

/** 신호봉 종가 → 현물 — 실측 변동 % */
export function spotMoveSinceBarPct(
  candles: Candle[],
  barIdx: number,
  spot: number
): number | null {
  const base = Number(candles[barIdx]?.close);
  if (!(base > 0) || !(spot > 0)) return null;
  return spotPctMove(base, spot);
}

/** 현물 → 스윙 목표 여지 % (롱=상방, 숏=하방) */
export function spotRoomToSwingTarget(
  candles: Candle[],
  spot: number,
  side: SpotReactionSide,
  lookback = 28
): number | null {
  const n = candles.length;
  if (n < 4 || !(spot > 0)) return null;
  const from = Math.max(0, n - lookback);
  if (side === 'LONG') {
    let hi = spot;
    for (let i = from; i < n; i++) {
      const h = Number(candles[i]!.high);
      if (Number.isFinite(h)) hi = Math.max(hi, h);
    }
    const target = hi > spot * 1.0003 ? hi : spot * 1.012;
    return spotPctMove(spot, target);
  }
  let lo = spot;
  for (let i = from; i < n; i++) {
    const l = Number(candles[i]!.low);
    if (Number.isFinite(l) && l > 0) lo = Math.min(lo, l);
  }
  const target = lo < spot * 0.9997 ? lo : spot * 0.988;
  return spotPctMove(spot, target);
}

/** zone 하단/상단 → 현물 반등·하락 실측 + 상·하방 여지 */
export function spotZoneReactionPct(params: {
  spot: number;
  zoneTop: number;
  zoneBot: number;
  side: SpotReactionSide;
  candles?: Candle[];
}): { moveKo: string; detailKo: string } {
  const { spot, side } = params;
  const top = Number(params.zoneTop);
  const bot = Number(params.zoneBot);
  if (!(spot > 0)) return { moveKo: '', detailKo: '' };

  const candles = params.candles ?? [];
  let movePct: number | null = null;
  let roomPct: number | null = null;

  if (side === 'LONG' && bot > 0) {
    movePct = spotPctMove(bot, spot);
    roomPct =
      top > spot ? spotPctMove(spot, top) : spotRoomToSwingTarget(candles, spot, 'LONG');
  } else if (side === 'SHORT' && top > 0) {
    movePct = spotPctMove(top, spot);
    roomPct =
      bot > 0 && bot < spot
        ? spotPctMove(spot, bot)
        : spotRoomToSwingTarget(candles, spot, 'SHORT');
  }

  const moveKo = fmtSpotPctSigned(movePct);
  const roomRaw = roomPct != null ? (side === 'LONG' ? roomPct : -roomPct) : null;
  const roomKo = fmtSpotPctSigned(roomRaw);
  const arrow = side === 'LONG' ? '↑' : '↓';

  let moveKoCompact = '';
  if (moveKo && roomKo) {
    moveKoCompact = `${moveKo}${arrow}${roomKo.replace(/^[+−]/, '')}`;
  } else if (moveKo) {
    moveKoCompact = moveKo;
  } else if (roomKo) {
    moveKoCompact = `${arrow}${roomKo.replace(/^[+−]/, '')}`;
  }

  const detailKo = [
    moveKo ? `현물 ${side === 'LONG' ? '반등' : '하락'} ${moveKo}` : '',
    roomKo ? `여지 ${arrow}${roomKo.replace(/^[+−]/, '')}` : '',
    '조건부·확정아님',
  ]
    .filter(Boolean)
    .join(' · ');

  return { moveKo: moveKoCompact, detailKo };
}

/** 거래량 마커 — 짧은 현물 % (신호봉→현물 + 여지) */
export function buildVolumeSignalSpotPctKo(params: {
  candles: Candle[];
  barIdx: number;
  spot: number;
  side: SpotReactionSide;
}): string {
  const { candles, barIdx, spot, side } = params;
  const move = spotMoveSinceBarPct(candles, barIdx, spot);
  const room = spotRoomToSwingTarget(candles, spot, side);
  const moveKo = fmtSpotPctSigned(move);
  if (!moveKo) return '';
  if (room == null || !Number.isFinite(room) || Math.abs(room) < 0.05) return moveKo;
  const roomAbs = fmtSpotPctSigned(side === 'LONG' ? room : -room).replace(/^[+−]/, '');
  const arrow = side === 'LONG' ? '↑' : '↓';
  return `${moveKo}${arrow}${roomAbs}`;
}

export function appendSpotPctToTag(tagKo: string, pctKo: string): string {
  const base = String(tagKo || '').trim();
  const pct = String(pctKo || '').trim();
  if (!pct) return base;
  if (!base) return pct;
  if (base.includes('%')) return base;
  return `${base} ${pct}`;
}

export function advVolKindToSide(kind: string): SpotReactionSide | null {
  if (
    kind === 'break-up' ||
    kind === 'confirm-up' ||
    kind === 'buy-dom' ||
    kind === 'bounce2' ||
    kind === 'big-long' ||
    kind === 'dump1'
  ) {
    return 'LONG';
  }
  if (
    kind === 'break-dn' ||
    kind === 'confirm-dn' ||
    kind === 'sell-dom' ||
    kind === 'drop2' ||
    kind === 'big-short' ||
    kind === 'rally1'
  ) {
    return 'SHORT';
  }
  return null;
}
