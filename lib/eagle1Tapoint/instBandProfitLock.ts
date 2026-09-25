/**
 * 반대 밴드 익절 전 손절 이동.
 * 목표 수익의 2/3에 닿으면, 이미 난 수익의 70%에 손절을 둔다.
 * 예) 목표 15 → 10에 닿으면 손절 7. 목표 10 → 7에 닿으면 손절 5.
 * 그 손절은 왕복 수수료를 넘긴 이익이어야 한다. 수수료 내면 손실인 자리로는 옮기지 않는다.
 * 가격이 더 가면 70%를 다시 계산해 손절만 올린다.
 */
import { BITGET_TAKER_FEE_RATE } from '@/lib/mergedDeskScalpNetRoe';

/** 목표 ROE의 이 비율에 닿으면 손절을 올리기 시작 */
export const INST_BAND_LOCK_ARM_FRAC = 2 / 3;
/** 이미 난 ROE 중 손절로 남기는 비율 */
export const INST_BAND_LOCK_KEEP_FRAC = 0.7;

export function roundTripFeeRoePct(leverage: number): number {
  const lev = Math.max(1, Number(leverage) || 1);
  return BITGET_TAKER_FEE_RATE * 2 * lev * 100;
}

function profitRoePct(params: {
  entry: number;
  price: number;
  direction: 'LONG' | 'SHORT';
  leverage: number;
}): number | null {
  const entry = Number(params.entry);
  const price = Number(params.price);
  const lev = Math.max(1, Number(params.leverage) || 1);
  if (!(entry > 0) || !(price > 0)) return null;
  const move =
    params.direction === 'LONG' ? (price - entry) / entry : (entry - price) / entry;
  if (!(move > 0)) return null;
  return move * lev * 100;
}

function priceAtRoe(params: {
  entry: number;
  direction: 'LONG' | 'SHORT';
  leverage: number;
  roePct: number;
}): number | null {
  const entry = Number(params.entry);
  const lev = Math.max(1, Number(params.leverage) || 1);
  const roe = Number(params.roePct);
  if (!(entry > 0) || !(roe > 0)) return null;
  const frac = roe / 100 / lev;
  const px = params.direction === 'LONG' ? entry * (1 + frac) : entry * (1 - frac);
  return px > 0 ? px : null;
}

/**
 * 목표의 2/3 이상 수익이 나 있으면 손절을 그 수익의 70%로 당긴다.
 * 더 나빠진 손절로는 되돌리지 않는다.
 */
export function nextInstBandProfitLockSl(params: {
  entry: number;
  direction: 'LONG' | 'SHORT';
  leverage: number;
  /** 반대 밴드 익절가 */
  tp?: number | null;
  currentSl?: number | null;
  mark: number;
}): { sl: number; lockRoePct: number; netRoePct: number } | null {
  const entry = Number(params.entry);
  const mark = Number(params.mark);
  const tp = Number(params.tp);
  const cur = Number(params.currentSl);
  if (!(entry > 0) || !(mark > 0) || !(tp > 0)) return null;

  const progress = profitRoePct({
    entry,
    price: mark,
    direction: params.direction,
    leverage: params.leverage,
  });
  const target = profitRoePct({
    entry,
    price: tp,
    direction: params.direction,
    leverage: params.leverage,
  });
  if (progress == null || target == null) return null;
  if (progress + 0.05 < target * INST_BAND_LOCK_ARM_FRAC) return null;

  const lockRoe = progress * INST_BAND_LOCK_KEEP_FRAC;
  const fee = roundTripFeeRoePct(params.leverage);
  if (!(lockRoe > fee)) return null;

  const sl = priceAtRoe({
    entry,
    direction: params.direction,
    leverage: params.leverage,
    roePct: lockRoe,
  });
  if (sl == null) return null;

  if (params.direction === 'LONG') {
    if (!(sl > entry && sl < mark)) return null;
    if (cur > 0 && sl <= cur + entry * 0.00005) return null;
  } else {
    if (!(sl < entry && sl > mark)) return null;
    if (cur > 0 && sl >= cur - entry * 0.00005) return null;
  }

  return {
    sl,
    lockRoePct: lockRoe,
    netRoePct: lockRoe - fee,
  };
}
