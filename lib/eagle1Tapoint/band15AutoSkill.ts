/**
 * 호칭: 15분밴드자동 (BAND15_AUTO)
 * 전 코인 자동주문 본체. 구 QS/SNIPER/오토/캔들합류 주문 아님.
 * LIVE 승격 전 Paper. 확정 수익 아님.
 */
export const BAND15_AUTO_HOCHUNG = '15분밴드자동' as const;
export const BAND15_AUTO_CALLSIGN = 'BAND15_AUTO' as const;
export const BAND15_AUTO_SKILL_ID = 'band15Auto' as const;
export const BAND15_AUTO_ENGINE_ID = 'INST_BAND_15M_PAPER' as const;
export const BAND15_AUTO_TF = '15m' as const;

export function band15AutoWhyKo(fire: boolean): string {
  return fire
    ? `${BAND15_AUTO_HOCHUNG} · 밴드1·2 정렬 READY · Paper · LIVE아님`
    : `${BAND15_AUTO_HOCHUNG} · 대기`;
}
