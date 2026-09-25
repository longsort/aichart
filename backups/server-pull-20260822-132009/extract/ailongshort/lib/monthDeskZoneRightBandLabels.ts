/**
 * 마감·안착 — 존 우측(형성 구간 끝)에 E·SL·TP·존 역할 라벨 (5m 등 LTF).
 */
import type { OverlayItem } from '@/types';

import type { MonthDeskFeatureSettleLabel } from '@/lib/monthDeskFeatureSettleLabels';
import { MONTH_DESK_HIDE_ZONE_CAPTION_IDS } from '@/lib/monthDeskZoneShortLabels';
import { monthDeskDottedLineRightXWithGap } from '@/lib/monthDeskChartTailSpacing';

export type MonthDeskZoneBandLabelRow = {
  key: string;
  labelKo: string;
  price: number;
  color: string;
  overlayId?: string;
  settle?: MonthDeskFeatureSettleLabel;
};

const LINE_PRIORITY_GROUPS: { role: string; specs: { id: string; labelKo: string; color: string }[] }[] = [
  {
    role: 'entry',
    specs: [
      { id: 'merged-desk-trade-rail-e', labelKo: '진입 E', color: 'rgba(250,204,21,0.96)' },
      { id: 'month-desk-plan-entry', labelKo: '진입 E', color: 'rgba(250,204,21,0.96)' },
      { id: 'month-desk-typeom-entry', labelKo: '타점 E', color: 'rgba(250,204,21,0.96)' },
      { id: 'trade-atlas-entry', labelKo: '진입 E', color: 'rgba(253,224,71,0.96)' },
      { id: 'merged-ares-line-e', labelKo: '진입 E', color: 'rgba(250,204,21,0.96)' },
    ],
  },
  {
    role: 'sl',
    specs: [
      { id: 'merged-desk-trade-rail-sl', labelKo: '손절 SL', color: 'rgba(248,113,113,0.95)' },
      { id: 'month-desk-plan-sl', labelKo: '손절 SL', color: 'rgba(248,113,113,0.95)' },
      { id: 'month-desk-typeom-sl', labelKo: '타점 SL', color: 'rgba(248,113,113,0.95)' },
      { id: 'trade-atlas-sl', labelKo: '손절 SL', color: 'rgba(248,113,113,0.95)' },
      { id: 'merged-ares-line-sl', labelKo: '손절 SL', color: 'rgba(248,113,113,0.95)' },
    ],
  },
  {
    role: 'tp1',
    specs: [
      { id: 'merged-desk-trade-rail-tp1', labelKo: 'TP1', color: 'rgba(134,239,172,0.95)' },
      { id: 'month-desk-plan-tp1', labelKo: 'TP1', color: 'rgba(134,239,172,0.95)' },
      { id: 'trade-atlas-tp1', labelKo: 'TP1', color: 'rgba(134,239,172,0.95)' },
      { id: 'merged-ares-line-tp1', labelKo: 'TP1', color: 'rgba(134,239,172,0.95)' },
    ],
  },
  {
    role: 'tp2',
    specs: [
      { id: 'merged-desk-trade-rail-tp2', labelKo: 'TP2', color: 'rgba(125,211,252,0.92)' },
      { id: 'month-desk-plan-tp2', labelKo: 'TP2', color: 'rgba(125,211,252,0.92)' },
      { id: 'trade-atlas-tp2', labelKo: 'TP2', color: 'rgba(125,211,252,0.92)' },
      { id: 'merged-ares-line-tp2', labelKo: 'TP2', color: 'rgba(125,211,252,0.92)' },
    ],
  },
  {
    role: 'tp3',
    specs: [
      { id: 'merged-desk-trade-rail-tp3', labelKo: 'TP3', color: 'rgba(167,139,250,0.9)' },
      { id: 'month-desk-plan-tp3', labelKo: 'TP3', color: 'rgba(167,139,250,0.9)' },
      { id: 'trade-atlas-tp3', labelKo: 'TP3', color: 'rgba(167,139,250,0.9)' },
      { id: 'merged-ares-line-tp3', labelKo: 'TP3', color: 'rgba(167,139,250,0.9)' },
    ],
  },
  {
    role: 'core-entry',
    specs: [{ id: 'month-desk-core-long-entry', labelKo: '핵심 E', color: 'rgba(250,204,21,0.95)' }],
  },
  {
    role: 'core-sl',
    specs: [{ id: 'month-desk-core-long-sl', labelKo: '핵심 SL', color: 'rgba(248,113,113,0.92)' }],
  },
  {
    role: 'bounce',
    specs: [{ id: 'month-desk-core-long-bounce', labelKo: '반등', color: 'rgba(134,239,172,0.92)' }],
  },
];

