/**
 * Doksuri-1 — 상태전이 dedupe (텔레그램/카드 반복 알림 금지).
 */
import type { ZoneBattleState } from '@/lib/doksuri1/types';

export type Doksuri1StateFingerprint = {
  factHash: string;
  dominantSide: string;
  bigMoneyState: string;
  action: string;
  zoneStatesKey: string;
  candleEventFingerprint: string;
};

const lastByKey = new Map<string, Doksuri1StateFingerprint>();
const lastCandleEmitByKey = new Map<string, string>();

export function zoneStatesKey(
  zones: Array<{ zoneId: string; state: ZoneBattleState }> | null | undefined
): string {
  if (!zones?.length) return '';
  return zones
    .slice(0, 8)
    .map((z) => `${z.zoneId}:${z.state}`)
    .join('|');
}

export function buildDoksuri1StateFingerprint(params: {
  factHash: string;
  dominantSide: string;
  bigMoneyState: string;
  action: string;
  zoneScores?: Array<{ zoneId: string; state: ZoneBattleState }> | null;
  candleEventFingerprint?: string | null;
}): Doksuri1StateFingerprint {
  return {
    factHash: params.factHash,
    dominantSide: params.dominantSide,
    bigMoneyState: params.bigMoneyState,
    action: params.action,
    zoneStatesKey: zoneStatesKey(params.zoneScores),
    candleEventFingerprint: params.candleEventFingerprint || 'none',
  };
}

/** true면 상태 변경 → 알림/갱신 허용. false면 스킵 */
export function shouldEmitDoksuri1StateChange(
  scopeKey: string,
  next: Doksuri1StateFingerprint
): boolean {
  const prev = lastByKey.get(scopeKey);
  if (
    prev &&
    prev.factHash === next.factHash &&
    prev.dominantSide === next.dominantSide &&
    prev.bigMoneyState === next.bigMoneyState &&
    prev.action === next.action &&
    prev.zoneStatesKey === next.zoneStatesKey &&
    prev.candleEventFingerprint === next.candleEventFingerprint
  ) {
    return false;
  }
  lastByKey.set(scopeKey, next);
  return true;
}

/**
 * 캔들 이벤트 안착/실패 전이만 — 수시 전송 방지.
 * worthy=false면 항상 false.
 */
export function shouldEmitDoksuri1CandleEvent(
  scopeKey: string,
  fingerprint: string,
  worthy: boolean
): boolean {
  if (!worthy || !fingerprint || fingerprint === 'none') return false;
  const prev = lastCandleEmitByKey.get(scopeKey);
  if (prev === fingerprint) return false;
  lastCandleEmitByKey.set(scopeKey, fingerprint);
  return true;
}

export function clearDoksuri1StateDedupe(scopeKey?: string): void {
  if (scopeKey) {
    lastByKey.delete(scopeKey);
    lastCandleEmitByKey.delete(scopeKey);
  } else {
    lastByKey.clear();
    lastCandleEmitByKey.clear();
  }
}
