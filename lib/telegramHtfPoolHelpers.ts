import type { OverlayItem } from '@/types';

/** HTF: 마감봉 H/L이 HotZone 면(가격)과 겹치는지 */
export function htfCandleTouchesHotZoneInPool(
  pool: OverlayItem[],
  c: { high: number; low: number } | null | undefined
): boolean {
  if (!c || !Number.isFinite(c.high) || !Number.isFinite(c.low)) return false;
  for (const o of pool as any[]) {
    const id = String(o?.id || '');
    const idL = id.toLowerCase();
    if (!idL.includes('hotzone') && !idL.includes('hot-zone') && !id.startsWith('hotzone-')) continue;
    if (String(o?.kind || '').toLowerCase() === 'label') continue;
    const p1 = Number(o?.price1);
    const p2 = Number(o?.price2);
    if (!Number.isFinite(p1) || !Number.isFinite(p2)) continue;
    const lo = Math.min(p1, p2);
    const hi = Math.max(p1, p2);
    if (c.high >= lo && c.low <= hi) return true;
  }
  return false;
}

export function htfCandleTouchesSupplyDemandStrongInPool(
  pool: OverlayItem[],
  c: { high: number; low: number } | null | undefined
): boolean {
  if (!c || !Number.isFinite(c.high) || !Number.isFinite(c.low)) return false;
  for (const o of pool as any[]) {
    const k = String(o?.kind || '');
    const cat = String(o?.category || '');
    if (k === 'label') continue;
    const isSupply = k === 'supplyZone' || /supply|공급|저항/i.test(String(o?.label || ''));
    const isDemand = k === 'demandZone' || /demand|수요|지지|support/i.test(String(o?.label || ''));
    const isStrong = cat === 'strongZone' || k === 'strongHigh' || k === 'strongLow' || k === 'strongZone';
    if (!isSupply && !isDemand && !isStrong) continue;
    const p1 = Number(o?.price1);
    const p2 = Number(o?.price2);
    if (!Number.isFinite(p1) || !Number.isFinite(p2)) continue;
    const lo = Math.min(p1, p2);
    const hi = Math.max(p1, p2);
    if (c.high >= lo && c.low <= hi) return true;
  }
  return false;
}
