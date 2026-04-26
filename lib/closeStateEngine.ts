import type { CloseLevels } from './closeLevelEngine';

export type CloseState = 'above' | 'below' | 'reclaiming' | 'rejected' | 'accepted_above' | 'accepted_below';

export type CloseTf = 'daily' | 'weekly' | 'monthly' | '1m' | '5m' | '15m' | '1h' | '4h';

export type CloseStateResult = {
  dailyState: CloseState | null;
  weeklyState: CloseState | null;
  monthlyState: CloseState | null;
  state1m?: CloseState | null;
  state5m?: CloseState | null;
  state15m?: CloseState | null;
  state1h?: CloseState | null;
  state4h?: CloseState | null;
  acceptedLevels: Array<{ tf: CloseTf; price: number }>;
  rejectedLevels: Array<{ tf: CloseTf; price: number }>;
};

const BAND_PCT = 0.001;

function stateAtLevel(currentPrice: number, level: number): CloseState {
  const band = level * BAND_PCT;
  if (currentPrice > level + band) return 'accepted_above';
  if (currentPrice < level - band) return 'accepted_below';
  return 'reclaiming';
}

function pushState(
  level: number | null | undefined,
  state: CloseState | null,
  tf: CloseTf,
  accepted: Array<{ tf: CloseTf; price: number }>,
  rejected: Array<{ tf: CloseTf; price: number }>
) {
  if (level == null) return;
  if (state === 'accepted_above') accepted.push({ tf, price: level });
  else if (state === 'accepted_below') rejected.push({ tf, price: level });
}

/**
 * 현재가와 각 종가 레벨 관계 판정. 분·시간·일·주·월 전부.
 */
export function computeCloseState(
  currentPrice: number,
  levels: CloseLevels
): CloseStateResult {
  const acceptedLevels: Array<{ tf: CloseTf; price: number }> = [];
  const rejectedLevels: Array<{ tf: CloseTf; price: number }> = [];

  const dailyState = levels.dailyCloseLevel != null ? stateAtLevel(currentPrice, levels.dailyCloseLevel) : null;
  const weeklyState = levels.weeklyCloseLevel != null ? stateAtLevel(currentPrice, levels.weeklyCloseLevel) : null;
  const monthlyState = levels.monthlyCloseLevel != null ? stateAtLevel(currentPrice, levels.monthlyCloseLevel) : null;
  const state1m = levels.close1m != null ? stateAtLevel(currentPrice, levels.close1m) : null;
  const state5m = levels.close5m != null ? stateAtLevel(currentPrice, levels.close5m) : null;
  const state15m = levels.close15m != null ? stateAtLevel(currentPrice, levels.close15m) : null;
  const state1h = levels.close1h != null ? stateAtLevel(currentPrice, levels.close1h) : null;
  const state4h = levels.close4h != null ? stateAtLevel(currentPrice, levels.close4h) : null;

  pushState(levels.dailyCloseLevel, dailyState, 'daily', acceptedLevels, rejectedLevels);
  pushState(levels.weeklyCloseLevel, weeklyState, 'weekly', acceptedLevels, rejectedLevels);
  pushState(levels.monthlyCloseLevel, monthlyState, 'monthly', acceptedLevels, rejectedLevels);
  pushState(levels.close1m, state1m, '1m', acceptedLevels, rejectedLevels);
  pushState(levels.close5m, state5m, '5m', acceptedLevels, rejectedLevels);
  pushState(levels.close15m, state15m, '15m', acceptedLevels, rejectedLevels);
  pushState(levels.close1h, state1h, '1h', acceptedLevels, rejectedLevels);
  pushState(levels.close4h, state4h, '4h', acceptedLevels, rejectedLevels);

  return {
    dailyState,
    weeklyState,
    monthlyState,
    state1m,
    state5m,
    state15m,
    state1h,
    state4h,
    acceptedLevels,
    rejectedLevels,
  };
}
