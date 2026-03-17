import type { CloseLevels } from './closeLevelEngine';
import type { CloseStateResult } from './closeStateEngine';

export type CloseScenarioItem = {
  tf: 'daily' | 'weekly' | 'monthly';
  state: string;
  message: string;
};

export type CloseScenarioResult = {
  closeBias: 'bullish' | 'bearish' | 'neutral';
  buyZoneBoost: number;
  sellZoneBoost: number;
  mustHoldCloseLevel: number | null;
  mustReclaimCloseLevel: number | null;
  closeScenarios: CloseScenarioItem[];
};

/**
 * 종가 레벨 상태를 매수/매도 시나리오에 반영.
 * - 일봉 종가선 위 안착 + 주봉선 위 유지 = 매수 우세 가점
 * - 일봉 종가선 회복 실패 + 주봉선 아래 = 매도 우세 가점
 * - reclaiming = trigger 대기
 * - accepted_below = rejection 가점 (매도 쪽)
 */
export function computeCloseScenario(
  levels: CloseLevels,
  stateResult: CloseStateResult
): CloseScenarioResult {
  const scenarios: CloseScenarioItem[] = [];
  let buyBoost = 0;
  let sellBoost = 0;

  const add = (tf: 'daily' | 'weekly' | 'monthly', state: string | null, price: number | null) => {
    if (state == null || price == null) return;
    let message = '';
    if (state === 'accepted_above') {
      message = `${tf === 'daily' ? '일봉' : tf === 'weekly' ? '주봉' : '월봉'} 종가선 위 안착`;
      buyBoost += tf === 'daily' ? 5 : tf === 'weekly' ? 8 : 10;
    } else if (state === 'accepted_below') {
      message = `${tf === 'daily' ? '일봉' : tf === 'weekly' ? '주봉' : '월봉'} 종가선 아래`;
      sellBoost += tf === 'daily' ? 5 : tf === 'weekly' ? 8 : 10;
    } else if (state === 'reclaiming') {
      message = `${tf === 'daily' ? '일봉' : tf === 'weekly' ? '주봉' : '월봉'} 종가선 근처 재진입 테스트`;
    }
    if (message) scenarios.push({ tf, state, message });
  };

  add('daily', stateResult.dailyState, levels.dailyCloseLevel);
  add('weekly', stateResult.weeklyState, levels.weeklyCloseLevel);
  add('monthly', stateResult.monthlyState, levels.monthlyCloseLevel);

  let closeBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (buyBoost > sellBoost) closeBias = 'bullish';
  else if (sellBoost > buyBoost) closeBias = 'bearish';

  const mustHoldCloseLevel =
    stateResult.acceptedLevels.length > 0
      ? Math.min(...stateResult.acceptedLevels.map((l) => l.price))
      : null;
  const mustReclaimCloseLevel =
    stateResult.rejectedLevels.length > 0
      ? stateResult.rejectedLevels.map((l) => l.price).sort((a, b) => b - a)[0] ?? null
      : null;

  return {
    closeBias,
    buyZoneBoost: Math.min(25, buyBoost),
    sellZoneBoost: Math.min(25, sellBoost),
    mustHoldCloseLevel,
    mustReclaimCloseLevel,
    closeScenarios: scenarios,
  };
}
