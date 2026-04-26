/**
 * 규칙 기반 참고 점수(0~100, 50=중립). 투자 권유·승률이 아닌 체결 편향 요약용.
 */
export function ruleBasedTapeBias(buyPressure: number, sellPressure: number): { score: number; label: string } {
  const bp = Number.isFinite(buyPressure) ? buyPressure : 0.5;
  const sp = Number.isFinite(sellPressure) ? sellPressure : 0.5;
  const t = bp + sp;
  const nb = t > 0 ? bp / t : 0.5;
  const delta = nb - 0.5;
  const score = Math.round(50 + delta * 100);
  let label = '체결 균형';
  if (delta > 0.1) label = '매수 체결 우세';
  else if (delta < -0.1) label = '매도 체결 우세';
  return { score: Math.max(0, Math.min(100, score)), label };
}
