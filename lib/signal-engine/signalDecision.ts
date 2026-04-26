import type { SignalDirection, SignalState } from './types';

function thresholdProfile(timeframe: string, regime?: 'trend' | 'range') {
  const tf = (timeframe || '').toLowerCase();
  const isLow = tf === '1m' || tf === '5m';
  const isMid = tf === '15m' || tf === '1h';
  const rangeBoost = regime === 'range' ? 4 : 0;
  if (isLow) {
    return {
      triggeredSetup: 50 + rangeBoost,
      triggeredTrigger: 34 + rangeBoost,
      triggeredTotal: 82 + rangeBoost,
      readySetup: 38 + rangeBoost,
      readyTrigger: 18 + rangeBoost,
      watchSetup: 28 + rangeBoost,
    };
  }
  if (isMid) {
    return {
      triggeredSetup: 46 + rangeBoost,
      triggeredTrigger: 31 + rangeBoost,
      triggeredTotal: 77 + rangeBoost,
      readySetup: 35 + rangeBoost,
      readyTrigger: 15 + rangeBoost,
      watchSetup: 25 + rangeBoost,
    };
  }
  return {
    triggeredSetup: 43 + rangeBoost,
    triggeredTrigger: 28 + rangeBoost,
    triggeredTotal: 72 + rangeBoost,
    readySetup: 33 + rangeBoost,
    readyTrigger: 14 + rangeBoost,
    watchSetup: 23 + rangeBoost,
  };
}

export function signalDecision(params: {
  bullishSetupCount: number;
  bearishSetupCount: number;
  bullishTriggerCount: number;
  bearishTriggerCount: number;
  invalid: boolean;
  contextScore: number;
  setupScore: number;
  triggerScore: number;
  timeframe: string;
  regime?: 'trend' | 'range';
}) {
  const direction: SignalDirection =
    params.bullishSetupCount > params.bearishSetupCount
      ? 'LONG'
      : params.bearishSetupCount > params.bullishSetupCount
        ? 'SHORT'
        : 'NONE';
  let state: SignalState = 'NO_SIGNAL';
  const total = params.contextScore + params.setupScore + params.triggerScore;
  const th = thresholdProfile(params.timeframe, params.regime);
  if (params.invalid) state = 'INVALID';
  else if (params.setupScore >= th.triggeredSetup && params.triggerScore >= th.triggeredTrigger && total >= th.triggeredTotal) state = 'TRIGGERED';
  else if (params.setupScore >= th.readySetup && params.triggerScore >= th.readyTrigger) state = 'READY';
  else if (params.setupScore >= th.watchSetup && params.triggerScore < th.readyTrigger) state = 'WATCH';
  return {
    direction,
    state,
    total,
    thresholds: {
      triggered: { setup: th.triggeredSetup, trigger: th.triggeredTrigger, total: th.triggeredTotal },
      ready: { setup: th.readySetup, trigger: th.readyTrigger },
      watch: { setup: th.watchSetup, triggerUpper: th.readyTrigger },
      timeframe: params.timeframe,
      regime: params.regime ?? 'trend',
    },
  };
}
