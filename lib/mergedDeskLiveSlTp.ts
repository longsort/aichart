/**
 * 실주문 SL/TP 정규화.
 * 신호는 기존 TF/타점 그대로 → 진입 후:
 *   SL = 신호 타점 SL (우선) · 사용자 ROE%는 "최대 한도"만 (존이 미친 거리일 때 자름)
 *   TP = 전코인 ROE 8% 고정 (조기 존 TP로 안 자름)
 * 확정 수익 아님.
 */
import { resolveAutoTradeTfHold } from '@/lib/doksuri1/autoTradeTfHoldScale';
import { FAST_TP1_ROE_PCT, FAST_SL_ROE_PCT } from '@/lib/mergedDeskAutoTradeConfig';
import { roeTargetPrice } from '@/lib/mergedDeskAutoScalpEngine';
import {
  MIN_SL_PRICE_FRAC,
  widenSlToMinDistance,
} from '@/lib/mergedDeskDirectionSlGuard';

/**
 * Dual Fast / 신호B — 구조 손절가 참고 + 레버 조정.
 * 최종 SL은 사용자 maxSlRoe(기본 30%) 이상 여유 강제.
 * 가격거리×레버 ≤ maxSlRoe면 구조SL 유지·아니면 ROE거리로 확장.
 */
export function resolveStructureAwareLevSlTp(params: {
  entry: number;
  direction: 'LONG' | 'SHORT';
  signalSl: number;
  maxLev: number;
  minLev?: number;
  maxSlRoePct?: number;
  tp1RoePct?: number;
}): {
  ok: boolean;
  lev: number;
  sl: number;
  tp: number;
  slRoePct: number;
  reasonKo: string;
} {
  const entry = Number(params.entry);
  let sl = Number(params.signalSl);
  const dir = params.direction;
  const maxLev = Math.max(1, Math.min(125, Math.round(Number(params.maxLev) || 20)));
  const minLev = Math.max(1, Math.min(maxLev, Math.round(Number(params.minLev) || 5)));
  const maxSlRoe = Math.max(5, Number(params.maxSlRoePct) || FAST_SL_ROE_PCT);
  const tpRoe = Math.max(1, Number(params.tp1RoePct) || FAST_TP1_ROE_PCT);

  if (!(entry > 0) || !(sl > 0)) {
    return {
      ok: false,
      lev: maxLev,
      sl: 0,
      tp: 0,
      slRoePct: 0,
      reasonKo: '구조SL·진입가없음',
    };
  }
  if (dir === 'LONG' && !(sl < entry)) {
    return {
      ok: false,
      lev: maxLev,
      sl,
      tp: 0,
      slRoePct: 0,
      reasonKo: '구조SL 롱방향불일치',
    };
  }
  if (dir === 'SHORT' && !(sl > entry)) {
    return {
      ok: false,
      lev: maxLev,
      sl,
      tp: 0,
      slRoePct: 0,
      reasonKo: '구조SL 숏방향불일치',
    };
  }

  /** 사용자 레버 유지 · SL은 최소 maxSlRoe% ROE 거리 */
  const lev = maxLev;
  const minMove = maxSlRoe / 100 / lev;
  sl = widenSlToMinDistance({
    direction: dir,
    entry,
    sl,
    minFrac: Math.max(MIN_SL_PRICE_FRAC, minMove),
  });
  if (dir === 'LONG' && !(sl < entry)) sl = entry * (1 - minMove);
  if (dir === 'SHORT' && !(sl > entry)) sl = entry * (1 + minMove);

  const moveFrac = Math.abs(entry - sl) / entry;
  const slRoePct = moveFrac * 100 * lev;
  const tp = roeTargetPrice(entry, dir, lev, tpRoe / 100);
  return {
    ok: true,
    lev,
    sl,
    tp,
    slRoePct,
    reasonKo: `손절≥${maxSlRoe}%ROE · ${lev}x · SL≈${slRoePct.toFixed(1)}%ROE · TP${tpRoe}%ROE`,
  };
}

