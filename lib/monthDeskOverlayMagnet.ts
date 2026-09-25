/**
 * 마감·안착 차트 — 존·선·핀·라벨을 분석 time/price에 고정(줌·패닝 동기).
 */

/** 마감·안착 분석 오버레이 id (봉 자석·라벨 앵커 대상) */
export function isMonthDeskFeatureOverlayId(id: string | undefined): boolean {
  if (!id) return false;
  const zid = String(id);
  if (zid.startsWith('month-desk-')) return true;
  if (zid.startsWith('ob-pre-beam-pin-')) return true;
  return false;
}

/** time→X: coreMagnetBarTimeToX (캔들 봉에 스냅) */
export function isMonthDeskMagnetBarSnapOverlayId(id: string | undefined): boolean {
  return isMonthDeskFeatureOverlayId(id);
}

/** 존 폭: analyze time1~time2만 (우측 빈 축까지 임의 연장 방지) */
export function isMonthDeskMagnetZoneStrictWidthId(id: string | undefined): boolean {
  if (!id) return false;
  const zid = String(id);
  if (zid.startsWith('month-desk-core-money-')) return true;
  if (zid.startsWith('month-desk-history-money-')) return true;
  if (zid.startsWith('month-desk-unified-')) return true;
  if (zid === 'month-desk-plan-risk-zone' || zid === 'month-desk-plan-reward-zone') return true;
  if (zid.startsWith('month-desk-smc-') && /zone|ob|fvg|supply|demand/i.test(zid)) return true;
  return false;
}

/** 존·면: 형성 구간(time1~time2)에만 붙임 — 최신봉까지 강제 연장 금지 */
export function isMonthDeskStickZoneToAnalyzedBarsId(id: string | undefined): boolean {
  if (!isMonthDeskMagnetZoneStrictWidthId(id)) return false;
  const zid = String(id);
  if (zid.startsWith('month-desk-typeom-')) return false;
  return true;
}

/** 가로선·keyLevel 라벨 Y를 선 가격에 고정 */
export function isMonthDeskAnchoredLineLabelId(id: string | undefined): boolean {
  if (!id) return false;
  const zid = String(id);
  if (!zid.startsWith('month-desk-')) return false;
  if (zid.endsWith('-zone') || zid.includes('-zone-')) return false;
  if (
    zid === 'month-desk-core-money-long' ||
    zid === 'month-desk-core-money-short' ||
    zid === 'month-desk-core-money-entry'
  ) {
    return false;
  }
  return true;
}
