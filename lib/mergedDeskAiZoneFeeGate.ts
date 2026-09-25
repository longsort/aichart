/**
 * AIZONE TP/SL · 수수료 후 순ROE·RR 게이트.
 * Bitget 테이커 근사. 확정 수익 아님.
 */
import { estimateScalpNetRoe } from '@/lib/mergedDeskScalpNetRoe';
import { ultraScalpCostGatePass } from '@/lib/doksuri1/ultraScalpEngine';

export function aiZoneFeeRrGate(params: {
  entry: number;
  sl: number;
  tp: number;
  direction: 'LONG' | 'SHORT';
  leverage: number;
  minRr?: number;
}): { ok: boolean; reasonKo: string; grossRoePct: number; netRoePct: number; rr: number } {
  const e = Number(params.entry);
  const sl = Number(params.sl);
  const tp = Number(params.tp);
  const lev = Math.max(1, Math.min(125, Number(params.leverage) || 10));
  const minRr = Math.max(1, Number(params.minRr) || 1.2);
  if (!(e > 0) || !(sl > 0) || !(tp > 0)) {
    return { ok: false, reasonKo: '수수료게이트 · E/SL/TP 없음', grossRoePct: 0, netRoePct: 0, rr: 0 };
  }
  const risk = Math.abs(e - sl);
  const reward = Math.abs(tp - e);
  if (!(risk > 0) || !(reward > 0)) {
    return { ok: false, reasonKo: '수수료게이트 · 거리0', grossRoePct: 0, netRoePct: 0, rr: 0 };
  }
  const rr = reward / risk;
  /** 부동소수: 1.20 < 1.2 오탐 방지 */
  if (rr + 1e-6 < minRr) {
    return {
      ok: false,
      reasonKo: `수수료전 RR ${rr.toFixed(2)}<${minRr} · WAIT`,
      grossRoePct: 0,
      netRoePct: 0,
      rr,
    };
  }
  const movePct = (reward / e) * 100;
  const grossRoePct = movePct * lev;
  const est = estimateScalpNetRoe({
    grossRoePct,
    leverage: lev,
    holdHours: 0.35,
  });
  const cost = ultraScalpCostGatePass({
    leverage: lev,
    tp1RoePct: grossRoePct,
    minNetMultiple: 2,
  });
  if (!cost.ok) {
    return {
      ok: false,
      reasonKo: cost.reasonKo || `순ROE ${est.netRoePct.toFixed(1)}% · 수수료不足 · WAIT`,
      grossRoePct,
      netRoePct: est.netRoePct,
      rr,
    };
  }
  if (!(est.netRoePct > 0)) {
    return {
      ok: false,
      reasonKo: `순ROE ${est.netRoePct.toFixed(2)}%≤0 · 수수료에 먹힘 · WAIT`,
      grossRoePct,
      netRoePct: est.netRoePct,
      rr,
    };
  }
  return {
    ok: true,
    reasonKo: `수수료OK · 순ROE ${est.netRoePct.toFixed(1)}% · RR ${rr.toFixed(2)}`,
    grossRoePct,
    netRoePct: est.netRoePct,
    rr,
  };
}