/**
 * 거래소 시드(자산) 기준 · 손절 도달 시 계좌손실 ≈ accountRiskPct%(기본 5).
 * margin = equity × risk% / SL_ROE% · 상한 maxMarginEquityPct.
 */
export const ACCOUNT_RISK_PCT_DEFAULT = 5;

export function resolveAccountRiskMarginUsdt(params: {
  equityUsdt: number;
  slRoePct: number;
  accountRiskPct?: number;
  /** 증거금이 자산의 이 %를 넘지 않음 (기본 25) */
  maxMarginEquityPct?: number;
  /** 최소 증거금 USDT */
  minMarginUsdt?: number;
}): {
  ok: boolean;
  marginUsdt: number;
  accountRiskPct: number;
  reasonKo: string;
} {
  const equity = Math.max(0, Number(params.equityUsdt) || 0);
  const slRoe = Math.max(0.5, Number(params.slRoePct) || FAST_SL_ROE_PCT);
  const riskPct = Math.max(
    0.5,
    Math.min(25, Number(params.accountRiskPct) || ACCOUNT_RISK_PCT_DEFAULT)
  );
  const maxMargPct = Math.max(
    riskPct,
    Math.min(50, Number(params.maxMarginEquityPct) || 25)
  );
  const minM = Math.max(1, Number(params.minMarginUsdt) || 1);

  if (!(equity >= 5)) {
    return {
      ok: false,
      marginUsdt: 0,
      accountRiskPct: riskPct,
      reasonKo: '거래소시드부족(<5U)',
    };
  }

  /** 손절 ROE r% → 증거금 m 이면 계좌손실 ≈ m/eq × r% · 목표 risk% → m = eq×risk/r */
  let margin = (equity * riskPct) / slRoe;
  const cap = (equity * maxMargPct) / 100;
  if (margin > cap) margin = cap;
  margin = Math.max(minM, Math.round(margin * 100) / 100);

  const realizedRisk = (margin / equity) * slRoe;
  return {
    ok: true,
    marginUsdt: margin,
    accountRiskPct: riskPct,
    reasonKo: `시드리스크${riskPct}% · 증거금${margin.toFixed(1)}U · 손절시≈${realizedRisk.toFixed(1)}%자산 · SL_ROE${slRoe.toFixed(1)}%`,
  };
}

