import type { OrderbookSnapshot } from '@/lib/data/collectors/orderbookCollector';
import type { AggTrade } from '@/lib/data/collectors/tradesCollector';
import type { OverlayItem, StrongZoneOutput } from '@/types';
import { clusterZones } from './zoneClusterEngine';
import { computeZoneStrength } from './zoneStrengthEngine';
import { computeSignalFromZones } from './signalEngine';

export type StrongZonePipelineResult = {
  nearestBuyZone: StrongZoneOutput | null;
  nearestSellZone: StrongZoneOutput | null;
  verdict: 'LONG' | 'SHORT' | 'WATCH';
  confidence: number;
  buyZones: StrongZoneOutput[];
  sellZones: StrongZoneOutput[];
};

/** 가격대별 고래·기관 매수/매도 물량(호가+대량체결)만으로 zone 생성. 캔들 구조는 사용하지 않음. */
export function runStrongZonePipeline(
  orderbook: OrderbookSnapshot | null,
  trades: AggTrade[],
  currentPrice: number
): StrongZonePipelineResult {
  const raw = clusterZones(orderbook, trades, currentPrice);
  const { buyZones, sellZones } = computeZoneStrength(raw, currentPrice);
  const signal = computeSignalFromZones(buyZones, sellZones, currentPrice);
  return {
    nearestBuyZone: signal.nearestBuyZone,
    nearestSellZone: signal.nearestSellZone,
    verdict: signal.verdict,
    confidence: signal.confidence,
    buyZones,
    sellZones,
  };
}

/** 차트 가격 범위 [minPrice, maxPrice]와 겹치는 구간만 사용 (표시용, zone 자체는 호가·체결 물량 기준) */
function clampZoneToRange(low: number, high: number, minPrice: number, maxPrice: number): { low: number; high: number } | null {
  if (high < minPrice || low > maxPrice) return null;
  return { low: Math.max(low, minPrice), high: Math.min(high, maxPrice) };
}

function formatVolumeUsdt(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}

export function strongZonesToOverlays(
  buyZones: StrongZonePipelineResult['buyZones'],
  sellZones: StrongZonePipelineResult['sellZones'],
  minPrice: number,
  maxPrice: number,
  _visibleLen: number
): OverlayItem[] {
  const range = Math.max(1e-9, maxPrice - minPrice);
  const toRatio = (p: number) => (maxPrice - p) / range;
  const overlays: OverlayItem[] = [];
  const x1 = 0.02;
  const x2 = 0.98;
  buyZones.forEach((z, i) => {
    const clamped = clampZoneToRange(z.low, z.high, minPrice, maxPrice);
    if (!clamped) return;
    const volStr = z.volumeUsdt != null && z.volumeUsdt > 0 ? ` · ${formatVolumeUsdt(z.volumeUsdt)}` : '';
    overlays.push({
      id: `strong-buy-${i}`,
      kind: 'demandZone',
      label: `고래·기관 매수 ${z.probability}%${volStr}`,
      x1,
      y1: toRatio(clamped.high),
      x2,
      y2: toRatio(clamped.low),
      confidence: z.probability,
      color: 'rgba(98,239,224,0.28)',
      category: 'strongZone',
    });
  });
  sellZones.forEach((z, i) => {
    const clamped = clampZoneToRange(z.low, z.high, minPrice, maxPrice);
    if (!clamped) return;
    const volStr = z.volumeUsdt != null && z.volumeUsdt > 0 ? ` · ${formatVolumeUsdt(z.volumeUsdt)}` : '';
    overlays.push({
      id: `strong-sell-${i}`,
      kind: 'supplyZone',
      label: `고래·기관 매도 ${z.probability}%${volStr}`,
      x1,
      y1: toRatio(clamped.high),
      x2,
      y2: toRatio(clamped.low),
      confidence: z.probability,
      color: 'rgba(255,123,123,0.28)',
      category: 'strongZone',
    });
  });
  return overlays;
}

export { clusterZones } from './zoneClusterEngine';
export { computeZoneStrength } from './zoneStrengthEngine';
export { computeSignalFromZones } from './signalEngine';
