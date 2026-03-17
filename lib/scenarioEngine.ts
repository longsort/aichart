/**
 * 레벨 엔진 결과를 바탕으로 시나리오 문장 생성
 * - mustHold / mustBreak / invalidation
 * - bullishScenario / bearishScenario
 * - nextTargets
 */

import type { LevelEngineOutput } from './levelEngine';
import type { Verdict } from '@/types';

export type ScenarioEngineInput = {
  levels: LevelEngineOutput;
  verdict: Verdict;
  currentPrice: number;
  entry: number;
  stopLoss: number;
  targets: number[];
};

export type ScenarioEngineOutput = {
  mustHold: string;
  mustBreak: string;
  invalidation: string;
  bullishScenario: string;
  bearishScenario: string;
  nextTargets: string[];
};

function formatPrice(p: number): string {
  return p >= 1000 ? p.toFixed(2) : p.toFixed(4);
}

export function computeScenarios(input: ScenarioEngineInput): ScenarioEngineOutput {
  const { levels, verdict, currentPrice, entry, stopLoss, targets } = input;
  const { breakoutLevel, supportLevel, invalidationLevel } = levels;

  const mustHold = supportLevel != null
    ? `${formatPrice(supportLevel.price)} 지지선을 지켜야 상승이 유효합니다. (${supportLevel.reason})`
    : `${formatPrice(currentPrice * 0.99)} 이하 이탈 시 하락으로 전환될 수 있습니다.`;

  const mustBreak = breakoutLevel != null
    ? `${formatPrice(breakoutLevel.price)} 저항을 돌파해야 상승이 확정됩니다. (${breakoutLevel.reason})`
    : '현재 구간 위 유의미한 저항이 없습니다.';

  const invalidation = invalidationLevel != null
    ? `${formatPrice(invalidationLevel.price)} 이탈 시 하락 확정(롱 무효화). (${invalidationLevel.reason})`
    : '지지 이탈 시 하락 시나리오로 전환됩니다.';

  const bullishScenario = breakoutLevel != null
    ? `${formatPrice(breakoutLevel.price)} 돌파 후 ${targets.length ? `목표 ${targets.slice(0, 2).map(t => formatPrice(t)).join(', ')}` : '추가 상승'} 구간으로 진행 가능.`
    : '저항 돌파 시 상승 지속.';

  const bearishScenario = invalidationLevel != null
    ? `${formatPrice(invalidationLevel.price)} 이탈 시 하락 확정, 손절 ${formatPrice(stopLoss)} 인근.`
    : '지지 이탈 시 하락 가속.';

  const nextTargets = targets.length > 0
    ? targets.slice(0, 5).map((t, i) => `TP${i + 1} ${formatPrice(t)}`)
    : breakoutLevel != null
      ? [`Breakout ${formatPrice(breakoutLevel.price)}`]
      : [];

  return {
    mustHold,
    mustBreak,
    invalidation,
    bullishScenario,
    bearishScenario,
    nextTargets,
  };
}
