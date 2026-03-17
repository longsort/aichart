import type { CloseLevels } from './closeLevelEngine';

export type CloseState = 'above' | 'below' | 'reclaiming' | 'rejected' | 'accepted_above' | 'accepted_below';

export type CloseStateResult = {
  dailyState: CloseState | null;
  weeklyState: CloseState | null;
  monthlyState: CloseState | null;
  acceptedLevels: Array<{ tf: 'daily' | 'weekly' | 'monthly'; price: number }>;
  rejectedLevels: Array<{ tf: 'daily' | 'weekly' | 'monthly'; price: number }>;
};

const BAND_PCT = 0.001;

function stateAtLevel(currentPrice: number, level: number): CloseState {
  const band = level * BAND_PCT;
  if (currentPrice > level + band) return 'accepted_above';
  if (currentPrice < level - band) return 'accepted_below';
  return 'reclaiming';
}

/**
 * 현재가와 각 종가 레벨 관계 판정.
 * accepted_above: 가격이 레벨 위에서 안착
 * accepted_below: 가격이 레벨 아래에서 안착
 * reclaiming: 레벨 근처에서 재진입/테스트 중
 */
export function computeCloseState(
  currentPrice: number,
  levels: CloseLevels
): CloseStateResult {
  const acceptedLevels: Array<{ tf: 'daily' | 'weekly' | 'monthly'; price: number }> = [];
  const rejectedLevels: Array<{ tf: 'daily' | 'weekly' | 'monthly'; price: number }> = [];

  const dailyState = levels.dailyCloseLevel != null
    ? stateAtLevel(currentPrice, levels.dailyCloseLevel)
    : null;
  const weeklyState = levels.weeklyCloseLevel != null
    ? stateAtLevel(currentPrice, levels.weeklyCloseLevel)
    : null;
  const monthlyState = levels.monthlyCloseLevel != null
    ? stateAtLevel(currentPrice, levels.monthlyCloseLevel)
    : null;

  if (dailyState === 'accepted_above' && levels.dailyCloseLevel != null) acceptedLevels.push({ tf: 'daily', price: levels.dailyCloseLevel });
  if (dailyState === 'accepted_below' && levels.dailyCloseLevel != null) rejectedLevels.push({ tf: 'daily', price: levels.dailyCloseLevel });
  if (weeklyState === 'accepted_above' && levels.weeklyCloseLevel != null) acceptedLevels.push({ tf: 'weekly', price: levels.weeklyCloseLevel });
  if (weeklyState === 'accepted_below' && levels.weeklyCloseLevel != null) rejectedLevels.push({ tf: 'weekly', price: levels.weeklyCloseLevel });
  if (monthlyState === 'accepted_above' && levels.monthlyCloseLevel != null) acceptedLevels.push({ tf: 'monthly', price: levels.monthlyCloseLevel });
  if (monthlyState === 'accepted_below' && levels.monthlyCloseLevel != null) rejectedLevels.push({ tf: 'monthly', price: levels.monthlyCloseLevel });

  return {
    dailyState,
    weeklyState,
    monthlyState,
    acceptedLevels,
    rejectedLevels,
  };
}
