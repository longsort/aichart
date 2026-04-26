import type { Candle, OverlayItem } from '@/types';

function fmtPivotPrice(p: number): string {
  if (!Number.isFinite(p)) return '—';
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (p >= 1) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return p.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function fmtPivotVolume(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1e9) return `${(v / 1e9).toFixed(3)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(3)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(3)}K`;
  return v.toFixed(2);
}

/** TV식 캔들분석 핵심 존 — 보라 Supply / 틸 Demand, 반투명 띠 */
const SUPPLY_FILL = 'rgba(168, 85, 247, 0.32)';
const DEMAND_FILL = 'rgba(45, 212, 191, 0.32)';
const SUPPLY_STROKE = '#c084fc';
const DEMAND_STROKE = '#2dd4bf';

function isEngineFluidSd(o: OverlayItem): boolean {
  if (o.kind !== 'supplyZone' && o.kind !== 'demandZone') return false;
  const id = String(o.id || '');
  return /^supply-\d+$/.test(id) || /^demand-\d+$/.test(id);
}

/**
 * analyze 엔진(FluidTrades 스윙 기반)의 supply/demand만 골라 캔들분석용으로 재스타일.
 * 차트 우측까지 연장(x2=1), 라벨은 Supply / Demand.
 */
export function buildCandleAnalysisCoreSdZones(engineOverlays: OverlayItem[], candles: Candle[]): OverlayItem[] {
  if (!candles.length || !engineOverlays.length) return [];
  const lastT = candles[candles.length - 1].time as number;
  const raw = engineOverlays.filter(isEngineFluidSd);
  if (!raw.length) return [];

  const supplies = raw.filter((o) => o.kind === 'supplyZone').slice(-4);
  const demands = raw.filter((o) => o.kind === 'demandZone').slice(-4);
  const ordered = [...supplies, ...demands];

  return ordered.map((o) => {
    const isSupply = o.kind === 'supplyZone';
    const p1 = Number(o.price1);
    const p2 = Number(o.price2);
    const top = Math.max(p1, p2);
    const bottom = Math.min(p1, p2);
    const midPx = (top + bottom) / 2;
    const suffix = String(o.id || '').replace(/^supply-|^demand-/, '');
    const x1 = typeof o.x1 === 'number' && Number.isFinite(o.x1) ? o.x1 : 0;
    const name = isSupply ? 'Supply' : 'Demand';
    return {
      ...o,
      id: `ca-core-${o.kind}-${suffix}`,
      category: 'candleAnalysisCoreSd',
      /** TV 스타일: 이름 + 존 중간가(한 줄씩) — 캡션은 차트 우측에만 그림 */
      label: `${name}\n${fmtPivotPrice(midPx)}`,
      x1,
      x2: 1,
      time1: o.time1,
      time2: lastT,
      price1: top,
      price2: bottom,
      color: isSupply ? SUPPLY_FILL : DEMAND_FILL,
      lineLabelColor: isSupply ? SUPPLY_STROKE : DEMAND_STROKE,
    } as OverlayItem;
  });
}

/**
 * 동일 스윙의 엔진 POI 좌표 + 해당 봉 고/저·거래량으로 TV식 피벗 콜아웃(label).
 */
export function buildCandleAnalysisCoreSdPivots(engineOverlays: OverlayItem[], candles: Candle[]): OverlayItem[] {
  if (!candles.length || !engineOverlays.length) return [];
  const raw = engineOverlays.filter(isEngineFluidSd);
  if (!raw.length) return [];

  const supplies = raw.filter((o) => o.kind === 'supplyZone').slice(-4);
  const demands = raw.filter((o) => o.kind === 'demandZone').slice(-4);
  const out: OverlayItem[] = [];

  for (const z of [...supplies, ...demands]) {
    const suffix = String(z.id || '').replace(/^supply-|^demand-/, '');
    const idx = parseInt(suffix, 10);
    if (!Number.isFinite(idx) || idx < 0 || idx >= candles.length) continue;
    const c = candles[idx];
    if (!c) continue;
    const isSupply = z.kind === 'supplyZone';
    const poiId = isSupply ? `poi-supply-${suffix}` : `poi-demand-${suffix}`;
    const poi = engineOverlays.find((o) => o.id === poiId && o.kind === 'poi');
    if (!poi || typeof poi.x1 !== 'number' || typeof poi.y1 !== 'number') continue;

    const price = isSupply ? c.high : c.low;
    const label = `${fmtPivotPrice(price)}\n${fmtPivotVolume(c.volume ?? 0)}`;

    out.push({
      ...poi,
      id: `ca-core-pivot-${isSupply ? 's' : 'd'}-${suffix}`,
      kind: 'label',
      category: 'candleAnalysisCoreSd',
      label,
      price1: price,
      confidence: Math.min(88, poi.confidence ?? 76),
      color: isSupply ? 'rgba(168, 85, 247, 0.95)' : 'rgba(45, 212, 191, 0.95)',
      lineLabelColor: isSupply ? '#fae8ff' : '#ecfdf5',
      labelBackgroundColor: isSupply ? 'rgba(88, 28, 135, 0.5)' : 'rgba(15, 118, 110, 0.48)',
      labelTextColor: '#f8fafc',
    } as OverlayItem);
  }
  return out;
}
