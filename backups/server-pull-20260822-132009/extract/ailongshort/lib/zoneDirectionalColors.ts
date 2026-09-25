/**
 * 차트 존 색 — 모든 모드 공통: 롱·수요 초록, 숏·공급 빨강, 중립·중간대 파랑 (#3B82F6 계열)
 */
import type { OverlayItem } from '@/types';

export const ZONE_LONG_FILL = 'rgba(34,197,94,0.18)';
export const ZONE_LONG_STROKE = 'rgba(34,197,94,0.42)';
export const ZONE_LONG_SOLID = '#22C55E';

export const ZONE_SHORT_FILL = 'rgba(239,68,68,0.18)';
export const ZONE_SHORT_STROKE = 'rgba(239,68,68,0.42)';
export const ZONE_SHORT_SOLID = '#EF4444';

/** 캔들 기준 중간·균형·BPR·진입 반응구간 등 */
export const ZONE_MID_FILL = 'rgba(59,130,246,0.18)';
export const ZONE_MID_STROKE = 'rgba(59,130,246,0.42)';
export const ZONE_MID_SOLID = '#3B82F6';

export type ZoneDirectionRole = 'long' | 'short' | 'mid';

export type ZoneDirectionalTint = {
  fillSoft: string;
  strokeSoft: string;
  labelSolid: string;
  role: ZoneDirectionRole;
};

function rgbaHints(colorStr: string): { g: boolean; r: boolean; b: boolean } {
  const c = colorStr.replace(/\s/g, '');
  return {
    g: /34,197,94|22C55E|22c55e/i.test(c),
    r: /239,68,68|EF4444|ef4444/i.test(c),
    b: /59,130,246|3B82F6|3b82f6/i.test(c),
  };
}

/**
 * 엔진 `kind`·id·라벨·color로 방향 틴트 결정. 적용 불가 시 null (호출측이 item.color 유지).
 */
