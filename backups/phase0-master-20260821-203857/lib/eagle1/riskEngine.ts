/**
 * Eagle1 risk-engine — structural vs executable SL, structure TPs, RR after costs.
 * Size is independent of model confidence.
 */

import { atrAt, type Eagle1Bar, type StructureSnapshot } from './structureEngine';
import type { Eagle1Zone, ZoneEngineResult } from './zoneEngine';

export type RiskDirection = 'LONG' | 'SHORT';

export type RiskCandidateKind =
  | 'poc_retest'
  | 'ob_retest'
  | 'fvg_retest'
  | 'breaker_retest'
  | 'sweep_reversal'
  | 'pullback';

export type Eagle1RiskPlan = {
  direction: RiskDirection | null;
  candidateKind: RiskCandidateKind | null;
  entryLow: number | null;
  entryHigh: number | null;
  structuralSl: number | null;
  executableSl: number | null;
  tp1: number | null;
  tp1Reason: string;
  tp2: number | null;
  tp2Reason: string;
  tp3: number | null;
  tp3Reason: string;
  grossRrTp1: number | null;
  netRrTp1: number | null;
  rrGate: 'reject' | 'watch' | 'confirm_candidate' | 'prioritize' | 'none';
  feesBps: number;
  slippageBps: number;
  fundingBps: number;
  execution: 'ok' | 'SIGNAL_VALID_EXECUTION_WAIT' | '데이터 없음';
  sizeNote: string;
  sizeUnits: number | null;
  sizeEquity: number;
  sizeRiskPct: number;
  rejectReasons: string[];
};

export const EAGLE1_DEFAULT_EQUITY = 10_000;
export const EAGLE1_DEFAULT_RISK_PCT = 1;

export const EAGLE1_RR_REJECT = 1.8;
export const EAGLE1_RR_WATCH = 2.5;
export const EAGLE1_RR_PRIORITIZE = 3.0;

/** Round-trip taker-ish default — tunable, not a promise. */
export const EAGLE1_FEE_BPS = 4;
export const EAGLE1_SLIP_BPS = 1;
export const EAGLE1_FUNDING_BPS = 1;

function costsFrac(feesBps: number, slipBps: number, fundBps: number): number {
  return (feesBps + slipBps + fundBps) / 10000;
}

function rrAfterCosts(params: {
  direction: RiskDirection;
  entry: number;
  sl: number;
  tp: number;
  costFrac: number;
}): number | null {
  const { direction, entry, sl, tp, costFrac } = params;
  if (!(entry > 0 && sl > 0 && tp > 0)) return null;
  const risk = direction === 'LONG' ? entry - sl : sl - entry;
  const reward = direction === 'LONG' ? tp - entry : entry - tp;
  if (!(risk > 0) || !(reward > 0)) return null;
  const cost = entry * costFrac;
  const netRisk = risk + cost;
  const netReward = reward - cost;
  if (netRisk <= 0) return null;
  return netReward / netRisk;
}

function rrGate(net: number | null): Eagle1RiskPlan['rrGate'] {
  if (net == null) return 'none';
  if (net < EAGLE1_RR_REJECT) return 'reject';
  if (net < EAGLE1_RR_WATCH) return 'watch';
  if (net >= EAGLE1_RR_PRIORITIZE) return 'prioritize';
  return 'confirm_candidate';
}

function pickZone(zones: Eagle1Zone[], source: Eagle1Zone['source_type'], bias: 'bullish' | 'bearish'): Eagle1Zone | null {
  return (
    [...zones]
      .reverse()
      .find(
        (z) =>
          z.source_type === source &&
          z.bias === bias &&
          z.status !== 'BROKEN' &&
          z.status !== 'INVALID' &&
          z.status !== 'DELETED'
      ) ?? null
  );
}

