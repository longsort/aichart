/**
 * 통합·분석 Mirage TV zone — 안착·확정·실패·재시도·BOS·CHOCH 상태 (조건부 참고, 검증 필요).
 */
import type { Candle, OverlayItem } from '@/types';
import { snapMergedOverlayTimeToCandles } from '@/lib/mergedAnalysisOverlayTimes';
import { isMergedDeskMirageTvZoneOverlay } from '@/lib/mergedAnalysisOverlayIds';

export type MirageZoneLifecycleKey =
  | 'analyze'
  | 'settled'
  | 'confirmed'
  | 'settle_fail'
  | 'retry_possible'
  | 'retry_fail'
  | 'bos'
  | 'choch';

export type MirageZoneLifecycleTag = {
  key: MirageZoneLifecycleKey;
  labelKo: string;
  detailKo: string;
  stateClass: string;
};

type ZoneRole = 'support' | 'resistance' | 'ob_bull' | 'ob_bear' | 'neutral';

function candleIndexAtOrBefore(candles: Candle[], t: number): number {
  if (!candles.length) return 0;
  let lo = 0;
  let hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (Number(candles[mid]!.time) <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function inferZoneRole(item: OverlayItem): ZoneRole {
  const id = String(item.id || '');
  const extra = String(item.overlayZoneExtraClass || '');
  if (extra.includes('ob-bull') || extra.includes('smc-bull')) return 'ob_bull';
  if (extra.includes('ob-bear') || extra.includes('smc-bear')) return 'ob_bear';
  if (id.includes('support') || extra.includes('support')) return 'support';
  if (id.includes('resist') || extra.includes('resist')) return 'resistance';
  if (item.structureBias === 'bullish') return 'support';
  if (item.structureBias === 'bearish') return 'resistance';
  return 'neutral';
}

function baseCaption(item: OverlayItem): string {
  const raw = String(item.label || '').trim();
  if (!raw) {
    if (item.structureBias === 'bearish') return '숏존';
    if (item.structureBias === 'bullish') return '롱존';
    return '존';
  }
  return raw.split('·')[0]!.trim();
}

function tagFor(
  key: MirageZoneLifecycleKey,
  labelKo: string,
  detailKo: string
): MirageZoneLifecycleTag {
  return { key, labelKo, detailKo, stateClass: `merged-ares-mlsp-tv-state-${key}` };
}

/** 형성 봉 이후 스윙 고저로 BOS·CHOCH 근접 태그 */
function detectStructureTagNearZone(
  candles: Candle[],
  fromIdx: number,
  role: ZoneRole
): MirageZoneLifecycleTag | null {
  const swings: Array<{ type: 'high' | 'low'; index: number; price: number }> = [];
  for (let i = Math.max(2, fromIdx); i < candles.length - 2; i++) {
    const c = candles[i]!;
    const p2 = candles[i - 2]!;
    const p1 = candles[i - 1]!;
    const n1 = candles[i + 1]!;
    const n2 = candles[i + 2]!;
    if (c.high > p1.high && c.high > p2.high && c.high > n1.high && c.high > n2.high) {
      swings.push({ type: 'high', index: i, price: c.high });
    }
    if (c.low < p1.low && c.low < p2.low && c.low < n1.low && c.low < n2.low) {
      swings.push({ type: 'low', index: i, price: c.low });
    }
  }
  if (swings.length < 3) return null;

  let trend: 'bullish' | 'bearish' | 'range' = 'range';
  let lastBos: 'bullish' | 'bearish' | null = null;
  let lastChoch: 'bullish' | 'bearish' | null = null;

  for (let i = 2; i < swings.length; i++) {
    const a = swings[i - 2]!;
    const c = swings[i]!;
    if (c.type === 'high' && a.type === 'high' && c.price > a.price) {
      lastBos = 'bullish';
      if (trend === 'bearish') lastChoch = 'bullish';
      trend = 'bullish';
    }
    if (c.type === 'low' && a.type === 'low' && c.price < a.price) {
      lastBos = 'bearish';
      if (trend === 'bullish') lastChoch = 'bearish';
      trend = 'bearish';
    }
  }

  const bullZone = role === 'support' || role === 'ob_bull';
  const bearZone = role === 'resistance' || role === 'ob_bear';

  if (lastChoch === 'bullish' && bullZone) {
    return tagFor('choch', 'CHOCH', '하락 추세 중 상방 구조 전환 — 조건부 참고');
  }
  if (lastChoch === 'bearish' && bearZone) {
    return tagFor('choch', 'CHOCH', '상승 추세 중 하방 구조 전환 — 조건부 참고');
  }
  if (lastBos === 'bullish' && bullZone) {
    return tagFor('bos', 'BOS', '상방 구조 돌파 — 검증 필요');
  }
  if (lastBos === 'bearish' && bearZone) {
    return tagFor('bos', 'BOS', '하방 구조 돌파 — 검증 필요');
  }
  return null;
}

function evaluateZoneLifecycle(
  candles: Candle[],
  formationIdx: number,
  zoneTop: number,
  zoneBot: number,
  role: ZoneRole
): MirageZoneLifecycleTag {
  const struct = detectStructureTagNearZone(candles, formationIdx, role);
  if (struct) return struct;

  const n = candles.length;
  if (formationIdx >= n - 1) {
    return tagFor('analyze', '분석', '형성 직후 — 추가 봉 마감 후 재평가');
  }

  const expectHoldBull = role === 'support' || role === 'ob_bull';
  const expectHoldBear = role === 'resistance' || role === 'ob_bear';

  let settleStreak = 0;
  let touchCount = 0;
  let failEvents = 0;
  let retryTouches = 0;
  let sawFail = false;

  for (let i = formationIdx + 1; i < n; i++) {
    const c = candles[i]!;
    const inZone = c.close >= zoneBot && c.close <= zoneTop;
    const wickTouch =
      (c.low <= zoneTop && c.low >= zoneBot) || (c.high >= zoneBot && c.high <= zoneTop);

    if (wickTouch || inZone) touchCount++;

    const bullFail = c.close < zoneBot * (1 - 1e-6);
    const bearFail = c.close > zoneTop * (1 + 1e-6);

    if ((expectHoldBull && bullFail) || (expectHoldBear && bearFail) || (role === 'neutral' && (bullFail || bearFail))) {
      if (sawFail) failEvents++;
      sawFail = true;
      settleStreak = 0;
      continue;
    }

    if (sawFail && (wickTouch || inZone)) {
      retryTouches++;
    }

    if (inZone) settleStreak++;
    else settleStreak = 0;
  }

  if (sawFail && failEvents >= 1 && retryTouches === 0) {
    return tagFor('retry_fail', '돌파무효', '종가 zone 이탈 후 재진입 없음 — 숏/롱 활성 시나리오 아님');
  }
  if (sawFail && retryTouches > 0 && settleStreak < 2) {
    return tagFor('retry_possible', '재시도', '실패 후 zone 재접촉 — 조건부 재평가');
  }
  if (sawFail && settleStreak < 1) {
    /** 숏존 상향 돌파 / 롱존 하향 이탈 — 활성 숏·롱 캡션 금지 */
    if (expectHoldBear) {
      return tagFor('settle_fail', '숏돌파', '종가 zone 상단 돌파 — 숏존 무효(조건부)');
    }
    if (expectHoldBull) {
      return tagFor('settle_fail', '롱이탈', '종가 zone 하단 이탈 — 롱존 무효(조건부)');
    }
    return tagFor('settle_fail', '안착실패', 'zone 이탈 종가 — 상위 TF 맥락 확인');
  }
  if (settleStreak >= 2) {
    return tagFor('confirmed', '확정', '연속 종가 zone 내 유지 — 조건부 참고');
  }
  if (settleStreak >= 1 || touchCount >= 2) {
    return tagFor('settled', '안착', 'zone 내 종가·접촉 — 추가 확인 필요');
  }
  return tagFor('analyze', '분석', '형성 후 유의미한 안착 신호 없음');
}

function hasPostFormationTouch(
  candles: Candle[],
  formationIdx: number,
  zoneTop: number,
  zoneBot: number
): boolean {
  for (let i = formationIdx + 1; i < candles.length; i++) {
    const c = candles[i]!;
    const wickTouch =
      (c.low <= zoneTop && c.low >= zoneBot) || (c.high >= zoneBot && c.high <= zoneTop);
    const inZone = c.close >= zoneBot && c.close <= zoneTop;
    if (wickTouch || inZone) return true;
  }
  return false;
}

function applyLifecycleToZone(item: OverlayItem, candles: Candle[]): OverlayItem {
  const p1 = Number(item.price1);
  const p2 = Number(item.price2);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return item;

  const zoneTop = Math.max(p1, p2);
  const zoneBot = Math.min(p1, p2);
  const tForm = Number(snapMergedOverlayTimeToCandles(Number(item.time1), candles));
  const formationIdx = candleIndexAtOrBefore(candles, tForm);
  const role = inferZoneRole(item);

  /** 후반영 — 형성 이후 터치가 없으면 선반영 라벨 유지 */
  if (!hasPostFormationTouch(candles, formationIdx, zoneTop, zoneBot)) {
    return item;
  }

  const life = evaluateZoneLifecycle(candles, formationIdx, zoneTop, zoneBot, role);
  const brokenShort =
    life.key === 'settle_fail' &&
    (role === 'resistance' || role === 'ob_bear') &&
    life.labelKo.includes('돌파');
  const brokenLong =
    life.key === 'settle_fail' &&
    (role === 'support' || role === 'ob_bull') &&
    life.labelKo.includes('이탈');
  const base = brokenShort || brokenLong ? life.labelKo : baseCaption(item);
  const combinedLabel =
    brokenShort || brokenLong ? life.labelKo : `${base}·${life.labelKo}`;
  const priorTip = String(item.labelTooltip || '').trim();

  const extra = String(item.overlayZoneExtraClass || '')
    .trim()
    .split(/\s+/)
    .filter((c) => c && !c.startsWith('merged-ares-mlsp-tv-state-') && !c.startsWith('merged-desk-zone-broken'));
  extra.push(life.stateClass);
  if (brokenShort) extra.push('merged-desk-zone-broken', 'merged-desk-zone-broken--bull');
  if (brokenLong) extra.push('merged-desk-zone-broken', 'merged-desk-zone-broken--bear');

  return {
    ...item,
    label: combinedLabel,
    zoneFaceBase: brokenShort || brokenLong ? life.labelKo : item.zoneFaceBase,
    structureBias: brokenShort ? 'bullish' : brokenLong ? 'bearish' : item.structureBias,
    labelTooltip: priorTip
      ? `${priorTip} · 후반영 — ${life.detailKo}`
      : `${base} · 후반영 — ${life.detailKo}`,
    overlayZoneExtraClass: extra.join(' '),
  };
}

/** Mirage TV zone — 후반영 lifecycle (터치 이후만) */
/** @deprecated — applyMirageZoneReactiveLifecycle 사용 */
export function applyMirageZoneLifecycleLabels(
  overlays: OverlayItem[],
  candles: Candle[]
): OverlayItem[] {
  return applyMirageZoneReactiveLifecycle(overlays, candles);
}

export function applyMirageZoneReactiveLifecycle(
  overlays: OverlayItem[],
  candles: Candle[]
): OverlayItem[] {
  if (candles.length < 4) return overlays;
  return overlays.map((raw) => {
    if (!isMergedDeskMirageTvZoneOverlay(raw) || String(raw.kind) !== 'zone') return raw;
    return applyLifecycleToZone(raw, candles);
  });
}