export function collectMonthDeskZoneBandPriceLabels(pack: OverlayItem[]): MonthDeskZoneBandLabelRow[] {
  const out: MonthDeskZoneBandLabelRow[] = [];
  for (const group of LINE_PRIORITY_GROUPS) {
    for (const spec of group.specs) {
      const o = pack.find((x) => x.id === spec.id);
      const p = o?.price1;
      if (typeof p !== 'number' || !Number.isFinite(p)) continue;
      out.push({
        key: spec.id,
        labelKo: spec.labelKo,
        price: p,
        color: spec.color,
        overlayId: spec.id,
      });
      break;
    }
  }
  return out;
}

/** 존 id → 차트 우측에 붙일 짧은 설명 */
export function monthDeskZoneRoleCaption(id: string, fallbackLabel = ''): string {
  const zid = String(id || '');
  if (zid === 'month-desk-plan-risk-zone') return '위험존';
  if (zid === 'month-desk-plan-reward-zone') return '수익존';
  if (zid.startsWith('ob-pre-beam-zone')) return '구조 OB';
  if (zid === 'month-desk-core-money-long' || zid === 'month-desk-core-money-entry') return '★핵심롱';
  if (zid === 'month-desk-core-money-short') return '★핵심숏';
  if (zid === 'month-desk-core-long-spot') return '롱핵심';
  if (zid === 'month-desk-unified-zone') return '연합타점';
  if (zid === 'month-desk-typeom-pocket-zone') return '스윙존';
  const fb = String(fallbackLabel || '').trim();
  if (fb.length <= 8) return fb;
  return fb.slice(0, 8);
}

const PLAN_LINE_PREFIXES = [
  'month-desk-plan-',
  'month-desk-core-long-',
  'month-desk-anchor-',
  'month-desk-typeom-entry',
  'month-desk-typeom-sl',
  'month-desk-typeom-tp',
  'trade-atlas-entry',
  'trade-atlas-sl',
  'trade-atlas-tp',
  'merged-ares-line-',
];

/** 점선·플랜 가로선이 화면에서 끝나는 X (우측 밴드 라벨 앵커) */
export function resolveMonthDeskDottedLineRightX(
  screen: Array<{
    id?: string;
    kind?: string;
    x1: number;
    x2?: number;
    xMaxRight?: number;
  }>,
  chartWidth: number
): number {
  let anchor = 0;
  for (const s of screen) {
    const id = String(s.id || '');
    const kind = String(s.kind || '');
    const isPlanLine =
      PLAN_LINE_PREFIXES.some((p) => id.startsWith(p)) ||
      id.startsWith('trade-atlas-') ||
      (kind === 'keyLevel' && id.startsWith('month-desk-'));
    if (!isPlanLine) continue;
    const xr = Math.max(
      Number(s.x1) || 0,
      Number(s.x2 ?? s.x1) || 0,
      Number(s.xMaxRight ?? 0) || 0
    );
    if (Number.isFinite(xr)) anchor = Math.max(anchor, xr);
  }
  if (anchor > 0) return monthDeskDottedLineRightXWithGap(anchor, chartWidth);
  return Math.max(0, chartWidth * 0.9);
}

export function collectMonthDeskZoneRolePins(
  screenZones: Array<{ id?: string; x1: number; y1: number; x2?: number; y2?: number; zoneTimeEndScreenX?: number }>,
  settleByOverlayId?: Map<string, MonthDeskFeatureSettleLabel> | null
): Array<{
  id: string;
  caption: string;
  left: number;
  top: number;
  settle?: MonthDeskFeatureSettleLabel;
}> {
  const pins: Array<{
    id: string;
    caption: string;
    left: number;
    top: number;
    settle?: MonthDeskFeatureSettleLabel;
  }> = [];
  for (const z of screenZones) {
    const id = String(z.id || '');
    if (MONTH_DESK_HIDE_ZONE_CAPTION_IDS.has(id)) continue;
    if (!id.startsWith('month-desk-') && !id.startsWith('ob-pre-beam-zone')) continue;
    if (!id.includes('zone') && !id.endsWith('-spot')) continue;
    const right =
      typeof z.zoneTimeEndScreenX === 'number' && Number.isFinite(z.zoneTimeEndScreenX)
        ? z.zoneTimeEndScreenX
        : Math.max(z.x1, z.x2 ?? z.x1);
    const top = Math.min(z.y1, z.y2 ?? z.y1);
    const bot = Math.max(z.y1, z.y2 ?? z.y1);
    const cap = monthDeskZoneRoleCaption(id);
    pins.push({
      id,
      caption: cap,
      left: right + 10,
      top: (top + bot) / 2 - 8,
    });
  }
  return pins;
}