export function resolveZoneDirectionalColors(item: OverlayItem): ZoneDirectionalTint | null {
  const kind = item.kind;
  const id = String(item.id ?? '');
  const lbl = String(item.label ?? '').trim();
  const colorStr = String(item.color ?? '');
  const h = rgbaHints(colorStr);

  /** 마감·안착 타점(골든포켓·코어·FVG): `item.color` 시안·로즈·스카이 톤 유지 — 수요존=초록 일괄 덮어쓰기 방지 */
  if (id.startsWith('month-desk-typeom-')) return null;
  /** 눌림 핫존(phz): 피보·눌림 존 면방식 유지 */
  if (id.startsWith('phz-')) return null;
  /** 고래 Hot Zone 레이더(hotzone-*) — 볼륨 열지도 색 유지 */
  if (id.startsWith('hotzone-')) return null;

  if (kind === 'demandZone') {
    return { fillSoft: ZONE_LONG_FILL, strokeSoft: ZONE_LONG_STROKE, labelSolid: ZONE_LONG_SOLID, role: 'long' };
  }
  if (kind === 'supplyZone') {
    return { fillSoft: ZONE_SHORT_FILL, strokeSoft: ZONE_SHORT_STROKE, labelSolid: ZONE_SHORT_SOLID, role: 'short' };
  }

  if (kind === 'reactionZone') {
    if (id === 'reaction-zone-support') {
      return { fillSoft: ZONE_LONG_FILL, strokeSoft: ZONE_LONG_STROKE, labelSolid: ZONE_LONG_SOLID, role: 'long' };
    }
    if (id === 'reaction-zone-resistance') {
      return { fillSoft: ZONE_SHORT_FILL, strokeSoft: ZONE_SHORT_STROKE, labelSolid: ZONE_SHORT_SOLID, role: 'short' };
    }
    if (id === 'reaction-zone-atr' || id === 'reaction-zone-entry') {
      return { fillSoft: ZONE_MID_FILL, strokeSoft: ZONE_MID_STROKE, labelSolid: ZONE_MID_SOLID, role: 'mid' };
    }
  }

  if (kind === 'bprZone') {
    return { fillSoft: ZONE_MID_FILL, strokeSoft: ZONE_MID_STROKE, labelSolid: ZONE_MID_SOLID, role: 'mid' };
  }

  if (kind === 'fvg') {
    const up = lbl.includes('상승') || /\bbull/i.test(lbl);
    const down = lbl.includes('하락') || /\bbear/i.test(lbl);
    if (up && !down) return { fillSoft: ZONE_LONG_FILL, strokeSoft: ZONE_LONG_STROKE, labelSolid: ZONE_LONG_SOLID, role: 'long' };
    if (down && !up) return { fillSoft: ZONE_SHORT_FILL, strokeSoft: ZONE_SHORT_STROKE, labelSolid: ZONE_SHORT_SOLID, role: 'short' };
    if (h.g && !h.r) return { fillSoft: ZONE_LONG_FILL, strokeSoft: ZONE_LONG_STROKE, labelSolid: ZONE_LONG_SOLID, role: 'long' };
    if (h.r && !h.g) return { fillSoft: ZONE_SHORT_FILL, strokeSoft: ZONE_SHORT_STROKE, labelSolid: ZONE_SHORT_SOLID, role: 'short' };
    return { fillSoft: ZONE_MID_FILL, strokeSoft: ZONE_MID_STROKE, labelSolid: ZONE_MID_SOLID, role: 'mid' };
  }

  if (kind === 'ob') {
    const up =
      lbl.includes('롱') ||
      lbl.includes('상승') ||
      lbl.includes('수요') ||
      lbl.includes('지지') ||
      /\bdemand|bull|support/i.test(lbl);
    const down =
      lbl.includes('숏') ||
      lbl.includes('하락') ||
      lbl.includes('공급') ||
      lbl.includes('저항') ||
      /\bsupply|bear|resist/i.test(lbl);
    if (up && !down) return { fillSoft: ZONE_LONG_FILL, strokeSoft: ZONE_LONG_STROKE, labelSolid: ZONE_LONG_SOLID, role: 'long' };
    if (down && !up) return { fillSoft: ZONE_SHORT_FILL, strokeSoft: ZONE_SHORT_STROKE, labelSolid: ZONE_SHORT_SOLID, role: 'short' };
    if (h.g && !h.r) return { fillSoft: ZONE_LONG_FILL, strokeSoft: ZONE_LONG_STROKE, labelSolid: ZONE_LONG_SOLID, role: 'long' };
    if (h.r && !h.g) return { fillSoft: ZONE_SHORT_FILL, strokeSoft: ZONE_SHORT_STROKE, labelSolid: ZONE_SHORT_SOLID, role: 'short' };
    return { fillSoft: ZONE_MID_FILL, strokeSoft: ZONE_MID_STROKE, labelSolid: ZONE_MID_SOLID, role: 'mid' };
  }

  if (kind === 'zone') {
    if (id.startsWith('bible-cp-frame-')) return null;
    if (/^major-support-\d+-zone$/.test(id)) {
      return { fillSoft: ZONE_LONG_FILL, strokeSoft: ZONE_LONG_STROKE, labelSolid: ZONE_LONG_SOLID, role: 'long' };
    }
    if (/^major-resistance-\d+-zone$/.test(id)) {
      return { fillSoft: ZONE_SHORT_FILL, strokeSoft: ZONE_SHORT_STROKE, labelSolid: ZONE_SHORT_SOLID, role: 'short' };
    }

    const longLbl =
      /롱|LONG|매수|지지|수요|bull|support|demand|상승/i.test(lbl) &&
      !/숏|SHORT|매도|저항|공급|bear|resist|supply|하락/i.test(lbl);
    const shortLbl =
      (/숏|SHORT|매도|저항|공급|bear|resist|supply|하락/i.test(lbl) &&
        !/롱|LONG|매수|지지|수요|bull|support|demand|상승/i.test(lbl)) ||
      false;
    if (longLbl && !shortLbl) return { fillSoft: ZONE_LONG_FILL, strokeSoft: ZONE_LONG_STROKE, labelSolid: ZONE_LONG_SOLID, role: 'long' };
    if (shortLbl && !longLbl) return { fillSoft: ZONE_SHORT_FILL, strokeSoft: ZONE_SHORT_STROKE, labelSolid: ZONE_SHORT_SOLID, role: 'short' };
    if (h.g && !h.r) return { fillSoft: ZONE_LONG_FILL, strokeSoft: ZONE_LONG_STROKE, labelSolid: ZONE_LONG_SOLID, role: 'long' };
    if (h.r && !h.g) return { fillSoft: ZONE_SHORT_FILL, strokeSoft: ZONE_SHORT_STROKE, labelSolid: ZONE_SHORT_SOLID, role: 'short' };
    if (h.b) return { fillSoft: ZONE_MID_FILL, strokeSoft: ZONE_MID_STROKE, labelSolid: ZONE_MID_SOLID, role: 'mid' };
    if (/중립|균형|EQ|박스|중앙|middle|range|진입|반응/i.test(lbl) || /equil|mid-range|pivot-mid/i.test(id)) {
      return { fillSoft: ZONE_MID_FILL, strokeSoft: ZONE_MID_STROKE, labelSolid: ZONE_MID_SOLID, role: 'mid' };
    }
  }

  return null;
}

