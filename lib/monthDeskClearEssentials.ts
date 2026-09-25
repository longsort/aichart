import type { OverlayItem } from '@/types';

/** 간결(clear) 차트 — 항상 유지할 레이어 id (타점·손익·롱/숏 구간) */
export const MONTH_DESK_CLEAR_ESSENTIAL_IDS = new Set([
  'month-desk-plan-entry',
  'month-desk-plan-sl',
  'month-desk-plan-tp1',
  'month-desk-plan-risk-zone',
  'month-desk-plan-reward-zone',
  'month-desk-core-money-long',
  'month-desk-core-money-short',
  'month-desk-core-money-entry',
  'month-desk-core-long-spot',
  'month-desk-strike-long-zone',
  'month-desk-strike-short-zone',
  'month-desk-strike-long-entry',
  'month-desk-strike-short-entry',
  'month-desk-strike-long-sl',
  'month-desk-strike-short-sl',
  'month-desk-core-short-spot',
  'month-desk-typeom-entry',
  'month-desk-typeom-sl',
  'month-desk-typeom-fvg-zone',
  'trade-atlas-long-zone',
  'trade-atlas-short-zone',
  'trade-atlas-entry-band',
  'trade-atlas-entry',
  'trade-atlas-sl',
  'trade-atlas-tp1',
  'trade-atlas-tp2',
  'trade-atlas-tp3',
  'reaction-zone-entry',
  'reaction-zone-resistance',
  'reaction-zone-support',
]);

/** clear 모드에서 유지할 id 프리픽스 */
export const MONTH_DESK_CLEAR_ESSENTIAL_PREFIXES = [
  'month-desk-plan-',
  'month-desk-core-long-',
  'month-desk-core-short-',
  'month-desk-strike-',
  'month-desk-core-money-',
  'month-desk-smc-bos-',
  'month-desk-smc-choch-',
  'ob-pre-beam-zone',
  'ob-pre-beam-pin-',
  'trade-atlas-',
  'phz-pull-',
  'phz-cluster-',
  'phz-support-',
  'parkf-lr-',
  'parkf-pri-',
  'parkf-sec-',
  'whale-alr-',
  'md-path-',
] as const;

/** clear에서 제거할 장식용 phz (타점·구조와 겹침) */
export const MONTH_DESK_CLEAR_PHZ_DECOR_PREFIXES = [
  'phz-tp',
  'phz-ref-',
  'phz-bullpath-',
  'phz-bearpath-',
  'phz-bullnum-',
  'phz-bearnum-',
  'phz-hot-dot-',
  'phz-hot-tag-',
] as const;

export function isMonthDeskClearEssentialOverlay(o: OverlayItem): boolean {
  const id = String(o.id || '');
  if (MONTH_DESK_CLEAR_ESSENTIAL_IDS.has(id)) return true;
  if (MONTH_DESK_CLEAR_ESSENTIAL_PREFIXES.some((p) => id.startsWith(p))) return true;
  if (id.startsWith('month-desk-pin-confirmed') || id.startsWith('month-desk-pin-candidate')) return true;
  if (id === 'month-desk-chart-deck') return true;
  return false;
}

export function isMonthDeskClearDecorPhz(id: string): boolean {
  const zid = String(id || '');
  if (!zid.startsWith('phz-')) return false;
  return MONTH_DESK_CLEAR_PHZ_DECOR_PREFIXES.some((p) => zid.startsWith(p) || zid.includes(`-${p}`));
}

export function isMonthDeskClearNoiseOverlay(o: OverlayItem): boolean {
  const id = String(o.id || '');
  const kind = String(o.kind || '');
  if (isMonthDeskClearEssentialOverlay(o)) return false;
  if (id.startsWith('whale-auto-bu-ob')) return true;
  if (id.startsWith('key-mustHold-') || id.startsWith('key-mustBreak-')) return true;
  if (id.startsWith('smc-entry-playbook-')) return true;
  if (id.startsWith('month-desk-typeom-pocket') || id.startsWith('month-desk-typeom-leg-')) return true;
  if (id.startsWith('month-desk-typeom-ob-') || id.startsWith('month-desk-typeom-deep-')) return true;
  if (id.startsWith('month-desk-typeom-eq-')) return true;
  if (id.startsWith('month-desk-typeom-tp') && id !== 'month-desk-typeom-entry') return true;
  if (id === 'month-desk-unified-zone' || id === 'month-desk-unified-core') return true;
  if (id === 'month-desk-plan-tp2' || id === 'month-desk-plan-tp3') return true;
  if (kind === 'fibLine') return true;
  if (id.startsWith('hotzone-')) return true;
  if (isMonthDeskClearDecorPhz(id)) return true;
  return false;
}
