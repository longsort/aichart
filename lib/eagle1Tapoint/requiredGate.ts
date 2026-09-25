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
  /** 통합 일봉면 정렬 */
  dailyFaceOk?: boolean;
  dailyFaceSoft?: boolean;
  dailyFaceTag?: string;
  /** 선진거래량 action */
  advVolumeAction?: string | null;
  /** 확정 방향 — 선진역행 차단 */
  direction?: 'LONG' | 'SHORT' | null;
  /** 실행선 기하 유효 (숏: SL>E>TP1) */
  execLevelsOk?: boolean;
  /** §24 NET EV 통과 */
  netEvOk?: boolean;
  netEvFailTag?: string | null;
  /** §19 오더플로 역행 */
  flowConflict?: boolean;
  /** §25 상관 클러스터 초과 */
  corrBlocked?: boolean;
  /** 상위 TF 스윕 역행 — 하드 차단(자동진입층에서 주로 사용) */
  htfSweepConflict?: boolean;
  htfSweepConflictTag?: string | null;
  /** 정렬/경고 패스 태그 */
  htfSweepAlignTag?: string | null;
  htfSweepWarnTag?: string | null;
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
    /** §8·§27 — 단일 피벗/증거부족 존만으로는 진입 금지 */
    const weakSingle =
      z.sources?.includes('WEAK_SINGLE') ||
      (Array.isArray(z.sources) && z.sources.length < 2 && (z.strength || 0) < 60);
    if (weakSingle) {
      fail.push('WEAK_SINGLE_ZONE');
    } else {
      pass.push('MULTI_EVIDENCE');
    }
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

  /** 일봉면 역행 — 이벤트경로면 soft, 아니면 차단 */
  if (params.dailyFaceOk === false && params.dailyFaceSoft !== true) {
    if (eventPath) pass.push(`DAILY_FACE_SOFT:${params.dailyFaceTag || '역행'}`);
    else fail.push(`DAILY_FACE_CONFLICT:${params.dailyFaceTag || '역행'}`);
  } else if (params.dailyFaceTag) {
    pass.push(`DAILY_FACE:${params.dailyFaceTag}`);
  }

  if (params.advVolumeAction === 'long-ref' || params.advVolumeAction === 'short-ref') {
    pass.push(`ADV_VOL:${params.advVolumeAction}`);
  }
  if (
    params.direction === 'LONG' &&
    params.advVolumeAction === 'short-ref'
  ) {
    fail.push('ADV_VOL_CONFLICT');
  }
  if (
    params.direction === 'SHORT' &&
    params.advVolumeAction === 'long-ref'
  ) {
    fail.push('ADV_VOL_CONFLICT');
  }

  if (params.execLevelsOk === false) {
    fail.push('EXEC_LEVELS_BAD');
  } else if (params.execLevelsOk === true) {
    pass.push('EXEC_LEVELS_OK');
  }

  if (params.netEvOk === false) {
    fail.push(params.netEvFailTag ? `NET_EV:${params.netEvFailTag}` : 'NET_EV_FAIL');
  } else if (params.netEvOk === true) {
    pass.push('NET_EV_OK');
  }

  if (params.flowConflict === true) {
    if (eventPath) pass.push('FLOW_SOFT_EVENT');
    else fail.push('FLOW_CONFLICT');
  }

  if (params.corrBlocked === true) {
    fail.push('CORR_CLUSTER_LIMIT');
  }

  if (params.htfSweepConflict === true) {
    fail.push(
      params.htfSweepConflictTag
        ? String(params.htfSweepConflictTag)
        : 'HTF_SWEEP_CONFLICT'
    );
  } else {
    if (params.htfSweepAlignTag) pass.push(String(params.htfSweepAlignTag));
    if (params.htfSweepWarnTag) pass.push(String(params.htfSweepWarnTag));
  }

  return { ok: fail.length === 0, failReasons: fail, passTags: pass };
}
