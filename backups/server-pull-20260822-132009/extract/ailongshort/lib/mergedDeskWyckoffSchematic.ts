/**
 * 와이코프 교재 도식(StockCharts 스타일) + 지금 자리 핫스팟.
 * 클릭 시 이미지 · 차트 하방초록/상방빨강 깜빡임.
 */
import type { OverlayItem } from '@/types';
import type { MergedDeskWyckoffRead, WyckoffEvent, WyckoffPhase } from '@/lib/mergedDeskWyckoffCycle';

export type WyckoffSchematicId =
  | 'accumulation-1'
  | 'accumulation-2'
  | 'distribution-1'
  | 'distribution-2'
  | 'price-cycle';

export type WyckoffBlinkPin = {
  id: string;
  side: 'low' | 'high';
  time: number;
  price: number;
  label: string;
  primary: boolean;
};

type WyckoffSpot = { left: number; top: number; lx?: number; ly?: number };

/** left/top = 가격선 꼭짓점(비교줄). lx/ly = PNG 인쇄 라벨 중심(원본 지금자리). */
const HOTSPOTS: Record<WyckoffSchematicId, Record<string, WyckoffSpot>> = {
  'accumulation-1': {
    PS: { left: 7, top: 50, lx: 7, ly: 54 },
    SC: { left: 16, top: 81, lx: 16, ly: 86 },
    AR: { left: 21, top: 58, lx: 21, ly: 54 },
    ST_A: { left: 25, top: 78, lx: 25, ly: 82 },
    ST_B: { left: 34, top: 83, lx: 40, ly: 87 },
    SPRING: { left: 63, top: 87, lx: 63, ly: 92 },
    TEST: { left: 67, top: 81, lx: 67, ly: 86 },
    LPS: { left: 73, top: 68, lx: 73, ly: 72 },
    SOS: { left: 76, top: 51, lx: 76, ly: 47 },
    BU: { left: 79, top: 58, lx: 79, ly: 63 },
    E: { left: 88, top: 28 },
  },
  'accumulation-2': {
    PS: { left: 12, top: 53, lx: 12, ly: 56 },
    SC: { left: 17, top: 79, lx: 17, ly: 84 },
    AR: { left: 22, top: 53, lx: 22, ly: 49 },
    ST_A: { left: 23, top: 75, lx: 23, ly: 79 },
    ST_B: { left: 34, top: 82, lx: 40, ly: 86 },
    LPS: { left: 63, top: 76, lx: 63, ly: 80 },
    SOS: { left: 75, top: 43, lx: 75, ly: 39 },
    BU: { left: 79, top: 58, lx: 79, ly: 63 },
    E: { left: 85, top: 27 },
  },
  'distribution-1': {
    PSY: { left: 21.5, top: 40.5, lx: 21.5, ly: 37 },
    BC: { left: 24.5, top: 30.5, lx: 24.5, ly: 27 },
    AR: { left: 26.5, top: 50, lx: 26, ly: 54 },
    ST_A: { left: 28, top: 35, lx: 28, ly: 32 },
    UT_B: { left: 40, top: 31, lx: 40, ly: 27 },
    SOW_B: { left: 45, top: 47, lx: 45, ly: 51 },
    UTAD: { left: 58, top: 23.5, lx: 58, ly: 20 },
    TEST: { left: 60.5, top: 31, lx: 60.5, ly: 28 },
    LPSY: { left: 65, top: 40, lx: 65, ly: 37 },
    SOW: { left: 69.5, top: 54, lx: 69.5, ly: 58 },
    E: { left: 78, top: 82 },
  },
  'distribution-2': {
    PSY: { left: 22, top: 40, lx: 22, ly: 45 },
    BC: { left: 25, top: 30, lx: 25, ly: 33 },
    AR: { left: 27, top: 58, lx: 27, ly: 56 },
    ST_A: { left: 31, top: 36, lx: 31, ly: 39 },
    UT_B: { left: 43.5, top: 28.5, lx: 45, ly: 30 },
    SOW_B: { left: 50, top: 61, lx: 50, ly: 64 },
    LPSY: { left: 58, top: 36, lx: 58, ly: 33 },
    SOW: { left: 66, top: 64, lx: 66, ly: 62 },
    E: { left: 78, top: 78 },
  },
  'price-cycle': {
    ACC: { left: 32, top: 82, lx: 35, ly: 87 },
    MARKUP: { left: 50, top: 55, lx: 52, ly: 70 },
    DIST: { left: 62, top: 28, lx: 60, ly: 20 },
    MARKDOWN: { left: 74, top: 50, lx: 73, ly: 70 },
  },
};

export function wyckoffSchematicSrc(id: WyckoffSchematicId): string {
  return `/schematics/wyckoff/${id}.png`;
}

