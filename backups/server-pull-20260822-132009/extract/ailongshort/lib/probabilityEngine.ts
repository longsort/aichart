export type ProbabilityResult = {
  longProbability: number;
  shortProbability: number;
  score: number;
  reason: string[];
};

export type TradeProbabilityExtras = {
  /** WAD 급증 + 호가·체결 매수 존 겹침 시 롱 확률 가산(음수면 감산) */
  wadZoneLongBonus?: number;
  /** WAD 급증 + 호가·체결 매도 존 겹침 시 숏 확률 가산 */
  wadZoneShortBonus?: number;
  /** AI·고래 모드: 신뢰·정렬 반영 강화, 정렬 붕괴 시 상한으로 과신 완화 */
  aiModeMax?: boolean;
};

export function computeTradeProbability(
  verdict: string,
  confidence: number,
  engine: Record<string, any>,
  topRefScore: number,
  mtfAlignment: number,
  extras?: TradeProbabilityExtras
): ProbabilityResult {
  const reasons: string[] = [];
  let longP = 50;
  let shortP = 50;
  const lz = extras?.wadZoneLongBonus ?? 0;
  const sz = extras?.wadZoneShortBonus ?? 0;
  const mx = extras?.aiModeMax === true;
  const capP = mx ? 96 : 90;
  const capP2 = mx ? 97 : 92;
  const capWatch = mx ? 90 : 88;
  if (verdict === 'LONG') {
    longP = Math.min(
      capP,
      (mx ? 40 : 45) + confidence * (mx ? 0.46 : 0.4) + (topRefScore || 0) * (mx ? 11 : 10) + mtfAlignment * (mx ? 0.26 : 0.2)
    );
    longP = Math.min(capP2, Math.max(6, longP + lz - sz));
    if (mx) {
      if (mtfAlignment <= 38) longP = Math.min(longP, 76);
      else if (mtfAlignment <= 48) longP = Math.min(longP, 86);
    }
    shortP = 100 - longP;
    reasons.push('구조 롱', `신뢰도 ${confidence}%`, `MTF 정렬 ${mtfAlignment}%`);
    if (lz > 0) reasons.push('존·WAD 롱 합치');
    if (sz > 0) reasons.push('반대 축 존·WAD');
    if (mx) reasons.push('AI·고래 가중');
  } else if (verdict === 'SHORT') {
    shortP = Math.min(
      capP,
      (mx ? 40 : 45) + confidence * (mx ? 0.46 : 0.4) + (topRefScore || 0) * (mx ? 11 : 10) + mtfAlignment * (mx ? 0.26 : 0.2)
    );
    shortP = Math.min(capP2, Math.max(6, shortP + sz - lz));
    if (mx) {
      if (mtfAlignment <= 38) shortP = Math.min(shortP, 76);
      else if (mtfAlignment <= 48) shortP = Math.min(shortP, 86);
    }
    longP = 100 - shortP;
    reasons.push('구조 숏', `신뢰도 ${confidence}%`, `MTF 정렬 ${mtfAlignment}%`);
    if (sz > 0) reasons.push('존·WAD 숏 합치');
    if (lz > 0) reasons.push('반대 축 존·WAD');
    if (mx) reasons.push('AI·고래 가중');
  } else {
    longP = Math.min(capWatch, Math.max(10, 50 + lz - sz));
    shortP = 100 - longP;
    reasons.push('관망', `신뢰도 ${confidence}%`);
    if (lz !== 0 || sz !== 0) reasons.push('존·WAD 가중');
    if (mx) reasons.push('AI·고래 가중');
  }
  const score = longP - shortP;
  return {
    longProbability: Math.round(longP),
    shortProbability: Math.round(shortP),
    score,
    reason: reasons.slice(0, 6),
  };
}
