/**
 * STEP13 — Zone Outcome 정의·측정.
 * HOLD / BREAK / FAKE_BREAK / SWEEP_REVERSAL / FLIP / INVALID / RANGE
 * 꼬리만으로 BREAK 확정 금지. 형성봉 미래참조 금지.
 */
import type { Candle } from '@/types';
import type { AmzMarketZone, AmzZoneRole } from './types';
import {
  DEFAULT_AMZ_OUTCOME_CONFIG,
  mergeAmzOutcomeConfig,
  type AmzOutcomeConfig,
} from './outcomeConfig';

export type AmzOutcomeKind =
  | 'HOLD'
  | 'BREAK'
  | 'FAKE_BREAK'
  | 'SWEEP_REVERSAL'
  | 'FLIP'
  | 'RANGE'
  | 'INVALID'
  | 'PENDING';

export type AmzOutcomeRecord = {
  zoneId: string;
  role: AmzZoneRole;
  eventBarIdx: number;
  eventTime: number;
  horizon: number;
  outcome: AmzOutcomeKind;
  mfePct: number;
  maePct: number;
  reactionPct: number;
  noteKo: string;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function isSupportLike(role: AmzZoneRole): boolean {
  return role === 'DEFENSE_SUPPORT' || role === 'FLIP';
}

function isResistLike(role: AmzZoneRole): boolean {
  return role === 'DEFENSE_RESISTANCE';
}

function atrAt(candles: Candle[], endExclusive: number): number {
  const from = Math.max(1, endExclusive - 14);
  let s = 0;
  let c = 0;
  for (let i = from; i < endExclusive; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    s += Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    c += 1;
  }
  const px = Number(candles[endExclusive - 1]?.close) || 1;
  return c > 0 ? s / c : px * 0.004;
}

/**
 * eventBarIdx 시점에 Zone이 "테스트/접근"된 뒤 horizon 봉의 결과.
 * candles[eventBarIdx] 는 닫힌 봉이어야 함. 이후 봉만 결과 측정.
 */
export function measureZoneOutcome(params: {
  candles: Candle[];
  zone: Pick<AmzMarketZone, 'id' | 'role' | 'outerLower' | 'outerUpper'>;
  eventBarIdx: number;
  horizon: number;
  config?: Partial<AmzOutcomeConfig> | null;
}): AmzOutcomeRecord | null {
  const cfg = mergeAmzOutcomeConfig(params.config);
  const { candles, zone, eventBarIdx, horizon } = params;
  const n = candles.length;
  /** 결과 측정에 필요한 봉이 아직 없으면 PENDING 불가 — null (미완성) */
  if (eventBarIdx < 2 || eventBarIdx + horizon >= n - 1) return null;

  const atr = atrAt(candles, eventBarIdx + 1);
  const entry = Number(candles[eventBarIdx]!.close);
  if (!(entry > 0)) return null;

  const lo = zone.outerLower;
  const hi = zone.outerUpper;
  const buf = atr * cfg.breakCloseAtrBuffer;

  let mfe = 0;
  let mae = 0;
  let firstCloseBreakIdx: number | null = null;
  let wickOnlySweep = false;
  let fakeReclaim = false;
  let sustainedBreak = false;
  let flipHold = false;

  for (let j = eventBarIdx + 1; j <= eventBarIdx + horizon; j++) {
    const c = candles[j]!;
    const cl = Number(c.close);
    const high = Number(c.high);
    const low = Number(c.low);

    if (isSupportLike(zone.role)) {
      mfe = Math.max(mfe, high - entry);
      mae = Math.max(mae, entry - low);
      const wickBreak = low < lo - buf && cl >= lo;
      const closeBreak = cl < lo - buf;
      if (wickBreak && !closeBreak) wickOnlySweep = true;
      if (closeBreak && firstCloseBreakIdx == null) firstCloseBreakIdx = j;
      if (firstCloseBreakIdx != null && j > firstCloseBreakIdx && cl >= lo) fakeReclaim = true;
      if (
        firstCloseBreakIdx != null &&
        j >= firstCloseBreakIdx + cfg.breakConfirmBars &&
        cl < lo - buf
      ) {
        sustainedBreak = true;
      }
      if (
        sustainedBreak &&
        j >= firstCloseBreakIdx! + cfg.breakConfirmBars + 1 &&
        cl < lo - buf &&
        Number(candles[j - 1]?.close) < lo
      ) {
        /** broken then stays below = flip to resistance territory */
        flipHold = true;
      }
    } else if (isResistLike(zone.role)) {
      mfe = Math.max(mfe, entry - low);
      mae = Math.max(mae, high - entry);
      const wickBreak = high > hi + buf && cl <= hi;
      const closeBreak = cl > hi + buf;
      if (wickBreak && !closeBreak) wickOnlySweep = true;
      if (closeBreak && firstCloseBreakIdx == null) firstCloseBreakIdx = j;
      if (firstCloseBreakIdx != null && j > firstCloseBreakIdx && cl <= hi) fakeReclaim = true;
      if (
        firstCloseBreakIdx != null &&
        j >= firstCloseBreakIdx + cfg.breakConfirmBars &&
        cl > hi + buf
      ) {
        sustainedBreak = true;
      }
      if (
        sustainedBreak &&
        j >= firstCloseBreakIdx! + cfg.breakConfirmBars + 1 &&
        cl > hi + buf &&
        Number(candles[j - 1]?.close) > hi
      ) {
        flipHold = true;
      }
    } else {
      mfe = Math.max(mfe, Math.abs(high - entry), Math.abs(entry - low));
      mae = Math.max(mae, Math.min(Math.abs(high - entry), Math.abs(entry - low)));
    }
  }

  const closeAt = Number(candles[eventBarIdx + horizon]!.close);
  const reactionPct = isResistLike(zone.role)
    ? ((entry - closeAt) / entry) * 100
    : ((closeAt - entry) / entry) * 100;
  const mfePct = (mfe / entry) * 100;
  const maePct = (mae / entry) * 100;

  let outcome: AmzOutcomeKind = 'RANGE';
  let noteKo = '횡보/불명확';

  if (firstCloseBreakIdx != null && fakeReclaim && !sustainedBreak) {
    outcome = 'FAKE_BREAK';
    noteKo = '종가돌파 후 Zone 복귀 · FAKE_BREAK';
  } else if (wickOnlySweep && !sustainedBreak && reactionPct >= cfg.sweepMinReversalPct) {
    outcome = 'SWEEP_REVERSAL';
    noteKo = '꼬리돌파+종가복귀 · SWEEP (꼬리≠Break)';
  } else if (sustainedBreak && flipHold) {
    outcome = 'FLIP';
    noteKo = 'Break 지속 후 반대역할 유지 · FLIP';
  } else if (sustainedBreak) {
    outcome = 'BREAK';
    noteKo = '종가확인+지속 · BREAK';
  } else if (
    reactionPct >= cfg.holdMinReactionPct &&
    mfePct >= cfg.holdMinReactionPct &&
    mfe >= atr * cfg.holdMinReactionAtr &&
    firstCloseBreakIdx == null
  ) {
    outcome = 'HOLD';
    noteKo = '유의미 반응 · HOLD';
  } else if (maePct > mfePct * 2 && reactionPct < -cfg.holdMinReactionPct) {
    outcome = 'INVALID';
    noteKo = '역방향 우세 · INVALID 참고';
  }

  return {
    zoneId: zone.id,
    role: zone.role,
    eventBarIdx,
    eventTime: Number(candles[eventBarIdx]!.time),
    horizon,
    outcome,
    mfePct: Math.round(mfePct * 100) / 100,
    maePct: Math.round(maePct * 100) / 100,
    reactionPct: Math.round(reactionPct * 100) / 100,
    noteKo,
  };
}

export { DEFAULT_AMZ_OUTCOME_CONFIG, mergeAmzOutcomeConfig };
