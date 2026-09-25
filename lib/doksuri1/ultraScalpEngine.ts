/**
 * 독수리1호 ULTRA SCALPING — 기존 자동초단/페이퍼에 연동하는 게이트·타깃.
 * 실주문 기본 OFF. SIGNAL → PAPER → SHADOW → LIVE 단계.
 * 확정 승률·수익 아님.
 */
import { normalizeChartTimeframe } from '@/lib/constants';
import { estimateScalpNetRoe } from '@/lib/mergedDeskScalpNetRoe';
import { autoTradeMaxBarsForTf } from '@/lib/doksuri1/autoTradeTfHoldScale';

/** 초단타 핵심 TF (1m 타이밍 · 3m 확인 · 5m 셋업 · 15m 구조) */
export const ULTRA_SCALP_CORE_TFS = ['1m', '3m', '5m', '15m'] as const;

/** 방향 바이어스 참고 (강제 합의 아님) */
export const ULTRA_SCALP_BIAS_TFS = ['15m', '1h'] as const;

export type UltraTradingMode = 'OFF' | 'SIGNAL_ONLY' | 'PAPER' | 'SHADOW' | 'LIVE';

export type UltraStrategySpeed = 'NORMAL' | 'SCALP' | 'ULTRA_SCALP';

export type UltraScalpEngineState =
  | 'SCANNING'
  | 'SETUP'
  | 'WAITING'
  | 'ORDER'
  | 'POSITION'
  | 'COOLDOWN'
  | 'HALTED'
  | 'TF_BLOCK';

export function isUltraScalpCoreTf(tf: string): boolean {
  const n = normalizeChartTimeframe(tf);
  return (ULTRA_SCALP_CORE_TFS as readonly string[]).includes(n);
}

/** 레버에 맞춘 TP1/TP2 목표 ROE (증거금 대비). 기본 5% → 10%. */
export function resolveUltraScalpRoeCaps(params: {
  leverage: number;
  tp1RoePct?: number;
  tp2RoePct?: number;
}): { tp1Roe: number; tp2Roe: number; leverage: number; priceMoveTp1Pct: number; priceMoveTp2Pct: number } {
  const lev = Math.max(1, Math.min(125, Number(params.leverage) || 10));
  let tp1 = Math.max(3, Math.min(15, Number(params.tp1RoePct) || 5)) / 100;
  let tp2 = Math.max(tp1 + 0.01, Math.min(20, Number(params.tp2RoePct) || 10) / 100);
  /** 고레버: 가격 이동이 너무 작아지지 않게 최소 가격% 하한 */
  const minMove = lev >= 50 ? 0.08 / 100 : lev >= 25 ? 0.12 / 100 : 0.15 / 100;
  if (tp1 / lev < minMove) tp1 = minMove * lev;
  if (tp2 / lev < minMove * 1.4) tp2 = minMove * 1.4 * lev;
  tp2 = Math.max(tp2, tp1 + 0.01);
  return {
    tp1Roe: tp1,
    tp2Roe: tp2,
    leverage: lev,
    priceMoveTp1Pct: (tp1 / lev) * 100,
    priceMoveTp2Pct: (tp2 / lev) * 100,
  };
}

/** TF별 최대 보유 봉 (마감봉 기준) — 1m~1M 스케일 */
export function ultraScalpMaxBars(tf: string): number {
  return autoTradeMaxBarsForTf(tf);
}

/**
 * 비용 게이트 — 목표 순ROE가 왕복비용×배수보다 커야 통과.
 * EV/승률 확정 아님.
 */
export function ultraScalpCostGatePass(params: {
  leverage: number;
  tp1RoePct: number;
  minNetMultiple?: number;
}): { ok: boolean; reasonKo: string; netRoePct: number; costPct: number } {
  const gross = Math.max(0, Number(params.tp1RoePct) || 5);
  const est = estimateScalpNetRoe({
    grossRoePct: gross,
    leverage: params.leverage,
    holdHours: 0.35,
  });
  const cost = est.roundTripFeeOnMarginPct + est.fundingOnMarginPct;
  const mult = Math.max(1.5, params.minNetMultiple ?? 2);
  const need = cost * mult;
  const ok = est.netRoePct >= need * 0.35 && est.netRoePct > 0.5;
  return {
    ok,
    netRoePct: est.netRoePct,
    costPct: cost,
    reasonKo: ok
      ? `비용OK · 순ROE≈${est.netRoePct.toFixed(1)}% (비용≈${cost.toFixed(1)}%p)`
      : `비용PASS · 순ROE≈${est.netRoePct.toFixed(1)}% < 필요(비용×${mult.toFixed(1)} 참고)`,
  };
}

export function resolveUltraTradingMode(params: {
  enabled: boolean;
  liveArmed: boolean;
  tradingMode?: UltraTradingMode | null;
}): UltraTradingMode {
  if (!params.enabled) return 'OFF';
  const m = params.tradingMode;
  if (m === 'LIVE') return params.liveArmed ? 'LIVE' : 'PAPER';
  if (m === 'SHADOW' || m === 'SIGNAL_ONLY' || m === 'PAPER' || m === 'OFF') return m;
  return 'PAPER';
}

export function ultraScalpTfGate(chartTf: string, ultraOnly: boolean): {
  ok: boolean;
  state: UltraScalpEngineState;
  reasonKo: string;
} {
  if (!ultraOnly) {
    return { ok: true, state: 'SCANNING', reasonKo: 'TF제한없음' };
  }
  if (!isUltraScalpCoreTf(chartTf)) {
    return {
      ok: false,
      state: 'TF_BLOCK',
      reasonKo: `초단 ULTRA는 1·3·5·15분만 · 현재 ${normalizeChartTimeframe(chartTf)}`,
    };
  }
  return { ok: true, state: 'SCANNING', reasonKo: `ULTRA TF ${normalizeChartTimeframe(chartTf)}` };
}

/** LIVE 하드락 — UI에서 실수 해제 불가 (liveArmed+명시모드만) */
export function isUltraLiveLocked(tradingMode: UltraTradingMode, liveArmed: boolean): boolean {
  return tradingMode === 'LIVE' && !liveArmed;
}
