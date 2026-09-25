/**
 * Doksuri-1 — LONG/SHORT 동시 플랜 (실측 레벨만).
 */
import type { Doksuri1TradePlan, PlanStatus } from '@/lib/doksuri1/types';
import type { DumpSupportResistPath } from '@/lib/mergedDeskDumpSupportResistPath';
import {
  sanitizeTelegramPrice,
  sanitizeTelegramTradeLevels,
} from '@/lib/telegramSymbolPriceGuard';

export type DualPlanSwingLite = {
  side: string;
  stance: string;
  entryLow: number;
  entryHigh: number;
  entryMid: number;
  stopLoss: number;
  tp1: number;
  tp2?: number;
  tp3?: number;
  grade?: string;
  invalidationKo?: string;
  confluence?: number;
};

function fmtPxLabel(n: number): string {
  if (!(n > 0) || !Number.isFinite(n)) return '—';
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

/**
 * 롱 SL: 무효가가 진입에 너무 가까우면 최소 0.8% 구조폭으로 넓힘(사이징·노이즈 방어).
 * 숏 SL: 대칭.
 */
function structuralStop(
  dir: 'LONG' | 'SHORT',
  entry: number,
  preferred: number | null,
  minPct = 0.008
): number {
  const floorDist = entry * minPct;
  if (dir === 'LONG') {
    const cand = preferred != null && preferred < entry ? preferred : entry - floorDist;
    return Math.min(cand, entry - floorDist);
  }
  const cand = preferred != null && preferred > entry ? preferred : entry + floorDist;
  return Math.max(cand, entry + floorDist);
}

function dedupeTp(
  tp1: number | null,
  tp2: number | null,
  tp3: number | null
): { tp1: number | null; tp2: number | null; tp3: number | null } {
  let a = tp1;
  let b = tp2;
  let c = tp3;
  if (a && b && Math.abs(b - a) / Math.max(a, 1) < 0.0005) b = null;
  if (a && c && Math.abs(c - a) / Math.max(a, 1) < 0.0005) c = null;
  if (b && c && Math.abs(c - b) / Math.max(b, 1) < 0.0005) c = null;
  return { tp1: a, tp2: b, tp3: c };
}

function emptyPlan(dir: 'LONG' | 'SHORT'): Doksuri1TradePlan {
  return {
    direction: dir,
    status: 'WAIT_CONFIRMATION',
    entryLow: null,
    entryHigh: null,
    entry: null,
    stopLoss: null,
    tp1: null,
    tp2: null,
    tp3: null,
    rr: null,
    confirmationCount: 0,
    confirmationTotal: 5,
    invalidationKo: null,
    reasonKo: '레벨 미산출',
    chaseForbidden: true,
  };
}

function rrOf(dir: 'LONG' | 'SHORT', entry: number, sl: number, tp1: number): number | null {
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp1 - entry);
  if (!(risk > 0) || !(reward > 0)) return null;
  return Math.round((reward / risk) * 100) / 100;
}

function statusFor(
  dir: 'LONG' | 'SHORT',
  swing: DualPlanSwingLite | null | undefined,
  price: number,
  entry: number | null
): { status: PlanStatus; chase: boolean; conf: number } {
  if (!entry || !(price > 0)) return { status: 'WAIT_CONFIRMATION', chase: true, conf: 0 };
  const dist = Math.abs(price - entry) / entry;
  if (dist > 0.012) return { status: 'TOO_LATE', chase: true, conf: 1 };
  if (swing?.stance?.startsWith('ENTER') && swing.side === dir) {
    return { status: 'ACTIVE', chase: false, conf: 4 };
  }
  if (swing?.side === dir && swing.stance.includes('PULLBACK')) {
    return { status: 'WAIT_PULLBACK', chase: false, conf: 2 };
  }
  return { status: 'WAIT_CONFIRMATION', chase: dist > 0.004, conf: 2 };
}

