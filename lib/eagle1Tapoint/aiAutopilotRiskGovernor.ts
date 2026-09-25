/**
 * AI AUTOPILOT — RISK CONSTITUTION.
 * AI/신호엔진이 변경할 수 없음. 확정 수익 아님.
 */
export const AI_AUTOPILOT_ENGINE_ID = 'AI_AUTOPILOT_SNIPER' as const;
export const AI_AUTOPILOT_SKILL_ID = 'ethAutopilot' as const;
export const MAX_TOTAL_TRADE_RISK_PCT = 5;
export const AI_AUTOPILOT_CONFIG_VERSION = 'ap-eth-v1';

export type RiskGovernorResult = {
  ok: boolean;
  reasonKo: string;
  selectedRiskPct: number;
  maxRiskPct: typeof MAX_TOTAL_TRADE_RISK_PCT;
};

/** 아이디어 합산 최악손실이 5%를 넘으면 거절. SL 확대 요청도 거절. */
export function governIdeaRisk(input: {
  equityUsdt: number;
  worstCaseLossUsdt: number;
  requestedRiskPct?: number;
  slWidenRequested?: boolean;
}): RiskGovernorResult {
  const max = MAX_TOTAL_TRADE_RISK_PCT;
  if (input.slWidenRequested) {
    return {
      ok: false,
      reasonKo: 'RISK · SL 확대 금지',
      selectedRiskPct: 0,
      maxRiskPct: max,
    };
  }
  const eq = Math.max(0, Number(input.equityUsdt) || 0);
  const worst = Math.max(0, Number(input.worstCaseLossUsdt) || 0);
  const cap = eq * (max / 100);
  const req = Math.min(max, Math.max(0, Number(input.requestedRiskPct) || 0.5));
  if (!(eq > 0)) {
    return { ok: false, reasonKo: 'RISK · 계좌 없음', selectedRiskPct: 0, maxRiskPct: max };
  }
  if (worst > cap + 1e-8) {
    return {
      ok: false,
      reasonKo: `RISK 5% 초과 거절 · 최악 ${worst.toFixed(2)} > 한도 ${cap.toFixed(2)}`,
      selectedRiskPct: 0,
      maxRiskPct: max,
    };
  }
  return {
    ok: true,
    reasonKo: `RISK OK · ${req.toFixed(2)}% / 상한 ${max.toFixed(1)}%`,
    selectedRiskPct: req,
    maxRiskPct: max,
  };
}

export function clampSelectedRiskPct(pct: number): number {
  const v = Number(pct);
  if (!Number.isFinite(v)) return 0.5;
  return Math.max(0, Math.min(MAX_TOTAL_TRADE_RISK_PCT, v));
}

export function isEthAutopilotSymbol(symbol: string | null | undefined): boolean {
  const u = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return u.startsWith('ETH');
}
