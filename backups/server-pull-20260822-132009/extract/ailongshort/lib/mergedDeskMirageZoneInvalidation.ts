/**
 * Mirage zone — 무효화 가격 수평 점선 (zone 깨짐 기준).
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { isMergedDeskMirageTvZoneOverlay } from '@/lib/mergedAnalysisOverlayIds';
import { inferMirageZoneRole, type ZoneRole } from '@/lib/mergedDeskMirageZoneExchangeIntel';

export function mirageZoneInvalidationPrice(
  zoneTop: number,
  zoneBot: number,
  role: ZoneRole
): number | null {
  if (!(zoneTop > zoneBot)) return null;
  const expectBull = role === 'support' || role === 'ob_bull';
  const expectBear = role === 'resistance' || role === 'ob_bear';
  if (expectBull) return zoneBot;
  if (expectBear) return zoneTop;
  return null;
}

export function injectMirageZoneInvalidationLines(
  overlays: OverlayItem[],
  candles: Candle[]
): OverlayItem[] {
  if (candles.length < 2) return overlays;
  const n = candles.length;
  const tLast = Number(candles[n - 1]!.time) as UTCTimestamp;
  const out: OverlayItem[] = [...overlays];
  const seen = new Set<string>();

  for (const raw of overlays) {
    if (!isMergedDeskMirageTvZoneOverlay(raw) || String(raw.kind) !== 'zone') continue;
    const id = String(raw.id || '');
    if (seen.has(id)) continue;
    seen.add(id);

    const p1 = Number(raw.price1);
    const p2 = Number(raw.price2);
    if (!Number.isFinite(p1) || !Number.isFinite(p2)) continue;

    const zoneTop = Math.max(p1, p2);
    const zoneBot = Math.min(p1, p2);
    const role = inferMirageZoneRole(raw);
    const invalPx = mirageZoneInvalidationPrice(zoneTop, zoneBot, role);
    if (invalPx == null) continue;

    const t1 = Number(raw.time1) as UTCTimestamp;
    const expectBull = role === 'support' || role === 'ob_bull';
    const labelKo = expectBull ? '무효·하향이탈' : '무효·상향돌파';

    out.push({
      id: `merged-ares-mlsp-tv-inval-${id.replace(/^merged-ares-mlsp-tv-/, '')}`,
      kind: 'keyLevel',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: tLast,
      price1: invalPx,
      price2: invalPx,
      confidence: 0.72,
      color: 'rgba(248,113,113,0.55)',
      lineLabelColor: '#f87171',
      lineDash: '5 4',
      lineStrokeWidth: 1.4,
      category: 'keyLevel',
      noProject: true,
      overlayZoneExtraClass: 'merged-ares-mlsp-tv-invalidation-line',
      labelTooltip: `${labelKo} — 종가 ${expectBull ? 'zone 하단' : 'zone 상단'} 이탈 시 시나리오 무효 · 검증 필요`,
    });
  }

  return out;
}
