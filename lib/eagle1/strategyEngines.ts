/**
 * Strategy engines (래핑) — 기존 structure/zone/acceptance/falseBreak/poc 재사용.
 * 신규 원리만 StrategyZone으로 출력. 트레이더 이름 UI 금지.
 */

import type { Eagle1Bar, StructureSnapshot } from './structureEngine';
import { lastSweepLiquidity } from './structureEngine';
import type { Eagle1Zone, PocState, ZoneEngineResult } from './zoneEngine';
import type { StructureAcceptanceReport } from './structureAcceptanceEngine';
import type { FalseBreakReport } from './falseBreakEngine';
import type { OrderFlowReport } from './orderFlowFacade';
import type { Eagle1RiskPlan } from './riskEngine';
import {
  emptyStrategyStats,
  type StrategyType,
  type StrategyZone,
} from './strategyZone';
import type { MarketZoneEvidence } from './marketZone';

function ev(id: string, group: MarketZoneEvidence['group'], label: string, available: boolean, score: number | null = null): MarketZoneEvidence {
  return { id, group, label, score: available ? score : null, available };
}

function mk(
  partial: Omit<StrategyZone, keyof ReturnType<typeof emptyStrategyStats>> & Partial<ReturnType<typeof emptyStrategyStats>>
): StrategyZone {
  return { ...emptyStrategyStats(), ...partial };
}

/** §11 Trend Break — BOS + HTF bias + acceptance */
export function runTrendBreakStrategy(params: {
  structure: StructureSnapshot;
  acceptance: StructureAcceptanceReport | null;
  timeframe: string;
  symbol?: string;
  price: number;
}): StrategyZone | null {
  const last = [...params.structure.events].reverse().find((e) => e.kind === 'BOS');
  if (!last || !(params.price > 0)) return null;
  const long = last.bias === 'bullish';
  const regimeOk = long
    ? params.structure.regime === 'BULL' || params.structure.regime === 'STRONG_BULL'
    : params.structure.regime === 'BEAR' || params.structure.regime === 'STRONG_BEAR';
  if (!regimeOk) return null;
  const acc = params.acceptance;
  const accepted = acc?.state === 'ACCEPTED' || acc?.state === 'HOLD' || acc?.state === 'CLOSE_CONFIRM';
  if (!accepted && acc?.state !== 'BODY_BREAK' && acc?.state !== 'RETEST') return null;
  const atrPad = Math.abs(last.level) * 0.0015;
  const lower = long ? last.level - atrPad : last.level;
  const upper = long ? last.level : last.level + atrPad;
  return mk({
    id: `strat-trend-break-${last.index}`,
    symbol: params.symbol ?? '',
    strategyType: 'TREND_BREAK',
    direction: long ? 'LONG' : 'SHORT',
    upper,
    lower,
    midpoint: (upper + lower) / 2,
    sourceTimeframe: params.timeframe,
    createdAt: last.known_at,
    confirmedAt: accepted ? last.known_at : null,
    state: accepted ? 'CONFIRMED' : 'PENDING',
    triggerPrice: last.level,
    invalidationPrice: long ? lower - atrPad : upper + atrPad,
    target1: null,
    target2: null,
    target3: null,
    rr: null,
    setupScore: accepted ? 72 : 55,
    evidence: [
      ev('bos', 'STRUCTURE', 'BOS', true, 70),
      ev('regime', 'HTF', params.structure.regime, true, 60),
      ev('acceptance', 'STRUCTURE', acc?.state ?? 'UNAVAILABLE', Boolean(acc), acc ? 65 : null),
    ],
    labelEn: long ? 'BREAK LONG ZONE' : 'BREAK SHORT ZONE',
    labelKo: long ? '추세돌파 롱구간' : '추세돌파 숏구간',
    note: 'BOS + regime + acceptance',
  });
}

