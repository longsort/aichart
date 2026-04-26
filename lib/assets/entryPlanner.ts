/**
 * Fulink Pro ULTRA EntryPlanner 포팅.
 * isLong, price, s1, r1, accountUsdt, riskPct → entry, sl, tp1/2/3, rr, leverageRec, qtyBtc, marginUsdt.
 */
export type EntryPlan = {
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rr1: number;
  rr2: number;
  rr3: number;
  leverageRec: number;
  qtyBtc: number;
  marginUsdt: number;
};

export function planEntry(params: {
  isLong: boolean;
  price: number;
  s1: number;
  r1: number;
  accountUsdt: number;
  riskPct: number;
}): EntryPlan {
  const { isLong, price, s1, r1, accountUsdt, riskPct } = params;
  const entry = price;
  const span = Math.abs(r1 - s1);
  const pad = span <= 0 ? price * 0.003 : span * 0.1;

  let sl: number, tp1: number, tp2: number, tp3: number;
  if (isLong) {
    sl = s1 - pad;
    tp1 = entry + (r1 - entry) * 0.55;
    tp2 = entry + (r1 - entry) * 0.8;
    tp3 = r1;
  } else {
    sl = r1 + pad;
    tp1 = entry - (entry - s1) * 0.55;
    tp2 = entry - (entry - s1) * 0.8;
    tp3 = s1;
  }

  const riskPerBtc = Math.abs(entry - sl);
  const maxLoss = Math.min(accountUsdt, Math.max(0, accountUsdt * (riskPct / 100)));
  const qty = riskPerBtc <= 0 ? 0 : maxLoss / riskPerBtc;
  const notional = qty * entry;

  let lev: number;
  const slPct = entry <= 0 ? 0 : (riskPerBtc / entry) * 100;
  if (slPct >= 5) lev = 3;
  else if (slPct >= 3) lev = 5;
  else if (slPct >= 2) lev = 8;
  else if (slPct >= 1.2) lev = 10;
  else if (slPct >= 0.8) lev = 12;
  else lev = 15;

  const maxLevByLiq = slPct <= 0 ? 25 : 80 / slPct;
  lev = Math.min(lev, maxLevByLiq);
  lev = Math.max(2, Math.min(25, lev));

  const margin = lev <= 0 ? 0 : notional / lev;

  const rr = (tp: number) =>
    riskPerBtc <= 0 ? 0 : Math.abs(tp - entry) / riskPerBtc;

  return {
    entry,
    sl,
    tp1,
    tp2,
    tp3,
    rr1: rr(tp1),
    rr2: rr(tp2),
    rr3: rr(tp3),
    leverageRec: lev,
    qtyBtc: qty,
    marginUsdt: margin,
  };
}
