import type { ElliottSchematicId, MergedDeskElliottRead } from '@/lib/mergedDeskElliottWave';

export const ELLIOTT_FIGURES: Array<{
  id: ElliottSchematicId;
  tabKo: string;
  captionKo: string;
}> = [
  {
    id: 'fig-8-1',
    tabKo: '8-1 충격5+조정3',
    captionKo: '그림 8-1: 5충격 + 3조정(ABC). 상위 한 단위는 (1) 후 (2). 소스: 프렉터 1995.',
  },
  {
    id: 'fig-8-2',
    tabKo: '8-2 프랙탈',
    captionKo: '그림 8-2: 작은 5·3이 모여 큰 (1)–(5)·(A)–(C). 소스: 프렉터 1995.',
  },
  {
    id: 'fig-8-3',
    tabKo: '8-3 확장',
    captionKo: '그림 8-3: 3파확장(1≈5) · 5파확장(5≈1.618×1→3) · 1파확장(3~5≈0.618×1).',
  },
  {
    id: 'fig-8-4',
    tabKo: '8-4 W4 황금비',
    captionKo: '그림 8-4: 비확장 시 시작→W4 ≈ 0.618 전체 · 5파확장 시 ≈ 0.382 전체. 관측.',
  },
  {
    id: 'fig-8-5',
    tabKo: '8-5 2·4되돌림',
    captionKo: '그림 8-5: W2≈0.382/0.618×W1 · W4≈0.236/0.382×W3. 단순/복합·깊/얕 교대 경향.',
  },
];

const PNG_IDS = new Set<ElliottSchematicId>(['fig-8-1', 'fig-8-2', 'fig-8-3', 'fig-8-4']);

const HOTSPOTS: Record<ElliottSchematicId, Record<string, { left: number; top: number }>> = {
  'fig-8-1': {
    '1': { left: 22, top: 37 },
    '2': { left: 33, top: 62 },
    '3': { left: 50, top: 19 },
    '4': { left: 58, top: 46 },
    '5': { left: 68, top: 8 },
    A: { left: 76, top: 44 },
    B: { left: 84, top: 24 },
    C: { left: 92, top: 68 },
  },
  'fig-8-2': {
    '1': { left: 18, top: 40 },
    '2': { left: 26, top: 62 },
    '3': { left: 46, top: 14 },
    '4': { left: 55, top: 36 },
    '5': { left: 66, top: 8 },
    A: { left: 78, top: 40 },
    B: { left: 87, top: 22 },
    C: { left: 96, top: 54 },
  },
  'fig-8-3': {
    '1': { left: 10, top: 48 },
    '2': { left: 13, top: 62 },
    '3': { left: 22, top: 22 },
    '4': { left: 27, top: 38 },
    '5': { left: 31, top: 26 },
    w3: { left: 20, top: 28 },
    w5: { left: 58, top: 16 },
    w1: { left: 80, top: 20 },
  },
  'fig-8-4': {
    '4': { left: 32, top: 48 },
    '5': { left: 42, top: 14 },
    '4x': { left: 74, top: 64 },
    '5x': { left: 88, top: 12 },
  },
  'fig-8-5': {
    '1': { left: 25, top: 19 },
    '2': { left: 42, top: 46 },
    '3': { left: 86, top: 15 },
    '4': { left: 98, top: 40 },
  },
};

export function elliottSchematicSrc(id: ElliottSchematicId): string {
  return PNG_IDS.has(id) ? `/schematics/elliott/${id}.png` : `/schematics/elliott/${id}.svg`;
}

export function elliottHotspotKey(read: MergedDeskElliottRead, fig?: ElliottSchematicId): string {
  const id = fig ?? read.schematicId;
  if (id === 'fig-8-3') {
    if (read.extension === 'w5') return 'w5';
    if (read.extension === 'w1') return 'w1';
    if (read.extension === 'w3') return 'w3';
    return read.wave === 'A' || read.wave === 'B' || read.wave === 'C' ? '5' : read.wave;
  }
  if (id === 'fig-8-4') {
    if (read.extension === 'w5') return read.wave === '4' ? '4x' : '5x';
    return read.wave === '5' ? '5' : '4';
  }
  if (id === 'fig-8-5') {
    if (read.wave === '1' || read.wave === '2') return read.wave;
    if (read.wave === '3' || read.wave === '4') return read.wave;
    return read.wave === '5' ? '3' : read.wave === 'A' || read.wave === 'C' ? '2' : '4';
  }
  return read.hotspotKey || read.wave;
}

export function elliottSchematicHotspot(
  id: ElliottSchematicId,
  key: string
): { left: number; top: number } | null {
  return HOTSPOTS[id]?.[key] ?? null;
}

export function listElliottHotspots(
  id: ElliottSchematicId
): Array<{ key: string; left: number; top: number }> {
  const map = HOTSPOTS[id];
  if (!map) return [];
  return Object.entries(map).map(([key, v]) => ({ key, left: v.left, top: v.top }));
}

/** 도식 위 국소 ZONE(%). 전체 그림 덮는 넓은 띠 금지. */
const ZONE_BOX: Record<string, { left: number; top: number; width: number; height: number }> = {
  'fig-8-1:2': { left: 26, top: 54, width: 12, height: 10 },
  'fig-8-1:4': { left: 52, top: 36, width: 12, height: 10 },
  'fig-8-1:A': { left: 70, top: 36, width: 12, height: 10 },
  'fig-8-1:B': { left: 78, top: 24, width: 11, height: 9 },
  'fig-8-1:C': { left: 86, top: 58, width: 12, height: 10 },
  'fig-8-2:2': { left: 20, top: 56, width: 11, height: 10 },
  'fig-8-2:C': { left: 90, top: 48, width: 8, height: 10 },
  'fig-8-5:2': { left: 34, top: 40, width: 14, height: 12 },
  'fig-8-5:4': { left: 86, top: 34, width: 12, height: 12 },
  'fig-8-4:4': { left: 26, top: 44, width: 14, height: 12 },
};

export function elliottSchematicZoneBox(
  id: ElliottSchematicId,
  wave: string
): { left: number; top: number; width: number; height: number } | null {
  return ZONE_BOX[`${id}:${wave}`] ?? null;
}