/** §14 Liquidity Sweep Reversal */
export function runLiquidityReversalStrategy(params: {
  structure: StructureSnapshot;
  falseBreak: FalseBreakReport | null;
  timeframe: string;
  symbol?: string;
}): StrategyZone | null {
  const sweep = [...params.structure.events].reverse().find((e) => e.kind === 'SWEEP');
  const choch = [...params.structure.events].reverse().find((e) => e.kind === 'CHOCH');
  if (!sweep || !choch) return null;
  if (Math.abs(sweep.index - choch.index) > 12) return null;
  const long = sweep.bias === 'bearish' && choch.bias === 'bullish';
  const short = sweep.bias === 'bullish' && choch.bias === 'bearish';
  if (!long && !short) return null;
  const liq = lastSweepLiquidity(params.structure.events);
  const level = long ? liq.ssl : liq.bsl;
  if (level == null) return null;
  const pad = Math.abs(level) * 0.0012;
  const lower = level - pad;
  const upper = level + pad;
  const fb = params.falseBreak;
  const fbOk = Boolean(fb?.breakout?.active || fb?.breakdown?.active);
  return mk({
    id: `strat-liq-rev-${sweep.index}-${choch.index}`,
    symbol: params.symbol ?? '',
    strategyType: 'LIQUIDITY_REVERSAL',
    direction: long ? 'LONG' : 'SHORT',
    upper,
    lower,
    midpoint: level,
    sourceTimeframe: params.timeframe,
    createdAt: Math.max(sweep.known_at, choch.known_at),
    confirmedAt: fbOk ? Math.max(sweep.known_at, choch.known_at) : null,
    state: fbOk ? 'CONFIRMED' : 'FRESH',
    triggerPrice: level,
    invalidationPrice: long ? lower - pad : upper + pad,
    target1: null,
    target2: null,
    target3: null,
    rr: null,
    setupScore: fbOk ? 74 : 58,
    evidence: [
      ev('sweep', 'LIQUIDITY', 'SWEEP', true, 70),
      ev('choch', 'STRUCTURE', 'CHoCH', true, 70),
      ev('fake', 'STRUCTURE', fb?.kind ?? 'UNAVAILABLE', Boolean(fb && fb.kind !== 'NONE'), fbOk ? 65 : null),
    ],
    labelEn: long ? 'REVERSAL LONG ZONE' : 'REVERSAL SHORT ZONE',
    labelKo: long ? '스윕 반전 롱' : '스윕 반전 숏',
    note: 'Sweep + CHoCH',
  });
}

/** §15 OB Retest — fresh OB + acceptance-ish */
export function runObRetestStrategy(params: {
  zones: Eagle1Zone[];
  price: number;
  timeframe: string;
  symbol?: string;
}): StrategyZone | null {
  const obs = params.zones.filter(
    (z) =>
      z.source_type === 'ob' &&
      z.status !== 'BROKEN' &&
      z.status !== 'INVALID' &&
      z.status !== 'DELETED' &&
      z.frozen
  );
  if (!obs.length || !(params.price > 0)) return null;
  const near = [...obs].sort((a, b) => {
    const da = Math.min(Math.abs(params.price - a.lower), Math.abs(params.price - a.upper));
    const db = Math.min(Math.abs(params.price - b.lower), Math.abs(params.price - b.upper));
    return da - db;
  })[0]!;
  const touching = params.price >= near.lower * 0.998 && params.price <= near.upper * 1.002;
  if (!touching && near.test_count < 1) return null;
  const long = near.bias === 'bullish';
  if (near.bias === 'neutral') return null;
  return mk({
    id: `strat-ob-retest-${near.zone_id}`,
    symbol: params.symbol ?? '',
    strategyType: 'OB_RETEST',
    direction: long ? 'LONG' : 'SHORT',
    upper: near.upper,
    lower: near.lower,
    midpoint: near.midpoint,
    sourceTimeframe: params.timeframe,
    createdAt: near.created_at,
    confirmedAt: near.frozen ? near.created_at : null,
    state: near.status === 'FRESH' || near.status === 'CONFIRMED' ? 'TESTING' : 'FRESH',
    triggerPrice: near.midpoint,
    invalidationPrice: long ? near.lower : near.upper,
    target1: null,
    target2: null,
    target3: null,
    rr: null,
    setupScore: 60 + Math.min(20, near.test_count * 5),
    evidence: [ev('ob', 'STRUCTURE', 'OB', true, near.strength)],
    labelEn: long ? 'OB RETEST LONG' : 'OB RETEST SHORT',
    labelKo: long ? 'OB 재시험 롱' : 'OB 재시험 숏',
    note: near.reason,
  });
}