export function resolveLiveOrderSlTp(params: {
  entry: number;
  direction: 'LONG' | 'SHORT';
  leverage: number;
  /** 신호/타점 SL — 우선 사용 */
  signalSl?: number | null;
  /** 사용자 절대 손절가(선택) — 타점보다 우선 */
  userSlPrice?: number | null;
  /** 익절 ROE% 증거금 대비 (기본 8 · 강제 캡) */
  tp1RoePct?: number;
  /** 손절 최대 ROE% (기본 20) — 타점이 이보다 멀 때만 자름 */
  slRoePct?: number;
  /** 신호 TF — 분봉별 기본 TP 스케일 */
  timeframe?: string | null;
  /** 밴드 익절가 — lockStructurePrices 일 때만 사용 */
  signalTp?: number | null;
  /**
   * 로켓/존 구조 SL 보호 — ROE 한도의 2배까지 타점 SL 허용
   */
  preserveStructureSl?: boolean;
  /** 세판정 — 손절·익절 가격을 ROE로 다시 그리지 않음 */
  lockStructurePrices?: boolean;
}): {
  sl: number;
  tp: number;
  tp1RoePct: number;
  slRoePct: number;
  clampedSl: boolean;
  usedSignalSl: boolean;
  priceMoveSlPct: number;
} {
  const entry = Number(params.entry);
  const lev = Math.max(1, Math.min(125, Number(params.leverage) || 10));
  void resolveAutoTradeTfHold(params.timeframe || '15m');
  /** 사용자 익절 ROE% (비중·익절 탭) · 미설정만 기본 8 */
  const tp1Fixed = Math.max(
    1,
    Math.min(50, Number(params.tp1RoePct) || FAST_TP1_ROE_PCT)
  );
  const slRoePct = Math.max(
    0.5,
    Math.min(100, Number(params.slRoePct) || FAST_SL_ROE_PCT)
  );
  const dir = params.direction;

  if (!(entry > 0)) {
    return {
      sl: 0,
      tp: 0,
      tp1RoePct: tp1Fixed,
      slRoePct,
      clampedSl: false,
      usedSignalSl: false,
      priceMoveSlPct: (slRoePct / Math.max(1, lev)) * 100,
    };
  }

  if (params.lockStructurePrices) {
    const s = Number(params.signalSl);
    const t = Number(params.signalTp);
    const slOk = dir === 'LONG' ? s > 0 && s < entry : s > entry;
    const tpOk = dir === 'LONG' ? t > entry : t > 0 && t < entry;
    if (slOk && tpOk) {
      return {
        sl: s,
        tp: t,
        tp1RoePct: (Math.abs(t - entry) / entry) * 100 * lev,
        slRoePct: (Math.abs(entry - s) / entry) * 100 * lev,
        clampedSl: false,
        usedSignalSl: true,
        priceMoveSlPct: (Math.abs(entry - s) / entry) * 100,
      };
    }
  }

  const tpMove = tp1Fixed / 100 / lev;
  const slMove = slRoePct / 100 / lev;
  const tp = dir === 'LONG' ? entry * (1 + tpMove) : entry * (1 - tpMove);
  /** 사용자 손절 ROE% 거리 — 전코인 이 폭을 최소로 강제 (구조 타이트 SL로 4% 되는 것 금지) */
  const slRoePx = dir === 'LONG' ? entry * (1 - slMove) : entry * (1 + slMove);

  const userSl =
    params.userSlPrice != null && params.userSlPrice > 0 ? Number(params.userSlPrice) : null;
  const signalSl =
    params.signalSl != null && params.signalSl > 0 ? Number(params.signalSl) : null;

  let sl = slRoePx;
  let clampedSl = false;
  let usedSignalSl = false;

  const pick = userSl ?? signalSl;
  if (pick != null) {
    if (dir === 'LONG' && pick < entry && pick > 0) {
      /** 구조 SL이 더 멀면(여유↑)만 채택 · 더 타이트하면 ROE 손절 유지 */
      if (pick < slRoePx) {
        sl = pick;
        usedSignalSl = signalSl != null && userSl == null;
      } else {
        sl = slRoePx;
        clampedSl = true;
      }
    } else if (dir === 'SHORT' && pick > entry) {
      if (pick > slRoePx) {
        sl = pick;
        usedSignalSl = signalSl != null && userSl == null;
      } else {
        sl = slRoePx;
        clampedSl = true;
      }
    }
  }

  if (dir === 'LONG' && !(sl < entry && sl > 0)) sl = slRoePx;
  if (dir === 'SHORT' && !(sl > entry)) sl = slRoePx;

  /** ROE 손절폭 미만이면 강제 확장 */
  sl = widenSlToMinDistance({
    direction: dir,
    entry,
    sl,
    minFrac: Math.max(MIN_SL_PRICE_FRAC, slMove),
  });
  if (dir === 'LONG' && !(sl < entry && sl > 0)) sl = slRoePx;
  if (dir === 'SHORT' && !(sl > entry)) sl = slRoePx;

  const priceMoveSlPct = (Math.abs(entry - sl) / entry) * 100;

  return {
    sl,
    tp,
    tp1RoePct: tp1Fixed,
    slRoePct,
    clampedSl,
    usedSignalSl,
    priceMoveSlPct,
  };
}