export function buildDoksuri1DualPlans(params: {
  symbol: string;
  price: number;
  swing?: DualPlanSwingLite | null;
  levels?: {
    entry?: number | null;
    sl?: number | null;
    tp1?: number | null;
    tp2?: number | null;
    tp3?: number | null;
  } | null;
  srPath?: DumpSupportResistPath | null;
}): { long: Doksuri1TradePlan; short: Doksuri1TradePlan } {
  const { symbol, price, swing, levels, srPath } = params;
  const scrub = sanitizeTelegramTradeLevels(symbol, price, levels ?? undefined);
  const long = emptyPlan('LONG');
  const short = emptyPlan('SHORT');

  /** LONG: 스윙 롱 또는 지지 경로 */
  if (swing?.side === 'LONG' && swing.entryMid > 0) {
    const e = sanitizeTelegramPrice(symbol, price, swing.entryMid);
    const slRaw = sanitizeTelegramPrice(symbol, price, swing.stopLoss);
    const tp1 = sanitizeTelegramPrice(symbol, price, swing.tp1);
    const tps = dedupeTp(
      tp1,
      sanitizeTelegramPrice(symbol, price, swing.tp2 ?? null),
      sanitizeTelegramPrice(symbol, price, swing.tp3 ?? null)
    );
    long.entry = e;
    long.entryLow = sanitizeTelegramPrice(symbol, price, swing.entryLow);
    long.entryHigh = sanitizeTelegramPrice(symbol, price, swing.entryHigh);
    long.stopLoss =
      e != null ? sanitizeTelegramPrice(symbol, price, structuralStop('LONG', e, slRaw)) : slRaw;
    long.tp1 = tps.tp1;
    long.tp2 = tps.tp2;
    long.tp3 = tps.tp3;
    long.invalidationKo = swing.invalidationKo
      ? swing.invalidationKo.replace(
          /(\d+\.\d{2,})/g,
          (m) => fmtPxLabel(Number(m))
        )
      : null;
    long.reasonKo = '스윙중투 롱 타점';
    if (e && long.stopLoss && tps.tp1) long.rr = rrOf('LONG', e, long.stopLoss, tps.tp1);
    const st = statusFor('LONG', swing, price, e);
    long.status = st.status;
    long.chaseForbidden = st.chase;
    long.confirmationCount = st.conf;
  } else if (srPath?.supportPrice) {
    const e = sanitizeTelegramPrice(symbol, price, srPath.supportPrice);
    const inv = sanitizeTelegramPrice(symbol, price, srPath.invalidationPrice);
    const sl =
      e != null
        ? sanitizeTelegramPrice(symbol, price, structuralStop('LONG', e, inv))
        : null;
    const tp1 = sanitizeTelegramPrice(symbol, price, srPath.bounceLimitPrice ?? srPath.resistPrice);
    const tp2Raw = sanitizeTelegramPrice(symbol, price, srPath.resistPrice);
    const tps = dedupeTp(tp1, tp2Raw, null);
    long.entry = e;
    long.entryLow = e;
    long.entryHigh = e;
    long.stopLoss = sl;
    long.tp1 = tps.tp1;
    long.tp2 = tps.tp2;
    long.tp3 = null;
    long.reasonKo = '폭락 지지·반등경로';
    long.invalidationKo = inv != null ? `경로 무효 ${fmtPxLabel(inv)}` : null;
    if (e && sl && tps.tp1) long.rr = rrOf('LONG', e, sl, tps.tp1);
    const st = statusFor('LONG', swing, price, e);
    long.status = st.status;
    long.chaseForbidden = true;
    long.confirmationCount = srPath.supportFirm ? 3 : 1;
  }

  /** SHORT: 스윙 숏 또는 저항 경로 */
  if (swing?.side === 'SHORT' && swing.entryMid > 0) {
    const e = sanitizeTelegramPrice(symbol, price, swing.entryMid);
    const slRaw = sanitizeTelegramPrice(symbol, price, swing.stopLoss);
    const tp1 = sanitizeTelegramPrice(symbol, price, swing.tp1);
    const tps = dedupeTp(
      tp1,
      sanitizeTelegramPrice(symbol, price, swing.tp2 ?? null),
      sanitizeTelegramPrice(symbol, price, swing.tp3 ?? null)
    );
    short.entry = e;
    short.entryLow = sanitizeTelegramPrice(symbol, price, swing.entryLow);
    short.entryHigh = sanitizeTelegramPrice(symbol, price, swing.entryHigh);
    short.stopLoss =
      e != null ? sanitizeTelegramPrice(symbol, price, structuralStop('SHORT', e, slRaw)) : slRaw;
    short.tp1 = tps.tp1;
    short.tp2 = tps.tp2;
    short.tp3 = tps.tp3;
    short.invalidationKo = swing.invalidationKo
      ? swing.invalidationKo.replace(/(\d+\.\d{2,})/g, (m) => fmtPxLabel(Number(m)))
      : null;
    short.reasonKo = '스윙중투 숏 타점';
    if (e && short.stopLoss && tps.tp1) short.rr = rrOf('SHORT', e, short.stopLoss, tps.tp1);
    const st = statusFor('SHORT', swing, price, e);
    short.status = st.status;
    short.chaseForbidden = st.chase;
    short.confirmationCount = st.conf;
  } else if (srPath?.resistPrice || srPath?.bounceLimitPrice) {
    const e = sanitizeTelegramPrice(
      symbol,
      price,
      srPath.resistPrice ?? srPath.bounceLimitPrice
    );
    const slRaw = sanitizeTelegramPrice(symbol, price, e != null ? e * 1.008 : null);
    const sl =
      e != null ? sanitizeTelegramPrice(symbol, price, structuralStop('SHORT', e, slRaw)) : null;
    const tp1 = sanitizeTelegramPrice(symbol, price, srPath.supportPrice);
    const tps = dedupeTp(
      tp1,
      sanitizeTelegramPrice(symbol, price, srPath.invalidationPrice),
      null
    );
    short.entry = e;
    short.entryLow = e;
    short.entryHigh = e;
    short.stopLoss = sl;
    short.tp1 = tps.tp1;
    short.tp2 = tps.tp2;
    short.reasonKo = '폭락 저항·매도감시';
    if (e && sl && tps.tp1) short.rr = rrOf('SHORT', e, sl, tps.tp1);
    short.status = 'WAIT_PULLBACK';
    short.chaseForbidden = true;
    short.confirmationCount = srPath.resistFirm ? 3 : 1;
  }

  /** 데스크 unified levels — 스윙 방향에만 보강 */
  if (scrub.entry && scrub.sl) {
    if (swing?.side === 'LONG' && !long.entry) {
      long.entry = scrub.entry;
      long.stopLoss = scrub.sl;
      long.tp1 = scrub.tp1;
      long.tp2 = scrub.tp2;
      long.tp3 = scrub.tp3;
      long.reasonKo = '데스크 통합 레벨';
    }
    if (swing?.side === 'SHORT' && !short.entry) {
      short.entry = scrub.entry;
      short.stopLoss = scrub.sl;
      short.tp1 = scrub.tp1;
      short.tp2 = scrub.tp2;
      short.tp3 = scrub.tp3;
      short.reasonKo = '데스크 통합 레벨';
    }
  }

  return { long, short };
}
