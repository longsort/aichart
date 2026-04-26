import type { OverlayItem } from '@/types';

function formatOverlayPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (p >= 0.01) return p.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  return p.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 8 });
}

export function extractTelegramCpHotLinesFromOverlays(
  pool: OverlayItem[]
): { cpLine: string | null; hotzoneLine: string | null } {
  const fmtP = (v: number | null | undefined) =>
    typeof v === 'number' && Number.isFinite(v) ? formatOverlayPrice(v) : '-';

  const cpCandidates = [...pool].filter((o: any) => String(o?.category || '') === 'chartPrimeTrendChannels');
  const cpPrices: number[] = [];
  for (const o of cpCandidates as any[]) {
    const b = o?.channelBand;
    if (b && typeof b === 'object') {
      for (const k of ['priceHigh1', 'priceHigh2', 'priceLow1', 'priceLow2'] as const) {
        const v = Number(b[k]);
        if (Number.isFinite(v)) cpPrices.push(v);
      }
    }
    const p1 = Number(o?.price1);
    const p2 = Number(o?.price2);
    if (Number.isFinite(p1)) cpPrices.push(p1);
    if (Number.isFinite(p2)) cpPrices.push(p2);
  }
  const cpPacked = [...new Set(cpPrices.map((p) => formatOverlayPrice(p)))].slice(-6).slice(-3).join(' / ');
  const cpLine = cpPacked ? `CP 선: ${cpPacked}` : null;

  const hz = [...pool]
    .filter((o: any) => String(o?.id || '').startsWith('hotzone-') && o?.kind !== 'label')
    .sort((a: any, b: any) => Number(b?.time2 ?? b?.time1 ?? 0) - Number(a?.time2 ?? a?.time1 ?? 0))[0] as any;
  const hotzoneLine =
    hz && Number.isFinite(Number(hz.price1)) && Number.isFinite(Number(hz.price2))
      ? (() => {
          const hi = Math.max(Number(hz.price1), Number(hz.price2));
          const lo = Math.min(Number(hz.price1), Number(hz.price2));
          return `HotZone 선: ${fmtP(lo)} ~ ${fmtP(hi)}`;
        })()
      : null;

  return { cpLine, hotzoneLine };
}
