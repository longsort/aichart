/**
 * 기관밴드(ST) 터치 — 캔들 마커 compact 라벨 (마감·안착·융합·통합·분석 공용).
 * L★ / S◆ · LH★(합류) / LP★(정밀) · ⚡LH★(S등급 합류) 등.
 */
import type { InstitutionalBandInteractionMarker } from '@/lib/institutionalSuperBand';

/** 캔들 위 표시 — 짧은 LH/SH/LP/SP + tier 기호 */
export function formatInstitutionalBandTouchMarkerChartText(
  ev: InstitutionalBandInteractionMarker
): string {
  const sym = ev.tier === 'A' ? '★' : ev.tier === 'B' ? '◆' : '·';
  const sHint = ev.confluence?.grade === 'S' ? '⚡' : '';
  const lane = ev.unionSource === 'confluence' ? 'H' : ev.unionSource === 'precision' ? 'P' : '';
  if (ev.verdict === 'LONG') {
    return lane ? `${sHint}L${lane}${sym}` : `${sHint}L${sym}`;
  }
  return lane ? `${sHint}S${lane}${sym}` : `${sHint}S${sym}`;
}

/** detailMap·클릭 패널 — ST· 파이프 (ChartView chartMarkerDetailLine과 연동) */
export function formatInstitutionalBandTouchMarkerDetailText(
  ev: InstitutionalBandInteractionMarker
): string {
  const sym = ev.tier === 'A' ? '★' : ev.tier === 'B' ? '◆' : '';
  const head = ev.verdict === 'LONG' ? `ST·L${sym}` : `ST·S${sym}`;
  const sum = ev.summaryParts.slice(0, 8).join('·');
  const prec =
    ev.precisionParts && ev.precisionParts.length
      ? `|정밀:${ev.precisionParts.slice(0, 6).join('·')}`
      : '';
  const cnf = ev.confluence
    ? `|합류${ev.confluence.total}·${ev.confluence.grade}|${ev.confluence.parts.slice(0, 5).join('·')}`
    : '';
  const pipe =
    ev.unionSource === 'confluence' ? '|파이프:합류' : ev.unionSource === 'precision' ? '|파이프:정밀' : '';
  const sr =
    typeof (ev as { supportProb?: number }).supportProb === 'number' ||
    typeof (ev as { resistanceProb?: number }).resistanceProb === 'number'
      ? `|지지${(ev as { supportProb?: number }).supportProb ?? '—'}%·저항${(ev as { resistanceProb?: number }).resistanceProb ?? '—'}%`
      : '';
  return `${head}|${ev.tier}|${ev.score}|${ev.proximityAtr.toFixed(2)}|${sum}${prec}${cnf}${pipe}${sr}`;
}

export function markerLooksLikeInstitutionalBandTouch(m: {
  shape?: string;
  text?: string;
}): boolean {
  if (m.shape !== 'arrowUp' && m.shape !== 'arrowDown') return false;
  const tx = String(m.text ?? '').trim();
  return (
    /^[⚡]?[LS][HP]?[★◆·]/.test(tx) ||
    /^롱ST/.test(tx) ||
    /^숏ST/.test(tx) ||
    tx === 'LP' ||
    tx === 'SP' ||
    tx === 'LH' ||
    tx === 'SH'
  );
}

export function institutionalBandTouchMarkerStyle(ev: InstitutionalBandInteractionMarker): {
  color: string;
  size: number;
} {
  const sGrade = ev.confluence?.grade === 'S';
  if (ev.verdict === 'LONG') {
    return {
      color: sGrade ? '#fbbf24' : ev.tier === 'A' ? '#2dd4bf' : ev.tier === 'B' ? '#14b8a6' : '#0d9488',
      size: sGrade || ev.tier === 'A' ? 2 : 1,
    };
  }
  return {
    color: sGrade ? '#fbbf24' : ev.tier === 'A' ? '#f472b6' : ev.tier === 'B' ? '#fb7185' : '#e11d48',
    size: sGrade || ev.tier === 'A' ? 2 : 1,
  };
}