/** §16 FVG/BPR Mitigation */
export function runMitigationStrategy(params: {
  zones: Eagle1Zone[];
  price: number;
  timeframe: string;
  symbol?: string;
}): StrategyZone | null {
  const gaps = params.zones.filter(
    (z) =>
      (z.source_type === 'fvg' || z.source_type === 'bpr') &&
      z.status !== 'BROKEN' &&
      z.status !== 'INVALID' &&
      z.status !== 'DELETED'
  );
  if (!gaps.length || !(params.price > 0)) return null;
  const hit = gaps.find((z) => params.price >= z.lower && params.price <= z.upper) ?? gaps[0]!;
  const long = hit.bias !== 'bearish';
  return mk({
    id: `strat-mitigation-${hit.zone_id}`,
    symbol: params.symbol ?? '',
    strategyType: 'MITIGATION',
    direction: long ? 'LONG' : 'SHORT',
    upper: hit.upper,
    lower: hit.lower,
    midpoint: hit.midpoint,
    sourceTimeframe: params.timeframe,
    createdAt: hit.created_at,
    confirmedAt: hit.frozen ? hit.created_at : null,
    state: 'TESTING',
    triggerPrice: hit.midpoint,
    invalidationPrice: long ? hit.lower : hit.upper,
    target1: null,
    target2: null,
    target3: null,
    rr: null,
    setupScore: hit.source_type === 'bpr' ? 64 : 58,
    evidence: [
      ev(hit.source_type, 'STRUCTURE', hit.source_type.toUpperCase(), true, hit.strength),
    ],
    labelEn: long ? 'MITIGATION LONG ZONE' : 'MITIGATION SHORT ZONE',
    labelKo: long ? '완화 롱구간' : '완화 숏구간',
    note: hit.reason,
  });
}

/** §19 POC Reclaim */
export function runPocReclaimStrategy(params: {
  pocState: PocState | null;
  poc: number | null;
  timeframe: string;
  symbol?: string;
}): StrategyZone | null {
  const st = params.pocState;
  const poc = params.poc;
  if (poc == null || !st) return null;
  const long = st === 'RECLAIMED' || st === 'HOLD_SUCCESS' || st === 'CLOSED_ABOVE';
  const short = st === 'LOST' || st === 'REJECTION' || st === 'CLOSED_BELOW';
  if (!long && !short) return null;
  const pad = Math.abs(poc) * 0.0008;
  return mk({
    id: `strat-poc-${st}`,
    symbol: params.symbol ?? '',
    strategyType: 'POC_RECLAIM',
    direction: long ? 'LONG' : 'SHORT',
    upper: poc + pad,
    lower: poc - pad,
    midpoint: poc,
    sourceTimeframe: params.timeframe,
    createdAt: 0,
    confirmedAt: st === 'RECLAIMED' || st === 'LOST' ? 1 : null,
    state: st === 'RECLAIMED' || st === 'LOST' ? 'CONFIRMED' : 'TESTING',
    triggerPrice: poc,
    invalidationPrice: long ? poc - pad * 2 : poc + pad * 2,
    target1: null,
    target2: null,
    target3: null,
    rr: null,
    setupScore: st === 'RECLAIMED' || st === 'LOST' ? 70 : 55,
    evidence: [ev('poc', 'PROFILE', st, true, 70)],
    labelEn: long ? 'POC RECLAIM LONG' : 'POC LOSS SHORT',
    labelKo: long ? 'POC 재탈환 롱' : 'POC 상실 숏',
    note: st,
  });
}

/** §10 Asymmetric Risk — risk plan RR 게이트 */
export function runAsymmetricRiskStrategy(params: {
  risk: Eagle1RiskPlan | null;
  timeframe: string;
  symbol?: string;
  minRr?: number;
}): StrategyZone | null {
  const r = params.risk;
  if (!r || !r.direction || r.entryLow == null || r.executableSl == null) return null;
  if (r.rejectReasons.length && r.rrGate === 'reject') return null;
  const rr = r.netRrTp1 ?? r.grossRrTp1;
  if (rr == null || rr < (params.minRr ?? 2)) return null;
  const long = r.direction === 'LONG';
  const entry = (r.entryLow + (r.entryHigh ?? r.entryLow)) / 2;
  const lower = long ? r.executableSl : Math.min(entry, r.tp1 ?? entry);
  const upper = long ? Math.max(entry, r.tp1 ?? entry) : r.executableSl;
  return mk({
    id: `strat-asym-${r.direction}`,
    symbol: params.symbol ?? '',
    strategyType: 'ASYMMETRIC_RISK',
    direction: r.direction,
    upper,
    lower,
    midpoint: entry,
    sourceTimeframe: params.timeframe,
    createdAt: 0,
    confirmedAt: null,
    state: 'PENDING',
    triggerPrice: entry,
    invalidationPrice: r.executableSl,
    target1: r.tp1,
    target2: r.tp2,
    target3: r.tp3,
    rr,
    setupScore: Math.min(90, 50 + rr * 10),
    evidence: [ev('rr', 'OTHER', `RR ${rr.toFixed(2)}`, true, Math.min(100, rr * 25))],
    labelEn: long ? 'ASYM LONG ZONE' : 'ASYM SHORT ZONE',
    labelKo: long ? '비대칭 롱' : '비대칭 숏',
    note: r.rejectReasons[0] || `RR ${rr.toFixed(2)}`,
  });
}

