/**
 * Doksuri-1 — zone·행동 기준 주방향 (양방향 풀플랜 혼선 방지).
 * 확정 수익·진입 지시 아님.
 */
import type { Doksuri1Fact } from '@/lib/doksuri1/types';

export type Doksuri1FocusSide = 'LONG' | 'SHORT' | 'WAIT';

function moneyNearBias(fact: Doksuri1Fact): Doksuri1FocusSide | null {
  const lines = fact.mergedDeskMoneyAnalysisKo ?? [];
  const blob = lines.join(' ');
  const nearLong = /근접[^\n]*\$\$\$\$?롱|근접[^\n]*롱 \$\$\$\$|\$\$\$\$롱[^\n]*거리/.test(blob);
  const nearShort = /근접[^\n]*\$\$\$\$?숏|근접[^\n]*숏 \$\$\$\$|\$\$\$\$숏[^\n]*거리/.test(blob);
  if (nearLong && nearShort) return 'WAIT';
  if (nearLong) return 'LONG';
  if (nearShort) return 'SHORT';

  const flags = fact.mergedDeskIntelFlags;
  if (!flags?.nearMoney) return null;
  const mapBlob = (fact.mergedDeskIntelLinesKo ?? []).join(' ');
  const cartLong = /🛒[^\n]*\$\$\$\$롱/.test(mapBlob);
  const cartShort = /🛒[^\n]*\$\$\$\$숏/.test(mapBlob);
  if (cartLong && !cartShort) return 'LONG';
  if (cartShort && !cartLong) return 'SHORT';
  return null;
}

function zoneBattleBias(fact: Doksuri1Fact): Doksuri1FocusSide | null {
  const floorTest = fact.zoneScores.some(
    (z) =>
      (z.labelKo.includes('지지') || z.labelKo.includes('폭락')) &&
      (z.state === 'TESTING' || z.state === 'DEFENDING' || z.state === 'RECLAIMED')
  );
  const ceilApproach = fact.zoneScores.some(
    (z) =>
      (z.labelKo.includes('매도') || z.labelKo.includes('저항')) &&
      (z.state === 'APPROACHING' || z.state === 'TESTING' || z.state === 'BREAK_ATTEMPT')
  );
  if (floorTest && !ceilApproach) return 'LONG';
  if (ceilApproach && !floorTest) return 'SHORT';
  return null;
}

/** 현재 전황에서 풀로 보여줄 쪽 — 반대는 한 줄만 */
export function resolveDoksuri1FocusSide(fact: Doksuri1Fact): Doksuri1FocusSide {
  if (fact.action === 'CONFIRMED_LONG' || fact.action === 'WATCH_LONG') return 'LONG';
  if (fact.action === 'CONFIRMED_SHORT' || fact.action === 'WATCH_SHORT') return 'SHORT';

  const longOk =
    fact.longPlan.status === 'READY' ||
    fact.longPlan.status === 'WAIT_CONFIRMATION' ||
    fact.longPlan.status === 'WAIT_PULLBACK' ||
    fact.longPlan.status === 'ACTIVE';
  const shortOk =
    fact.shortPlan.status === 'READY' ||
    fact.shortPlan.status === 'WAIT_CONFIRMATION' ||
    fact.shortPlan.status === 'WAIT_PULLBACK' ||
    fact.shortPlan.status === 'ACTIVE';
  const longLate = fact.longPlan.status === 'TOO_LATE' || fact.longPlan.status === 'INVALID';
  const shortLate = fact.shortPlan.status === 'TOO_LATE' || fact.shortPlan.status === 'INVALID';

  if (longOk && shortLate) return 'LONG';
  if (shortOk && longLate) return 'SHORT';

  const money = moneyNearBias(fact);
  if (money === 'LONG' || money === 'SHORT') return money;

  const zone = zoneBattleBias(fact);
  if (zone === 'LONG' || zone === 'SHORT') return zone;

  if (fact.dominantSide === 'BUYERS' && !longLate) return 'LONG';
  if (fact.dominantSide === 'SELLERS' && !shortLate) return 'SHORT';

  if (fact.structureLabelKo?.includes('반등') || fact.structureLabelKo?.includes('상승')) {
    if (!longLate) return 'LONG';
  }
  if (fact.structureLabelKo?.includes('하락') || fact.structureLabelKo?.includes('붕괴')) {
    if (!shortLate) return 'SHORT';
  }

  return 'WAIT';
}

export function doksuri1FocusReasonKo(fact: Doksuri1Fact, focus: Doksuri1FocusSide): string {
  if (focus === 'WAIT') return '양방향 미확정 · 풀플랜 생략 · zone·안착 확인 후';
  if (focus === 'LONG') {
    if (fact.action === 'WATCH_LONG' || fact.action === 'CONFIRMED_LONG') {
      return '행동·zone 기준 롱쪽만 전개';
    }
    if (fact.shortPlan.status === 'TOO_LATE') return '숏 TOO_LATE · 롱쪽만 전개';
    return '지지·$$$$·우세 기준 롱쪽만 전개';
  }
  if (fact.action === 'WATCH_SHORT' || fact.action === 'CONFIRMED_SHORT') {
    return '행동·zone 기준 숏쪽만 전개';
  }
  if (fact.longPlan.status === 'TOO_LATE') return '롱 TOO_LATE · 숏쪽만 전개';
  return '저항·$$$$·우세 기준 숏쪽만 전개';
}
