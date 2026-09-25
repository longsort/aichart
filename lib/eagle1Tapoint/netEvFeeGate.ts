/**
 * §24 거래비용 NET EV 필터 — Gross가 아니라 비용 후.
 * Bitget 테이커 근사 + 슬리피지.
 */
import {
  BITGET_TAKER_FEE_RATE,
  estimateScalpNetRoe,
} from '@/lib/mergedDeskScalpNetRoe';
import {
  EAGLE1_FEE_BPS,
  EAGLE1_FUNDING_BPS,
  EAGLE1_SLIP_BPS,
} from '@/lib/eagle1/riskEngine';

export type TapNetEvGate = {
  ok: boolean;
  failTag: string | null;
  netRrTp1: number | null;
  netRoePct: number | null;
  expectedMovePct: number | null;
  roundTripCostPct: number;
  noteKo: string;
  feesBps: number;
  slipBps: number;
  fundBps: number;
};

function rrNet(params: {
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number;
  costFrac: number;
}): number | null {
  const risk =
    params.direction === 'LONG' ? params.entry - params.sl : params.sl - params.entry;
  const reward =
    params.direction === 'LONG' ? params.tp - params.entry : params.entry - params.tp;
  if (!(risk > 0) || !(reward > 0)) return null;
  const cost = params.entry * params.costFrac;
  const netRisk = risk + cost;
  const netReward = reward - cost;
  if (netRisk <= 0) return null;
  return netReward / netRisk;
}

export function evaluateTapNetEvGate(params: {
  direction: 'LONG' | 'SHORT' | null;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  leverage?: number;
  execKind?: string;
  /** 시장가일 때 더 빡센 최소 이동 */
  marketOrder?: boolean;
}): TapNetEvGate {
  const feesBps = EAGLE1_FEE_BPS;
  const slipBps = EAGLE1_SLIP_BPS + (params.marketOrder ? 2 : 0);
  const fundBps = EAGLE1_FUNDING_BPS;
  const costFrac = (feesBps + slipBps + fundBps) / 10000;
  /** 왕복 근사 (진입+청산) — bps는 편도 합이므로 ×2에 가깝게 fee 반영됨 */
  const roundTripCostPct = costFrac * 2;

  const empty = (note: string, fail: string | null = 'NET_EV_DATA'): TapNetEvGate => ({
    ok: false,
    failTag: fail,
    netRrTp1: null,
    netRoePct: null,
    expectedMovePct: null,
    roundTripCostPct,
    noteKo: note,
    feesBps,
    slipBps,
    fundBps,
  });

  const dir = params.direction;
  const e = Number(params.entry);
  const s = Number(params.sl);
  const t = Number(params.tp1);
  if (!dir || !(e > 0) || !(s > 0) || !(t > 0)) {
    return empty('진입·SL·TP1 부족 · NET EV 불가');
  }

  const expectedMovePct = Math.abs(t - e) / e;
  const netRr = rrNet({
    direction: dir,
    entry: e,
    sl: s,
    tp: t,
    costFrac: roundTripCostPct,
  });

  const lev = Math.max(1, Number(params.leverage) || 20);
  const grossRoe = expectedMovePct * lev * 100;
  const netRoe = estimateScalpNetRoe({
    grossRoePct: grossRoe,
    leverage: lev,
    takerFeeRate: BITGET_TAKER_FEE_RATE,
    holdHours: params.marketOrder || params.execKind === 'MARKET_SCALP' ? 0.35 : 1.5,
  });

  const minRr = params.marketOrder ? 1.6 : 1.4;
  const minNetRoe = params.marketOrder ? 1.2 : 0.8;
  const moveVsCost = expectedMovePct >= roundTripCostPct * (params.marketOrder ? 2.2 : 1.6);

  const fails: string[] = [];
  if (netRr == null || netRr < minRr) fails.push('NET_RR_LOW');
  if (netRoe.netRoePct < minNetRoe) fails.push('NET_ROE_LOW');
  if (!moveVsCost) fails.push('MOVE_LT_COST');

  const ok = fails.length === 0;
  return {
    ok,
    failTag: ok ? null : fails[0]!,
    netRrTp1: netRr,
    netRoePct: netRoe.netRoePct,
    expectedMovePct,
    roundTripCostPct,
    noteKo: ok
      ? `NET RR ${netRr!.toFixed(2)} · 순ROE≈${netRoe.netRoePct.toFixed(2)}%`
      : `비용필터 · ${fails.join('·')} · 순ROE≈${netRoe.netRoePct.toFixed(2)}%`,
    feesBps,
    slipBps,
    fundBps,
  };
}