/** VCP / Range break — compression 휴리스틱 (ATR 수축 근사) */
export function runVcpStyleStrategy(params: {
  candles: Eagle1Bar[];
  endExclusive: number;
  structure: StructureSnapshot;
  timeframe: string;
  symbol?: string;
}): StrategyZone | null {
  const end = params.endExclusive;
  const slice = params.candles.slice(Math.max(0, end - 24), end);
  if (slice.length < 16) return null;
  const ranges = slice.map((b) => b.high - b.low);
  const early = ranges.slice(0, 8).reduce((a, b) => a + b, 0) / 8;
  const late = ranges.slice(-8).reduce((a, b) => a + b, 0) / 8;
  if (!(early > 0) || late / early > 0.72) return null;
  const last = slice[slice.length - 1]!;
  const hi = Math.max(...slice.map((b) => b.high));
  const lo = Math.min(...slice.map((b) => b.low));
  const long = params.structure.regime === 'BULL' || params.structure.regime === 'STRONG_BULL';
  const short = params.structure.regime === 'BEAR' || params.structure.regime === 'STRONG_BEAR';
  if (!long && !short) return null;
  return mk({
    id: `strat-vcp-${end}`,
    symbol: params.symbol ?? '',
    strategyType: 'VCP',
    direction: long ? 'LONG' : 'SHORT',
    upper: hi,
    lower: lo,
    midpoint: (hi + lo) / 2,
    sourceTimeframe: params.timeframe,
    createdAt: last.time,
    confirmedAt: null,
    state: 'PENDING',
    triggerPrice: long ? hi : lo,
    invalidationPrice: long ? lo : hi,
    target1: null,
    target2: null,
    target3: null,
    rr: null,
    setupScore: 56,
    evidence: [ev('compress', 'VOLATILITY', 'range contraction', true, 55)],
    labelEn: long ? 'VCP LONG ZONE' : 'VCP SHORT ZONE',
    labelKo: long ? '수축 롱구간' : '수축 숏구간',
    note: 'range contraction',
  });
}

export type StrategyEnginePack = {
  zones: StrategyZone[];
  byType: Partial<Record<StrategyType, StrategyZone | null>>;
};

export function runStrategyEnginePack(params: {
  candles: Eagle1Bar[];
  endExclusive: number;
  structure: StructureSnapshot;
  zones: ZoneEngineResult;
  acceptance: StructureAcceptanceReport | null;
  falseBreak: FalseBreakReport | null;
  orderFlow?: OrderFlowReport | null;
  riskLong: Eagle1RiskPlan | null;
  riskShort: Eagle1RiskPlan | null;
  timeframe: string;
  symbol?: string;
}): StrategyEnginePack {
  const price = params.candles[Math.max(0, params.endExclusive - 1)]?.close ?? 0;
  const list: StrategyZone[] = [];
  const push = (z: StrategyZone | null) => {
    if (z) list.push(z);
  };
  push(
    runTrendBreakStrategy({
      structure: params.structure,
      acceptance: params.acceptance,
      timeframe: params.timeframe,
      symbol: params.symbol,
      price,
    })
  );
  push(
    runLiquidityReversalStrategy({
      structure: params.structure,
      falseBreak: params.falseBreak,
      timeframe: params.timeframe,
      symbol: params.symbol,
    })
  );
  push(
    runObRetestStrategy({
      zones: params.zones.zones,
      price,
      timeframe: params.timeframe,
      symbol: params.symbol,
    })
  );
  push(
    runMitigationStrategy({
      zones: params.zones.zones,
      price,
      timeframe: params.timeframe,
      symbol: params.symbol,
    })
  );
  push(
    runPocReclaimStrategy({
      pocState: params.zones.profile.pocState,
      poc: params.zones.profile.poc,
      timeframe: params.timeframe,
      symbol: params.symbol,
    })
  );
  push(
    runVcpStyleStrategy({
      candles: params.candles,
      endExclusive: params.endExclusive,
      structure: params.structure,
      timeframe: params.timeframe,
      symbol: params.symbol,
    })
  );
  push(
    runAsymmetricRiskStrategy({
      risk: params.riskLong,
      timeframe: params.timeframe,
      symbol: params.symbol,
    })
  );
  push(
    runAsymmetricRiskStrategy({
      risk: params.riskShort,
      timeframe: params.timeframe,
      symbol: params.symbol,
    })
  );

  void params.orderFlow;

  const byType: StrategyEnginePack['byType'] = {};
  for (const z of list) byType[z.strategyType] = z;
  return { zones: list, byType };
}
