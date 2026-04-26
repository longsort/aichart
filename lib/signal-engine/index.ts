import type { MarketDataInput, SignalReason, SignalResult } from './types';
import { contextFilter } from './contextFilter';
import { liquiditySweep } from './liquiditySweep';
import { divergence } from './divergence';
import { oiAnalysis } from './oiAnalysis';
import { absorption } from './absorption';
import { zoneReaction } from './zoneReaction';
import { orderbookStrength } from './orderbookStrength';
import { structureTrigger } from './structureTrigger';
import { signalDecision } from './signalDecision';
import { riskModel } from './riskModel';

function minConfirmMovePct(timeframe: string): number {
  const tf = (timeframe || '').toLowerCase();
  if (tf === '1m') return 0.03;
  if (tf === '5m') return 0.04;
  if (tf === '15m') return 0.06;
  if (tf === '1h') return 0.1;
  if (tf === '4h') return 0.15;
  return 0.2;
}

export function runFrontRunSignalEngine(input: MarketDataInput): SignalResult {
  const reasons: SignalReason[] = [];
  const ctx = contextFilter(input);
  reasons.push(...ctx.reasons);

  const sweep = liquiditySweep(input);
  const div = divergence(input);
  const oi = oiAnalysis(input);
  const absorb = absorption(input);
  const zr = zoneReaction(input);
  const ob = orderbookStrength(input);
  const trg = structureTrigger(input);

  let setupScore = 0;
  let triggerScore = 0;
  let bullishSetupCount = 0;
  let bearishSetupCount = 0;
  let bullishTriggerCount = 0;
  let bearishTriggerCount = 0;
  let bullishSetupScore = 0;
  let bearishSetupScore = 0;
  let bullishTriggerScore = 0;
  let bearishTriggerScore = 0;

  const add = (ok: boolean, code: string, label: string, score: number, bullish?: boolean) => {
    if (!ok) return;
    reasons.push({ code, label, score });
    setupScore += score;
    if (bullish === true) {
      bullishSetupCount += 1;
      bullishSetupScore += score;
    }
    if (bullish === false) {
      bearishSetupCount += 1;
      bearishSetupScore += score;
    }
  };

  add(sweep.bullish, 'SETUP_SWEEP_SELL', 'sell-side sweep', 25, true);
  add(sweep.bearish, 'SETUP_SWEEP_BUY', 'buy-side sweep', 25, false);
  add(div.bullish, 'SETUP_DIV_BULL', 'bullish divergence', 20, true);
  add(div.bearish, 'SETUP_DIV_BEAR', 'bearish divergence', 20, false);
  add(zr.demandConfirmed, 'SETUP_ZONE_DEMAND', 'demand reaction', 20, true);
  add(zr.supplyConfirmed, 'SETUP_ZONE_SUPPLY', 'supply reaction', 20, false);
  add(oi.flush, 'SETUP_OI_FLUSH', 'OI flush', 10, true);
  add(oi.weakTrend, 'SETUP_OI_WEAK', 'weak OI trend', 10, false);
  add(absorb.bullish, 'SETUP_ABS_BULL', 'bullish absorption', 10, true);
  add(absorb.bearish, 'SETUP_ABS_BEAR', 'bearish absorption', 10, false);
  add(ob.supportStrong, 'SETUP_OB_BID', 'orderbook bid wall', 10, true);
  add(ob.resistanceStrong, 'SETUP_OB_ASK', 'orderbook ask wall', 10, false);

  const addTrigger = (ok: boolean, code: string, label: string, score: number, bullish: boolean) => {
    if (!ok) return;
    reasons.push({ code, label, score });
    triggerScore += score;
    if (bullish) {
      bullishTriggerCount += 1;
      bullishTriggerScore += score;
    } else {
      bearishTriggerCount += 1;
      bearishTriggerScore += score;
    }
  };
  addTrigger(trg.bullishChoch, 'TRG_CHOCH_UP', 'bullish CHOCH', 20, true);
  addTrigger(trg.bearishChoch, 'TRG_CHOCH_DN', 'bearish CHOCH', 20, false);
  addTrigger(trg.bullishBos, 'TRG_BOS_UP', 'bullish BOS', 15, true);
  addTrigger(trg.bearishBos, 'TRG_BOS_DN', 'bearish BOS', 15, false);
  addTrigger(trg.displacementUp, 'TRG_DISP_UP', 'displacement up', 20, true);
  addTrigger(trg.displacementDown, 'TRG_DISP_DN', 'displacement down', 20, false);
  addTrigger(trg.retestHold, 'TRG_RETEST', 'retest hold/reject', 15, input.verdict !== 'SHORT');

  const invalid =
    (input.verdict === 'LONG' && (input.resistanceLevelProbability ?? 0) > 85) ||
    (input.verdict === 'SHORT' && (input.supportLevelProbability ?? 0) > 85);
  const d = signalDecision({
    bullishSetupCount,
    bearishSetupCount,
    bullishTriggerCount,
    bearishTriggerCount,
    invalid,
    contextScore: ctx.contextScore,
    setupScore,
    triggerScore,
    timeframe: input.timeframe,
    regime: input.regime,
  });

  const longCandidate = bullishSetupCount >= 3 && bullishTriggerCount >= 2;
  const shortCandidate = bearishSetupCount >= 3 && bearishTriggerCount >= 2;
  const longStrength = bullishSetupScore + bullishTriggerScore * 1.1 + bullishSetupCount * 4 + bullishTriggerCount * 5;
  const shortStrength = bearishSetupScore + bearishTriggerScore * 1.1 + bearishSetupCount * 4 + bearishTriggerCount * 5;
  const strengthDiff = Math.abs(longStrength - shortStrength);
  const preferredDirection =
    longStrength > shortStrength ? 'LONG' :
    shortStrength > longStrength ? 'SHORT' :
    'NONE';
  const ambiguousDirection = longCandidate && shortCandidate && strengthDiff < 22;
  const direction = ambiguousDirection || strengthDiff < 10 ? 'NONE' : preferredDirection;

  let finalState = d.state;
  const lastCandle = input.candles[input.candles.length - 1];
  const upImpulsePct = lastCandle ? ((Math.max(lastCandle.close, lastCandle.high) - lastCandle.open) / Math.max(1e-9, lastCandle.open)) * 100 : 0;
  const downImpulsePct = lastCandle ? ((lastCandle.open - Math.min(lastCandle.close, lastCandle.low)) / Math.max(1e-9, lastCandle.open)) * 100 : 0;
  const impulsePct = direction === 'LONG' ? upImpulsePct : direction === 'SHORT' ? downImpulsePct : 0;
  const minMove = minConfirmMovePct(input.timeframe);
  const moveConfirmed = impulsePct >= minMove;

  if (finalState === 'TRIGGERED') {
    const candidateOk = direction === 'LONG' ? longCandidate : direction === 'SHORT' ? shortCandidate : false;
    if (!candidateOk || direction === 'NONE') {
      finalState = 'WATCH';
      reasons.push({ code: 'FILTER_SIDE_CONFLICT', label: '방향 충돌로 확정 보류', score: -10 });
    } else if (!moveConfirmed) {
      finalState = 'READY';
      reasons.push({ code: 'FILTER_MIN_TICK', label: `최소 상승/하락폭(${minMove.toFixed(2)}%) 미충족`, score: -8 });
    } else if (ambiguousDirection) {
      finalState = 'READY';
      reasons.push({ code: 'FILTER_AMBIGUOUS', label: '동일 구간 양방향 충돌, 확정 보류', score: -8 });
    }
  }

  if ((finalState === 'READY' || finalState === 'TRIGGERED') && direction === 'NONE') {
    finalState = 'WATCH';
  }

  const setupDiff = Math.abs(bullishSetupCount - bearishSetupCount);
  const triggerDiff = Math.abs(bullishTriggerCount - bearishTriggerCount);
  const directionEdge = Math.min(15, setupDiff * 3 + triggerDiff * 2 + Math.min(8, Math.floor(strengthDiff / 8)));
  const stateBoost = finalState === 'TRIGGERED' ? 8 : finalState === 'READY' ? 4 : finalState === 'WATCH' ? -4 : -8;
  const confidence = Math.max(0, Math.min(100, Math.round((d.total / 130) * 100 + directionEdge + stateBoost)));
  let entry: number | undefined;
  let stop: number | undefined;
  let tp1: number | undefined;
  let tp2: number | undefined;
  let tp3: number | undefined;
  let rr: number | undefined;
  let leverage: number | undefined;
  let positionSize: number | undefined;
  let riskAmount: number | undefined;
  let spotProfitPct: number[] | undefined;
  let spotLossPct: number | undefined;
  let futuresProfitPct: number[] | undefined;
  let futuresLossPct: number | undefined;

  if ((finalState === 'READY' || finalState === 'TRIGGERED') && (direction === 'LONG' || direction === 'SHORT')) {
    entry = input.currentPrice;
    const stopDist = Math.max(input.currentPrice * 0.01, input.currentPrice * 0.006);
    stop = direction === 'LONG' ? entry - stopDist : entry + stopDist;
    const risk = riskModel({
      totalSeed: input.totalSeed ?? 1000,
      entryPrice: entry,
      stopPrice: stop,
      direction,
    });
    stop = risk.stop;
    tp1 = risk.tp1;
    tp2 = risk.tp2;
    tp3 = risk.tp3;
    rr = risk.rr;
    leverage = risk.leverage;
    positionSize = risk.positionSize;
    riskAmount = risk.riskAmount;
    spotProfitPct = risk.spotProfitPct.map((x) => Math.round(x * 100) / 100);
    spotLossPct = Math.round(risk.spotLossPct * 100) / 100;
    futuresProfitPct = risk.futuresProfitPct.map((x) => Math.round(x * 100) / 100);
    futuresLossPct = Math.round(risk.futuresLossPct * 100) / 100;
  }

  return {
    state: finalState,
    direction,
    confidence,
    signalTime: input.candles.length ? input.candles[input.candles.length - 1].time : undefined,
    entry,
    stop,
    tp1,
    tp2,
    tp3,
    rr,
    leverage,
    positionSize,
    riskAmount,
    spotProfitPct,
    spotLossPct,
    futuresProfitPct,
    futuresLossPct,
    reasons,
    contextScore: ctx.contextScore,
    setupScore,
    triggerScore,
    totalScore: d.total,
    thresholds: d.thresholds,
    timestamp: Date.now(),
  };
}

export type { SignalResult, SignalState, SignalDirection, SignalReason, MarketDataInput } from './types';
