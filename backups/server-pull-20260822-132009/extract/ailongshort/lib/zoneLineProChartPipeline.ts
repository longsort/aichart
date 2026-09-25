import type { OverlayItem } from '@/types';
import { filterMonthDeskLayersByMode } from '@/lib/monthDeskChartLayerPolicy';

/** 존·라인 — LinReg·CP·HotZone·Strike·mustHold(SL) 만 */
export function pickLinRegOverlays(items: OverlayItem[]): OverlayItem[] {
  return items.filter((o) => {
    const id = String(o.id || '');
    const cat = String((o as { category?: string }).category || '');
    const kind = String(o.kind || '');
    if (id.startsWith('parkf-')) return true;
    if (kind === 'trendLine' && (cat === 'trendlineEngine' || cat === 'autoTrendline')) return true;
    return false;
  });
}

export function pickCpChannelOverlays(items: OverlayItem[], enabled: boolean): OverlayItem[] {
  if (!enabled) return [];
  return items.filter((o) => {
    const id = String(o.id || '');
    const cat = String((o as { category?: string }).category || '');
    const kind = String(o.kind || '');
    if (id.startsWith('cptc-')) return true;
    if (cat === 'chartPrimeTrendChannels') return true;
    if (kind === 'channelBand' && id.startsWith('cptc-')) return true;
    return false;
  });
}

export function pickHotZoneOverlays(items: OverlayItem[]): OverlayItem[] {
  return items.filter((o) => {
    const id = String(o.id || '');
    return id.startsWith('hotzone-') || id.startsWith('whale-auto-bu-ob');
  });
}

export function buildZoneLineProBaseOverlays(params: {
  filteredOverlays: OverlayItem[];
  strikePack: OverlayItem[];
  whaleHotZoneOverlays: OverlayItem[];
  whaleHotZoneEnabled: boolean;
  showChartPrimeTrendChannels: boolean;
  pullbackHotOverlays?: OverlayItem[];
  pullbackHotEnabled?: boolean;
}): OverlayItem[] {
  const {
    filteredOverlays,
    strikePack,
    whaleHotZoneOverlays,
    whaleHotZoneEnabled,
    showChartPrimeTrendChannels,
    pullbackHotOverlays = [],
    pullbackHotEnabled = true,
  } = params;

  const mustHold = filteredOverlays.filter((o) => String(o.id || '').startsWith('key-mustHold-'));
  const whaleHz =
    whaleHotZoneEnabled && whaleHotZoneOverlays.length ? whaleHotZoneOverlays : [];
  const pullback =
    pullbackHotEnabled && pullbackHotOverlays.length
      ? pullbackHotOverlays.filter((o) => {
          const id = String(o.id || '');
          return id.startsWith('hotzone-') || id.startsWith('phz-hot');
        })
      : [];

  const raw = [
    ...pickCpChannelOverlays(filteredOverlays, showChartPrimeTrendChannels),
    ...pickLinRegOverlays(filteredOverlays),
    ...pickHotZoneOverlays([...whaleHz, ...pullback, ...filteredOverlays]),
    ...strikePack,
    ...mustHold.slice(0, 2),
  ];

  return filterMonthDeskLayersByMode(raw, 'zoneLinePro');
}
