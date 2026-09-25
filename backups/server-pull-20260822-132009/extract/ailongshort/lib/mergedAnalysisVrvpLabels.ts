/** 통합·분석 VRVP — 사용자-facing 한글 라벨 (POC/VAH/VAL 대신) */

export const MERGED_VRVP_KO = {
  /** Point of Control */
  poc: '최다거래가',
  pocShort: '최다거래',
  /** Value Area High */
  vaHigh: '집중상단',
  /** Value Area Low */
  vaLow: '집중하단',
  /** Value Area 70% band */
  vaBand: '거래70%',
  vaRange: '거래집중',
} as const;

export function mergedVrvpPocTitle(price: number, fmt: (n: number) => string): string {
  return `${MERGED_VRVP_KO.pocShort} ${fmt(price)}`;
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
}): string {
  const { poc, vaLow, vaHigh, timeframe, candleCount, vaCoveragePct } = params;
  const lo = vaLow != null ? vaLow.toFixed(0) : '—';
  const hi = vaHigh != null ? vaHigh.toFixed(0) : '—';
  const pct = Math.round(vaCoveragePct ?? 70);
  return `${MERGED_VRVP_KO.poc} ${poc.toFixed(0)} · ${MERGED_VRVP_KO.vaRange} ${lo}~${hi} · ${timeframe} ${candleCount}봉 (${pct}%)`;
}

export function mergedVrvpPanelPending(timeframe: string): string {
  return `${MERGED_VRVP_KO.poc} 계산 대기 — ${timeframe} TF 봉 수 부족 시 재시도`;
}

export function mergedVrvpVaRangeFoot(vaLow: number, vaHigh: number, fmt: (n: number) => string): string {
  return `${MERGED_VRVP_KO.vaRange} ${fmt(vaLow)}~${fmt(vaHigh)}`;
}
