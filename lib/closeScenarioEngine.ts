import type { CloseLevels } from './closeLevelEngine';
import type { CloseStateResult } from './closeStateEngine';

export type CloseScenarioTf = '1m' | '5m' | '15m' | '1h' | '4h' | 'daily' | 'weekly' | 'monthly';

export type CloseScenarioItem = {
  tf: CloseScenarioTf;
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
 * 분·시간·일·주·월 동일 규칙: 위 안착 가점, 아래 거절 가점, reclaiming 은 대기.
 */
export function computeCloseScenario(
  levels: CloseLevels,
  stateResult: CloseStateResult
): CloseScenarioResult {
  const scenarios: CloseScenarioItem[] = [];
  let buyBoost = 0;
  let sellBoost = 0;

  const addTf = (
    tf: CloseScenarioTf,
    state: string | null | undefined,
    price: number | null | undefined,
    label: string,
    buyW: number,
    sellW: number
  ) => {
    if (state == null || price == null) return;
    let message = '';
    if (state === 'accepted_above') {
      message = `${label} 종가선 위 안착`;
      buyBoost += buyW;
    } else if (state === 'accepted_below') {
      message = `${label} 종가선 아래`;
      sellBoost += sellW;
    } else if (state === 'reclaiming') {
      message = `${label} 종가선 근처 재진입 테스트`;
    }
    if (message) scenarios.push({ tf, state, message });
  };

  addTf('1m', stateResult.state1m, levels.close1m, '1m', 2, 2);
  addTf('5m', stateResult.state5m, levels.close5m, '5m', 2, 2);
  addTf('15m', stateResult.state15m, levels.close15m, '15m', 3, 3);
  addTf('1h', stateResult.state1h, levels.close1h, '1h', 4, 4);
  addTf('4h', stateResult.state4h, levels.close4h, '4h', 5, 5);
  addTf('daily', stateResult.dailyState, levels.dailyCloseLevel, '일봉', 5, 5);
  addTf('weekly', stateResult.weeklyState, levels.weeklyCloseLevel, '주봉', 8, 8);
  addTf('monthly', stateResult.monthlyState, levels.monthlyCloseLevel, '월봉', 10, 10);

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
