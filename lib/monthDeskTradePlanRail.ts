/**
 * 마감·안착 — 우측 진입·손절·반등(TP) 점선 연결 레일 (교육·참고).
 */
import type { OverlayItem } from '@/types';

export type MonthDeskTradePlanRailLevel = 'sl' | 'entry' | 'tp1' | 'tp2' | 'tp3';

export type MonthDeskTradePlanRailSpec = {
  level: MonthDeskTradePlanRailLevel;
  labelKo: string;
  ids: string[];
  color: string;
};

/** 아래(손절) → 위(반등3) 순서 */
export const MONTH_DESK_TRADE_PLAN_RAIL_SPECS: MonthDeskTradePlanRailSpec[] = [
  {
    level: 'sl',
    labelKo: '손절',
    ids: [
      'month-desk-strike-long-sl',
      'month-desk-strike-short-sl',
      'month-desk-plan-sl',
      'month-desk-core-long-sl',
      'month-desk-core-short-sl',
      'month-desk-typeom-inv',
    ],
    color: 'rgba(248,113,113,0.92)',
  },
  {
    level: 'entry',
    labelKo: '진입',
    ids: [
      'month-desk-strike-long-entry',
      'month-desk-strike-short-entry',
      'month-desk-plan-entry',
      'month-desk-core-long-entry',
      'month-desk-core-short-entry',
      'month-desk-typeom-entry',
    ],
    color: 'rgba(250,204,21,0.95)',
  },
  {
    level: 'tp1',
    labelKo: '반등1',
    ids: [
      'month-desk-strike-long-tp1',
      'month-desk-strike-short-tp1',
      'month-desk-plan-tp1',
      'month-desk-typeom-tp1',
      'month-desk-core-long-bounce',
      'month-desk-core-short-tp1',
    ],
    color: 'rgba(134,239,172,0.92)',
  },
  {
    level: 'tp2',
    labelKo: '반등2',
    ids: [
      'month-desk-strike-long-tp2',
      'month-desk-strike-short-tp2',
      'month-desk-plan-tp2',
      'month-desk-typeom-tp2',
      'month-desk-core-short-tp2',
    ],
    color: 'rgba(125,211,252,0.9)',
  },
  {
    level: 'tp3',
    labelKo: '반등3',
    ids: [
      'month-desk-strike-long-tp3',
      'month-desk-strike-short-tp3',
      'month-desk-plan-tp3',
      'month-desk-typeom-tp3',
      'month-desk-core-short-tp3',
    ],
    color: 'rgba(167,139,250,0.88)',
  },
];

export type MonthDeskTradePlanRailNode = {
  level: MonthDeskTradePlanRailLevel;
  labelKo: string;
  price: number;
  color: string;
};

type ScreenRow = {
  id?: string;
  y1?: number;
  y2?: number;
  price1?: number;
};

function firstPrice(items: OverlayItem[] | ScreenRow[], ids: string[]): number | null {
  for (const id of ids) {
    const o = items.find((x) => String((x as { id?: string }).id || '') === id);
    const p = (o as { price1?: number })?.price1;
    if (typeof p === 'number' && Number.isFinite(p) && p > 0) return p;
  }
  return null;
}

function firstScreenY(screen: ScreenRow[], ids: string[]): number | null {
  for (const id of ids) {
    const o = screen.find((x) => String(x.id || '') === id);
    if (!o || !Number.isFinite(Number(o.y1))) continue;
    const y1 = Number(o.y1);
    const y2 = typeof o.y2 === 'number' && Number.isFinite(o.y2) ? Number(o.y2) : y1;
    return (y1 + y2) / 2;
  }
  return null;
}

/** 연합·핵심 플랜 가격 추출 (pack 우선 — clear 모드에서도 TP2/3 가격 유지) */
export function extractMonthDeskTradePlanRailNodes(
  pack: OverlayItem[],
  screen: ScreenRow[]
): MonthDeskTradePlanRailNode[] {
  const out: MonthDeskTradePlanRailNode[] = [];
  for (const spec of MONTH_DESK_TRADE_PLAN_RAIL_SPECS) {
    const price = firstPrice(pack, spec.ids) ?? firstPrice(screen, spec.ids);
    if (price == null) continue;
    out.push({ level: spec.level, labelKo: spec.labelKo, price, color: spec.color });
  }
  if (out.length < 2) return [];
  /** 롱 기준: 가격 오름차순 = 화면 아래→위 */
  out.sort((a, b) => a.price - b.price);
  return out;
}

export function clampRailScreenY(y: number, chartH: number, pad = 10): number {
  return Math.max(pad, Math.min(chartH - pad, y));
}

export function resolveRailScreenY(
  screen: ScreenRow[],
  spec: MonthDeskTradePlanRailSpec,
  price: number,
  priceToY: (p: number) => number | null,
  chartH: number
): number | null {
  const fromScreen = firstScreenY(screen, spec.ids);
  if (fromScreen != null) return clampRailScreenY(fromScreen, chartH);
  const y = priceToY(price);
  if (y == null) return null;
  return clampRailScreenY(y, chartH);
}