export function wyckoffEventEn(phase: WyckoffPhase | null, event: WyckoffEvent): string {
  if (!phase && (event === 'none' || !event)) return '';
  if (phase === 'B' && event === 'ST') return 'ST in Phase B';
  if (phase === 'B' && event === 'UT') return 'UT in Phase B';
  if (phase === 'B' && event === 'SOW') return 'SOW in Phase B';
  if (phase === 'A' && event === 'ST') return 'ST (Phase A)';
  if (event === 'Spring') return 'Spring (Phase C)';
  if (event === 'UTAD') return 'UTAD (Phase C)';
  if (event === 'LPS') return phase === 'C' ? 'LPS (Phase C)' : 'LPS (Phase D)';
  if (event === 'LPSY') return phase === 'C' ? 'LPSY (Phase C)' : 'LPSY (Phase D)';
  if (event === 'SOS') return 'SOS (Phase D)';
  if (event === 'BU') return 'BU / LPS (Phase D)';
  if (event === 'SOW') return 'SOW (Phase D)';
  if (event === 'none' && phase === 'E') return '';
  return event && event !== 'none' ? `${event}${phase ? ` (Phase ${phase})` : ''}` : phase ? `Phase ${phase}` : '';
}

export function resolveWyckoffSchematicId(read: MergedDeskWyckoffRead): WyckoffSchematicId {
  if (!read.schematic || read.macro === 'markup' || read.macro === 'markdown') {
    if (read.macro === 'markup') return 'price-cycle';
    if (read.macro === 'markdown') return 'price-cycle';
    return 'price-cycle';
  }
  const variant = read.schematicVariant ?? (read.spring || read.utad ? 1 : 2);
  if (read.schematic === 'accumulation') return variant === 1 ? 'accumulation-1' : 'accumulation-2';
  return variant === 1 ? 'distribution-1' : 'distribution-2';
}

export function resolveWyckoffHotspotKey(read: MergedDeskWyckoffRead): string {
  if (!read.schematic || read.macro === 'markup') return read.macro === 'markdown' ? 'MARKDOWN' : 'MARKUP';
  if (read.macro === 'markdown') return 'MARKDOWN';
  if (read.macro === 'accumulation' && read.phase === 'E') return 'E';
  if (read.macro === 'distribution' && read.phase === 'E') return 'E';
  const e = read.event;
  const p = read.phase;
  if (p === 'B' && e === 'ST') return 'ST_B';
  if (p === 'A' && e === 'ST') return 'ST_A';
  if (p === 'B' && e === 'UT') return 'UT_B';
  if (p === 'B' && e === 'SOW') return 'SOW_B';
  if (e === 'Spring') return 'SPRING';
  if (e === 'AR') return 'AR';
  if (e === 'SC') return 'SC';
  if (e === 'PS') return 'PS';
  if (e === 'PSY') return 'PSY';
  if (e === 'BC') return 'BC';
  if (e === 'UTAD') return 'UTAD';
  if (e === 'LPS') return 'LPS';
  if (e === 'LPSY') return 'LPSY';
  if (e === 'SOS') return 'SOS';
  if (e === 'BU') return 'BU';
  if (e === 'SOW') return 'SOW';
  if (e === 'UT') return 'UT_B';
  if (p === 'E') return 'E';
  return p === 'B' ? 'ST_B' : 'ST_A';
}

export function wyckoffSchematicHotspot(
  schematicId: WyckoffSchematicId,
  key: string
): { left: number; top: number; lx?: number; ly?: number } | null {
  return HOTSPOTS[schematicId]?.[key] ?? null;
}

export function listWyckoffHotspots(
  schematicId: WyckoffSchematicId
): Array<{ key: string; left: number; top: number; lx?: number; ly?: number }> {
  const map = HOTSPOTS[schematicId];
  if (!map) return [];
  return Object.entries(map).map(([key, v]) => ({
    key,
    left: v.left,
    top: v.top,
    lx: v.lx,
    ly: v.ly,
  }));
}

export function buildWyckoffBlinkOverlays(pins: WyckoffBlinkPin[]): OverlayItem[] {
  return pins.map((p) => ({
    id: p.id,
    kind: 'label' as const,
    label: p.label,
    x1: 0,
    y1: 0,
    time1: p.time,
    price1: p.price,
    confidence: p.primary ? 86 : 70,
    color: p.side === 'low' ? '#22c55e' : '#ef4444',
    category: 'labels',
    overlayZoneExtraClass: [
      'merged-desk-wyckoff-blink',
      p.side === 'low' ? 'merged-desk-wyckoff-blink--green' : 'merged-desk-wyckoff-blink--red',
      p.primary ? 'merged-desk-wyckoff-blink--primary' : '',
    ]
      .filter(Boolean)
      .join(' '),
    labelTooltip: `${p.label} · 하방=초록 · 상방=빨강 · 확정 아님`,
  }));
}
