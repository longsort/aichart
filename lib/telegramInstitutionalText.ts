import type { InstitutionalBandInteractionMarker } from '@/lib/institutionalSuperBand';

export function formatInstitutionalBandTouchMarkerDetailText(ev: InstitutionalBandInteractionMarker): string {
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
  return `${head}|${ev.tier}|${ev.score}|${ev.proximityAtr.toFixed(2)}|${sum}${prec}${cnf}${pipe}`;
}