export function buildRiskPlan(params: {
  candles: Eagle1Bar[];
  structure: StructureSnapshot;
  zones: ZoneEngineResult;
  direction: RiskDirection | null;
  endExclusive?: number;
  feesBps?: number;
  slippageBps?: number;
  fundingBps?: number;
  spreadBps?: number | null;
  depthOk?: boolean | null;
  equity?: number;
  riskPct?: number;
  medianMaeR?: number | null;
  medianMfeR?: number | null;
  statSample?: number;
}): Eagle1RiskPlan {
  const n = Math.min(params.candles.length, params.endExclusive ?? params.candles.length);
  const last = params.candles[n - 1];
  const feesBps = params.feesBps ?? EAGLE1_FEE_BPS;
  const spreadBps = params.spreadBps != null && Number.isFinite(params.spreadBps) ? params.spreadBps : null;
  const slippageBps =
    params.slippageBps ??
    (spreadBps != null ? Math.max(EAGLE1_SLIP_BPS, Math.round(spreadBps * 0.5)) : EAGLE1_SLIP_BPS);
  const fundingBps = params.fundingBps ?? EAGLE1_FUNDING_BPS;
  const empty: Eagle1RiskPlan = {
    direction: null,
    candidateKind: null,
    entryLow: null,
    entryHigh: null,
    structuralSl: null,
    executableSl: null,
    tp1: null,
    tp1Reason: '데이터 없음',
    tp2: null,
    tp2Reason: '데이터 없음',
    tp3: null,
    tp3Reason: '데이터 없음',
    grossRrTp1: null,
    netRrTp1: null,
    rrGate: 'none',
    feesBps,
    slippageBps,
    fundingBps,
    execution: '데이터 없음',
    sizeNote: '사이즈는 계좌위험·손절폭으로만 — 확신도와 무관',
    sizeUnits: null,
    sizeEquity: params.equity ?? EAGLE1_DEFAULT_EQUITY,
    sizeRiskPct: params.riskPct ?? EAGLE1_DEFAULT_RISK_PCT,
    rejectReasons: [],
  };
  if (!last || !params.direction) return empty;

  const dir = params.direction;
  const bias = dir === 'LONG' ? 'bullish' : 'bearish';
  const atr = atrAt(params.candles, n) || last.close * 0.002;
  const fvg = pickZone(params.zones.zones, 'fvg', bias);
  const ob = pickZone(params.zones.zones, 'ob', bias);
  const breaker = pickZone(params.zones.zones, 'breaker', bias);
  const poc = params.zones.zones.find((z) => z.source_type === 'poc');
  const hvn = pickZone(params.zones.zones, 'hvn', bias) ?? params.zones.zones.find((z) => z.source_type === 'hvn');
  const demand = pickZone(params.zones.zones, 'demand', 'bullish');
  const supply = pickZone(params.zones.zones, 'supply', 'bearish');

  type Cand = { kind: RiskCandidateKind; low: number; high: number; rank: number };
  const inBand = (z: { lower: number; upper: number } | null | undefined) =>
    Boolean(z && last.close <= z.upper && last.close >= z.lower);
  const cands: Cand[] = [];
  if (inBand(fvg) && fvg) cands.push({ kind: 'fvg_retest', low: fvg.lower, high: fvg.upper, rank: 5 });
  if (inBand(ob) && ob) cands.push({ kind: 'ob_retest', low: ob.lower, high: ob.upper, rank: 4 });
  if (inBand(breaker) && breaker) cands.push({ kind: 'breaker_retest', low: breaker.lower, high: breaker.upper, rank: 4 });
  if (poc && Math.abs(last.close - poc.midpoint) <= atr * 0.6) {
    cands.push({ kind: 'poc_retest', low: poc.lower, high: poc.upper, rank: 3 });
  }
  if (params.structure.state === 'SWEEP' || params.structure.state === 'SHIFT') {
    const z = dir === 'LONG' ? demand : supply;
    cands.push({
      kind: 'sweep_reversal',
      low: z ? z.lower : last.close - atr * 0.15,
      high: z ? z.upper : last.close + atr * 0.15,
      rank: 2,
    });
  }
  cands.push({ kind: 'pullback', low: last.close - atr * 0.12, high: last.close + atr * 0.12, rank: 1 });
  cands.sort((a, b) => b.rank - a.rank);
  const best = cands[0]!;
  const candidateKind = best.kind;
  const entryLow = best.low;
  const entryHigh = best.high;

  const swingSl =
    dir === 'LONG'
      ? params.structure.lastSwingLow?.price ?? last.low - atr
      : params.structure.lastSwingHigh?.price ?? last.high + atr;
  const sweepSl = [...params.structure.events]
    .reverse()
    .find((e) => e.kind === 'SWEEP' && e.bias === (dir === 'LONG' ? 'bullish' : 'bearish'));
  const structuralSl = sweepSl
    ? dir === 'LONG'
      ? Math.min(swingSl, sweepSl.price) - atr * 0.05
      : Math.max(swingSl, sweepSl.price) + atr * 0.05
    : dir === 'LONG'
      ? swingSl - atr * 0.08
      : swingSl + atr * 0.08;

  /** MAE-aware: do not park SL inside 0.25 ATR of entry (normal noise). */
  const maeR = params.statSample != null && params.statSample >= 30 ? params.medianMaeR : null;
  const minStop = atr * Math.max(0.35, maeR != null && maeR > 0.35 ? Math.min(1.2, maeR) : 0.35);
  let executableSl = structuralSl;
  const entryMid = (entryLow + entryHigh) / 2;
  if (dir === 'LONG' && entryMid - executableSl < minStop) executableSl = entryMid - minStop;
  if (dir === 'SHORT' && executableSl - entryMid < minStop) executableSl = entryMid + minStop;
  const stopDist = Math.abs(entryMid - executableSl);
  if (stopDist > atr * 3.5) {
    executableSl = dir === 'LONG' ? entryMid - atr * 2.8 : entryMid + atr * 2.8;
  }

  const liqHigh = params.structure.equalHighs.slice(-1)[0] ?? params.structure.lastSwingHigh?.price ?? last.high + atr * 2;
  const liqLow = params.structure.equalLows.slice(-1)[0] ?? params.structure.lastSwingLow?.price ?? last.low - atr * 2;
  const nextPoc = poc?.midpoint ?? null;
  const hvnPx = hvn?.midpoint ?? null;
  const mfeR = params.statSample != null && params.statSample >= 30 ? params.medianMfeR : null;
  const riskPx = Math.abs(entryMid - executableSl) || atr;

  let tp1: number;
  let tp2: number;
  let tp3: number;
  let tp1Reason: string;
  let tp2Reason: string;
  let tp3Reason: string;
  if (dir === 'LONG') {
    tp1 = nextPoc && nextPoc > entryMid ? nextPoc : entryMid + atr * 1.2;
    tp1Reason = nextPoc && nextPoc > entryMid ? '가까운 최다거래가격' : '근거리 ATR 확장(구조 목표 부족)';
    tp2 = hvnPx && hvnPx > tp1 ? hvnPx : liqHigh;
    tp2Reason = hvnPx && hvnPx > tp1 ? '다음 거래밀집' : '위쪽 유동성/스윙고점';
    tp3 = mfeR != null ? entryMid + mfeR * riskPx : liqHigh + atr * 1.6;
    tp3Reason = mfeR != null ? '표본 MFE 확장' : '확장 목표(측정 이동)';
    if (tp3 <= tp2) tp3 = tp2 + atr * 0.8;
  } else {
    tp1 = nextPoc && nextPoc < entryMid ? nextPoc : entryMid - atr * 1.2;
    tp1Reason = nextPoc && nextPoc < entryMid ? '가까운 최다거래가격' : '근거리 ATR 확장(구조 목표 부족)';
    tp2 = hvnPx && hvnPx < tp1 ? hvnPx : liqLow;
    tp2Reason = hvnPx && hvnPx < tp1 ? '다음 거래밀집' : '아래쪽 유동성/스윙저점';
    tp3 = mfeR != null ? entryMid - mfeR * riskPx : liqLow - atr * 1.6;
    tp3Reason = mfeR != null ? '표본 MFE 확장' : '확장 목표(측정 이동)';
    if (tp3 >= tp2) tp3 = tp2 - atr * 0.8;
  }

  const costFrac = costsFrac(feesBps, slippageBps, fundingBps);
  const gross =
    dir === 'LONG' ? (tp1 - entryMid) / (entryMid - executableSl) : (entryMid - tp1) / (executableSl - entryMid);
  const net = rrAfterCosts({ direction: dir, entry: entryMid, sl: executableSl, tp: tp1, costFrac });
  const gate = rrGate(net);
  const rejectReasons: string[] = [];
  if (gate === 'reject') rejectReasons.push(`순RR ${net == null ? '없음' : net.toFixed(2)} < ${EAGLE1_RR_REJECT}`);
  if (dir === 'LONG' && executableSl >= entryMid) rejectReasons.push('손절이 진입 위');
  if (dir === 'SHORT' && executableSl <= entryMid) rejectReasons.push('손절이 진입 아래');
  if (Math.abs(entryMid - executableSl) > atr * 3.45) rejectReasons.push('손절 과대');
  let execution: Eagle1RiskPlan['execution'] = spreadBps == null && params.depthOk == null ? '데이터 없음' : 'ok';
  if (spreadBps != null && spreadBps > 8) {
    execution = 'SIGNAL_VALID_EXECUTION_WAIT';
    rejectReasons.push(`스프레드 ${spreadBps.toFixed(1)}bps — 셋업은 유효, 체결 대기`);
  }
  if (params.depthOk === false) {
    execution = 'SIGNAL_VALID_EXECUTION_WAIT';
    rejectReasons.push('호가 깊이 부족 — 셋업은 유효, 체결 대기');
  }

  return {
    direction: dir,
    candidateKind,
    entryLow: Math.min(entryLow, entryHigh),
    entryHigh: Math.max(entryLow, entryHigh),
    structuralSl,
    executableSl,
    tp1,
    tp1Reason,
    tp2,
    tp2Reason,
    tp3,
    tp3Reason,
    grossRrTp1: Number.isFinite(gross) ? gross : null,
    netRrTp1: net,
    rrGate: gate,
    feesBps,
    slippageBps,
    fundingBps,
    execution,
    sizeNote: '사이즈는 계좌위험·손절폭으로만 — 확신도와 무관',
    sizeUnits: positionUnits({
      equity: params.equity ?? EAGLE1_DEFAULT_EQUITY,
      riskPct: params.riskPct ?? EAGLE1_DEFAULT_RISK_PCT,
      entry: entryMid,
      sl: executableSl,
    }),
    sizeEquity: params.equity ?? EAGLE1_DEFAULT_EQUITY,
    sizeRiskPct: params.riskPct ?? EAGLE1_DEFAULT_RISK_PCT,
    rejectReasons,
  };
}

export function positionUnits(params: {
  equity: number;
  riskPct: number;
  entry: number;
  sl: number;
  confidence?: number;
}): number | null {
  void params.confidence;
  const { equity, riskPct, entry, sl } = params;
  const stop = Math.abs(entry - sl);
  if (!(equity > 0) || !(riskPct > 0) || !(stop > 0)) return null;
  return (equity * (riskPct / 100)) / stop;
}
