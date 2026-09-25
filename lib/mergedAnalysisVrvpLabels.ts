/** 통합·분석 VRVP — 사용자-facing 한글 라벨 (POC/VAH/VAL 대신) */

export const MERGED_VRVP_KO = {
  /** Point of Control */
  poc: '최다거래가',
  pocShort: '최다거래',
  pocBuy: '매수최다거래',
  pocSell: '매도최다거래',
  /** Developing POC — 최근 스윙~현재 */
  developingPoc: '진행최다',
  developingPocShort: '진행최다',
  /** Spot-near HVN */
  nearHvnAbove: '근처고거래↑',
  nearHvnBelow: '근처고거래↓',
  /** Value Area High */
  vaHigh: '집중상단',
  /** Value Area Low */
  vaLow: '집중하단',
  /** Value Area 70% band */
  vaBand: '거래70%',
  vaRange: '거래집중',
} as const;

export function mergedVrvpPocTitle(
  price: number,
  fmt: (n: number) => string,
  bias?: { side?: 'buy' | 'sell' | 'balanced' | null; buyPct?: number | null; sellPct?: number | null } | null
): string {
  const side =
    bias?.side === 'buy'
      ? `${MERGED_VRVP_KO.pocBuy}·롱톤`
      : bias?.side === 'sell'
        ? `${MERGED_VRVP_KO.pocSell}·숏톤`
        : bias?.side === 'balanced'
          ? '최다거래·균형'
          : MERGED_VRVP_KO.pocShort;
  const share =
    bias?.buyPct != null && bias?.sellPct != null
      ? ` 매${Math.round(bias.buyPct)}/도${Math.round(bias.sellPct)}`
      : '';
  return `${side}${share} ${fmt(price)}`;
}

/** 통합·분석 최다거래 — 매수=초록 · 매도=빨강 · 균형만 호박 (HTML 스트립·축선 공용) */
export function mergedVrvpPocTone(params: {
  side?: 'buy' | 'sell' | 'balanced' | null;
  buyPct?: number | null;
  sellPct?: number | null;
  strength?: number | null;
} | null | undefined): {
  side: 'buy' | 'sell' | 'balanced' | null;
  strong: boolean;
  lineHex: string;
  binCss: string;
  railCss: string;
  labelHex: string;
  dashCss: string;
} {
  const side = params?.side ?? null;
  const buy = params?.buyPct;
  const sell = params?.sellPct;
  const strength = params?.strength ?? 0;
  const strong =
    (side === 'buy' && buy != null && sell != null && buy - sell >= 5) ||
    (side === 'sell' && buy != null && sell != null && sell - buy >= 5) ||
    strength >= 62;

  if (side === 'buy') {
    return {
      side,
      strong,
      lineHex: strong ? '#22c55e' : '#4ade80',
      binCss: strong ? 'rgba(34,197,94,0.88)' : 'rgba(74,222,128,0.78)',
      railCss: strong
        ? 'linear-gradient(90deg,rgba(34,197,94,0.45),rgba(34,197,94,0.92) 42%,rgba(74,222,128,0.35))'
        : 'linear-gradient(90deg,rgba(74,222,128,0.4),rgba(74,222,128,0.85) 42%,rgba(74,222,128,0.3))',
      labelHex: '#86efac',
      dashCss: 'rgba(74,222,128,0.72)',
    };
  }
  if (side === 'sell') {
    return {
      side,
      strong,
      lineHex: strong ? '#ef4444' : '#f87171',
      binCss: strong ? 'rgba(239,68,68,0.88)' : 'rgba(248,113,113,0.78)',
      railCss: strong
        ? 'linear-gradient(90deg,rgba(239,68,68,0.45),rgba(239,68,68,0.92) 42%,rgba(248,113,113,0.35))'
        : 'linear-gradient(90deg,rgba(248,113,113,0.4),rgba(248,113,113,0.85) 42%,rgba(248,113,113,0.3))',
      labelHex: '#fca5a5',
      dashCss: 'rgba(248,113,113,0.72)',
    };
  }
  return {
    side,
    strong: false,
    lineHex: '#fbbf24',
    binCss: 'rgba(250,204,21,0.75)',
    railCss: 'linear-gradient(90deg,rgba(250,204,21,0.55),rgba(250,204,21,0.88) 40%,rgba(250,204,21,0.35))',
    labelHex: '#fde047',
    dashCss: 'rgba(250,204,21,0.65)',
  };
}

