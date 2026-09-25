/**
 * XRP 전용 — 독수리1호 4패턴(필수3+보너스) 스캔·신호.
 * 캔들LS와 분리. 확정 승률·수익 아님.
 */
import type { Candle } from '@/types';
import { evaluateFourStrategyPack } from '@/lib/doksuri1/fourStrategyEngine';
import {
  FOUR_STRATEGY_EN,
  FOUR_STRATEGY_KO,
  type FourStrategyId,
  type FourStrategySide,
  type FourStrategyGrade,
  type MandatoryCheck,
  type BonusItem,
} from '@/lib/doksuri1/fourStrategyTypes';
import { ULTRA_SCALP_CORE_TFS } from '@/lib/doksuri1/ultraScalpEngine';

export const XRP_4STRAT_SYMBOL = 'XRPUSDT';

export function listXrpFourStrategyTimeframes(): readonly string[] {
  return ULTRA_SCALP_CORE_TFS;
}

export type XrpFourStrategySignal = {
  signalId: string;
  symbol: string;
  timeframe: string;
  direction: FourStrategySide;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  score: number;
  grade: FourStrategyGrade;
  mandatoryCount: number;
  bonusScore: number;
  mandatory: MandatoryCheck[];
  bonusItems: BonusItem[];
  fourStrategyId: FourStrategyId;
  fourSupporting: FourStrategyId[];
  regime: string;
  noteKo: string;
  boardKo: string;
  closedBarTime: number;
};

export function scanXrpFourStrategyOnClosedBar(params: {
  candles: Candle[];
  timeframe: string;
  leverage: number;
  tp1RoePct?: number;
  tp2RoePct?: number;
  rocketDir?: 'LONG' | 'SHORT' | null;
}): XrpFourStrategySignal | null {
  const pack = evaluateFourStrategyPack({
    symbol: XRP_4STRAT_SYMBOL,
    timeframe: params.timeframe,
    candles: params.candles,
    leverage: params.leverage,
    tp1RoePct: params.tp1RoePct ?? 5,
    tp2RoePct: params.tp2RoePct ?? 7,
    rocketDir: params.rocketDir ?? null,
    treatLastClosed: false,
  });
  const c = pack.candidate;
  if (!c || c.rejectReason || !(c.entry > 0) || !(c.stop > 0) || !c.allowPaper) {
    return null;
  }
  if (c.mandatoryCount < 3 || c.score < 60) return null;

  const n = params.candles.length;
  const closed = params.candles[Math.max(0, n - 2)];
  const closedT = Number(closed?.time) || Math.floor(Date.now() / 1000);
  const id = c.primaryStrategy;
  const signalId = `xrp-4s-${params.timeframe}-${id}-${c.side}-${closedT}`;

  const mandLine = c.mandatory.map((m) => `${m.ok ? '✓' : '✗'}${m.labelKo}`).join(' ');
  const bonusLine = c.bonusItems.length
    ? c.bonusItems.map((b) => `${b.labelKo}+${b.points}`).join(' ')
    : '보너스0';
  const boardKo = [
    `${XRP_4STRAT_SYMBOL}`,
    `STRATEGY ${FOUR_STRATEGY_EN[id]}`,
    `SIDE ${c.side}`,
    `MANDATORY ${c.mandatoryCount}/3 · ${mandLine}`,
    `BONUS ${bonusLine}`,
    `TOTAL ${c.score}/100 · ${c.grade}`,
    `STATUS ENTRY CANDIDATE`,
  ].join('\n');

  return {
    signalId,
    symbol: XRP_4STRAT_SYMBOL,
    timeframe: params.timeframe,
    direction: c.side,
    entry: c.entry,
    sl: c.stop,
    tp1: c.tp1,
    tp2: c.tp2,
    score: c.score,
    grade: c.grade,
    mandatoryCount: c.mandatoryCount,
    bonusScore: c.bonusScore,
    mandatory: c.mandatory,
    bonusItems: c.bonusItems,
    fourStrategyId: id,
    fourSupporting: c.supportingStrategies,
    regime: c.regime,
    noteKo: `XRP ${FOUR_STRATEGY_KO[id]} ${c.side === 'LONG' ? '롱' : '숏'} · ${c.grade} ${c.score}점`,
    boardKo,
    closedBarTime: closedT,
  };
}
