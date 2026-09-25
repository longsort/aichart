/**
 * §16 MARKET SCALP · §17 ZONE SNIPER — 실행종류 + 주문형태 실체.
 * 라벨만이 아니라 entryHint / orderType 결정.
 */
import type { TapBattleZone, TapExecKind } from './types';

export type TapOrderType = 'MARKET' | 'LIMIT_CONFIRMED' | 'LIMIT_PRE' | 'WAIT';

export type TapExecPlan = {
  execKind: TapExecKind;
  orderType: TapOrderType;
  /** 권장 진입가 (시장가=현재가, 스나이퍼=존 가장자리/미드) */
  entryHint: number | null;
  noteKo: string;
  /** 시장가 허용 시 expectedMove가 비용보다 커야 함 (게이트에서 재검증) */
  marketAllowed: boolean;
};

export function resolveTapExecPlan(params: {
  price: number;
  direction: 'LONG' | 'SHORT' | null;
  battleZone: TapBattleZone | null;
  eventPath: boolean;
  eventScore: number;
  atZone: boolean;
  hasReclaim: boolean;
  hasMicro: boolean;
  /** 예상 가격변동 비율 (0.003 = 0.3%) */
  expectedMovePct: number | null;
  /** 왕복 비용 비율 근사 */
  roundTripCostPct: number;
}): TapExecPlan {
  const px = params.price;
  const z = params.battleZone;
  const cost = Math.max(0.0004, params.roundTripCostPct);
  const move = params.expectedMovePct;
  const moveOk = move != null && move >= cost * 1.8;

  /** §16 MARKET SCALP — 강한 이벤트 + 즉각 리클레임·미세구조 */
  const scalpOk =
    params.eventPath &&
    params.eventScore >= 72 &&
    params.hasReclaim &&
    params.hasMicro &&
    moveOk;

  if (scalpOk && px > 0) {
    return {
      execKind: 'MARKET_SCALP',
      orderType: 'MARKET',
      entryHint: px,
      noteKo: '이벤트·리클레임 확인 · 시장가 스캘프',
      marketAllowed: true,
    };
  }

  /** §17 ZONE SNIPER */
  if (z && z.lo > 0 && z.hi > 0 && params.direction) {
    const edge =
      params.direction === 'LONG'
        ? z.lo + (z.hi - z.lo) * 0.25
        : z.hi - (z.hi - z.lo) * 0.25;
    const mid = z.mid || (z.lo + z.hi) / 2;

    if (params.atZone && params.hasReclaim && params.hasMicro) {
      return {
        execKind: 'ZONE_SNIPER',
        orderType: 'LIMIT_CONFIRMED',
        entryHint: edge,
        noteKo: '전투구간 도달·확인 후 지정가',
        marketAllowed: false,
      };
    }
    if (params.atZone || (px >= z.lo * 0.998 && px <= z.hi * 1.002)) {
      return {
        execKind: 'ZONE_SNIPER',
        orderType: 'LIMIT_PRE',
        entryHint: mid,
        noteKo: '고품질 존 사전 Limit · 트리거 대기',
        marketAllowed: false,
      };
    }
    return {
      execKind: 'ZONE_SNIPER',
      orderType: 'WAIT',
      entryHint: mid,
      noteKo: '전투구간 미도달 · 추격 금지',
      marketAllowed: false,
    };
  }

  return {
    execKind: 'WAIT',
    orderType: 'WAIT',
    entryHint: px > 0 ? px : null,
    noteKo: '실행유형 미정 · 대기',
    marketAllowed: false,
  };
}