export function mergedVrvpSpotMoveFoot(params: {
  upsidePct: number | null | undefined;
  downsidePct: number | null | undefined;
}): string {
  const up = params.upsidePct;
  const dn = params.downsidePct;
  const upS = up != null && Number.isFinite(up) ? `${up >= 0 ? '+' : ''}${up.toFixed(1)}%` : '—';
  const dnS = dn != null && Number.isFinite(dn) ? `${dn >= 0 ? '-' : ''}${Math.abs(dn).toFixed(1)}%` : '—';
  return `현물 VA기준 ↑${upS} ↓${dnS} · 추정`;
}

export function mergedVrvpVaHighTitle(price: number, fmt: (n: number) => string): string {
  return `${MERGED_VRVP_KO.vaHigh} ${fmt(price)}`;
}

export function mergedVrvpVaLowTitle(price: number, fmt: (n: number) => string): string {
  return `${MERGED_VRVP_KO.vaLow} ${fmt(price)}`;
}

export function mergedVrvpPanelSummary(params: {
  poc: number;
  vaLow: number | null | undefined;
  vaHigh: number | null | undefined;
  timeframe: string;
  candleCount: number;
  vaCoveragePct: number | null | undefined;
  pocBiasKo?: string | null;
  scenarioKo?: string | null;
  developingPoc?: number | null;
  nearHvnAbove?: number | null;
  nearHvnBelow?: number | null;
}): string {
  const {
    poc,
    vaLow,
    vaHigh,
    timeframe,
    candleCount,
    vaCoveragePct,
    pocBiasKo,
    scenarioKo,
    developingPoc,
    nearHvnAbove,
    nearHvnBelow,
  } = params;
  const lo = vaLow != null ? vaLow.toFixed(0) : '—';
  const hi = vaHigh != null ? vaHigh.toFixed(0) : '—';
  const pct = Math.round(vaCoveragePct ?? 70);
  const bias = pocBiasKo ? ` · ${pocBiasKo}` : '';
  const scen = scenarioKo ? ` · ${scenarioKo}` : '';
  const dev =
    developingPoc != null && Number.isFinite(developingPoc)
      ? ` · ${MERGED_VRVP_KO.developingPoc} ${developingPoc.toFixed(0)}`
      : '';
  const near =
    nearHvnAbove != null || nearHvnBelow != null
      ? ` · 근처${nearHvnAbove != null ? '↑' + nearHvnAbove.toFixed(0) : ''}${
          nearHvnBelow != null ? '↓' + nearHvnBelow.toFixed(0) : ''
        }`
      : '';
  return `${MERGED_VRVP_KO.poc} ${poc.toFixed(0)}${dev}${near} · ${MERGED_VRVP_KO.vaRange} ${lo}~${hi} · ${timeframe} ${candleCount}봉 (${pct}%)${bias}${scen}`;
}

export function mergedVrvpPanelPending(timeframe: string): string {
  return `${MERGED_VRVP_KO.poc} 계산 대기 — ${timeframe} TF 봉 수 부족 시 재시도`;
}

export function mergedVrvpVaRangeFoot(vaLow: number, vaHigh: number, fmt: (n: number) => string): string {
  return `${MERGED_VRVP_KO.vaRange} ${fmt(vaLow)}~${fmt(vaHigh)}`;
}
