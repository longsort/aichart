/**
 * 진입추정·저항추정 둘 다 강하고 갭/거리가 가까우면 WAIT.
 * 자동매매 방향 억지 선택 방지. 확정 수익·승률 아님.
 */
import type { AiZoneEntrySnapshot, AiZoneFaceBand } from '@/lib/mergedDeskAiZoneSnapshot';
import { FAST_TP1_ROE_PCT } from '@/lib/mergedDeskAutoTradeConfig';

/** 양방향 모두 이 이상이면 충돌 후보 */
export const AIZONE_DUAL_PCT_MIN = 70;
/** |롱%−숏%| 이 값 이하면 WAIT */
export const AIZONE_DUAL_GAP_MAX = 8;
/** 반대구간까지 가격거리가 이 ROE% 미만이면 WAIT (레버 반영) */
export const AIZONE_DUAL_ROOM_ROE_MIN = FAST_TP1_ROE_PCT;

export type DualEstimateWaitResult = {
  wait: boolean;
  reasonKo: string;
  longPct: number;
  shortPct: number;
  gap: number;
};

function bandMid(b: AiZoneFaceBand | null | undefined): number | null {
  if (!b) return null;
  const mid = b.mid > 0 ? b.mid : (Number(b.lo) + Number(b.hi)) / 2;
  return mid > 0 ? mid : null;
}

/** 롱 기준 위쪽 방(다음저항) · 숏 기준 아래쪽 방(다음지지) 가격거리 비율 */
export function dualEstimateRoomPricePct(params: {
  price: number;
  nextResist?: number | null;
  nextSupport?: number | null;
  longZone?: AiZoneFaceBand | null;
  shortZone?: AiZoneFaceBand | null;
  sellFace?: AiZoneFaceBand | null;
  buyFace?: AiZoneFaceBand | null;
}): { upPct: number | null; downPct: number | null } {
  const price = Number(params.price);
  if (!(price > 0)) return { upPct: null, downPct: null };

  const resist =
    Number(params.nextResist) > price
      ? Number(params.nextResist)
      : bandMid(params.shortZone) != null && (bandMid(params.shortZone) as number) > price
        ? (bandMid(params.shortZone) as number)
        : bandMid(params.sellFace) != null && (bandMid(params.sellFace) as number) > price
          ? (bandMid(params.sellFace) as number)
          : null;

  const support =
    Number(params.nextSupport) > 0 && Number(params.nextSupport) < price
      ? Number(params.nextSupport)
      : bandMid(params.longZone) != null && (bandMid(params.longZone) as number) < price
        ? (bandMid(params.longZone) as number)
        : bandMid(params.buyFace) != null && (bandMid(params.buyFace) as number) < price
          ? (bandMid(params.buyFace) as number)
          : null;

  return {
    upPct: resist != null ? (resist - price) / price : null,
    downPct: support != null ? (price - support) / price : null,
  };
}

/**
 * 양쪽 추정 ≥70 이고
 * (1) 갭 ≤8 또는
 * (2) 반대쪽 방이 목표 ROE 가격거리보다 짧음
 * → WAIT.
 */
export function aiZoneDualEstimateWait(params: {
  longPct?: number | null;
  shortPct?: number | null;
  price: number;
  leverage?: number | null;
  direction?: 'LONG' | 'SHORT' | null;
  nextResist?: number | null;
  nextSupport?: number | null;
  longZone?: AiZoneFaceBand | null;
  shortZone?: AiZoneFaceBand | null;
  sellFace?: AiZoneFaceBand | null;
  buyFace?: AiZoneFaceBand | null;
  snap?: AiZoneEntrySnapshot | null;
}): DualEstimateWaitResult {
  const snap = params.snap;
  const longPct = Number(
    params.longPct != null ? params.longPct : snap?.longPct != null ? snap.longPct : NaN
  );
  const shortPct = Number(
    params.shortPct != null ? params.shortPct : snap?.shortPct != null ? snap.shortPct : NaN
  );
  const gap =
    Number.isFinite(longPct) && Number.isFinite(shortPct)
      ? Math.abs(longPct - shortPct)
      : Number.POSITIVE_INFINITY;

  const empty: DualEstimateWaitResult = {
    wait: false,
    reasonKo: '',
    longPct: Number.isFinite(longPct) ? longPct : 0,
    shortPct: Number.isFinite(shortPct) ? shortPct : 0,
    gap: Number.isFinite(gap) ? gap : 0,
  };

  if (!(longPct >= AIZONE_DUAL_PCT_MIN) || !(shortPct >= AIZONE_DUAL_PCT_MIN)) {
    return empty;
  }

  if (gap <= AIZONE_DUAL_GAP_MAX) {
    return {
      wait: true,
      reasonKo: `양쪽추정 롱${longPct.toFixed(0)}/숏${shortPct.toFixed(0)}≥${AIZONE_DUAL_PCT_MIN} · 갭${gap.toFixed(0)}≤${AIZONE_DUAL_GAP_MAX} · WAIT`,
      longPct,
      shortPct,
      gap,
    };
  }

  const lev = Math.max(1, Number(params.leverage) || 40);
  const minRoomPct = AIZONE_DUAL_ROOM_ROE_MIN / lev;
  const room = dualEstimateRoomPricePct({
    price: params.price,
    nextResist: params.nextResist ?? snap?.nextResist,
    nextSupport: params.nextSupport ?? snap?.nextSupport,
    longZone: params.longZone ?? snap?.longZone,
    shortZone: params.shortZone ?? snap?.shortZone,
    sellFace: params.sellFace ?? snap?.sellFace,
    buyFace: params.buyFace ?? snap?.buyFace,
  });

  const dir = params.direction;
  if (dir === 'LONG' && room.upPct != null && room.upPct < minRoomPct) {
    return {
      wait: true,
      reasonKo: `양쪽≥${AIZONE_DUAL_PCT_MIN} · 롱방 ${(room.upPct * 100).toFixed(2)}%<목표ROE${AIZONE_DUAL_ROOM_ROE_MIN}%(@${lev}x) · WAIT`,
      longPct,
      shortPct,
      gap,
    };
  }
  if (dir === 'SHORT' && room.downPct != null && room.downPct < minRoomPct) {
    return {
      wait: true,
      reasonKo: `양쪽≥${AIZONE_DUAL_PCT_MIN} · 숏방 ${(room.downPct * 100).toFixed(2)}%<목표ROE${AIZONE_DUAL_ROOM_ROE_MIN}%(@${lev}x) · WAIT`,
      longPct,
      shortPct,
      gap,
    };
  }

  /** 방향 없이 스캔할 때 — 위·아래 방 둘 다 짧으면 샌드위치 WAIT */
  if (
    !dir &&
    room.upPct != null &&
    room.downPct != null &&
    room.upPct < minRoomPct &&
    room.downPct < minRoomPct
  ) {
    return {
      wait: true,
      reasonKo: `양쪽≥${AIZONE_DUAL_PCT_MIN} · 상하방짧음 · WAIT`,
      longPct,
      shortPct,
      gap,
    };
  }

  return empty;
}
