/**
 * 원본 교재 도식(PNG/SVG)의 지지·저항 면 좌표.
 * 캔들 비교 파란 줄과 무관 — 도식에 인쇄된 Resistance/Support 띠.
 */
import type { WyckoffSchematicId } from '@/lib/mergedDeskWyckoffSchematic';

export type SchematicNativeFace = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type SchematicNativeFaces = {
  buy: SchematicNativeFace;
  sell: SchematicNativeFace;
};

const WYCKOFF_FACES: Record<WyckoffSchematicId, SchematicNativeFaces> = {
  /** StockCharts Distribution #1 — 상단 Resistance Lines / 하단 Support Lines */
  'distribution-1': {
    sell: { left: 20, top: 27, width: 52, height: 7 },
    buy: { left: 20, top: 47, width: 52, height: 7 },
  },
  'distribution-2': {
    sell: { left: 20, top: 29, width: 55, height: 7 },
    buy: { left: 20, top: 53, width: 55, height: 7 },
  },
  'accumulation-1': {
    sell: { left: 8, top: 52, width: 78, height: 8 },
    buy: { left: 8, top: 78, width: 78, height: 8 },
  },
  'accumulation-2': {
    sell: { left: 10, top: 46, width: 72, height: 8 },
    buy: { left: 10, top: 76, width: 72, height: 8 },
  },
  'price-cycle': {
    sell: { left: 52, top: 16, width: 30, height: 16 },
    buy: { left: 12, top: 60, width: 28, height: 16 },
  },
};

const GENERIC: SchematicNativeFaces = {
  sell: { left: 10, top: 18, width: 78, height: 14 },
  buy: { left: 10, top: 62, width: 78, height: 14 },
};

export function textbookNativeFaces(
  school: string | null | undefined,
  figureId: string | null | undefined
): SchematicNativeFaces {
  if (school === 'wyckoff' && figureId && figureId in WYCKOFF_FACES) {
    return WYCKOFF_FACES[figureId as WyckoffSchematicId]!;
  }
  if (school === 'elliott') {
    return {
      sell: { left: 12, top: 14, width: 76, height: 16 },
      buy: { left: 12, top: 58, width: 76, height: 18 },
    };
  }
  return GENERIC;
}
