/**
 * FlowConfirmationEngine — CVD/OI/OFI/LOB/흡수 등을 STRONG_BUY…STRONG_SELL로 통합.
 * 데이터 없으면 UNAVAILABLE (0점 위장 금지). orderFlowFacade 재사용.
 */

import { runOrderFlowFacade, type OrderFlowReport } from './orderFlowFacade';
import type { Eagle1MoneyPressure, Eagle1MoneyPressureLive } from './moneyPressureBand';

export type FlowConfirmationBias =
  | 'STRONG_BUY'
  | 'BUY'
  | 'NEUTRAL'
  | 'SELL'
  | 'STRONG_SELL'
  | 'UNAVAILABLE';

export type FlowChannelVote = {
  key: string;
  available: boolean;
  stale: boolean;
  /** -2..+2, null = UNAVAILABLE */
  signed: number | null;
  labelKo: string;
  note: string;
};

export type FlowConfirmationReport = {
  bias: FlowConfirmationBias;
  /** Available 채널만으로 계산한 -100..+100 — 확률 아님 */
  score: number | null;
  availableCount: number;
  staleCount: number;
  votes: FlowChannelVote[];
  orderFlow: OrderFlowReport;
  summaryKo: string;
  /** CONFIRMED 진입에 사용 가능 여부 */
  usableForConfirm: boolean;
};

function signedFromChannel(key: string, valueText: string, available: boolean): number | null {
  if (!available) return null;
  const t = valueText;
  if (key === 'cvd') {
    if (t.includes('매수')) return 1;
    if (t.includes('매도')) return -1;
    return 0;
  }
  if (key === 'oi') {
    if (t.includes('증가')) return 0.5;
    if (t.includes('감소')) return -0.5;
    return 0;
  }
  if (key === 'lob') {
    if (t.includes('매수')) return 1;
    if (t.includes('매도')) return -1;
    return 0;
  }
  if (key === 'ofi') {
    if (t.includes('유입')) return 1;
    if (t.includes('유출')) return -1;
    return 0;
  }
  return 0;
}

function moneyVote(money?: Eagle1MoneyPressure | null): FlowChannelVote {
  if (!money) {
    return {
      key: 'money',
      available: false,
      stale: false,
      signed: null,
      labelKo: '머니압력',
      note: 'UNAVAILABLE',
    };
  }
  const st = money.state;
  let signed: number | null = 0;
  if (st === 'STRONG_BUY' || st === 'PERSISTENT_BUY' || st === 'BREAKOUT_BUY') signed = st === 'STRONG_BUY' ? 2 : 1;
  else if (st === 'BUY_ABSORPTION') signed = 1;
  else if (st === 'CHASE_BUY') signed = 0.5;
  else if (st === 'STRONG_SELL' || st === 'PERSISTENT_SELL' || st === 'BREAKDOWN_SELL') signed = st === 'STRONG_SELL' ? -2 : -1;
  else if (st === 'SELL_ABSORPTION') signed = -1;
  else if (st === 'CHASE_SELL') signed = -0.5;
  else signed = 0;
  return {
    key: 'money',
    available: true,
    stale: false,
    signed: Math.max(-2, Math.min(2, signed)),
    labelKo: '머니압력',
    note: money.stateKo,
  };
}

function absorptionVote(money?: Eagle1MoneyPressure | null): FlowChannelVote {
  if (!money || !money.absorbed) {
    return {
      key: 'absorption',
      available: false,
      stale: false,
      signed: null,
      labelKo: '흡수',
      note: 'UNAVAILABLE',
    };
  }
  const buyAbs = money.state === 'BUY_ABSORPTION';
  const sellAbs = money.state === 'SELL_ABSORPTION';
  if (!buyAbs && !sellAbs) {
    return {
      key: 'absorption',
      available: true,
      stale: false,
      signed: 0,
      labelKo: '흡수',
      note: 'absorbed',
    };
  }
  return {
    key: 'absorption',
    available: true,
    stale: false,
    signed: buyAbs ? 1 : -1,
    labelKo: '흡수',
    note: money.stateKo,
  };
}

function biasFromScore(score: number, n: number): FlowConfirmationBias {
  if (n <= 0) return 'UNAVAILABLE';
  if (score >= 55) return 'STRONG_BUY';
  if (score >= 20) return 'BUY';
  if (score <= -55) return 'STRONG_SELL';
  if (score <= -20) return 'SELL';
  return 'NEUTRAL';
}

export function runFlowConfirmationEngine(params: {
  live?: Eagle1MoneyPressureLive | null;
  money?: Eagle1MoneyPressure | null;
  /** 이미 계산된 facade — 중복 API 호출 방지 */
  orderFlow?: OrderFlowReport | null;
}): FlowConfirmationReport {
  const orderFlow = params.orderFlow ?? runOrderFlowFacade({ live: params.live });
  const votes: FlowChannelVote[] = orderFlow.channels.map((c) => ({
    key: c.key,
    available: c.available,
    stale: c.stale,
    signed: signedFromChannel(c.key, c.valueText, c.available),
    labelKo: c.labelKo,
    note: c.stale ? 'STALE' : c.available ? c.note : 'UNAVAILABLE',
  }));
  votes.push(moneyVote(params.money));
  votes.push(absorptionVote(params.money));

  const usable = votes.filter((v) => v.available && !v.stale && v.signed != null);
  const staleCount = votes.filter((v) => v.stale).length;
  const availableCount = usable.length;

  if (availableCount === 0) {
    return {
      bias: 'UNAVAILABLE',
      score: null,
      availableCount: 0,
      staleCount,
      votes,
      orderFlow,
      summaryKo: 'FLOW UNAVAILABLE',
      usableForConfirm: false,
    };
  }

  const raw = usable.reduce((s, v) => s + (v.signed ?? 0), 0) / availableCount;
  const score = Math.round(Math.max(-100, Math.min(100, raw * 100)));
  const bias = biasFromScore(score, availableCount);
  /** 채널 2개 미만이면 확정 신호에 쓰지 않음 */
  const usableForConfirm = availableCount >= 2 && staleCount === 0 && bias !== 'UNAVAILABLE';

  return {
    bias,
    score,
    availableCount,
    staleCount,
    votes,
    orderFlow,
    summaryKo: `${bias} · ${availableCount}ch · score ${score}`,
    usableForConfirm,
  };
}

/** Acceptance I — orderbook 없음 → UNAVAILABLE, score≠0 위장 금지 */
export function flowConfirmationAcceptanceI(): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  const r = runFlowConfirmationEngine({
    live: { has_orderbook: false },
    money: null,
  });
  const lob = r.votes.find((v) => v.key === 'lob');
  if (!lob || lob.available) notes.push('LOB should be unavailable');
  if (lob?.signed != null && !lob.available) notes.push('unavailable LOB must not have signed score');
  if (r.bias === 'UNAVAILABLE' && r.score != null) notes.push('UNAVAILABLE must keep score null');
  /** 전부 없음 */
  if (r.availableCount === 0 && r.score !== null) notes.push('no channels → score null');
  return { ok: notes.length === 0, notes };
}