function stableVariantIndex(key: string, modulo: number): number {
  if (modulo <= 1) return 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h | 0) % modulo;
}

function variantKey(item: OverlayItem): string {
  return `${String(item.kind || '')}|${String(item.id || '')}|${String(item.label || '').slice(0, 80)}`;
}

/** 롱·숏·중립 역할은 유지하되, 동일 역할 존·라인이 한색으로 뭉치지 않게 id·종류별로 틴트 분리 */
const LONG_VARIANTS: ZoneDirectionalTint[] = [
  { fillSoft: 'rgba(34,197,94,0.16)', strokeSoft: 'rgba(34,197,94,0.44)', labelSolid: '#22C55E', role: 'long' },
  { fillSoft: 'rgba(16,185,129,0.15)', strokeSoft: 'rgba(5,150,105,0.46)', labelSolid: '#059669', role: 'long' },
  { fillSoft: 'rgba(52,211,153,0.14)', strokeSoft: 'rgba(20,184,166,0.42)', labelSolid: '#14B8A6', role: 'long' },
  { fillSoft: 'rgba(74,222,128,0.13)', strokeSoft: 'rgba(22,163,74,0.40)', labelSolid: '#16a34a', role: 'long' },
  { fillSoft: 'rgba(110,231,183,0.12)', strokeSoft: 'rgba(4,120,87,0.38)', labelSolid: '#047857', role: 'long' },
];

const SHORT_VARIANTS: ZoneDirectionalTint[] = [
  { fillSoft: 'rgba(239,68,68,0.16)', strokeSoft: 'rgba(239,68,68,0.44)', labelSolid: '#EF4444', role: 'short' },
  { fillSoft: 'rgba(248,113,113,0.14)', strokeSoft: 'rgba(220,38,38,0.42)', labelSolid: '#DC2626', role: 'short' },
  { fillSoft: 'rgba(251,113,133,0.14)', strokeSoft: 'rgba(190,18,60,0.40)', labelSolid: '#BE123C', role: 'short' },
  { fillSoft: 'rgba(252,165,165,0.13)', strokeSoft: 'rgba(185,28,28,0.38)', labelSolid: '#B91C1C', role: 'short' },
  { fillSoft: 'rgba(254,202,202,0.12)', strokeSoft: 'rgba(153,27,27,0.36)', labelSolid: '#991B1B', role: 'short' },
];

const MID_VARIANTS: ZoneDirectionalTint[] = [
  { fillSoft: 'rgba(59,130,246,0.16)', strokeSoft: 'rgba(59,130,246,0.44)', labelSolid: '#3B82F6', role: 'mid' },
  { fillSoft: 'rgba(99,102,241,0.14)', strokeSoft: 'rgba(79,70,229,0.42)', labelSolid: '#4F46E5', role: 'mid' },
  { fillSoft: 'rgba(129,140,248,0.14)', strokeSoft: 'rgba(67,56,202,0.42)', labelSolid: '#4338CA', role: 'mid' },
  { fillSoft: 'rgba(56,189,248,0.13)', strokeSoft: 'rgba(2,132,199,0.40)', labelSolid: '#0284C7', role: 'mid' },
  { fillSoft: 'rgba(168,85,247,0.12)', strokeSoft: 'rgba(126,34,206,0.38)', labelSolid: '#7C3AED', role: 'mid' },
];

export function resolveZoneDirectionalColorsDistinct(item: OverlayItem): ZoneDirectionalTint | null {
  const base = resolveZoneDirectionalColors(item);
  if (!base) return null;
  const key = variantKey(item);
  if (base.role === 'long') {
    const arr = LONG_VARIANTS;
    return arr[stableVariantIndex(key, arr.length)] ?? base;
  }
  if (base.role === 'short') {
    const arr = SHORT_VARIANTS;
    return arr[stableVariantIndex(key, arr.length)] ?? base;
  }
  const arr = MID_VARIANTS;
  return arr[stableVariantIndex(key, arr.length)] ?? base;
}
