/**
 * Fulink Pro ULTRA RiskCalc 포팅.
 * entry/stop/target/qty/leverage → notional, margin, slPct, tpPct, slUsdt, tpUsdt.
 */
export type RiskCalcResult = {
  notionalUsdt: number;
  qty: number;
  leverage: number;
  marginUsdt: number;
  slPct: number;
  tpPct: number;
  slUsdt: number;
  tpUsdt: number;
};

const DEFAULT_FEE_ROUND_TRIP = 0.001; // 0.1% 왕복

export function computeRiskCalc(
  params: {
    entry: number;
    stop: number;
    target: number;
    qty: number;
    leverage: number;
  },
  feeRoundTrip = DEFAULT_FEE_ROUND_TRIP
): RiskCalcResult {
  const { entry, stop, target, qty, leverage } = params;
  const notional = Math.abs(qty * entry);
  const margin = leverage <= 0 ? 0 : notional / leverage;

  const rawSl = entry <= 0 ? 0 : Math.abs(entry - stop) / entry;
  const slPct = (rawSl + feeRoundTrip) * 100;

  const rawTp = entry <= 0 ? 0 : Math.abs(target - entry) / entry;
  const netTp = rawTp - feeRoundTrip;
  const tpPct = netTp < 0 ? 0 : netTp * 100;

  const slUsdt = notional * (slPct / 100);
  const tpUsdt = notional * (tpPct / 100);

  return {
    notionalUsdt: notional,
    qty,
    leverage,
    marginUsdt: margin,
    slPct,
    tpPct,
    slUsdt,
    tpUsdt,
  };
}
