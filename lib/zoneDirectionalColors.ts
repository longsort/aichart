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
    if (id === 'reaction-zone-entry') {
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
