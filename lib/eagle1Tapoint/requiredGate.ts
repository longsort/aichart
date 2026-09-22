/**
 * REQUIRED GATE — 실패 시 주문 금지.
 * Supporting evidence는 품질만 조정.
 */
import type { TapBattleZone, TapGateResult, TapScorePack } from './types';

export function evaluateRequiredGate(params: {
  qualityOk: boolean;
  hasContext: boolean;
  battleZone: TapBattleZone | null;
  price: number;
  nearZonePadPct?: number;
  hasLiquidityOrBreakout: boolean;
  hasReclaimOrAcceptance: boolean;
  hasMicroConfirm: boolean;
  tipMissingAiOnly?: boolean;
  scores: TapScorePack;
  /** §12 이벤트 경로 — LIQUIDITY/RECLAIM 중 하나 완화 가능 */
  eventPath?: boolean;
}): TapGateResult {
  const fail: string[] = [];
  const pass: string[] = [];
  const eventPath = params.eventPath === true;

  if (!params.qualityOk) fail.push('DATA_QUALITY_BAD');
  else pass.push('DATA_OK');

  if (!params.hasContext) fail.push('NO_CONTEXT');
  else pass.push('CONTEXT');

  if (params.tipMissingAiOnly) {
    fail.push('TIP_MISSING_AI_ONLY');
  }

  const z = params.battleZone;
  const px = params.price;
  const pad = Math.max(0.0015, Number(params.nearZonePadPct) || 0.004);
  if (!z || !(z.lo > 0) || !(z.hi > 0)) {
    fail.push('NO_BATTLE_ZONE');
  } else {
    pass.push('BATTLE_ZONE');
    const mid = z.mid || (z.lo + z.hi) / 2;
    const dist = Math.abs(px - mid) / Math.max(mid, 1e-9);
    const inside = px >= z.lo * (1 - pad) && px <= z.hi * (1 + pad);
    if (!inside && dist > pad * 2.5) {
      fail.push('PRICE_NOT_AT_ZONE');
    } else {
      pass.push('AT_ZONE');
    }
  }

  if (!params.hasLiquidityOrBreakout) {
    if (!(eventPath && params.hasReclaimOrAcceptance)) fail.push('NO_LIQUIDITY_EVENT');
    else pass.push('LIQUIDITY_SOFT_EVENT');
  } else pass.push('LIQUIDITY_OR_BREAKOUT');

  if (!params.hasReclaimOrAcceptance) {
    if (!(eventPath && params.hasLiquidityOrBreakout)) fail.push('NO_RECLAIM');
    else pass.push('RECLAIM_SOFT_EVENT');
  } else pass.push('RECLAIM');

  if (!params.hasMicroConfirm) fail.push('NO_MICRO_STRUCTURE');
  else pass.push('MICRO_CONFIRM');

  if (params.scores.entry < 50) fail.push('ENTRY_SCORE_LOW');
  if (params.scores.location < 45) fail.push('LOCATION_SCORE_LOW');

  return { ok: fail.length === 0, failReasons: fail, passTags: pass };
}
